/**
 * One-time (and safely re-runnable) provisioning script: creates the
 * "xanthus" database and every table/column/index the app's identity
 * layer needs. Run with `npm run setup:appwrite` after putting
 * APPWRITE_SETUP_API_KEY in .env.local (see .env.example) — this key
 * has admin-level project access and must never be committed or shipped
 * to the client, which is exactly why this script lives outside `src/`
 * and imports the server SDK (`node-appwrite`), never the browser one.
 *
 * Idempotent: every create call is wrapped so a 409 ("already exists")
 * is swallowed and everything else re-throws, so running this again
 * after adding one new table/column only creates what's missing.
 *
 * Row-level permissions (who can read/update a specific friendship,
 * rating, or run) are NOT set here — those are computed per-row by the
 * app when it writes the row, based on who's involved and the chosen
 * visibility. This script only sets the table-level "who can create a
 * row at all" permission and the shape of the data.
 */
import { readFileSync } from "node:fs";
import { Client, Permission, Role, Storage, TablesDB, TablesDBIndexType } from "node-appwrite";

function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return; // no .env.local — fall through to whatever's already in process.env
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_SETUP_API_KEY;

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID, or APPWRITE_SETUP_API_KEY in .env.local — see .env.example.",
  );
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const tablesDB = new TablesDB(client);
const storage = new Storage(client);

// Appwrite Cloud's free plan pre-provisions exactly one database per
// project and doesn't allow creating a second — use the one that's
// already there ("Xanthus DB") instead of trying to create "xanthus".
const DATABASE_ID = "6a7cd61a00290490a79d";

/** Swallows "already exists" so the script is safe to run again after adding something new. */
async function ensure<T>(label: string, fn: () => Promise<T>): Promise<void> {
  try {
    await fn();
    console.log(`  created: ${label}`);
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 409) {
      console.log(`  exists:  ${label}`);
      return;
    }
    console.error(`  FAILED:  ${label}`);
    throw err;
  }
}

/** New columns start "processing" — an index referencing one fails until it's "available". */
async function waitForColumn(tableId: string, key: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const column = await tablesDB.getColumn({ databaseId: DATABASE_ID, tableId, key });
    if ((column as { status: string }).status === "available") return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Column ${tableId}.${key} never became available`);
}

async function main() {
  console.log(`Using existing database "${DATABASE_ID}" (Appwrite Cloud's free plan caps at one per project)...`);

  // ---------------------------------------------------------------- profiles
  console.log("\nprofiles");
  await ensure("table profiles", () =>
    tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId: "profiles",
      name: "profiles",
      // Public read (handles are discoverable, like a Strava/Instagram
      // username); any signed-in user may create a row (their own, by
      // convention — the app creates it right after signup with the row
      // ID set to their account ID), row-level permissions handle update.
      permissions: [Permission.read(Role.any()), Permission.create(Role.users())],
      rowSecurity: true,
    }),
  );
  await ensure("profiles.handle", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "profiles", key: "handle", size: 20, required: true }),
  );
  await ensure("profiles.displayName", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "profiles", key: "displayName", size: 60, required: true }),
  );
  await ensure("profiles.avatarUrl", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "profiles", key: "avatarUrl", size: 500, required: false }),
  );
  // Master switch for the "ranking de lugares" leaderboard — off/absent by
  // default, flipped explicitly from /perfil. While false, this account's
  // km never appears on any place's leaderboard, public or friends-only.
  await ensure("profiles.leaderboardOptIn", () =>
    tablesDB.createBooleanColumn({ databaseId: DATABASE_ID, tableId: "profiles", key: "leaderboardOptIn", required: false }),
  );
  // Only meaningful once opted in above. The *public* leaderboard view
  // shows this (falling back to `handle`) instead of `displayName`, so a
  // stranger never sees a real name just from participating — the friends
  // view still uses the real `displayName`, same as everywhere else in
  // the app friends already see each other's real name.
  await ensure("profiles.publicDisplayName", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "profiles", key: "publicDisplayName", size: 60, required: false }),
  );
  await waitForColumn("profiles", "handle");
  await ensure("profiles index: unique handle", () =>
    tablesDB.createIndex({
      databaseId: DATABASE_ID,
      tableId: "profiles",
      key: "unique_handle",
      type: TablesDBIndexType.Unique,
      columns: ["handle"],
    }),
  );

  // ------------------------------------------------------------ friendships
  console.log("\nfriendships");
  await ensure("table friendships", () =>
    tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId: "friendships",
      name: "friendships",
      // Only "may a row be created at all" lives here — read/update for a
      // specific friendship is set per-row at creation time to exactly its
      // two participants (requester + addressee), since Appwrite has no
      // declarative "read if my ID matches either of these two columns"
      // rule the way a Postgres RLS policy would.
      permissions: [Permission.create(Role.users())],
      rowSecurity: true,
    }),
  );
  await ensure("friendships.requesterId", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "friendships", key: "requesterId", size: 36, required: true }),
  );
  await ensure("friendships.addresseeId", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "friendships", key: "addresseeId", size: 36, required: true }),
  );
  // Appwrite rejects a default value on a *required* column outright — the
  // app must always pass `status: "pending"` explicitly when it creates a
  // friendship, rather than relying on the database to fill it in.
  await ensure("friendships.status", () =>
    tablesDB.createEnumColumn({
      databaseId: DATABASE_ID,
      tableId: "friendships",
      key: "status",
      elements: ["pending", "accepted"],
      required: true,
    }),
  );
  // No generated/computed columns in Appwrite (unlike the Postgres version
  // of this schema) — the app computes this itself as
  // `[a, b].sort().join(":")` before writing, and the unique index below
  // is what actually rejects a reversed duplicate request.
  await ensure("friendships.pairKey", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "friendships", key: "pairKey", size: 73, required: true }),
  );
  await ensure("friendships.respondedAt", () =>
    tablesDB.createDatetimeColumn({ databaseId: DATABASE_ID, tableId: "friendships", key: "respondedAt", required: false }),
  );
  await waitForColumn("friendships", "pairKey");
  await ensure("friendships index: unique pairKey", () =>
    tablesDB.createIndex({
      databaseId: DATABASE_ID,
      tableId: "friendships",
      key: "unique_pair_key",
      type: TablesDBIndexType.Unique,
      columns: ["pairKey"],
    }),
  );

  // ------------------------------------------------------ coach_relationships
  console.log("\ncoach_relationships");
  await ensure("table coach_relationships", () =>
    tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId: "coach_relationships",
      name: "coach_relationships",
      permissions: [Permission.create(Role.users())],
      rowSecurity: true,
    }),
  );
  await ensure("coach_relationships.coachId", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "coach_relationships", key: "coachId", size: 36, required: true }),
  );
  await ensure("coach_relationships.studentId", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "coach_relationships", key: "studentId", size: 36, required: true }),
  );
  await ensure("coach_relationships.proposedBy", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "coach_relationships", key: "proposedBy", size: 36, required: true }),
  );
  await ensure("coach_relationships.status", () =>
    tablesDB.createEnumColumn({
      databaseId: DATABASE_ID,
      tableId: "coach_relationships",
      key: "status",
      elements: ["pending", "accepted"],
      required: true,
    }),
  );
  await ensure("coach_relationships.respondedAt", () =>
    tablesDB.createDatetimeColumn({ databaseId: DATABASE_ID, tableId: "coach_relationships", key: "respondedAt", required: false }),
  );
  await waitForColumn("coach_relationships", "coachId");
  await waitForColumn("coach_relationships", "studentId");
  await ensure("coach_relationships index: unique (coachId, studentId)", () =>
    tablesDB.createIndex({
      databaseId: DATABASE_ID,
      tableId: "coach_relationships",
      key: "unique_coach_student",
      type: TablesDBIndexType.Unique,
      columns: ["coachId", "studentId"],
    }),
  );

  // ---------------------------------------------------------- place_ratings
  console.log("\nplace_ratings");
  await ensure("table place_ratings", () =>
    tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId: "place_ratings",
      name: "place_ratings",
      permissions: [Permission.create(Role.users())],
      rowSecurity: true,
    }),
  );
  // place_id matches an id in the static curated seed list shipped with the
  // app (same pattern as the evidence facts) — not a foreign key, since the
  // seed list isn't a table.
  await ensure("place_ratings.placeId", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "place_ratings", key: "placeId", size: 60, required: true }),
  );
  await ensure("place_ratings.userId", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "place_ratings", key: "userId", size: 36, required: true }),
  );
  for (const key of ["seguranca", "percurso", "estrutura", "iluminacao", "fluxo"]) {
    await ensure(`place_ratings.${key}`, () =>
      tablesDB.createIntegerColumn({ databaseId: DATABASE_ID, tableId: "place_ratings", key, required: true, min: 1, max: 5 }),
    );
  }
  await ensure("place_ratings.note", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "place_ratings", key: "note", size: 500, required: false }),
  );
  // Defaults public conceptually (an anonymous safety tip about a park is
  // only useful if strangers can see it) — but same Appwrite constraint as
  // above, so the app must pass `visibility: "public"` explicitly rather
  // than omitting it and relying on a column default.
  await ensure("place_ratings.visibility", () =>
    tablesDB.createEnumColumn({
      databaseId: DATABASE_ID,
      tableId: "place_ratings",
      key: "visibility",
      elements: ["public", "friends", "private"],
      required: true,
    }),
  );
  await waitForColumn("place_ratings", "placeId");
  await waitForColumn("place_ratings", "userId");
  await ensure("place_ratings index: unique (placeId, userId)", () =>
    tablesDB.createIndex({
      databaseId: DATABASE_ID,
      tableId: "place_ratings",
      key: "unique_place_user",
      type: TablesDBIndexType.Unique,
      columns: ["placeId", "userId"],
    }),
  );

  // ------------------------------------------------------- place_run_stats
  console.log("\nplace_run_stats");
  await ensure("table place_run_stats", () =>
    tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId: "place_run_stats",
      name: "place_run_stats",
      // Same split as every other table: this only grants "may create a
      // row at all". Read is granted broadly (any signed-in user) per row
      // at creation time — the leaderboard is meant to be visible once an
      // athlete opts in, and the real gate is the opt-in itself
      // (`profiles.leaderboardOptIn`), not a per-row ACL. The "friends
      // only" view is a client-side filter over these same public rows,
      // same limitation `place_ratings`'s "friends" visibility already
      // has (no Appwrite Team exists per friend pair to enforce that
      // server-side).
      permissions: [Permission.create(Role.users())],
      rowSecurity: true,
    }),
  );
  // Matches an id in RUNNING_PLACES (src/lib/places.ts) — not a foreign
  // key, same convention as place_ratings.placeId above.
  await ensure("place_run_stats.placeId", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "place_run_stats", key: "placeId", size: 60, required: true }),
  );
  await ensure("place_run_stats.userId", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "place_run_stats", key: "userId", size: 36, required: true }),
  );
  await ensure("place_run_stats.totalMeters", () =>
    tablesDB.createFloatColumn({ databaseId: DATABASE_ID, tableId: "place_run_stats", key: "totalMeters", required: true, min: 0 }),
  );
  await ensure("place_run_stats.runCount", () =>
    tablesDB.createIntegerColumn({ databaseId: DATABASE_ID, tableId: "place_run_stats", key: "runCount", required: true, min: 0 }),
  );
  await ensure("place_run_stats.lastRunAt", () =>
    tablesDB.createDatetimeColumn({ databaseId: DATABASE_ID, tableId: "place_run_stats", key: "lastRunAt", required: true }),
  );
  await waitForColumn("place_run_stats", "placeId");
  await waitForColumn("place_run_stats", "userId");
  await ensure("place_run_stats index: unique (placeId, userId)", () =>
    tablesDB.createIndex({
      databaseId: DATABASE_ID,
      tableId: "place_run_stats",
      key: "unique_place_user",
      type: TablesDBIndexType.Unique,
      columns: ["placeId", "userId"],
    }),
  );

  // ------------------------------------------------------------------ runs
  console.log("\nruns");
  await ensure("table runs", () =>
    tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId: "runs",
      name: "runs",
      permissions: [Permission.create(Role.users())],
      rowSecurity: true,
    }),
  );
  await ensure("runs.userId", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "runs", key: "userId", size: 36, required: true }),
  );
  await ensure("runs.startedAt", () =>
    tablesDB.createDatetimeColumn({ databaseId: DATABASE_ID, tableId: "runs", key: "startedAt", required: true }),
  );
  await ensure("runs.finishedAt", () =>
    tablesDB.createDatetimeColumn({ databaseId: DATABASE_ID, tableId: "runs", key: "finishedAt", required: true }),
  );
  await ensure("runs.distanceMeters", () =>
    tablesDB.createFloatColumn({ databaseId: DATABASE_ID, tableId: "runs", key: "distanceMeters", required: true, min: 0 }),
  );
  await ensure("runs.movingSeconds", () =>
    tablesDB.createIntegerColumn({ databaseId: DATABASE_ID, tableId: "runs", key: "movingSeconds", required: true, min: 0 }),
  );
  // Full GPS trace as a JSON string, same shape as the local StoredPoint[].
  // Optional per row — a coach relationship might only need summary stats.
  // Max column size on Appwrite Cloud is large but not unbounded; this is
  // the shape, not a final storage decision (same caveat the original
  // Postgres version of this schema carried).
  await ensure("runs.points", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "runs", key: "points", size: 200_000, required: false }),
  );
  await ensure("runs.shoeName", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "runs", key: "shoeName", size: 100, required: false }),
  );
  // Defaults private conceptually — same Appwrite constraint as above, the
  // app must pass `visibility: "private"` explicitly rather than omitting it.
  await ensure("runs.visibility", () =>
    tablesDB.createEnumColumn({
      databaseId: DATABASE_ID,
      tableId: "runs",
      key: "visibility",
      elements: ["public", "friends", "private"],
      required: true,
    }),
  );

  // -------------------------------------------------------------- live_runs
  console.log("\nlive_runs");
  await ensure("table live_runs", () =>
    tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId: "live_runs",
      name: "live_runs",
      // Same "who may create at all" vs. "who may read/update this one" split
      // as every other table here: row-level permissions are set by the app
      // when the athlete actually goes live, scoped to the coach(es) they
      // picked for that run.
      permissions: [Permission.create(Role.users())],
      rowSecurity: true,
    }),
  );
  // Row ID is the run's own local id (see runIdRef in useRunTracker.ts) —
  // one row per in-progress run, found again by id rather than a query, and
  // naturally gone (deleted) the moment the run ends.
  await ensure("live_runs.userId", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "live_runs", key: "userId", size: 36, required: true }),
  );
  await ensure("live_runs.startedAt", () =>
    tablesDB.createDatetimeColumn({ databaseId: DATABASE_ID, tableId: "live_runs", key: "startedAt", required: true }),
  );
  await ensure("live_runs.distanceMeters", () =>
    tablesDB.createFloatColumn({ databaseId: DATABASE_ID, tableId: "live_runs", key: "distanceMeters", required: true, min: 0 }),
  );
  await ensure("live_runs.currentPaceSecPerKm", () =>
    tablesDB.createFloatColumn({ databaseId: DATABASE_ID, tableId: "live_runs", key: "currentPaceSecPerKm", required: false, min: 0 }),
  );
  await ensure("live_runs.elapsedSeconds", () =>
    tablesDB.createIntegerColumn({ databaseId: DATABASE_ID, tableId: "live_runs", key: "elapsedSeconds", required: true, min: 0 }),
  );
  await ensure("live_runs.lat", () =>
    tablesDB.createFloatColumn({ databaseId: DATABASE_ID, tableId: "live_runs", key: "lat", required: true, min: -90, max: 90 }),
  );
  await ensure("live_runs.lon", () =>
    tablesDB.createFloatColumn({ databaseId: DATABASE_ID, tableId: "live_runs", key: "lon", required: true, min: -180, max: 180 }),
  );
  await ensure("live_runs.updatedAtMs", () =>
    tablesDB.createIntegerColumn({ databaseId: DATABASE_ID, tableId: "live_runs", key: "updatedAtMs", required: true, min: 0 }),
  );
  // Which "longão" (group_runs) this live position belongs to, if any — see
  // group_runs below. Optional: most live runs are still the plain
  // 1-coach case with no group session involved.
  await ensure("live_runs.sessionCode", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "live_runs", key: "sessionCode", size: 12, required: false }),
  );
  await waitForColumn("live_runs", "sessionCode");
  await ensure("live_runs index: sessionCode", () =>
    tablesDB.createIndex({
      databaseId: DATABASE_ID,
      tableId: "live_runs",
      key: "by_session_code",
      type: TablesDBIndexType.Key,
      columns: ["sessionCode"],
    }),
  );

  // -------------------------------------------------------------- group_runs
  console.log("\ngroup_runs");
  await ensure("table group_runs", () =>
    tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId: "group_runs",
      name: "group_runs",
      // Row ID *is* the 6-character join code (see groupRuns.ts) — found
      // again by id, same convention as live_runs. Read is open to any
      // signed-in account, same reasoning as a TestFlight public link: the
      // code itself (1-in-a-billion-ish) is the real gate, and this row
      // holds no location, only name/host/schedule. Only the host may
      // update (e.g. close it) or delete.
      permissions: [Permission.read(Role.users()), Permission.create(Role.users())],
      rowSecurity: true,
    }),
  );
  await ensure("group_runs.hostId", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "group_runs", key: "hostId", size: 36, required: true }),
  );
  await ensure("group_runs.name", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "group_runs", key: "name", size: 60, required: true }),
  );
  await ensure("group_runs.startsAt", () =>
    tablesDB.createDatetimeColumn({ databaseId: DATABASE_ID, tableId: "group_runs", key: "startsAt", required: true }),
  );
  await ensure("group_runs.expiresAt", () =>
    tablesDB.createDatetimeColumn({ databaseId: DATABASE_ID, tableId: "group_runs", key: "expiresAt", required: true }),
  );
  await ensure("group_runs.status", () =>
    tablesDB.createEnumColumn({
      databaseId: DATABASE_ID,
      tableId: "group_runs",
      key: "status",
      elements: ["open", "closed"],
      required: true,
    }),
  );

  // ------------------------------------------------------ group_run_participants
  console.log("\ngroup_run_participants");
  await ensure("table group_run_participants", () =>
    tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId: "group_run_participants",
      name: "group_run_participants",
      // Same open-read reasoning as group_runs above — this row is just
      // "who's in this session", no location. Row ID is deterministic
      // (`${code}_${userId}`, see groupRuns.ts), so joining twice is a
      // harmless 409 rather than a duplicate row, and leaving is a direct
      // delete-by-id with no query needed first.
      //
      // *Create* is deliberately NOT open to Role.users() — unlike read,
      // which is harmless (no location in this row), create is the actual
      // privacy boundary ("only friends of the host may join") and that
      // check can't be expressed as an Appwrite permission rule. Rows here
      // are only ever created by the join-group-run Appwrite Function
      // (privileged key, verifies the friendship server-side) — see that
      // function's own comment, and src/lib/groupRuns.ts's file header, for
      // the full story of why an open table-level create here previously
      // let anyone insert themselves as a "participant" and get handed
      // live GPS read access downstream.
      permissions: [Permission.read(Role.users())],
      rowSecurity: true,
    }),
  );
  await ensure("group_run_participants.sessionCode", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "group_run_participants", key: "sessionCode", size: 12, required: true }),
  );
  await ensure("group_run_participants.userId", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "group_run_participants", key: "userId", size: 36, required: true }),
  );
  await ensure("group_run_participants.joinedAt", () =>
    tablesDB.createDatetimeColumn({ databaseId: DATABASE_ID, tableId: "group_run_participants", key: "joinedAt", required: true }),
  );
  await waitForColumn("group_run_participants", "sessionCode");
  await ensure("group_run_participants index: sessionCode", () =>
    tablesDB.createIndex({
      databaseId: DATABASE_ID,
      tableId: "group_run_participants",
      key: "by_session",
      type: TablesDBIndexType.Key,
      columns: ["sessionCode"],
    }),
  );
  await waitForColumn("group_run_participants", "userId");
  await ensure("group_run_participants index: userId", () =>
    tablesDB.createIndex({
      databaseId: DATABASE_ID,
      tableId: "group_run_participants",
      key: "by_user",
      type: TablesDBIndexType.Key,
      columns: ["userId"],
    }),
  );

  // -------------------------------------------------------------- run_comments
  console.log("\nrun_comments");
  await ensure("table run_comments", () =>
    tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId: "run_comments",
      name: "run_comments",
      // A coach's note on a specific shared run — same "create for anyone,
      // row-level read/update/delete set at write time" split as every
      // other table here. Read is granted to the comment's author and the
      // run's owner (the student) when the row is created, not here.
      permissions: [Permission.create(Role.users())],
      rowSecurity: true,
    }),
  );
  // The `runs` table row this comment is attached to — not a declared
  // foreign key (Appwrite has none), just a plain string matched by the app.
  await ensure("run_comments.runRowId", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "run_comments", key: "runRowId", size: 36, required: true }),
  );
  await ensure("run_comments.authorId", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "run_comments", key: "authorId", size: 36, required: true }),
  );
  await ensure("run_comments.text", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "run_comments", key: "text", size: 500, required: true }),
  );
  await waitForColumn("run_comments", "runRowId");
  await ensure("run_comments index: runRowId", () =>
    tablesDB.createIndex({
      databaseId: DATABASE_ID,
      tableId: "run_comments",
      key: "by_run",
      type: TablesDBIndexType.Key,
      columns: ["runRowId"],
    }),
  );

  // ------------------------------------------------------------- avatars
  console.log("\navatars (Storage bucket)");
  await ensure("bucket avatars", () =>
    storage.createBucket({
      bucketId: "avatars",
      name: "avatars",
      // Bucket-level read for anyone (a profile photo is meant to be seen
      // by friends/coaches, same public-by-default spirit as `profiles`
      // itself) plus create for any signed-in user; `fileSecurity: true`
      // lets the app additionally scope update/delete on each uploaded
      // file to its owner at upload time, same row-permission pattern
      // every table above already uses.
      permissions: [Permission.read(Role.any()), Permission.create(Role.users())],
      fileSecurity: true,
      maximumFileSize: 5 * 1024 * 1024,
      allowedFileExtensions: ["jpg", "jpeg", "png", "webp"],
    }),
  );

  console.log("\nDone. Every table/column/index above either already existed or was just created.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
