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
import { Permission, Query, Role, type Models } from "appwrite";
import { APPWRITE_DATABASE_ID, TABLES, getAppwrite } from "./appwrite";
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
}

export interface LiveRunUpdate {
  distanceMeters: number;
  currentPaceSecPerKm: number | null;
  elapsedSeconds: number;
  lat: number;
  lon: number;
}

/** Creates the live row for `runId`, readable by `coachIds` and no one else besides the athlete. */
export async function startLiveSession(
  runId: string,
  startedAt: number,
  coachIds: string[],
  update: LiveRunUpdate,
): Promise<boolean> {
  const appwrite = getAppwrite();
  if (!appwrite || coachIds.length === 0) return false;
  const account = await getCurrentAccount();
  if (!account) return false;

  try {
    await appwrite.tablesDB.createRow<LiveRun>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.liveRuns,
      rowId: runId,
      data: {
        userId: account.id,
        startedAt: new Date(startedAt).toISOString(),
        distanceMeters: update.distanceMeters,
        currentPaceSecPerKm: update.currentPaceSecPerKm ?? undefined,
        elapsedSeconds: update.elapsedSeconds,
        lat: update.lat,
        lon: update.lon,
        updatedAtMs: Date.now(),
      },
      permissions: [
        Permission.read(Role.user(account.id)),
        Permission.update(Role.user(account.id)),
        Permission.delete(Role.user(account.id)),
        ...coachIds.map((coachId) => Permission.read(Role.user(coachId))),
      ],
    });
    return true;
  } catch {
    return false;
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
