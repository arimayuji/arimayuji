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
import { ID, type Models, Permission, Query, Role } from "appwrite";
import { APPWRITE_DATABASE_ID, TABLES, getAppwrite } from "./appwrite";
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

function pairKeyOf(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

export type SendFriendRequestResult =
  | { ok: true; friendship: Friendship }
  | { ok: false; reason: "unavailable" | "not-found" | "self" | "duplicate" | "failed" };

/**
 * Sends a request to whoever owns `@handle`. The target is resolved
 * through the `profiles` table, whose row ID *is* the account ID (see
 * `createProfile`) — so `profile.$id` is the addressee's user ID, with no
 * second lookup.
 *
 * `requesterId` is deliberately NOT a parameter: it comes from the live
 * session inside this function, the same rule `submitRating` follows.
 * A caller-supplied requester ID would let any signed-in account mint a
 * friendship attributed to someone else's profile — the table-level
 * permission only checks "is this account signed in", never "is this row
 * about them".
 *
 * Row permissions are deliberately asymmetric:
 * - read for both, so the addressee can actually see the request arrive;
 * - update for the addressee *only*, because accepting is the one write
 *   that changes the row and only they may do it — granting the requester
 *   update as well would let them flip their own request to "accepted"
 *   without the other person ever agreeing;
 * - delete for both, which covers all three of cancel (requester),
 *   decline (addressee) and unfriend (either), none of which need update.
 */
export async function sendFriendRequest(handle: string): Promise<SendFriendRequestResult> {
  const appwrite = getAppwrite();
  if (!appwrite) return { ok: false, reason: "unavailable" };

  let requesterId: string;
  try {
    requesterId = (await appwrite.account.get()).$id;
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  const wanted = normalizeHandle(handle);
  if (!wanted) return { ok: false, reason: "not-found" };

  try {
    const found = await appwrite.tablesDB.listRows<Profile>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.profiles,
      queries: [Query.equal("handle", wanted), Query.limit(1)],
    });
    const target = found.rows[0];
    if (!target) return { ok: false, reason: "not-found" };

    const addresseeId = target.$id;
    if (addresseeId === requesterId) return { ok: false, reason: "self" };

    const pairKey = pairKeyOf(requesterId, addresseeId);
    // Only the two participants can read a friendship row, so this either
    // finds *our* row or nothing — it can't leak anyone else's. It turns
    // the unique-index 409 into a message the screen can explain, and the
    // index still backstops the race between two simultaneous requests.
    const existing = await appwrite.tablesDB.listRows<Friendship>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.friendships,
      queries: [Query.equal("pairKey", pairKey), Query.limit(1)],
    });
    if (existing.rows.length > 0) return { ok: false, reason: "duplicate" };

    const friendship = await appwrite.tablesDB.createRow<Friendship>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.friendships,
      rowId: ID.unique(),
      data: { requesterId, addresseeId, status: "pending", pairKey },
      permissions: [
        Permission.read(Role.user(requesterId)),
        Permission.read(Role.user(addresseeId)),
        Permission.update(Role.user(addresseeId)),
        Permission.delete(Role.user(requesterId)),
        Permission.delete(Role.user(addresseeId)),
      ],
    });
    return { ok: true, friendship };
  } catch {
    return { ok: false, reason: "failed" };
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
  } catch {
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
  } catch {
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
