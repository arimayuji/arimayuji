/**
 * Coach/student relationships between two accounts, as real Appwrite rows —
 * same shape as friendships.ts, but the two sides aren't interchangeable:
 * `coachId` and `studentId` are different roles, not "requester/addressee"
 * for one undirected pair. `proposedBy` is who has to wait; whoever is on
 * the *other* column is the one who can accept.
 *
 * One row per (coachId, studentId) pair — the unique index on that pair
 * (see scripts/appwrite-setup.ts) is what actually rejects a duplicate
 * proposal, not app logic. The same two people can hold both roles at once
 * (A coaches B, B also coaches A) as two separate rows; that's allowed on
 * purpose rather than special-cased away.
 *
 * Same degrade-to-empty convention as the rest of the backend layer.
 */
import { ID, type Models, Permission, Query, Role } from "appwrite";
import { APPWRITE_DATABASE_ID, TABLES, getAppwrite } from "./appwrite";
import { getCurrentAccount, getProfile, type Profile } from "./auth";
import { normalizeHandle } from "./friendships";

export type CoachRelationshipStatus = "pending" | "accepted";

export interface CoachRelationship extends Models.Row {
  coachId: string;
  studentId: string;
  proposedBy: string;
  status: CoachRelationshipStatus;
  respondedAt?: string;
}

/** Which role the *signed-in* account holds in this row. */
export type MyCoachRole = "coach" | "student";

/** "incoming" means the signed-in account did *not* propose it — the side that can accept. */
export type CoachRelationshipDirection = "incoming" | "outgoing";

export interface CoachConnection {
  relationship: CoachRelationship;
  myRole: MyCoachRole;
  direction: CoachRelationshipDirection;
  otherId: string;
  /** Null when that account never finished picking a handle, or its profile row is gone. */
  profile: Profile | null;
}

export type ProposeCoachResult =
  | { ok: true; relationship: CoachRelationship }
  | { ok: false; reason: "unavailable" | "not-found" | "self" | "duplicate" | "failed" };

/**
 * Proposes a coach/student relationship with whoever owns `@handle`.
 * `asRole: "student"` means "I'm asking this person to coach me" (they
 * become `coachId`); `asRole: "coach"` means "I'm asking this person to
 * let me coach them" (they become `studentId`). Either way the signed-in
 * account is `proposedBy` and the other side holds `update` — the same
 * asymmetric-permissions reasoning as `sendFriendRequest`, and for the
 * same reason: a caller-supplied identity would let anyone mint a
 * relationship attributed to someone else.
 */
export async function proposeCoachRelationship(
  handle: string,
  asRole: MyCoachRole,
): Promise<ProposeCoachResult> {
  const appwrite = getAppwrite();
  if (!appwrite) return { ok: false, reason: "unavailable" };

  let myId: string;
  try {
    myId = (await appwrite.account.get()).$id;
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

    const otherId = target.$id;
    if (otherId === myId) return { ok: false, reason: "self" };

    const coachId = asRole === "student" ? otherId : myId;
    const studentId = asRole === "student" ? myId : otherId;

    // Row-level permissions only let each participant see relationships
    // they're actually part of, so this either finds *our* row or nothing.
    const existing = await appwrite.tablesDB.listRows<CoachRelationship>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.coachRelationships,
      queries: [Query.equal("coachId", coachId), Query.equal("studentId", studentId), Query.limit(1)],
    });
    if (existing.rows.length > 0) return { ok: false, reason: "duplicate" };

    const relationship = await appwrite.tablesDB.createRow<CoachRelationship>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.coachRelationships,
      rowId: ID.unique(),
      data: { coachId, studentId, proposedBy: myId, status: "pending" },
      permissions: [
        Permission.read(Role.user(coachId)),
        Permission.read(Role.user(studentId)),
        Permission.update(Role.user(otherId)),
        Permission.delete(Role.user(coachId)),
        Permission.delete(Role.user(studentId)),
      ],
    });
    return { ok: true, relationship };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** Accept or decline. A decline deletes the row, same reasoning as `respondToFriendRequest`. */
export async function respondToCoachRequest(relationshipId: string, accept: boolean): Promise<boolean> {
  const appwrite = getAppwrite();
  if (!appwrite) return false;
  try {
    if (!accept) return await removeCoachRelationship(relationshipId);
    await appwrite.tablesDB.updateRow<CoachRelationship>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.coachRelationships,
      rowId: relationshipId,
      data: { status: "accepted", respondedAt: new Date().toISOString() },
    });
    return true;
  } catch {
    return false;
  }
}

/** Cancel a request you sent, or end the relationship — both sides hold delete on the row. */
export async function removeCoachRelationship(relationshipId: string): Promise<boolean> {
  const appwrite = getAppwrite();
  if (!appwrite) return false;
  try {
    await appwrite.tablesDB.deleteRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.coachRelationships,
      rowId: relationshipId,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Every coach relationship the signed-in account is part of, in either
 * role. Two queries merged locally (Appwrite has no OR across columns),
 * deduped by row ID, newest first.
 */
export async function listCoachRelationships(status?: CoachRelationshipStatus): Promise<CoachRelationship[]> {
  const appwrite = getAppwrite();
  if (!appwrite) return [];
  const account = await getCurrentAccount();
  if (!account) return [];

  const statusQuery = status ? [Query.equal("status", status)] : [];
  const forColumn = (column: "coachId" | "studentId") =>
    appwrite.tablesDB.listRows<CoachRelationship>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.coachRelationships,
      queries: [Query.equal(column, account.id), ...statusQuery, Query.orderDesc("$createdAt"), Query.limit(100)],
    });

  const [asCoach, asStudent] = await Promise.all([forColumn("coachId"), forColumn("studentId")]);
  const byId = new Map<string, CoachRelationship>();
  for (const row of [...asCoach.rows, ...asStudent.rows]) byId.set(row.$id, row);
  return [...byId.values()].sort((a, b) => b.$createdAt.localeCompare(a.$createdAt));
}

/** The same list, with the other participant's profile resolved for display. */
export async function listCoachConnections(status?: CoachRelationshipStatus): Promise<CoachConnection[]> {
  const account = await getCurrentAccount();
  if (!account) return [];
  const rows = await listCoachRelationships(status);
  const otherIds = [...new Set(rows.map((row) => (row.coachId === account.id ? row.studentId : row.coachId)))];
  const profiles = new Map<string, Profile | null>();
  await Promise.all(
    otherIds.map(async (id) => {
      profiles.set(id, await getProfile(id));
    }),
  );
  return rows.map((relationship) => {
    const myRole: MyCoachRole = relationship.coachId === account.id ? "coach" : "student";
    const otherId = myRole === "coach" ? relationship.studentId : relationship.coachId;
    return {
      relationship,
      myRole,
      direction: relationship.proposedBy === account.id ? "outgoing" : "incoming",
      otherId,
      profile: profiles.get(otherId) ?? null,
    } satisfies CoachConnection;
  });
}
