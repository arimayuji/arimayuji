/**
 * Per-account stats snapshot — everything shown on a friend's profile
 * (`/perfil/ver`), including the side-by-side comparison card. Same
 * one-row-per-owner shape as `profiles` (row ID is the account's own user
 * ID).
 *
 * Unlike the place leaderboard, there's no opt-in gate here — synced
 * unconditionally for anyone signed in who finishes or removes a run. A
 * friend already sees your real name and handle everywhere else in the
 * app, so a static aggregate isn't a new category of exposure the public
 * place leaderboard is (see the permissions comment in
 * scripts/appwrite-setup.ts for the row-level detail): the row is
 * public-read at the Appwrite level, but the profile page only ever
 * surfaces it to a confirmed friend. The same reasoning covers the newer
 * fields (week volume, streak, last-run date, PRs) added alongside the
 * original totals — all equally static, friends-only data.
 *
 * This row's *first* creation goes through the `claim-owned-row` Function
 * rather than a direct `createRow` — see that function's comment for why a
 * client-chosen row ID here used to let one account seed another's stats
 * row before they'd ever finished a run (LGPD/security audit finding #12).
 * The read-then-update path below for an *existing* row is unaffected: that
 * already only succeeds for whoever the row's own `Permission.update`
 * names, which the Function sets to the real owner at creation time.
 */
import { ExecutionMethod, type Models } from "appwrite";
import { APPWRITE_DATABASE_ID, CLIENT_ACTIONS_FUNCTION_ID, TABLES, getAppwrite } from "./appwrite";
import { buildStatsSnapshot } from "./tracking/stats";
import { listCompletedRuns } from "./tracking/storage";

/**
 * `| null` on every optional field, not just `?:` — Appwrite always returns
 * every schema attribute on a row, using `null` (never an omitted key) for
 * one that was never written. A row synced before these columns existed, or
 * from `share-run` never sending a value, comes back with `null`, not
 * `undefined` — a caller that only ever checks `!== undefined` (as
 * `/perfil/ver` once did) renders the literal string "null" and treats
 * `null` `lastRunAt` as the Unix epoch, both really shipped once.
 */
export interface ProfileStats extends Models.Row {
  userId: string;
  totalMeters: number;
  totalRuns: number;
  weekMeters?: number | null;
  streakWeeks?: number | null;
  lastRunAt?: number | null;
  pr5kSeconds?: number | null;
  pr10kSeconds?: number | null;
  prHalfSeconds?: number | null;
  prFullSeconds?: number | null;
}

/**
 * Recomputes this account's whole stats snapshot from the local run
 * history and pushes it to `profile_stats`, creating the row on the first
 * call. Replaces the old `recordFinishedRun`/`removeFinishedRun` pair,
 * which only ever incremented/decremented `totalMeters`/`totalRuns` by a
 * delta — that worked for a running sum, but streaks and personal records
 * aren't derivable that way (deleting the one run that held a PR, say,
 * means the new best has to be found by recomputing over what's left, not
 * subtracted from). Call this wherever a run is finished or removed —
 * recomputing over the full history every time is the same cost
 * `allTimeBests`/`computeRunRecords` already pay for local-only use, and
 * this runs in the background (`void syncProfileStats()`), never blocking
 * the UI.
 *
 * `userId` is read from the live session, never a parameter — same
 * reasoning `recordRunAtPlace` (placeLeaderboard.ts) documents: trusting a
 * caller-supplied id would let this public row be seeded/attributed to the
 * wrong account (an IDOR fixed in an LGPD/security audit pass).
 */
export async function syncProfileStats(): Promise<void> {
  const appwrite = getAppwrite();
  if (!appwrite) return;
  const account = await appwrite.account.get();
  const userId = account.$id;

  const runs = await listCompletedRuns();
  const snapshot = buildStatsSnapshot(runs);
  const data = {
    userId,
    totalMeters: snapshot.totalMeters,
    totalRuns: snapshot.totalRuns,
    weekMeters: snapshot.weekMeters,
    streakWeeks: snapshot.streakWeeks,
    ...(snapshot.lastRunAt !== null ? { lastRunAt: snapshot.lastRunAt } : {}),
    ...(snapshot.pr5kSeconds !== null ? { pr5kSeconds: snapshot.pr5kSeconds } : {}),
    ...(snapshot.pr10kSeconds !== null ? { pr10kSeconds: snapshot.pr10kSeconds } : {}),
    ...(snapshot.prHalfSeconds !== null ? { prHalfSeconds: snapshot.prHalfSeconds } : {}),
    ...(snapshot.prFullSeconds !== null ? { prFullSeconds: snapshot.prFullSeconds } : {}),
  };

  let exists = true;
  try {
    await appwrite.tablesDB.getRow<ProfileStats>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.profileStats,
      rowId: userId,
    });
  } catch {
    exists = false;
  }

  if (exists) {
    await appwrite.tablesDB.updateRow<ProfileStats>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.profileStats,
      rowId: userId,
      data,
    });
  } else {
    const execution = await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ action: "claim-owned-row", tableId: TABLES.profileStats, ...data }),
    });
    const body = JSON.parse(execution.responseBody || "{}") as { ok?: boolean; error?: string };
    if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300 || !body.ok) {
      throw new Error(body.error ?? "failed");
    }
  }
}

export async function getProfileStats(userId: string): Promise<ProfileStats | null> {
  const appwrite = getAppwrite();
  if (!appwrite) return null;
  try {
    return await appwrite.tablesDB.getRow<ProfileStats>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.profileStats,
      rowId: userId,
    });
  } catch {
    return null;
  }
}
