/**
 * "Correr por amigo por perto" — a one-shot "I opened the app here" ping,
 * not a live tracker. Every write goes through the `refresh-presence`
 * client-actions action (never client-direct), because the row's read
 * permission has to be granted to every accepted friend, which a plain
 * client session can't assign to someone else's `user:<id>` — same rule
 * `liveRuns.ts`'s `startLiveSession` documents. The Function also re-checks
 * `Profile.nearbyOptIn` server-side before writing anything, so a stale
 * client-side flag can never publish a location on its own.
 *
 * Deliberately its own table (`friend_presence`), not `live_runs` — a run's
 * row is deleted the instant the run ends; presence has no such event, it
 * just ages out (see `PRESENCE_STALE_MS` in the caller, `/amigos`).
 */
import { ExecutionMethod, Query, type Models } from "appwrite";
import { APPWRITE_DATABASE_ID, CLIENT_ACTIONS_FUNCTION_ID, TABLES, getAppwrite } from "./appwrite";
import { getCurrentAccount } from "./auth";

export interface FriendPresence extends Models.Row {
  lat: number;
  lon: number;
  updatedAtMs: number;
}

/** Publishes the caller's current location as their presence ping, visible to every currently-accepted friend. Best-effort like every other live-sharing write in this app — a dropped ping just means friends see a staler (or no) location, never a broken run or a crash. */
export async function refreshMyPresence(lat: number, lon: number): Promise<boolean> {
  const appwrite = getAppwrite();
  if (!appwrite) return false;
  const account = await getCurrentAccount();
  if (!account) return false;

  try {
    const execution = await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ action: "refresh-presence", lat, lon }),
    });
    const parsed = JSON.parse(execution.responseBody || "{}") as { ok?: boolean };
    return !!parsed.ok;
  } catch (err) {
    console.error("[friendPresence] refreshMyPresence threw:", err);
    return false;
  }
}

/** Every requested friend's presence row this account can actually read — row permissions already restrict the result to friends who are both opted in and still accepted, so no extra filtering is needed here. */
export async function listFriendsPresence(friendIds: string[]): Promise<FriendPresence[]> {
  const appwrite = getAppwrite();
  if (!appwrite || friendIds.length === 0) return [];
  try {
    const result = await appwrite.tablesDB.listRows<FriendPresence>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.friendPresence,
      queries: [Query.equal("$id", friendIds), Query.limit(friendIds.length)],
    });
    return result.rows;
  } catch {
    return [];
  }
}

/** Deletes the caller's own presence row — called the moment `nearbyOptIn` is switched off, so turning it off actually stops sharing immediately instead of just letting the last reading go stale for 15 minutes. */
export async function clearMyPresence(): Promise<void> {
  const appwrite = getAppwrite();
  if (!appwrite) return;
  const account = await getCurrentAccount();
  if (!account) return;
  try {
    await appwrite.tablesDB.deleteRow({ databaseId: APPWRITE_DATABASE_ID, tableId: TABLES.friendPresence, rowId: account.id });
  } catch {
    // Already gone, or never existed — nothing left to clean up.
  }
}
