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
import { ExecutionMethod, type Models, Query } from "appwrite";
import { APPWRITE_DATABASE_ID, CLIENT_ACTIONS_FUNCTION_ID, TABLES, getAppwrite } from "./appwrite";
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
 * Proposes a coach/student relationship with whoever owns `@handle`, via
 * the `client-actions` Function's `propose-coach-relationship` action
 * rather than a direct client-side `createRow`. Same reason as
 * `sendFriendRequest` in friendships.ts: the row needs permission granted
 * to whichever side isn't the caller, a role the caller's own session is
 * never allowed to assign to someone else — Appwrite only lets a caller
 * grant permissions to roles it already holds itself. A direct client
 * createRow (this function's original implementation) always failed with
 * `user_unauthorized` for exactly this reason — `coach_relationships` had
 * 0 rows in production despite real signups, silently, since the table
 * was created; confirmed 2026-08-26 alongside the identical friendships bug.
 */
export async function proposeCoachRelationship(
  handle: string,
  asRole: MyCoachRole,
): Promise<ProposeCoachResult> {
  const appwrite = getAppwrite();
  if (!appwrite) return { ok: false, reason: "unavailable" };

  const wanted = normalizeHandle(handle);
  if (!wanted) return { ok: false, reason: "not-found" };

  try {
    const execution = await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ action: "propose-coach-relationship", handle: wanted, asRole }),
    });
    const parsed = JSON.parse(execution.responseBody || "{}") as {
      ok?: boolean;
      row?: CoachRelationship;
      error?: string;
    };
    if (parsed.ok && parsed.row) return { ok: true, relationship: parsed.row };
    const reason = parsed.error;
    if (reason === "not-found" || reason === "self" || reason === "duplicate") {
      return { ok: false, reason };
    }
    return { ok: false, reason: "failed" };
  } catch (error) {
    console.error("[coachRelationships] proposeCoachRelationship failed", error);
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
    // Fire-and-forget, same convention as milestoneNotifications.ts — the
    // row update above already succeeded and is what matters; a missed
    // push just means the proposer finds out next time they open /perfil
    // instead of right away. Needs client-actions (see its own
    // notify-coach-request-accepted) since Messaging is server-only —
    // this update itself doesn't, the accepter already holds `update` on
    // the row from when it was created.
    void appwrite.functions
      .createExecution({
        functionId: CLIENT_ACTIONS_FUNCTION_ID,
        method: ExecutionMethod.POST,
        body: JSON.stringify({ action: "notify-coach-request-accepted", relationshipId }),
      })
      .catch(() => {});
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
