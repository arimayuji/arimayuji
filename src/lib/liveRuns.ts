/**
 * Live position sharing — the "part 2" that watches a run happen, on top of
 * part 1's after-the-fact sync (runsSync.ts). One row per in-progress run,
 * row ID equal to the run's own local id (see `runIdRef` in
 * useRunTracker.ts), so it's found again by id instead of a query and simply
 * doesn't exist once the run ends — `endLiveSession` deletes it rather than
 * marking a status, so a coach never has to guess whether a lingering row is
 * stale.
 *
 * Coach-side reads are a poll (see /treinador/aluno), not a realtime
 * subscription — a few seconds of lag is fine for glancing at someone's
 * pace, and a plain GET is far easier to reason about and verify than a
 * WebSocket channel.
 *
 * Every write here is fire-and-forget and swallows its own errors: a dropped
 * live-tracking ping must never interrupt the run being recorded, which is
 * the one thing this whole app actually promises to get right.
 */
import { ExecutionMethod, Query, type Models } from "appwrite";
import { APPWRITE_DATABASE_ID, CLIENT_ACTIONS_FUNCTION_ID, TABLES, getAppwrite } from "./appwrite";
import { getCurrentAccount } from "./auth";

export interface LiveRun extends Models.Row {
  userId: string;
  startedAt: string;
  distanceMeters: number;
  currentPaceSecPerKm?: number;
  elapsedSeconds: number;
  lat: number;
  lon: number;
  updatedAtMs: number;
  /** Which "longão" (group_runs) session this ping belongs to, if any — lets a group of runners find each other's live rows with one query instead of the 1:1 coach case's per-athlete lookup. */
  sessionCode?: string;
}

export interface LiveRunUpdate {
  distanceMeters: number;
  currentPaceSecPerKm: number | null;
  elapsedSeconds: number;
  lat: number;
  lon: number;
}

/**
 * Creates the live row for `runId`, readable by `viewerIds` and no one else
 * besides the athlete. `viewerIds` used to only ever be "the one coach
 * picked before starting" — it's now the union of that and whoever is
 * currently in the athlete's "longão" session (see `sessionCode`), so the
 * same row serves both audiences without two separate live-tracking paths.
 *
 * Goes through the `client-actions` Function rather than writing the row
 * directly, because granting `read` to a viewer means assigning a permission
 * to somebody else's `user:<id>` — which Appwrite refuses outright from a
 * plain client session (`401 user_unauthorized: "Permissions must be one of:
 * (any, users, user:<caller>, ...)"`). This file used to do it client-side
 * and swallow the rejection in the same bare `catch` that guards genuine
 * network blips, so live sharing failed silently for every audience from the
 * day the table was created. Confirmed against production on 2026-08-27:
 * `live_runs` held 0 rows, meaning not one live run had ever been created by
 * a real user. Exactly the bug that friendships/coach_relationships already
 * hit — see sendFriendRequest's comment in the Function for the same story.
 */
export async function startLiveSession(
  runId: string,
  startedAt: number,
  viewerIds: string[],
  update: LiveRunUpdate,
  sessionCode?: string,
): Promise<boolean> {
  const appwrite = getAppwrite();
  if (!appwrite || viewerIds.length === 0) return false;
  const account = await getCurrentAccount();
  if (!account) return false;

  try {
    const execution = await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({
        action: "start-live-session",
        runId,
        viewerIds,
        sessionCode,
        data: {
          startedAt: new Date(startedAt).toISOString(),
          distanceMeters: update.distanceMeters,
          currentPaceSecPerKm: update.currentPaceSecPerKm ?? undefined,
          elapsedSeconds: update.elapsedSeconds,
          lat: update.lat,
          lon: update.lon,
          updatedAtMs: Date.now(),
        },
      }),
    });
    const parsed = JSON.parse(execution.responseBody || "{}") as { ok?: boolean; error?: string };
    if (!parsed.ok) {
      // Unlike the pings below, a failure here means the coach/friends will
      // see nothing for the whole run — worth a breadcrumb rather than the
      // silence that hid this exact call being broken for weeks.
      console.error("[liveRuns] startLiveSession failed:", parsed.error ?? execution.responseBody);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[liveRuns] startLiveSession threw:", err);
    return false;
  }
}

/**
 * Re-grants read on the already-running live row to exactly `viewerIds`,
 * without touching its data — called while a "longão" is in progress, since
 * who's in the session (and thus who should be able to see this athlete's
 * dot) can change after the row was first created. Best-effort like every
 * other write here: a missed refresh just means someone who joined recently
 * can't see this athlete yet, not a failed run.
 */
export async function refreshLiveSessionAudience(
  runId: string,
  viewerIds: string[],
  sessionCode?: string,
): Promise<void> {
  const appwrite = getAppwrite();
  if (!appwrite) return;
  const account = await getCurrentAccount();
  if (!account) return;
  try {
    // Same reason as startLiveSession above: this rewrites permissions, so it
    // has to run with the Function's key rather than the athlete's session.
    await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ action: "refresh-live-audience", runId, viewerIds, sessionCode }),
    });
  } catch {
    // Next refresh (or the next regular position update) catches up.
  }
}

/** Best-effort — a missed ping just means the coach's map is a few seconds staler, nothing more. */
export async function updateLiveSession(runId: string, update: LiveRunUpdate): Promise<void> {
  const appwrite = getAppwrite();
  if (!appwrite) return;
  try {
    await appwrite.tablesDB.updateRow<LiveRun>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.liveRuns,
      rowId: runId,
      data: {
        distanceMeters: update.distanceMeters,
        currentPaceSecPerKm: update.currentPaceSecPerKm ?? undefined,
        elapsedSeconds: update.elapsedSeconds,
        lat: update.lat,
        lon: update.lon,
        updatedAtMs: Date.now(),
      },
    });
  } catch {
    // Next tick's update will catch up — nothing to recover here.
  }
}

/** Deletes the row so it stops existing rather than lingering "active" — called on finish, discard, or unmount. */
export async function endLiveSession(runId: string): Promise<void> {
  const appwrite = getAppwrite();
  if (!appwrite) return;
  try {
    await appwrite.tablesDB.deleteRow({ databaseId: APPWRITE_DATABASE_ID, tableId: TABLES.liveRuns, rowId: runId });
  } catch {
    // Already gone, or never got created — either way there's nothing left to clean up.
  }
}

/** The signed-in coach's view of whether a specific student is live right now — row permissions do the access control. */
export async function getActiveLiveSession(studentId: string): Promise<LiveRun | null> {
  const appwrite = getAppwrite();
  if (!appwrite) return null;
  try {
    const result = await appwrite.tablesDB.listRows<LiveRun>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.liveRuns,
      queries: [Query.equal("userId", studentId), Query.limit(1)],
    });
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * A coach's "who's running right now" view across every student at once —
 * the summary strip on `/treinador/sala`. One query with `Query.equal` on
 * a list, same batching approach as `listRunsSharedByStudents` below;
 * exactly the same row-permission model as `getActiveLiveSession` still
 * applies per row, so this only ever returns students who actually shared
 * live access with this coach. `studentIds` empty just short-circuits —
 * Appwrite's `Query.equal` with an empty array isn't a query worth sending.
 */
export async function listLiveRunsForStudents(studentIds: string[]): Promise<LiveRun[]> {
  const appwrite = getAppwrite();
  if (!appwrite || studentIds.length === 0) return [];
  try {
    const result = await appwrite.tablesDB.listRows<LiveRun>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.liveRuns,
      queries: [Query.equal("userId", studentIds), Query.limit(studentIds.length)],
    });
    return result.rows;
  } catch {
    return [];
  }
}

/**
 * Every athlete currently live within one "longão" session — the group
 * live map's whole data source. Deliberately just a query on `sessionCode`
 * with no extra filtering: row permissions already restrict this to rows
 * the signed-in account can actually read (i.e. the athletes who had
 * already included this account in their audience via
 * `startLiveSession`/`refreshLiveSessionAudience`), so what comes back is
 * exactly the athletes visible to me, never the whole session's raw list.
 */
export async function listSessionLiveRuns(sessionCode: string): Promise<LiveRun[]> {
  const appwrite = getAppwrite();
  if (!appwrite) return [];
  try {
    const result = await appwrite.tablesDB.listRows<LiveRun>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.liveRuns,
      queries: [Query.equal("sessionCode", sessionCode), Query.limit(30)],
    });
    return result.rows;
  } catch {
    return [];
  }
}
