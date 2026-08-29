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
 * location. *Create* on `group_run_participants` is not open, though: the
 * actual privacy boundary the athlete asked for — only friends of the host
 * may join — has no Appwrite permission rule to express ("is this account
 * a friend of that other account" isn't a Role), so it's enforced
 * server-side by the `join-group-run` Appwrite Function (same reasoning as
 * `delete-account`) instead of trusted to a client-side check. A row
 * inserted straight via the REST API, bypassing that check, would
 * otherwise get treated as a vetted participant everywhere downstream —
 * including by `refreshLiveSessionAudience` in liveRuns.ts, which grants
 * live GPS read to whoever's on this list.
 *
 * Same degrade-to-empty/false convention as the rest of the backend layer.
 */
import { ExecutionMethod, Permission, Query, Role, type Models } from "appwrite";
import { APPWRITE_DATABASE_ID, CLIENT_ACTIONS_FUNCTION_ID, TABLES, getAppwrite } from "./appwrite";
import { getCurrentAccount, getProfile, type Profile } from "./auth";
import { publicOrigin } from "./platform";

export type GroupRunStatus = "open" | "closed";

export interface GroupRun extends Models.Row {
  hostId: string;
  name: string;
  startsAt: string;
  expiresAt: string;
  status: GroupRunStatus;
  /** The lobby's "go" signal — null while waiting, set once by `startGroupRun` to the moment every polling client should start its own run. */
  startedAt: string | null;
}

export interface GroupRunParticipant extends Models.Row {
  sessionCode: string;
  userId: string;
  joinedAt: string;
  /** Whether this participant has marked themselves ready in the lobby — toggled by `setParticipantReady`. */
  ready: boolean;
}

export interface GroupRunParticipantConnection {
  participant: GroupRunParticipant;
  profile: Profile | null;
}

/** Unambiguous alphabet (no 0/O, 1/I) — read aloud or typed by hand, same idea as the emblem serials elsewhere in the app. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/**
 * 6 characters (33^6 ≈ 1.16 billion combinations) was an LGPD/security audit
 * finding (#19): read on `group_runs`/`group_run_participants` is open to
 * any signed-in account at the table level (the code itself is meant to be
 * the gate, same reasoning as a TestFlight public link) — a low but real
 * enumeration surface, since guessing a live code exposes a session's
 * name/host/participant list to a stranger the host never invited (joining
 * still requires being the host's friend, verified server-side by
 * `join-group-run` — this only ever affected what a guess could *read*, not
 * who could join). 8 characters (33^8 ≈ 1.26 trillion) makes brute-forcing
 * one within an 8-hour session (`SESSION_HOURS`) infeasible while an
 * athlete can still read a code aloud or type it by hand. Existing 6-char
 * codes keep working — the row ID is just a string, nothing about length is
 * baked into lookups.
 */
export const CODE_LENGTH = 8;
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
          startedAt: null,
        },
        // Table-level permissions already allow any signed-in account to
        // read every session (the code is the gate) — this grants only the
        // host update (e.g. closing it) and delete.
        permissions: [Permission.update(Role.user(account.id)), Permission.delete(Role.user(account.id))],
      });
      // The host is always allowed to join their own session — the
      // Function's friend check only runs for `hostId !== userId` — so this
      // still succeeds without a round trip through `friendships`.
      const joined = await callJoinGroupRunFunction(code);
      if (!joined.ok) return { ok: false, reason: "failed" };
      setActiveGroupRunCode(code);
      return { ok: true, groupRun };
    } catch (err) {
      if (isAppwriteConflict(err)) continue; // code already taken — draw another
      return { ok: false, reason: "failed" };
    }
  }
  return { ok: false, reason: "failed" };
}

/**
 * The link a QR code encodes for "corrida em dupla" pairing —
 * `src/app/parear/page.tsx` is the landing page it resolves to, same
 * pattern `/convite`'s own link already uses (try the custom scheme first,
 * fall back to a download page). A plain https URL rather than a bare code
 * so any phone's stock camera app can already scan it with no in-app
 * scanner needed — only the *generating* side needs the `qrcode` package.
 */
export function buildPairingUrl(code: string): string {
  return `${publicOrigin()}/parear?codigo=${encodeURIComponent(code)}`;
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

type JoinGroupRunFailureReason = "unavailable" | "not-found" | "expired" | "closed" | "not-friends" | "failed";

export type JoinGroupRunResult = { ok: true; groupRun: GroupRun } | { ok: false; reason: JoinGroupRunFailureReason };

/**
 * Runs the `join-group-run` Appwrite Function, which does the actual
 * membership check (host, or a mutual friend of the host — see that
 * function's own comment for why this can't be a client-side check) and
 * creates the participant row under its own privileged key. Shared by
 * `createGroupRun` (the host auto-joining their own session) and
 * `joinGroupRun` below — same call, same server-side gate either way.
 */
async function callJoinGroupRunFunction(code: string): Promise<JoinGroupRunResult> {
  const appwrite = getAppwrite();
  if (!appwrite) return { ok: false, reason: "unavailable" };
  try {
    const execution = await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ action: "join-group-run", sessionCode: code }),
    });
    const body = JSON.parse(execution.responseBody || "{}") as
      | { ok: true; groupRun: GroupRun }
      | { error: JoinGroupRunFailureReason };
    if (execution.responseStatusCode >= 200 && execution.responseStatusCode < 300 && "ok" in body && body.ok) {
      return { ok: true, groupRun: body.groupRun };
    }
    const reason = "error" in body ? body.error : "failed";
    return { ok: false, reason: reason ?? "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * Joining requires being a mutual friend of the host — the one privacy
 * decision this feature turns on, enforced server-side (see
 * `callJoinGroupRunFunction`). Already-joined is treated as success rather
 * than an error, so this is safe to call from a "join" button without
 * checking membership first.
 */
export async function joinGroupRun(code: string): Promise<JoinGroupRunResult> {
  const normalized = normalizeJoinCode(code);
  const result = await callJoinGroupRunFunction(normalized);
  if (result.ok) setActiveGroupRunCode(normalized);
  return result;
}

type PairRunSessionFailureReason = "unavailable" | "not-found" | "expired" | "closed" | "self" | "failed";

export type PairRunSessionResult = { ok: true; groupRun: GroupRun } | { ok: false; reason: PairRunSessionFailureReason };

/**
 * The QR-pairing join path for "corrida em dupla" — runs the
 * "pair-run-session" Function instead of `joinGroupRun`'s
 * "join-group-run", because that one requires already being an accepted
 * friend of the host (see its own comment) and a QR-paired stranger
 * obviously isn't yet. The Function creates/accepts that friendship first
 * (a QR scan is treated as strong enough mutual consent to skip the normal
 * request/accept dance — product decision, 2026-08-23) and only then joins,
 * so this always leaves the two as real, accepted friends, not just
 * paired for one session.
 */
export async function pairRunSession(code: string): Promise<PairRunSessionResult> {
  const appwrite = getAppwrite();
  if (!appwrite) return { ok: false, reason: "unavailable" };
  const normalized = normalizeJoinCode(code);
  try {
    const execution = await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ action: "pair-run-session", sessionCode: normalized }),
    });
    const body = JSON.parse(execution.responseBody || "{}") as
      | { ok: true; groupRun: GroupRun }
      | { error: PairRunSessionFailureReason };
    if (execution.responseStatusCode >= 200 && execution.responseStatusCode < 300 && "ok" in body && body.ok) {
      setActiveGroupRunCode(normalized);
      return { ok: true, groupRun: body.groupRun };
    }
    const reason = "error" in body ? body.error : "failed";
    return { ok: false, reason: reason ?? "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * Marks (or unmarks) the caller ready in the QR-pairing lobby — safe
 * client-direct, unlike most writes here that need a Function: the
 * participant row already grants the caller `update` on their own row
 * (see join-group-run/pair-run-session in client-actions), and this only
 * ever writes to that one row, never anyone else's.
 */
export async function setParticipantReady(code: string, ready: boolean): Promise<boolean> {
  const appwrite = getAppwrite();
  if (!appwrite) return false;
  const rowId = await participantRowId(normalizeJoinCode(code));
  if (!rowId) return false;
  try {
    await appwrite.tablesDB.updateRow<GroupRunParticipant>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.groupRunParticipants,
      rowId,
      data: { ready },
    });
    return true;
  } catch {
    return false;
  }
}

type StartGroupRunFailureReason = "unavailable" | "failed";

export type StartGroupRunResult = { ok: true; groupRun: GroupRun } | { ok: false; reason: StartGroupRunFailureReason };

/**
 * Runs the `start-group-run` Function action, which writes the shared
 * `startedAt` signal every lobby poll reacts to and best-effort pushes
 * every other participant. Function-mediated (not a client-direct
 * `updateRow`) because only the host holds row-level `update` on
 * `group_runs` — a non-host participant's client has no permission to
 * write this row at all, same reasoning as `startLiveSession` in
 * liveRuns.ts.
 */
export async function startGroupRun(code: string): Promise<StartGroupRunResult> {
  const appwrite = getAppwrite();
  if (!appwrite) return { ok: false, reason: "unavailable" };
  const normalized = normalizeJoinCode(code);
  try {
    const execution = await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ action: "start-group-run", sessionCode: normalized }),
    });
    const body = JSON.parse(execution.responseBody || "{}") as { ok: true; groupRun: GroupRun } | { error: string };
    if (execution.responseStatusCode >= 200 && execution.responseStatusCode < 300 && "ok" in body && body.ok) {
      return { ok: true, groupRun: body.groupRun };
    }
    return { ok: false, reason: "failed" };
  } catch {
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

