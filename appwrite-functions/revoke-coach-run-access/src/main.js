import { Client, Query, TablesDB } from "node-appwrite";

// Same fixed ID as src/lib/appwrite.ts (APPWRITE_DATABASE_ID).
const DATABASE_ID = "6a7cd61a00290490a79d";

/**
 * Event-triggered Appwrite Function (not `--execute`-triggered like the
 * others in this directory) — fires automatically whenever a row in
 * `coach_relationships` is deleted, whether the coach or the student is the
 * one who removed it. LGPD/security audit finding #10: `runsSync.ts`'s
 * `shareRunWithCoaches` grants `Permission.read(Role.user(coachId))` on the
 * student's `runs` rows one run at a time, and nothing ever revoked it —
 * ending the relationship only ever deleted the `coach_relationships` row
 * itself (see `removeCoachRelationship`), so an ex-coach kept raw GPS read
 * access to every run ever shared with them, forever.
 *
 * No client code changes needed for this: `removeCoachRelationship` still
 * just deletes the row exactly as before, and Appwrite calls this Function
 * with that row's last known data as soon as the delete actually happens —
 * whichever side (coach or student) triggered it.
 *
 * Deployed differently from the `--execute users` functions in this
 * directory — see README for the `--events` flag this one needs instead.
 */
async function revokeCoachRunAccess({ req, log, error }) {
  let payload;
  try {
    payload = req.bodyJson ?? JSON.parse(req.bodyText || "{}");
  } catch {
    error("revoke-coach-run-access: could not parse event payload");
    return;
  }
  const { coachId, studentId } = payload;
  if (!coachId || !studentId) {
    error(`revoke-coach-run-access: event payload missing coachId/studentId: ${req.bodyText}`);
    return;
  }

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers["x-appwrite-key"] ?? "");
  const tablesDB = new TablesDB(client);

  const coachRole = `user:${coachId}`;
  let cursor;
  let revoked = 0;
  // Paginated on purpose — a long-coached athlete can have far more than
  // one page of shared runs, and Appwrite caps a single listRows call.
  for (;;) {
    const queries = [Query.equal("userId", studentId), Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await tablesDB.listRows({ databaseId: DATABASE_ID, tableId: "runs", queries });
    if (page.rows.length === 0) break;

    for (const row of page.rows) {
      const permissions = row.$permissions.filter((p) => p !== `read("${coachRole}")`);
      if (permissions.length === row.$permissions.length) continue; // this run was never shared with this coach
      await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: "runs", rowId: row.$id, data: {}, permissions });
      revoked++;
    }

    if (page.rows.length < 100) break;
    cursor = page.rows[page.rows.length - 1].$id;
  }

  log(`revoke-coach-run-access: ended ${studentId} -> ${coachId}, stripped read from ${revoked} run(s)`);
}

export default revokeCoachRunAccess;
