import { Client, Query, TablesDB } from "node-appwrite";

// Same fixed ID as src/lib/appwrite.ts (APPWRITE_DATABASE_ID).
const DATABASE_ID = "6a7cd61a00290490a79d";

const MAX_KM_PER_WEEK = 500; // generous ceiling, just enough to reject a typo/garbage value, not a real training limit
const WEEK_START_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Appwrite Function backing "coach edits a student's week"
 * (src/lib/coachPlanOverrides.ts's `setPlanOverride`) — not a plain
 * client-side `createRow`/`updateRow`, because the privacy boundary here
 * ("only an accepted coach of this student may write their plan") has no
 * Appwrite permission rule to express, the same reasoning `join-group-run`
 * already documents for "is this account a friend of the host."
 *
 * `plan_overrides`' table-level permissions grant no create at all (see
 * scripts/appwrite-setup.ts) — rows only ever get created or updated here,
 * under this function's privileged key, after the coach relationship is
 * verified server-side. Without this, anyone could write a "plan" onto any
 * account's row via a raw REST call, and the student's own `/plano` would
 * show it as coming from their real coach.
 *
 * Deployed the same way as delete-account/join-group-run — see README.
 */
async function setPlanOverride({ req, res, error }) {
  const coachId = req.headers["x-appwrite-user-id"];
  if (!coachId) {
    return res.json({ error: "not-authenticated" }, 401);
  }

  let body;
  try {
    body = JSON.parse(req.bodyText || "{}");
  } catch {
    return res.json({ error: "invalid-body" }, 400);
  }
  const { studentId, weekStartDate, totalKm, sessions, note } = body;

  if (typeof studentId !== "string" || !studentId) {
    return res.json({ error: "missing-student-id" }, 400);
  }
  if (typeof weekStartDate !== "string" || !WEEK_START_DATE_RE.test(weekStartDate)) {
    return res.json({ error: "invalid-week-start-date" }, 400);
  }
  if (typeof totalKm !== "number" || !Number.isFinite(totalKm) || totalKm < 0 || totalKm > MAX_KM_PER_WEEK) {
    return res.json({ error: "invalid-total-km" }, 400);
  }
  if (!Array.isArray(sessions) || sessions.length !== 7) {
    return res.json({ error: "invalid-sessions" }, 400);
  }
  for (const session of sessions) {
    const validKind = ["rest", "easy", "quality", "long"].includes(session?.kind);
    const validKm = typeof session?.km === "number" && Number.isFinite(session.km) && session.km >= 0;
    if (!validKind || !validKm) {
      return res.json({ error: "invalid-sessions" }, 400);
    }
  }
  if (note !== undefined && note !== null && typeof note !== "string") {
    return res.json({ error: "invalid-note" }, 400);
  }

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers["x-appwrite-key"] ?? "");
  const tablesDB = new TablesDB(client);

  const accepted = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: "coach_relationships",
    queries: [
      Query.equal("coachId", coachId),
      Query.equal("studentId", studentId),
      Query.equal("status", "accepted"),
      Query.limit(1),
    ],
  });
  if (accepted.rows.length === 0) {
    return res.json({ error: "not-coach" }, 403);
  }

  const rowId = `${studentId}_${weekStartDate}`;
  const data = {
    coachId,
    studentId,
    weekStartDate,
    totalKm,
    sessions: JSON.stringify(sessions),
    note: note ?? null,
  };

  try {
    await tablesDB.upsertRow({
      databaseId: DATABASE_ID,
      tableId: "plan_overrides",
      rowId,
      data,
      permissions: [
        `read("user:${coachId}")`,
        `read("user:${studentId}")`,
        `update("user:${coachId}")`,
        `delete("user:${coachId}")`,
      ],
    });
  } catch (err) {
    error(`Falha ao salvar override de ${studentId} (${weekStartDate}) por ${coachId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }

  return res.json({ ok: true });
}

export default setPlanOverride;
