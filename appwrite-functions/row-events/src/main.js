import { Client, Query, TablesDB } from "node-appwrite";

// Same fixed ID as src/lib/appwrite.ts (APPWRITE_DATABASE_ID).
const DATABASE_ID = "6a7cd61a00290490a79d";

/** action: fired on a `coach_relationships` row delete — strips the ex-coach's read from every run shared with them. Originally appwrite-functions/revoke-coach-run-access. */
async function revokeCoachRunAccess({ payload, client, log, error }) {
  const { coachId, studentId } = payload;
  if (!coachId || !studentId) {
    error(`revoke-coach-run-access: event payload missing coachId/studentId: ${JSON.stringify(payload)}`);
    return;
  }

  const tablesDB = new TablesDB(client);
  const coachRole = `user:${coachId}`;
  let cursor;
  let revoked = 0;
  for (;;) {
    const queries = [Query.equal("userId", studentId), Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await tablesDB.listRows({ databaseId: DATABASE_ID, tableId: "runs", queries });
    if (page.rows.length === 0) break;

    for (const row of page.rows) {
      const permissions = row.$permissions.filter((p) => p !== `read("${coachRole}")`);
      if (permissions.length === row.$permissions.length) continue;
      await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: "runs", rowId: row.$id, data: {}, permissions });
      revoked++;
    }

    if (page.rows.length < 100) break;
    cursor = page.rows[page.rows.length - 1].$id;
  }

  log(`revoke-coach-run-access: ended ${studentId} -> ${coachId}, stripped read from ${revoked} run(s)`);
}

/** action: fired on a `group_run_participants` row delete — strips the departed viewer's read from every live_runs row in that session. Originally appwrite-functions/revoke-live-audience. */
async function revokeLiveAudience({ payload, client, log, error }) {
  const { sessionCode, userId } = payload;
  if (!sessionCode || !userId) {
    error(`revoke-live-audience: event payload missing sessionCode/userId: ${JSON.stringify(payload)}`);
    return;
  }

  const tablesDB = new TablesDB(client);
  const departedRole = `user:${userId}`;
  const rows = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: "live_runs",
    queries: [Query.equal("sessionCode", sessionCode), Query.limit(100)],
  });

  let revoked = 0;
  for (const row of rows.rows) {
    if (row.userId === userId) continue;
    const permissions = row.$permissions.filter((p) => p !== `read("${departedRole}")`);
    if (permissions.length === row.$permissions.length) continue;
    await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: "live_runs", rowId: row.$id, data: {}, permissions });
    revoked++;
  }

  log(`revoke-live-audience: ${userId} left ${sessionCode}, stripped read from ${revoked} live row(s)`);
}

/**
 * One event-triggered Appwrite Function backing both row-delete cleanups
 * this app needs — see src/lib/appwrite.ts's `CLIENT_ACTIONS_FUNCTION_ID`
 * comment for why this exists as a single dispatcher instead of two
 * separate Functions (Appwrite Cloud Free plan's 2-Functions-per-project
 * cap). Registered on BOTH events at deploy time (`--events`, see README),
 * so a single execution can be triggered by either table's delete — which
 * one actually fired is read from `x-appwrite-event`
 * (`databases.*.tables.<table>.rows.*.delete`), with the payload's own
 * shape as a fallback in case that header's format ever changes (a
 * `coach_relationships` row always has `coachId`; a
 * `group_run_participants` row never does).
 *
 * Each handler below is otherwise unchanged from the standalone Function it
 * replaces (see git history for
 * appwrite-functions/{revoke-coach-run-access,revoke-live-audience} before
 * this consolidation). No client code changes needed for either: the
 * athlete-facing `removeCoachRelationship`/`leaveGroupRun` calls still just
 * delete the row exactly as before, and Appwrite calls this Function with
 * that row's last known data as soon as the delete actually happens.
 */
async function rowEvents({ req, log, error }) {
  let payload;
  try {
    payload = req.bodyJson ?? JSON.parse(req.bodyText || "{}");
  } catch {
    error("row-events: could not parse event payload");
    return;
  }

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers["x-appwrite-key"] ?? "");

  const eventName = req.headers["x-appwrite-event"] ?? "";
  const isCoachRelationship = eventName.includes("coach_relationships") || "coachId" in payload;
  const isGroupParticipant = eventName.includes("group_run_participants") || ("sessionCode" in payload && !("coachId" in payload));

  if (isCoachRelationship) {
    return revokeCoachRunAccess({ payload, client, log, error });
  }
  if (isGroupParticipant) {
    return revokeLiveAudience({ payload, client, log, error });
  }
  error(`row-events: could not tell which table fired this event (x-appwrite-event="${eventName}")`);
}

export default rowEvents;
