/**
 * "Longão" — a group run session a host creates and shares by a 6-character
 * join code, so several friends running the same long run end up visible to
 * each other later on a shared live map (see the plan this was scoped
 * against for the full design). This module is Phase 1 only: the session
 * object itself and who's in it. Live location and the map come later.
 *
 * Row ID *is* the join code for `group_runs` (found again by id, same
 * convention as `live_runs`' row-id-is-the-run-id), and a deterministic
 * `${code}_${userId}` for `group_run_participants` — joining twice is a
 * harmless 409, not a duplicate row, and leaving needs no query first.
 *
 * Read on both tables is open to any signed-in account at the table level
 * (see scripts/appwrite-setup.ts) — the code is the real gate, same
 * reasoning as a TestFlight public link, and neither row holds any
 * location. The actual privacy boundary the athlete asked for — only
 * friends of the host may join — is enforced here in `joinGroupRun`, not
 * by Appwrite permissions, since Appwrite has no "is this account a friend
 * of that other account" rule to declare.
 *
 * Same degrade-to-empty/false convention as the rest of the backend layer.
 */
import { Permission, Query, Role, type Models } from "appwrite";
import { APPWRITE_DATABASE_ID, TABLES, getAppwrite } from "./appwrite";
import { getCurrentAccount, getProfile, type Profile } from "./auth";
import { listFriendConnections } from "./friendships";

export type GroupRunStatus = "open" | "closed";

export interface GroupRun extends Models.Row {
  hostId: string;
  name: string;
  startsAt: string;
  expiresAt: string;
  status: GroupRunStatus;
}

export interface GroupRunParticipant extends Models.Row {
  sessionCode: string;
  userId: string;
  joinedAt: string;
}

export interface GroupRunParticipantConnection {
  participant: GroupRunParticipant;
  profile: Profile | null;
}

/** Unambiguous alphabet (no 0/O, 1/I) — read aloud or typed by hand, same idea as the emblem serials elsewhere in the app. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const SESSION_HOURS = 8;
const MAX_CODE_ATTEMPTS = 5;

function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

/** However the athlete typed or pasted it — with/without spaces, lower/upper case — normalized to how it's actually stored as the row ID. */
export function normalizeJoinCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

function isAppwriteConflict(err: unknown): boolean {
  return (err as { code?: number } | null)?.code === 409;
}

async function participantRowId(code: string): Promise<string | null> {
  const account = await getCurrentAccount();
  return account ? `${code}_${account.id}` : null;
}

export type CreateGroupRunResult =
  | { ok: true; groupRun: GroupRun }
  | { ok: false; reason: "unavailable" | "failed" };

/** Creates the session and auto-joins the host as its first participant. Retries on a code collision — vanishingly rare at ~1 billion combinations, but the row ID has no other way to guarantee uniqueness up front. */
export async function createGroupRun(name: string, startsAt: number): Promise<CreateGroupRunResult> {
  const appwrite = getAppwrite();
  if (!appwrite) return { ok: false, reason: "unavailable" };
  const account = await getCurrentAccount();
  if (!account) return { ok: false, reason: "unavailable" };

  const expiresAt = new Date(startsAt + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  const trimmedName = name.trim().slice(0, 60) || "Longão";

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateJoinCode();
    try {
      const groupRun = await appwrite.tablesDB.createRow<GroupRun>({
        databaseId: APPWRITE_DATABASE_ID,
        tableId: TABLES.groupRuns,
        rowId: code,
        data: {
          hostId: account.id,
          name: trimmedName,
          startsAt: new Date(startsAt).toISOString(),
          expiresAt,
          status: "open",
        },
        // Table-level permissions already allow any signed-in account to
        // read every session (the code is the gate) — this grants only the
        // host update (e.g. closing it) and delete.
        permissions: [Permission.update(Role.user(account.id)), Permission.delete(Role.user(account.id))],
      });
      await appwrite.tablesDB.createRow<GroupRunParticipant>({
        databaseId: APPWRITE_DATABASE_ID,
        tableId: TABLES.groupRunParticipants,
        rowId: `${code}_${account.id}`,
        data: { sessionCode: code, userId: account.id, joinedAt: new Date().toISOString() },
        permissions: [Permission.delete(Role.user(account.id))],
      });
      setActiveGroupRunCode(code);
      return { ok: true, groupRun };
    } catch (err) {
      if (isAppwriteConflict(err)) continue; // code already taken — draw another
      return { ok: false, reason: "failed" };
    }
  }
  return { ok: false, reason: "failed" };
}

export async function getGroupRun(code: string): Promise<GroupRun | null> {
  const appwrite = getAppwrite();
  if (!appwrite) return null;
  try {
    return await appwrite.tablesDB.getRow<GroupRun>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.groupRuns,
      rowId: normalizeJoinCode(code),
    });
  } catch {
    return null;
  }
}

export type JoinGroupRunResult =
  | { ok: true; groupRun: GroupRun }
  | { ok: false; reason: "unavailable" | "not-found" | "expired" | "closed" | "not-friends" | "failed" };

/**
 * Joining requires being a mutual friend of the host — the one privacy
 * decision this feature turns on. The host themself always passes (they're
 * already a participant from `createGroupRun`, but re-joining after leaving
 * shouldn't require friending themselves). Already-joined is treated as
 * success rather than an error, so this is safe to call from a "join" button
 * without checking membership first.
 */
export async function joinGroupRun(code: string): Promise<JoinGroupRunResult> {
  const appwrite = getAppwrite();
  if (!appwrite) return { ok: false, reason: "unavailable" };
  const account = await getCurrentAccount();
  if (!account) return { ok: false, reason: "unavailable" };

  const normalized = normalizeJoinCode(code);
  const groupRun = await getGroupRun(normalized);
  if (!groupRun) return { ok: false, reason: "not-found" };
  if (groupRun.status === "closed") return { ok: false, reason: "closed" };
  if (new Date(groupRun.expiresAt).getTime() < Date.now()) return { ok: false, reason: "expired" };

  if (groupRun.hostId !== account.id) {
    const friends = await listFriendConnections("accepted");
    const isFriendOfHost = friends.some((connection) => connection.otherId === groupRun.hostId);
    if (!isFriendOfHost) return { ok: false, reason: "not-friends" };
  }

  try {
    await appwrite.tablesDB.createRow<GroupRunParticipant>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.groupRunParticipants,
      rowId: `${normalized}_${account.id}`,
      data: { sessionCode: normalized, userId: account.id, joinedAt: new Date().toISOString() },
      permissions: [Permission.delete(Role.user(account.id))],
    });
    setActiveGroupRunCode(normalized);
    return { ok: true, groupRun };
  } catch (err) {
    if (isAppwriteConflict(err)) {
      // Already a participant — not an error, just nothing new to do.
      setActiveGroupRunCode(normalized);
      return { ok: true, groupRun };
    }
    return { ok: false, reason: "failed" };
  }
}

export async function leaveGroupRun(code: string): Promise<boolean> {
  const appwrite = getAppwrite();
  if (!appwrite) return false;
  const rowId = await participantRowId(normalizeJoinCode(code));
  if (!rowId) return false;
  try {
    await appwrite.tablesDB.deleteRow({ databaseId: APPWRITE_DATABASE_ID, tableId: TABLES.groupRunParticipants, rowId });
    clearActiveGroupRunCodeIfMatches(normalizeJoinCode(code));
    return true;
  } catch {
    return false;
  }
}

/** Host-only in practice — Appwrite rejects the update for anyone else, since only the host holds `update` on the row (see `createGroupRun`). */
export async function closeGroupRun(code: string): Promise<boolean> {
  const appwrite = getAppwrite();
  if (!appwrite) return false;
  try {
    await appwrite.tablesDB.updateRow<GroupRun>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.groupRuns,
      rowId: normalizeJoinCode(code),
      data: { status: "closed" },
    });
    return true;
  } catch {
    return false;
  }
}

/** Everyone currently in the session, with their profile resolved for display — same pattern as `listFriendConnections`. */
export async function listParticipants(code: string): Promise<GroupRunParticipantConnection[]> {
  const appwrite = getAppwrite();
  if (!appwrite) return [];
  try {
    const rows = await appwrite.tablesDB.listRows<GroupRunParticipant>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.groupRunParticipants,
      queries: [Query.equal("sessionCode", normalizeJoinCode(code)), Query.orderAsc("joinedAt"), Query.limit(50)],
    });
    const profiles = new Map<string, Profile | null>();
    await Promise.all(rows.rows.map(async (row) => profiles.set(row.userId, await getProfile(row.userId))));
    return rows.rows.map((participant) => ({
      participant,
      profile: profiles.get(participant.userId) ?? null,
    }));
  } catch {
    return [];
  }
}

/** Every non-expired session the signed-in account currently participates in, newest first. */
export async function listMyGroupRuns(): Promise<GroupRun[]> {
  const appwrite = getAppwrite();
  if (!appwrite) return [];
  const account = await getCurrentAccount();
  if (!account) return [];
  try {
    const participantRows = await appwrite.tablesDB.listRows<GroupRunParticipant>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.groupRunParticipants,
      queries: [Query.equal("userId", account.id), Query.limit(50)],
    });
    const codes = [...new Set(participantRows.rows.map((row) => row.sessionCode))];
    const sessions = await Promise.all(codes.map((code) => getGroupRun(code)));
    const now = Date.now();
    return sessions
      .filter((session): session is GroupRun => session !== null && new Date(session.expiresAt).getTime() > now)
      .sort((a, b) => b.$createdAt.localeCompare(a.$createdAt));
  } catch {
    return [];
  }
}

const ACTIVE_CODE_KEY = "xanthus:longao-ativo";

/** The session /run should offer to share live position with, if any — set on create/join, cleared on leave. Deliberately not in `src/lib/preferences.ts`: that module is for real cross-screen settings, not a single-purpose pointer only /run and /longao care about. */
export function getActiveGroupRunCode(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CODE_KEY);
  } catch {
    return null;
  }
}

export function setActiveGroupRunCode(code: string): void {
  try {
    localStorage.setItem(ACTIVE_CODE_KEY, code);
  } catch {
    // Storage disabled: nothing persists, just asks again next time.
  }
}

function clearActiveGroupRunCodeIfMatches(code: string): void {
  try {
    if (localStorage.getItem(ACTIVE_CODE_KEY) === code) localStorage.removeItem(ACTIVE_CODE_KEY);
  } catch {
    // Storage disabled — nothing to clear.
  }
}

