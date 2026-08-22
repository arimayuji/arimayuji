import { Client, TablesDB } from "node-appwrite";

// Same fixed ID as src/lib/appwrite.ts (APPWRITE_DATABASE_ID).
const DATABASE_ID = "6a7cd61a00290490a79d";

/**
 * Appwrite Function backing the *first* creation of a `profiles`,
 * `profile_stats` or `place_run_stats` row — an LGPD/security audit finding
 * (#12) that these three tables granted `Permission.create(Role.users())`
 * with a deterministic row ID (the account's own `userId`, or
 * `${placeId}_${userId}`): any signed-in account could call `createRow`
 * directly against Appwrite's REST API with *someone else's* ID as the row
 * ID, before that person ever signed up or ran anywhere. That "reserves"
 * their row — a fabricated handle/display name, a forged distance total, or
 * update permissions that name only the attacker — and the real owner's own
 * later `createProfile`/`recordFinishedRun`/`recordRunAtPlace` call then
 * either 409s (profiles: they can never create their own row) or silently
 * fails to update (the other two: the attacker never granted them
 * `Permission.update`).
 *
 * Appwrite's permission system has no rule for "the row ID you're creating
 * must equal your own account ID" — permissions are role-based, not
 * attribute-based — so like `join-group-run`'s friendship check, the only
 * place this can actually be enforced is server-side, under a privileged
 * key, with these three tables' `create` permission narrowed to deny
 * `Role.users()` entirely (see scripts/appwrite-setup.ts) so this Function
 * is the *only* path that can ever create one.
 *
 * `userId` in `req.headers["x-appwrite-user-id"]` is what actually decides
 * the row ID and the `userId` field written — a caller-supplied value in
 * the request body is never trusted for identity, only for the rest of the
 * row's data (a display name, a distance delta). Deployed the same way as
 * delete-account/send-welcome-email/join-group-run — see README.
 */
async function claimOwnedRow({ req, res, error }) {
  const userId = req.headers["x-appwrite-user-id"];
  if (!userId) {
    return res.json({ error: "not-authenticated" }, 401);
  }

  let body;
  try {
    body = JSON.parse(req.bodyText || "{}");
  } catch {
    return res.json({ error: "invalid-body" }, 400);
  }
  const { tableId } = body;

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers["x-appwrite-key"] ?? "");
  const tablesDB = new TablesDB(client);

  let rowId;
  let data;
  let permissions;

  if (tableId === "profiles") {
    const handle = String(body.handle ?? "").trim();
    const displayName = String(body.displayName ?? "").trim();
    if (!handle || !displayName) {
      return res.json({ error: "missing-fields" }, 400);
    }
    rowId = userId;
    data = { handle, displayName };
    permissions = [`update("user:${userId}")`, `delete("user:${userId}")`];
  } else if (tableId === "profile_stats") {
    const totalMeters = Number(body.totalMeters);
    const totalRuns = Number(body.totalRuns);
    if (!Number.isFinite(totalMeters) || totalMeters < 0 || !Number.isFinite(totalRuns) || totalRuns < 0) {
      return res.json({ error: "missing-fields" }, 400);
    }
    rowId = userId;
    data = { userId, totalMeters, totalRuns };
    permissions = [`read("any")`, `update("user:${userId}")`, `delete("user:${userId}")`];
  } else if (tableId === "place_run_stats") {
    const placeId = String(body.placeId ?? "").trim();
    const totalMeters = Number(body.totalMeters);
    const runCount = Number(body.runCount);
    const lastRunAt = String(body.lastRunAt ?? "");
    if (!placeId || !Number.isFinite(totalMeters) || totalMeters < 0 || !Number.isFinite(runCount) || runCount < 0 || !lastRunAt) {
      return res.json({ error: "missing-fields" }, 400);
    }
    rowId = `${placeId}_${userId}`;
    data = { placeId, userId, totalMeters, runCount, lastRunAt };
    permissions = [`read("any")`, `update("user:${userId}")`, `delete("user:${userId}")`];
  } else {
    return res.json({ error: "unknown-table" }, 400);
  }

  try {
    const row = await tablesDB.createRow({ databaseId: DATABASE_ID, tableId, rowId, data, permissions });
    return res.json({ ok: true, row });
  } catch (err) {
    if (err.code === 409) {
      // Row already exists — the caller's own earlier attempt already
      // succeeded (a retry after a dropped response), or this really is an
      // attacker who got here first. Either way this Function doesn't
      // overwrite an existing row, so the caller falls back to its own
      // `updateRow` and finds out from Appwrite's own permission check
      // which case it was.
      return res.json({ error: "already-exists" }, 409);
    }
    error(`claim-owned-row failed for ${tableId}/${rowId}: ${err.message}`);
    return res.json({ error: "failed" }, 500);
  }
}

export default claimOwnedRow;
