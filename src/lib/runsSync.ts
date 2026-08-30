/**
 * Sharing one completed run with a coach — the "part 1" of coach visibility:
 * synced after the fact, not watched live. A run recorded and viewed
 * entirely on-device never touches this; it only runs when the athlete
 * explicitly taps "enviar pro treinador" on a specific run.
 *
 * One Appwrite row per (athlete, run) — re-sharing the same run with a
 * second coach adds that coach's read permission to the *same* row instead
 * of duplicating it, found by matching `userId` + `startedAt` since the
 * `runs` table has no column back to the run's local IndexedDB id.
 *
 * Same degrade-to-empty/false convention as the rest of the backend layer.
 */
import { ExecutionMethod, type Models, Query } from "appwrite";
import { APPWRITE_DATABASE_ID, CLIENT_ACTIONS_FUNCTION_ID, TABLES, getAppwrite } from "./appwrite";
import { getCurrentAccount } from "./auth";
import type { CompletedRun, StoredPoint } from "./tracking/storage";
import { runMovingSeconds } from "./tracking/storage";

export interface SyncedRun extends Models.Row {
  userId: string;
  startedAt: string;
  finishedAt: string;
  distanceMeters: number;
  movingSeconds: number;
  points?: string;
  shoeName?: string;
  visibility: "public" | "friends" | "private";
}

/** Keeps the row's JSON string well under the column's size limit, first/last point always kept. */
const MAX_SYNCED_POINTS = 500;

function downsamplePoints(points: StoredPoint[]): StoredPoint[] {
  if (points.length <= MAX_SYNCED_POINTS) return points;
  const stride = points.length / MAX_SYNCED_POINTS;
  const out: StoredPoint[] = [];
  for (let i = 0; i < MAX_SYNCED_POINTS; i++) out.push(points[Math.floor(i * stride)]);
  out.push(points[points.length - 1]);
  return out;
}

export type ShareRunResult = { ok: true } | { ok: false; reason: "unavailable" | "no-coach" | "failed" };

/**
 * Common plumbing for both `shareRunWithCoaches` and
 * `setRunFriendsVisibility` below: both end up calling the same
 * `share-run` action in `client-actions`, just with a different slice of
 * its (independent) `coachIds`/`shareWithFriends` knobs — see that
 * action's own comment in main.js for why they're kept independent
 * rather than one combined "audience" the two callers would stomp on
 * each other's behalf.
 *
 * This used to write `runs` directly from here, granting
 * `Permission.read(Role.user(coachId))` from a plain client session —
 * which Appwrite always refuses for a role that isn't the caller's own
 * (`401 user_unauthorized`), the same root cause already found and fixed
 * in `friendships.ts` (2026-08-26) and `liveRuns.ts` (2026-08-27). The
 * bare `catch` here swallowed that silently, so sharing a run with a
 * coach has likely never actually worked. Moved into the Function, same
 * pattern as `sendFriendRequest`.
 */
async function callShareRun(
  run: CompletedRun,
  extra: {
    coachIds?: string[];
    shareWithFriends?: boolean;
    achievementLabels?: string[];
    caption?: string;
    placeName?: string;
    elevationGainMeters?: number;
  },
): Promise<ShareRunResult> {
  const appwrite = getAppwrite();
  if (!appwrite) return { ok: false, reason: "unavailable" };

  try {
    const execution = await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({
        action: "share-run",
        startedAtMs: run.startedAt,
        finishedAtMs: run.finishedAt,
        distanceMeters: run.distanceMeters,
        movingSeconds: runMovingSeconds(run),
        points: JSON.stringify(downsamplePoints(run.points)),
        shoeName: run.shoeName,
        // Computed on-device (the athlete's own history/track list is
        // already available where this is called from — run-detail.tsx),
        // never re-derived by the Function. See share-run's own comment.
        achievements: extra.achievementLabels && extra.achievementLabels.length > 0 ? extra.achievementLabels : undefined,
        tracks: run.tracks && run.tracks.length > 0 ? run.tracks.map((t) => ({ name: t.name, artist: t.artist })) : undefined,
        caption: extra.caption,
        placeName: extra.placeName,
        elevationGainMeters: extra.elevationGainMeters,
        coachIds: extra.coachIds,
        shareWithFriends: extra.shareWithFriends,
      }),
    });
    const parsed = JSON.parse(execution.responseBody || "{}") as { ok?: boolean; error?: string };
    if (parsed.ok) return { ok: true };
    return { ok: false, reason: parsed.error === "no-audience" ? "no-coach" : "failed" };
  } catch (error) {
    console.error("[runsSync] share-run failed", error);
    return { ok: false, reason: "failed" };
  }
}

/**
 * Shares `run` with every coach in `coachIds` (accepted relationships only —
 * the caller is expected to have filtered to those, same as the UI does;
 * the Function re-validates this itself regardless). `userId` is never a
 * parameter here, same rule `submitRating`/`sendFriendRequest` follow: it
 * comes from the caller's own session inside the Function, not from
 * anything the client passes in.
 */
export async function shareRunWithCoaches(
  run: CompletedRun,
  coachIds: string[],
  achievementLabels: string[] = [],
): Promise<ShareRunResult> {
  if (coachIds.length === 0) return { ok: false, reason: "no-coach" };
  return callShareRun(run, { coachIds, achievementLabels });
}

/**
 * Turns this run's visibility in the friends feed on or off — a separate
 * knob from `shareRunWithCoaches` above, never touching `coachIds`, so
 * toggling one never silently undoes the other on the same row (see
 * `callShareRun`'s comment). `achievementLabels` (e.g. `["5 km"]` for new
 * PRs this run set) rides along so the feed card can show them —
 * computed by the caller, which already has the full run history needed
 * to know what's actually a new record (see personalRecords.ts).
 * `extras.caption` is the athlete's own free-text line for the post (a
 * "pace paquera" kind of joke — never a preset the app suggests);
 * `placeName`/`elevationGainMeters` are whatever run-detail.tsx already
 * resolved for its own display, just carried along as a snapshot.
 */
export async function setRunFriendsVisibility(
  run: CompletedRun,
  shareWithFriends: boolean,
  achievementLabels: string[] = [],
  extras: { caption?: string; placeName?: string; elevationGainMeters?: number } = {},
): Promise<ShareRunResult> {
  return callShareRun(run, { shareWithFriends, achievementLabels, ...extras });
}

/**
 * The Appwrite row for one of *my own* runs, found by its exact start
 * time — the same lookup key `shareRunWithCoaches` already uses to avoid
 * duplicating a row on re-share. Null when this run was never shared (no
 * row exists) or sharing isn't available, never an error — the caller
 * reads that as "no comments to show," not "something went wrong."
 */
export async function getSyncedRun(startedAtMs: number): Promise<SyncedRun | null> {
  const appwrite = getAppwrite();
  if (!appwrite) return null;
  const account = await getCurrentAccount();
  if (!account) return null;

  try {
    const result = await appwrite.tablesDB.listRows<SyncedRun>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.runs,
      queries: [
        Query.equal("userId", account.id),
        Query.equal("startedAt", new Date(startedAtMs).toISOString()),
        Query.limit(1),
      ],
    });
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Every run a specific student has shared with the signed-in coach — row-level permissions do the filtering, not this query. */
export async function listRunsSharedByStudent(studentId: string): Promise<SyncedRun[]> {
  const appwrite = getAppwrite();
  if (!appwrite) return [];
  try {
    const result = await appwrite.tablesDB.listRows<SyncedRun>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.runs,
      queries: [Query.equal("userId", studentId), Query.orderDesc("startedAt"), Query.limit(100)],
    });
    return result.rows;
  } catch {
    return [];
  }
}

/**
 * The same shared-runs read as `listRunsSharedByStudent`, batched across
 * every student at once for `/treinador/sala` — one query instead of N,
 * grouped back by `userId` since a single `Query.equal` with a list can't
 * keep each student's own `Query.limit`/ordering separate. Capped at 300
 * rows total (not 100 per student): the dashboard only needs "last run" /
 * "last 7 days" per student, not each one's full paginated history — a
 * coach with many active students would otherwise pull thousands of rows
 * for a summary strip that shows a handful of facts per person.
 */
export async function listRunsSharedByStudents(studentIds: string[]): Promise<Map<string, SyncedRun[]>> {
  const appwrite = getAppwrite();
  const byStudent = new Map<string, SyncedRun[]>();
  if (!appwrite || studentIds.length === 0) return byStudent;
  try {
    const result = await appwrite.tablesDB.listRows<SyncedRun>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.runs,
      queries: [Query.equal("userId", studentIds), Query.orderDesc("startedAt"), Query.limit(300)],
    });
    for (const run of result.rows) {
      const forStudent = byStudent.get(run.userId);
      if (forStudent) forStudent.push(run);
      else byStudent.set(run.userId, [run]);
    }
    return byStudent;
  } catch {
    return byStudent;
  }
}
