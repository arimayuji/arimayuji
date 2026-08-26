/**
 * Friendships between two accounts, as real Appwrite rows. One row per
 * pair — `pairKey` is `[a, b].sort().join(":")`, and the unique index on
 * it (see scripts/appwrite-setup.ts) is what actually rejects a reversed
 * duplicate request, not app logic.
 *
 * Same convention as the rest of the backend layer: everything degrades
 * to an empty array / a `{ ok: false }` result when Appwrite isn't
 * configured or nobody is signed in, since none of this is needed to
 * record a run.
 */
import { ExecutionMethod, type Models, Query } from "appwrite";
import { APPWRITE_DATABASE_ID, CLIENT_ACTIONS_FUNCTION_ID, TABLES, getAppwrite } from "./appwrite";
import { getCurrentAccount, getProfile, type Profile } from "./auth";

export type FriendshipStatus = "pending" | "accepted";

export interface Friendship extends Models.Row {
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  pairKey: string;
  respondedAt?: string;
}

/** "incoming" means the signed-in account is the addressee — the side that can accept. */
export type FriendshipDirection = "incoming" | "outgoing";

/** A friendship as a screen needs it: who the *other* person is, already resolved. */
export interface FriendConnection {
  friendship: Friendship;
  direction: FriendshipDirection;
  otherId: string;
  /** Null when that account never finished picking a handle, or its profile row is gone. */
  profile: Profile | null;
}

export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

export type SendFriendRequestResult =
  | { ok: true; friendship: Friendship }
  | { ok: false; reason: "unavailable" | "not-found" | "self" | "duplicate" | "failed" };

/**
 * Sends a request to whoever owns `@handle`, via the `client-actions`
 * Function's `send-friend-request` action rather than a direct client-side
 * `createRow`. This has to run privileged: the row needs read/update/delete
 * permission granted to the ADDRESSEE, a role the requester's own session
 * is never allowed to assign — Appwrite only lets a caller grant
 * permissions to roles it already holds itself ("any", "users", or its own
 * "user:<id>"), never an arbitrary other user's "user:<id>". A direct
 * client createRow (this function's original implementation) always failed
 * with `user_unauthorized` for exactly this reason — confirmed 2026-08-26
 * by replaying the exact same calls by hand against two disposable test
 * accounts; `friendships` had 0 rows in production despite real signups,
 * silently, since the table was created.
 */
export async function sendFriendRequest(handle: string): Promise<SendFriendRequestResult> {
  const appwrite = getAppwrite();
  if (!appwrite) return { ok: false, reason: "unavailable" };

  const wanted = normalizeHandle(handle);
  if (!wanted) return { ok: false, reason: "not-found" };

  try {
    const execution = await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ action: "send-friend-request", handle: wanted }),
    });
    const parsed = JSON.parse(execution.responseBody || "{}") as {
      ok?: boolean;
      row?: Friendship;
      error?: string;
    };
    if (parsed.ok && parsed.row) return { ok: true, friendship: parsed.row };
    const reason = parsed.error;
    if (reason === "not-found" || reason === "self" || reason === "duplicate") {
      return { ok: false, reason };
    }
    return { ok: false, reason: "failed" };
  } catch (error) {
    console.error("[friendships] sendFriendRequest failed", error);
    return { ok: false, reason: "failed" };
  }
}

/**
 * Public handle lookup, no session required — profile rows are readable by
 * anyone (see `createProfile`'s comment in auth.ts), so this works from the
 * signed-out invite-link landing page (`/convite`) the same as from inside
 * the app. Same query `sendFriendRequest` above already runs to resolve a
 * handle to an account, just without requiring the caller to be signed in.
 */
export async function getProfileByHandle(handle: string): Promise<Profile | null> {
  const appwrite = getAppwrite();
  if (!appwrite) return null;
  const wanted = normalizeHandle(handle);
  if (!wanted) return null;
  try {
    const found = await appwrite.tablesDB.listRows<Profile>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.profiles,
      queries: [Query.equal("handle", wanted), Query.limit(1)],
    });
    return found.rows[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Accept or decline. A decline *deletes* the row rather than recording a
 * "rejected" state: the schema's status enum is `pending | accepted` and
 * nothing else, so there is nowhere to store a refusal — and deleting
 * frees the `pairKey` again, so the two can try later instead of being
 * locked out forever by the unique index.
 *
 * Who may do what isn't checked here — it's enforced by the row's own
 * permissions (only the addressee holds update), so a requester trying to
 * accept their own request gets rejected by Appwrite, not by a client-side
 * `if` anyone could edit out.
 */
export async function respondToFriendRequest(friendshipId: string, accept: boolean): Promise<boolean> {
  const appwrite = getAppwrite();
  if (!appwrite) return false;
  try {
    if (!accept) return await removeFriendship(friendshipId);
    await appwrite.tablesDB.updateRow<Friendship>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.friendships,
      rowId: friendshipId,
      data: { status: "accepted", respondedAt: new Date().toISOString() },
    });
    return true;
  } catch (error) {
    console.error("[friendships] respondToFriendRequest failed", error);
    return false;
  }
}

/** Cancel a request you sent, or unfriend — both sides hold delete on the row. */
export async function removeFriendship(friendshipId: string): Promise<boolean> {
  const appwrite = getAppwrite();
  if (!appwrite) return false;
  try {
    await appwrite.tablesDB.deleteRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.friendships,
      rowId: friendshipId,
    });
    return true;
  } catch (error) {
    console.error("[friendships] removeFriendship failed", error);
    return false;
  }
}

/**
 * Every friendship the signed-in account is part of, on either side.
 * Appwrite has no OR across two columns, so this is two queries merged
 * locally — deduped by row ID, newest first.
 */
export async function listFriendships(status?: FriendshipStatus): Promise<Friendship[]> {
  const appwrite = getAppwrite();
  if (!appwrite) return [];
  const account = await getCurrentAccount();
  if (!account) return [];

  const statusQuery = status ? [Query.equal("status", status)] : [];
  const forColumn = (column: "requesterId" | "addresseeId") =>
    appwrite.tablesDB.listRows<Friendship>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.friendships,
      queries: [Query.equal(column, account.id), ...statusQuery, Query.orderDesc("$createdAt"), Query.limit(100)],
    });

  const [sent, received] = await Promise.all([forColumn("requesterId"), forColumn("addresseeId")]);
  const byId = new Map<string, Friendship>();
  for (const row of [...sent.rows, ...received.rows]) byId.set(row.$id, row);
  return [...byId.values()].sort((a, b) => b.$createdAt.localeCompare(a.$createdAt));
}

/**
 * The same list, with the other participant's profile resolved for
 * display. Profiles are publicly readable, so this needs no extra
 * permission — a missing one stays `null` rather than dropping the
 * friendship from the list.
 */
export async function listFriendConnections(status?: FriendshipStatus): Promise<FriendConnection[]> {
  const account = await getCurrentAccount();
  if (!account) return [];
  const rows = await listFriendships(status);
  const otherIds = [...new Set(rows.map((row) => (row.requesterId === account.id ? row.addresseeId : row.requesterId)))];
  const profiles = new Map<string, Profile | null>();
  await Promise.all(
    otherIds.map(async (id) => {
      profiles.set(id, await getProfile(id));
    }),
  );
  return rows.map((friendship) => {
    const otherId = friendship.requesterId === account.id ? friendship.addresseeId : friendship.requesterId;
    return {
      friendship,
      direction: friendship.addresseeId === account.id ? "incoming" : "outgoing",
      otherId,
      profile: profiles.get(otherId) ?? null,
    } satisfies FriendConnection;
  });
}
