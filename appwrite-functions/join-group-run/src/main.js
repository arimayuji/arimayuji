import { Client, Permission, Query, Role, TablesDB } from "node-appwrite";

// Same fixed ID as src/lib/appwrite.ts (APPWRITE_DATABASE_ID).
const DATABASE_ID = "6a7cd61a00290490a79d";

/**
 * Appwrite Function backing "join a longão" (src/lib/groupRuns.ts's
 * `joinGroupRun`) — not a plain client-side `createRow`, because the
 * privacy boundary the athlete asked for ("only friends of the host may
 * join") has no Appwrite permission rule to express ("is this account a
 * friend of that other account" isn't a Role Appwrite understands), the
 * same reasoning `delete-account` already documents for account deletion.
 *
 * `group_run_participants`' table-level permissions grant read to any
 * signed-in account but *not* create (see scripts/appwrite-setup.ts) —
 * participant rows only ever get created here, under this function's
 * privileged key, after the friendship (or host-ness) is verified
 * server-side. Without this, anyone could insert themselves as a
 * "participant" via a raw REST call, bypassing the friend check entirely,
 * and every other athlete's client would then unknowingly grant that
 * stranger read access to their live GPS position (see
 * `refreshLiveSessionAudience` in src/lib/liveRuns.ts, which trusts the
 * participants list as already-vetted).
 *
 * Deployed the same way as delete-account/send-welcome-email — see
 * README. Invoked from the browser via
 * `appwrite.functions.createExecution(...)` using the signed-in athlete's
 * own session; Appwrite auto-injects that caller's ID into
 * `x-appwrite-user-id` and a scoped, short-lived API key into
 * `x-appwrite-key` (configured via this function's "API key scopes" in
 * the console — no static admin secret stored here).
 */
async function joinGroupRun({ req, res, error }) {
  const userId = req.headers["x-appwrite-user-id"];
  if (!userId) {
    return res.json({ error: "not-authenticated" }, 401);
  }

  let sessionCode;
  try {
    sessionCode = String(JSON.parse(req.bodyText || "{}").sessionCode ?? "").toUpperCase();
  } catch {
    sessionCode = "";
  }
  if (!sessionCode) {
    return res.json({ error: "missing-session-code" }, 400);
  }

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers["x-appwrite-key"] ?? "");
  const tablesDB = new TablesDB(client);

  let groupRun;
  try {
    groupRun = await tablesDB.getRow({ databaseId: DATABASE_ID, tableId: "group_runs", rowId: sessionCode });
  } catch {
    return res.json({ error: "not-found" }, 404);
  }
  if (groupRun.status === "closed") {
    return res.json({ error: "closed" }, 403);
  }
  if (new Date(groupRun.expiresAt).getTime() < Date.now()) {
    return res.json({ error: "expired" }, 403);
  }

  if (groupRun.hostId !== userId) {
    const [asRequester, asAddressee] = await Promise.all([
      tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: "friendships",
        queries: [
          Query.equal("requesterId", userId),
          Query.equal("addresseeId", groupRun.hostId),
          Query.equal("status", "accepted"),
          Query.limit(1),
        ],
      }),
      tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: "friendships",
        queries: [
          Query.equal("requesterId", groupRun.hostId),
          Query.equal("addresseeId", userId),
          Query.equal("status", "accepted"),
          Query.limit(1),
        ],
      }),
    ]);
    const isFriendOfHost = asRequester.rows.length > 0 || asAddressee.rows.length > 0;
    if (!isFriendOfHost) {
      return res.json({ error: "not-friends" }, 403);
    }
  }

  try {
    await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: "group_run_participants",
      rowId: `${sessionCode}_${userId}`,
      data: { sessionCode, userId, joinedAt: new Date().toISOString() },
      permissions: [Permission.delete(Role.user(userId))],
    });
  } catch (err) {
    // 409 = already a participant (deterministic row id) — not an error.
    if (err.code !== 409) {
      error(`Falha ao entrar em ${sessionCode} para ${userId}: ${err.message}`);
      return res.json({ error: "failed" }, 500);
    }
  }

  return res.json({ ok: true, groupRun });
}

export default joinGroupRun;
