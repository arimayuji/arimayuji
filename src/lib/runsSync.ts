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
import { ID, type Models, Permission, Query, Role } from "appwrite";
import { APPWRITE_DATABASE_ID, TABLES, getAppwrite } from "./appwrite";
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
 * Shares `run` with every coach in `coachIds` (accepted relationships only —
 * the caller is expected to have filtered to those, same as the UI does).
 * `userId` is deliberately never a parameter, same rule `submitRating` and
 * `sendFriendRequest` follow: it comes from the live session inside this
 * function, not from anything the caller passes in.
 */
export async function shareRunWithCoaches(run: CompletedRun, coachIds: string[]): Promise<ShareRunResult> {
  const appwrite = getAppwrite();
  if (!appwrite) return { ok: false, reason: "unavailable" };
  if (coachIds.length === 0) return { ok: false, reason: "no-coach" };

  const account = await getCurrentAccount();
  if (!account) return { ok: false, reason: "unavailable" };
  const userId = account.id;

  const startedAtIso = new Date(run.startedAt).toISOString();
  const data = {
    userId,
    startedAt: startedAtIso,
    finishedAt: new Date(run.finishedAt).toISOString(),
    distanceMeters: run.distanceMeters,
    movingSeconds: runMovingSeconds(run),
    points: JSON.stringify(downsamplePoints(run.points)),
    shoeName: run.shoeName,
    visibility: "private" as const,
  };

  const ownerPermissions = [
    Permission.read(Role.user(userId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ];
  const coachPermissions = coachIds.map((coachId) => Permission.read(Role.user(coachId)));

  try {
    const existing = await appwrite.tablesDB.listRows<SyncedRun>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.runs,
      queries: [Query.equal("userId", userId), Query.equal("startedAt", startedAtIso), Query.limit(1)],
    });
    const row = existing.rows[0];

    if (row) {
      const permissions = [...new Set([...row.$permissions, ...ownerPermissions, ...coachPermissions])];
      await appwrite.tablesDB.updateRow<SyncedRun>({
        databaseId: APPWRITE_DATABASE_ID,
        tableId: TABLES.runs,
        rowId: row.$id,
        data,
        permissions,
      });
    } else {
      await appwrite.tablesDB.createRow<SyncedRun>({
        databaseId: APPWRITE_DATABASE_ID,
        tableId: TABLES.runs,
        rowId: ID.unique(),
        data,
        permissions: [...ownerPermissions, ...coachPermissions],
      });
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
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
