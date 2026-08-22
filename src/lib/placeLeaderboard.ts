/**
 * "Ranking de lugares" — cumulative km per (place, person), the live layer
 * behind the leaderboard on `/lugares/[id]`. Same one-row-per-pair,
 * deterministic-row-ID shape as `src/lib/placeRatings.ts`, but every row
 * here is always publicly readable (`Role.any()`) — the actual privacy
 * gate is upstream of this file entirely: `recordRunAtPlace` is only ever
 * called once an athlete has both opted in (`Profile.leaderboardOptIn`)
 * and confirmed a specific run, never automatically. Once a row exists,
 * it's meant to be visible; the "amigos" leaderboard view is a client-side
 * filter over these same public rows (cross-referenced against
 * `listFriendConnections`), not a separately-gated dataset — see the note
 * on the `place_run_stats` table in scripts/appwrite-setup.ts for why a
 * true server-enforced friends-only read isn't implemented here, same
 * accepted limitation `place_ratings`'s "friends" visibility already has.
 *
 * This row's *first* creation at a given place goes through the
 * `claim-owned-row` Function rather than a direct `createRow` — see that
 * function's comment for why a client-chosen row ID here used to let one
 * account seed another's totals at a place before they'd ever run there
 * (LGPD/security audit finding #12).
 */
import { ExecutionMethod, Query, type Models } from "appwrite";
import { APPWRITE_DATABASE_ID, CLIENT_ACTIONS_FUNCTION_ID, TABLES, getAppwrite } from "./appwrite";
import { getPublicProfile, type PublicProfile } from "./auth";

export interface PlaceRunStats extends Models.Row {
  placeId: string;
  userId: string;
  totalMeters: number;
  runCount: number;
  lastRunAt: string;
}

export interface PlaceLeaderboardEntry {
  userId: string;
  totalMeters: number;
  runCount: number;
  lastRunAt: string;
  /**
   * Never the real `displayName` — this list is fetched by anyone who
   * opens a place, friend or not, so it only ever carries the fields
   * `PublicProfile` allows. The "amigos" view resolves the real name
   * separately, from `listFriendConnections` (already scoped to genuine,
   * confirmed friendships), not from this row.
   */
  profile: PublicProfile | null;
}

function statsRowId(placeId: string, userId: string): string {
  return `${placeId}_${userId}`;
}

/**
 * Adds `distanceMeters` to this athlete's running total at `placeId`,
 * creating the row on the first run there. Not atomic (Appwrite has no
 * server-side increment on this API) — reads the current total, then
 * writes total+delta; a lost update here just means one run's distance
 * occasionally doesn't count yet, never a corrupted/negative total, and
 * the next confirmed run corrects the same way every other value here
 * self-corrects over time.
 *
 * `userId` is read from the live session, not a parameter — same reasoning
 * `submitRating` documents: trusting a caller-supplied id would let a
 * public row be attributed to the wrong account.
 */
export async function recordRunAtPlace(placeId: string, distanceMeters: number): Promise<void> {
  const appwrite = getAppwrite();
  if (!appwrite) return;
  const account = await appwrite.account.get();
  const userId = account.$id;
  const rowId = statsRowId(placeId, userId);

  let current: PlaceRunStats | null = null;
  try {
    current = await appwrite.tablesDB.getRow<PlaceRunStats>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.placeRunStats,
      rowId,
    });
  } catch {
    current = null;
  }

  const totalMeters = (current?.totalMeters ?? 0) + distanceMeters;
  const runCount = (current?.runCount ?? 0) + 1;
  const lastRunAt = new Date().toISOString();

  if (current) {
    await appwrite.tablesDB.updateRow<PlaceRunStats>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.placeRunStats,
      rowId,
      data: { placeId, userId, totalMeters, runCount, lastRunAt },
    });
  } else {
    const execution = await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ action: "claim-owned-row", tableId: TABLES.placeRunStats, placeId, totalMeters, runCount, lastRunAt }),
    });
    const body = JSON.parse(execution.responseBody || "{}") as { ok?: boolean; error?: string };
    if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300 || !body.ok) {
      throw new Error(body.error ?? "failed");
    }
  }
}

/**
 * Every stats row for `placeId`, highest total first, with each entry's
 * profile resolved via `getPublicProfile` — never the real `displayName`,
 * since this list is fetched by anyone who opens the place, not gated on
 * friendship. Callers pick which entries to keep for the "amigos" view
 * (this function always returns the full public list) and resolve the
 * real name for those separately, from `listFriendConnections` — a call
 * that's actually scoped to confirmed friendships, unlike this one.
 */
export async function getLeaderboardForPlace(placeId: string, limit = 50): Promise<PlaceLeaderboardEntry[]> {
  const appwrite = getAppwrite();
  if (!appwrite) return [];
  const result = await appwrite.tablesDB.listRows<PlaceRunStats>({
    databaseId: APPWRITE_DATABASE_ID,
    tableId: TABLES.placeRunStats,
    queries: [Query.equal("placeId", placeId), Query.orderDesc("totalMeters"), Query.limit(limit)],
  });
  const entries = await Promise.all(
    result.rows.map(async (row) => ({
      userId: row.userId,
      totalMeters: row.totalMeters,
      runCount: row.runCount,
      lastRunAt: row.lastRunAt,
      profile: await getPublicProfile(row.userId),
    })),
  );
  return entries;
}
