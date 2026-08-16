import { Client, Query, TablesDB, Users } from "node-appwrite";

// Same fixed ID as src/lib/appwrite.ts (APPWRITE_DATABASE_ID) — Appwrite
// Cloud's free plan only ever provisions this one database per project.
const DATABASE_ID = "6a7cd61a00290490a79d";

// Every table with a column that identifies its owner, and which column
// that is — mirrors scripts/appwrite-setup.ts's schema. Tables with two
// possible owner columns (a request/response pair) list both; a user who
// deletes their account should vanish from both sides of a relationship,
// not just rows where they were the one who acted first.
const OWNED_ROWS = [
  { tableId: "friendships", columns: ["requesterId", "addresseeId"] },
  { tableId: "coach_relationships", columns: ["coachId", "studentId"] },
  { tableId: "place_ratings", columns: ["userId"] },
  { tableId: "runs", columns: ["userId"] },
  { tableId: "live_runs", columns: ["userId"] },
  { tableId: "run_comments", columns: ["authorId"] },
];

/**
 * Appwrite Function, not a Next.js API route — the app is a static export
 * with no server runtime of its own (see src/lib/appwrite.ts), and account
 * deletion needs privileged access (node-appwrite's Users API) that must
 * never reach client code. Deployed separately via the Appwrite CLI/console
 * — see README for setup. Invoked from the browser via
 * `appwrite.functions.createExecution(...)` using the signed-in user's own
 * session; Appwrite auto-injects that caller's ID into `x-appwrite-user-id`
 * and a scoped, short-lived API key into `x-appwrite-key` (configured via
 * this function's "API key scopes" in the console — no static admin secret
 * stored here).
 */
async function deleteAccount({ req, res, log, error }) {
  const userId = req.headers["x-appwrite-user-id"];
  if (!userId) {
    return res.json({ error: "not-authenticated" }, 401);
  }

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers["x-appwrite-key"] ?? "");
  const tablesDB = new TablesDB(client);
  const users = new Users(client);

  for (const { tableId, columns } of OWNED_ROWS) {
    for (const column of columns) {
      try {
        await tablesDB.deleteRows({
          databaseId: DATABASE_ID,
          tableId,
          queries: [Query.equal(column, userId)],
        });
      } catch (err) {
        error(`Falha apagando linhas de ${tableId}.${column} para ${userId}: ${err.message}`);
      }
    }
  }

  // The profile row's ID is the account's own user ID (see
  // src/lib/auth.ts's createProfile) — a direct delete, not a query.
  try {
    await tablesDB.deleteRow({ databaseId: DATABASE_ID, tableId: "profiles", rowId: userId });
  } catch (err) {
    error(`Falha apagando profile de ${userId}: ${err.message}`);
  }

  // Last: once the identity itself is gone, any of the deletes above
  // failing partway wouldn't be retryable the same way (userId still
  // resolves to a real account) — deleting the account last means a
  // partial failure above still leaves an inspectable, retryable state.
  await users.delete({ userId });

  log(`Conta ${userId} excluída.`);
  return res.json({ ok: true });
}

export default deleteAccount;
