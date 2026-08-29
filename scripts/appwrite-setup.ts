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

  // ------------------------------------------------------------- city_races
  console.log("\ncity_races");
  await ensure("table city_races", () =>
    tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId: "city_races",
      name: "city_races",
      // Public read — a race calendar is public data by nature, same
      // spirit as `places.ts`'s curated catalog, just sourced live instead
      // of hand-seeded. No client create at all: rows are only ever
      // written by the sync-city-races scheduled action inside
      // client-actions (privileged key), which upserts a row per race
      // scraped from the Corrida Perfeita API / FPA API. A client-side
      // create here would let anyone plant a fake race with a phishing
      // registrationUrl.
      permissions: [Permission.read(Role.any())],
      rowSecurity: true,
    }),
  );
  await ensure("city_races.name", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "city_races", key: "name", size: 200, required: true }),
  );
  await ensure("city_races.date", () =>
    tablesDB.createDatetimeColumn({ databaseId: DATABASE_ID, tableId: "city_races", key: "date", required: true }),
  );
  // Only meaningfully different from `date` for a multi-day event (FPA
  // gives date_start/date_end; the Corrida Perfeita API doesn't distinguish
  // the two, so this is null for every row from that source).
  await ensure("city_races.endDate", () =>
    tablesDB.createDatetimeColumn({ databaseId: DATABASE_ID, tableId: "city_races", key: "endDate", required: false }),
  );
  // Empty string, not null, when a source didn't tag one (some Corrida
  // Perfeita entries — big national events like "Maratona de Sydney" —
  // have no city/state at all) — keeps every row's shape identical for
  // the client, which just treats "" as "unknown" the same way
  // CompletedRun.placeName's absence already means "unknown" elsewhere.
  await ensure("city_races.city", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "city_races", key: "city", size: 100, required: false }),
  );
  // UF (2 letters) for Corrida Perfeita rows; always "SP" for FPA rows
  // (Federação Paulista only covers São Paulo state).
  await ensure("city_races.state", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "city_races", key: "state", size: 2, required: false }),
  );
  // Race distances in km — an event can offer several (10km + 5km on the
  // same day). Empty array when the source didn't disclose one (FPA's
  // `distance` is frequently 0, meaning "not informed", not "0km race").
  await ensure("city_races.distancesKm", () =>
    tablesDB.createFloatColumn({ databaseId: DATABASE_ID, tableId: "city_races", key: "distancesKm", required: false, array: true }),
  );
  await ensure("city_races.registrationUrl", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "city_races", key: "registrationUrl", size: 500, required: false }),
  );
  await ensure("city_races.source", () =>
    tablesDB.createEnumColumn({
      databaseId: DATABASE_ID,
      tableId: "city_races",
      key: "source",
      elements: ["corrida_perfeita", "fpa"],
      required: true,
    }),
  );
  await waitForColumn("city_races", "date");
  await ensure("city_races index: date", () =>
    tablesDB.createIndex({
      databaseId: DATABASE_ID,
      tableId: "city_races",
      key: "by_date",
      type: TablesDBIndexType.Key,
      columns: ["date"],
    }),
  );
  await waitForColumn("city_races", "state");
  await ensure("city_races index: state", () =>
    tablesDB.createIndex({
      databaseId: DATABASE_ID,
      tableId: "city_races",
      key: "by_state",
      type: TablesDBIndexType.Key,
      columns: ["state"],
    }),
  );

  // ---------------------------------------------------------------- profiles
  console.log("\nprofiles");
  await ensure("table profiles", () =>
    tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId: "profiles",
      name: "profiles",
      // Public read (handles are discoverable, like a Strava/Instagram
      // username). *Create* is deliberately NOT open to Role.users() —
      // the row ID is the account's own user ID, and Appwrite has no
      // permission rule for "the row ID you're creating must equal your
      // own account ID"; a blanket create grant here let one account
      // "reserve" another's future profile row before they ever signed up
      // (LGPD/security audit finding #12). Rows are only ever created by
      // the claim-owned-row Appwrite Function (privileged key, derives the
      // row ID from the caller's own session) — see that function's own
      // comment. Row-level permissions (set by the Function) handle update.
      permissions: [Permission.read(Role.any())],
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
  // Same shape/reasoning as leaderboardOptIn — this decides what OTHER
  // accounts (accepted friends only) can see, so it has to live here, not
  // in the local-only preferences.ts: a client-side flag alone wouldn't
  // gate anything, the refresh-presence Function action is what actually
  // checks this before granting anyone read on this account's
  // friend_presence row. Off/absent by default; a friend-nearby ping is a
  // one-shot foreground location read, never a background watch — see
  // friend_presence's own table comment.
  await ensure("profiles.nearbyOptIn", () =>
    tablesDB.createBooleanColumn({ databaseId: DATABASE_ID, tableId: "profiles", key: "nearbyOptIn", required: false }),
  );
  // Only meaningful once opted in above. The *public* leaderboard view
  // shows this (falling back to `handle`) instead of `displayName`, so a
  // stranger never sees a real name just from participating — the friends
  // view still uses the real `displayName`, same as everywhere else in
  // the app friends already see each other's real name.
  await ensure("profiles.publicDisplayName", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "profiles", key: "publicDisplayName", size: 60, required: false }),
  );
  // Links to the account's running playlists (Spotify, Apple Music,
  // whatever) — shown on /perfil and to friends on /perfil/ver. One array
  // column, each entry a JSON string `{url, coverUrl}` (see
  // src/lib/playlistLink.ts's parsePlaylists/serializePlaylists) rather than
  // two parallel arrays, so a url and its cover can never drift out of index
  // sync. `coverUrl` is resolved once client-side when a link is added
  // (Spotify's public oEmbed endpoint) and cached in the JSON rather than
  // re-fetched on every profile view; stays empty for links this app doesn't
  // know how to resolve a cover for, which is fine — the link itself still
  // works either way.
  await ensure("profiles.playlists", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "profiles", key: "playlists", size: 600, required: false, array: true }),
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

  // ------------------------------------------------------------ plan_overrides
  console.log("\nplan_overrides");
  await ensure("table plan_overrides", () =>
    tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId: "plan_overrides",
      name: "plan_overrides",
      // *Create* is deliberately NOT open to Role.users() — "is this account
      // an accepted coach of that student" isn't a Role Appwrite can express,
      // same reasoning join-group-run's own table documents for "is this
      // account a friend of the host". Rows are only ever created by the
      // set-plan-override Appwrite Function (privileged key, verifies the
      // coach_relationships row server-side before writing) — see that
      // function's own comment. Row-level permissions (set by the Function)
      // grant read to both the coach and the student, update/delete to the
      // coach only.
      permissions: [],
      rowSecurity: true,
    }),
  );
  await ensure("plan_overrides.coachId", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "plan_overrides", key: "coachId", size: 36, required: true }),
  );
  await ensure("plan_overrides.studentId", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "plan_overrides", key: "studentId", size: 36, required: true }),
  );
  // ISO date (yyyy-mm-dd) of the Monday the overridden week starts —
  // matches PlannedWeek.startDate exactly, so applying an override is a
  // plain lookup by that string, no date math needed at read time.
  await ensure("plan_overrides.weekStartDate", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "plan_overrides", key: "weekStartDate", size: 10, required: true }),
  );
  await ensure("plan_overrides.totalKm", () =>
    tablesDB.createFloatColumn({ databaseId: DATABASE_ID, tableId: "plan_overrides", key: "totalKm", required: true }),
  );
  // JSON-encoded PlannedSession[] (7 entries, Monday-first) — same
  // stringify-a-small-structure convention as runs.points, just far
  // smaller (7 tiny objects, not a GPS track).
  await ensure("plan_overrides.sessions", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "plan_overrides", key: "sessions", size: 2000, required: true }),
  );
  await ensure("plan_overrides.note", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "plan_overrides", key: "note", size: 300, required: false }),
  );
  await waitForColumn("plan_overrides", "studentId");
  await ensure("plan_overrides index: studentId", () =>
    tablesDB.createIndex({
      databaseId: DATABASE_ID,
      tableId: "plan_overrides",
      key: "by_student",
      type: TablesDBIndexType.Key,
      columns: ["studentId"],
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
      // *Create* is deliberately NOT open to Role.users() — the row ID is
      // `${placeId}_${userId}`, and a blanket create grant here let one
      // account seed another's totals at a place before they'd ever run
      // there (LGPD/security audit finding #12), the same reasoning
      // `profiles` above documents. Rows are only ever created by the
      // claim-owned-row Appwrite Function (privileged key, derives the row
      // ID from the caller's own session). Read is granted broadly (any
      // signed-in user) per row at creation time — the leaderboard is meant
      // to be visible once an athlete opts in, and the real gate is the
      // opt-in itself (`profiles.leaderboardOptIn`), not a per-row ACL. The
      // "friends only" view is a client-side filter over these same public
      // rows, same limitation `place_ratings`'s "friends" visibility
      // already has (no Appwrite Team exists per friend pair to enforce
      // that server-side).
      permissions: [],
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

  // -------------------------------------------------------- profile_stats
  console.log("\nprofile_stats");
  await ensure("table profile_stats", () =>
    tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId: "profile_stats",
      name: "profile_stats",
      // Public read, same accepted tradeoff place_run_stats documents
      // above (no Appwrite Team exists per friend pair to enforce a real
      // server-side "friends only" read) — but unlike place_run_stats,
      // there's no opt-in gate here at all: a friend already sees your
      // real name and handle everywhere else in the app, so a cumulative
      // running total isn't a new category of exposure the way appearing
      // on a public place leaderboard is. The gate that matters is
      // src/app/(app)/perfil/ver/page.tsx only ever *surfacing* this to a
      // confirmed friend, never a stranger browsing by handle.
      //
      // *Create* is deliberately NOT open to Role.users() — same
      // claim-owned-row reasoning as `profiles`/`place_run_stats` above
      // (LGPD/security audit finding #12): the row ID is the account's own
      // user ID, so a blanket create grant let one account seed another's
      // stats row before they'd ever finished a run.
      permissions: [],
      rowSecurity: true,
    }),
  );
  // Row ID is the account's own user ID (like `profiles`), not
  // `ID.unique()` — one row per account, so no separate lookup index is
  // needed the way place_run_stats' composite key requires.
  await ensure("profile_stats.userId", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "profile_stats", key: "userId", size: 36, required: true }),
  );
  await ensure("profile_stats.totalMeters", () =>
    tablesDB.createFloatColumn({ databaseId: DATABASE_ID, tableId: "profile_stats", key: "totalMeters", required: true, min: 0 }),
  );
  await ensure("profile_stats.totalRuns", () =>
    tablesDB.createIntegerColumn({ databaseId: DATABASE_ID, tableId: "profile_stats", key: "totalRuns", required: true, min: 0 }),
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
  // "Coach ao vivo" — all four optional, all additive to the existing row:
  // heartRateBpm only appears when the athlete opted in for this specific
  // run (preferences.ts's shareHeartRateWithCoach) AND a watch/strap is
  // actually writing near-real-time samples to HealthKit/Health Connect;
  // forecastSecondsRemaining mirrors exactly what useRunTracker.ts already
  // computes for the athlete's own screen, just shared along so the coach
  // never has to re-derive it from raw pace+distance. pendingCueId/
  // pendingCueAtMs are the "go" signal a coach's pre-recorded voice cue
  // rides on — same shape as group_runs.startedAt from the QR-lobby
  // feature (a field a poll reacts to), written by the send-coach-cue
  // Function action (the coach only ever has `read` on this row, never
  // `update`) and cleared client-direct by the athlete once the clip plays
  // (the athlete already owns `update` on their own row).
  await ensure("live_runs.heartRateBpm", () =>
    tablesDB.createIntegerColumn({ databaseId: DATABASE_ID, tableId: "live_runs", key: "heartRateBpm", required: false, min: 0 }),
  );
  await ensure("live_runs.forecastSecondsRemaining", () =>
    tablesDB.createIntegerColumn({ databaseId: DATABASE_ID, tableId: "live_runs", key: "forecastSecondsRemaining", required: false, min: 0 }),
  );
  await ensure("live_runs.pendingCueId", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "live_runs", key: "pendingCueId", size: 40, required: false }),
  );
  await ensure("live_runs.pendingCueAtMs", () =>
    tablesDB.createIntegerColumn({ databaseId: DATABASE_ID, tableId: "live_runs", key: "pendingCueAtMs", required: false, min: 0 }),
  );

  // --------------------------------------------------------- friend_presence
  console.log("\nfriend_presence");
  await ensure("table friend_presence", () =>
    tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId: "friend_presence",
      name: "friend_presence",
      // A one-shot "I opened the app here" ping, not a run — deliberately
      // its own table rather than reusing live_runs, whose row lifecycle
      // (deleted the moment a run ends) doesn't fit "just opened the app,
      // no run happening." No table-level create/read at all: every write
      // (including the very first one) goes through the refresh-presence
      // Function action, which is also what grants read to the caller's
      // accepted friends — a blanket create here would let anyone plant a
      // row before the Function ever validates the opt-in.
      permissions: [],
      rowSecurity: true,
    }),
  );
  // Row ID is the account's own user ID (like profile_stats) — one row per
  // account, overwritten on every ping, never accumulated.
  await ensure("friend_presence.lat", () =>
    tablesDB.createFloatColumn({ databaseId: DATABASE_ID, tableId: "friend_presence", key: "lat", required: true, min: -90, max: 90 }),
  );
  await ensure("friend_presence.lon", () =>
    tablesDB.createFloatColumn({ databaseId: DATABASE_ID, tableId: "friend_presence", key: "lon", required: true, min: -180, max: 180 }),
  );
  await ensure("friend_presence.updatedAtMs", () =>
    tablesDB.createIntegerColumn({ databaseId: DATABASE_ID, tableId: "friend_presence", key: "updatedAtMs", required: true, min: 0 }),
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
  // The "everyone's ready, go" signal for the QR-pairing lobby — null
  // means still waiting, set once (by the host, via the start-group-run
  // Function action) to the moment every polling client should treat as
  // "start now". Deliberately a new column rather than a third `status`
  // value: `status` already means "can people still join / is this
  // session over", a different axis from "has the run itself begun",
  // and widening a live Appwrite enum column is a real migration this
  // avoids.
  await ensure("group_runs.startedAt", () =>
    tablesDB.createDatetimeColumn({ databaseId: DATABASE_ID, tableId: "group_runs", key: "startedAt", required: false }),
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
  // Lobby ready-up flag, toggled client-direct once the row also grants
  // the participant `update` on themselves (see join-group-run/
  // pair-run-session in client-actions) — `required: false` +
  // `xdefault: false` rather than `required: true`, since the Appwrite
  // SDK rejects a default value on a required column; every row still
  // reads as `false` until the participant marks themselves ready.
  await ensure("group_run_participants.ready", () =>
    tablesDB.createBooleanColumn({
      databaseId: DATABASE_ID,
      tableId: "group_run_participants",
      key: "ready",
      required: false,
      xdefault: false,
    }),
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

  // -------------------------------------------------------- content_ideas
  console.log("\ncontent_ideas");
  // Fixed allowlist, duplicated on purpose from src/lib/internalTeam.ts —
  // this script deliberately never imports from src/ (see file header
  // above), so the two lists are kept in sync by hand. This is the first
  // table in this project where "who may read/write" is a short, static
  // set rather than Role.any()/Role.users()/an empty array gated behind a
  // Function: unlike a friendship or coach relationship, membership here
  // isn't negotiated between two accounts, so Role.user(id) can express
  // it directly at the table level.
  const INTERNAL_TEAM_ACCOUNT_IDS: string[] = [
    // Manter em sincronia manual com src/lib/internalTeam.ts.
  ];
  if (INTERNAL_TEAM_ACCOUNT_IDS.length === 0) {
    console.warn(
      "  WARNING: INTERNAL_TEAM_ACCOUNT_IDS is empty — content_ideas will have no permissions until this is filled in (here and in src/lib/internalTeam.ts) and the script is re-run.",
    );
  }
  const contentIdeasPermissions = INTERNAL_TEAM_ACCOUNT_IDS.flatMap((id) => [
    Permission.read(Role.user(id)),
    Permission.create(Role.user(id)),
    Permission.update(Role.user(id)),
    Permission.delete(Role.user(id)),
  ]);
  await ensure("table content_ideas", () =>
    tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId: "content_ideas",
      name: "content_ideas",
      permissions: contentIdeasPermissions,
      rowSecurity: true,
    }),
  );
  // Runs unconditionally, not swallowed behind ensure()'s 409 check — the
  // whole point of a fixed allowlist is that it changes (adding a
  // teammate), and a 409 on an already-existing table skips re-applying
  // `permissions` entirely. That's the exact bug "tightening LGPD finding
  // #12" below already had to fix once for profiles/place_run_stats/
  // profile_stats, so this table pays that cost up front instead.
  await tablesDB.updateTable({
    databaseId: DATABASE_ID,
    tableId: "content_ideas",
    permissions: contentIdeasPermissions,
    rowSecurity: true,
  });
  await ensure("content_ideas.title", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "content_ideas", key: "title", size: 120, required: true }),
  );
  // Same 5 pillars documented in SOCIAL-CONTEXT.md — keep the two in sync.
  await ensure("content_ideas.pillar", () =>
    tablesDB.createEnumColumn({
      databaseId: DATABASE_ID,
      tableId: "content_ideas",
      key: "pillar",
      elements: ["produto", "autentico", "autoridade", "marca", "comunidade"],
      required: true,
    }),
  );
  await ensure("content_ideas.status", () =>
    tablesDB.createEnumColumn({
      databaseId: DATABASE_ID,
      tableId: "content_ideas",
      key: "status",
      elements: ["ideia", "rascunho", "agendado", "publicado"],
      required: true,
    }),
  );
  await ensure("content_ideas.notes", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "content_ideas", key: "notes", size: 2000, required: false }),
  );
  // Link to wherever the actual asset lives (an Artifact, Recraft Studio,
  // a finished video) — this table only tracks the idea, never hosts the
  // file itself.
  await ensure("content_ideas.assetUrl", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "content_ideas", key: "assetUrl", size: 500, required: false }),
  );
  await ensure("content_ideas.createdBy", () =>
    tablesDB.createStringColumn({ databaseId: DATABASE_ID, tableId: "content_ideas", key: "createdBy", size: 36, required: true }),
  );

  // ------------------------------------------------------------- avatars
  // Checked with getBucket() first, not just a create-and-catch-409 like
  // `ensure()` does for tables/columns: Appwrite Cloud's Free plan also
  // caps total buckets per project (hit in practice once `avatars` was
  // already the only one), and that cap rejects `createBucket` with a 403
  // *before* it ever gets to check whether "avatars" already exists — so
  // treating this one like every other `ensure()` call would fail this
  // script every single re-run on a project already at its bucket limit,
  // even though there is nothing left to create.
  console.log("\navatars (Storage bucket)");
  const avatarsBucketExists = await storage
    .getBucket({ bucketId: "avatars" })
    .then(() => true)
    .catch(() => false);
  if (avatarsBucketExists) {
    console.log("  exists:  bucket avatars");
  } else {
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
  }

  // ---------------------------------------------- tighten LGPD finding #12
  // `ensure()` above only ever creates a table that doesn't exist yet — on
  // a project where profiles/place_run_stats/profile_stats were already
  // created with the old `Permission.create(Role.users())`, re-running this
  // script leaves that permission in place (a 409 short-circuits before the
  // permissions array is ever looked at again). These three `updateTable`
  // calls apply regardless of whether the table is brand new or years old,
  // so the fix actually reaches a project that's been running since before
  // the claim-owned-row Function existed.
  //
  // `rowSecurity: true` has to ride along in this same call, not just live
  // in the `createTable` definitions above — for the same reason a 409 on
  // an existing table skips re-applying `permissions`, it also skips
  // `rowSecurity`. A table stuck on `rowSecurity: false` ignores every
  // per-row permission `claim-owned-row` ever sets (Appwrite only consults
  // row-level grants when this flag is on), so on a project old enough to
  // predate this flag being added here, every one of these three tables
  // silently had **no update path at all** — not a client bug, a schema
  // one: the row says `update("user:X")`, but the table was never told to
  // look at that. Found 2026-08-22 chasing a real report that "Participar
  // do ranking" on /perfil did nothing.
  console.log("\ntightening create permissions (LGPD/security audit finding #12)");
  for (const tableId of ["profiles", "place_run_stats", "profile_stats"] as const) {
    const permissions = tableId === "profiles" ? [Permission.read(Role.any())] : [];
    await ensure(`${tableId}: strip Role.users() create + enable rowSecurity`, () =>
      tablesDB.updateTable({ databaseId: DATABASE_ID, tableId, permissions, rowSecurity: true }),
    );
  }

  console.log("\nDone. Every table/column/index above either already existed or was just created.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
