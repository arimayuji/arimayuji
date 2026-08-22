import { Client, Query, TablesDB } from "node-appwrite";

// Same fixed ID as src/lib/appwrite.ts (APPWRITE_DATABASE_ID).
const DATABASE_ID = "6a7cd61a00290490a79d";

/**
 * Event-triggered Appwrite Function — fires automatically whenever a row in
 * `group_run_participants` is deleted, i.e. whenever someone leaves a
 * "longão". LGPD/security audit finding #11: the athlete's own client
 * (`refreshLiveSessionAudience` in src/lib/liveRuns.ts) re-grants read on
 * their live-position row to whoever's currently in the session, but only
 * on a 20-second poll and only best-effort — a missed tick, a killed app,
 * or a dropped network request left someone who just left still able to
 * read that athlete's live GPS for up to the rest of the run. This closes
 * the gap the client-side poll can't: the departure itself is the trigger,
 * not a timer.
 *
 * No client code changes needed for this: `leaveGroupRun` still just
 * deletes the participant row exactly as before, and Appwrite calls this
 * Function with that row's last known data as soon as the delete happens.
 * The 20s client poll in `run/page.tsx` still matters for the *other*
 * direction (someone *joining* mid-run needs to be *granted* read, which
 * isn't a delete event this Function ever sees) — this only ever removes,
 * never adds.
 *
 * Deployed differently from the `--execute users` functions in this
 * directory — see README for the `--events` flag this one needs instead.
 */
async function revokeLiveAudience({ req, log, error }) {
  let payload;
  try {
    payload = req.bodyJson ?? JSON.parse(req.bodyText || "{}");
  } catch {
    error("revoke-live-audience: could not parse event payload");
    return;
  }
  const { sessionCode, userId } = payload;
  if (!sessionCode || !userId) {
    error(`revoke-live-audience: event payload missing sessionCode/userId: ${req.bodyText}`);
    return;
  }

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers["x-appwrite-key"] ?? "");
  const tablesDB = new TablesDB(client);

  const departedRole = `user:${userId}`;
  const rows = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: "live_runs",
    queries: [Query.equal("sessionCode", sessionCode), Query.limit(100)],
  });

  let revoked = 0;
  for (const row of rows.rows) {
    // The athlete's own live row for a session they just left themselves —
    // never strip their own read/update/delete, only ever another
    // athlete's grant *to* the departed viewer.
    if (row.userId === userId) continue;
    const permissions = row.$permissions.filter((p) => p !== `read("${departedRole}")`);
    if (permissions.length === row.$permissions.length) continue; // this athlete never had the departed viewer on their audience
    await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: "live_runs", rowId: row.$id, data: {}, permissions });
    revoked++;
  }

  log(`revoke-live-audience: ${userId} left ${sessionCode}, stripped read from ${revoked} live row(s)`);
}

export default revokeLiveAudience;
