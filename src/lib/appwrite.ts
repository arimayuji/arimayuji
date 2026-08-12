/**
 * The one optional backend dependency in an otherwise fully local app.
 * Recording a run, history, and PRs never touch this — only the features
 * that need a real account (rating a place, adding a friend or a coach)
 * do. Auth is Appwrite's own client-side auth: this app is a static
 * export with no Next.js server runtime (see next.config.ts), so there's
 * nowhere to run a server-side OAuth callback. The Appwrite client SDK
 * does the whole round trip from the browser instead — same reasoning
 * that ruled out Auth.js.
 *
 * `NEXT_PUBLIC_` is required for a static export — these are baked into
 * the client bundle at build time. Neither value is a secret: a project
 * ID and endpoint are meant to be public, the same way Appwrite's own
 * quickstart embeds them directly in browser code. Access control lives
 * in each collection's permissions (see scripts/appwrite-setup.ts), not
 * in hiding these two values.
 */
import { Account, Client, TablesDB, Teams } from "appwrite";

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;

// Appwrite Cloud's free plan pre-provisions exactly one database per
// project and doesn't allow creating a second — this is that one
// ("Xanthus DB"), not an ID we chose ourselves.
export const APPWRITE_DATABASE_ID = "6a7cd61a00290490a79d";

/** Appwrite's current terminology is Tables/Rows/Columns (the older Collections/Documents/Attributes API still exists but is deprecated) — these are table IDs. */
export const TABLES = {
  profiles: "profiles",
  friendships: "friendships",
  coachRelationships: "coach_relationships",
  placeRatings: "place_ratings",
  runs: "runs",
} as const;

interface AppwriteServices {
  client: Client;
  account: Account;
  tablesDB: TablesDB;
  teams: Teams;
}

let services: AppwriteServices | null = null;

/**
 * Null when the project isn't configured (no env vars set) — every
 * caller must treat that as "the community features aren't available
 * right now," the same way `saveActiveRun` treats a missing `indexedDB`,
 * rather than throwing during a build that hasn't wired up Appwrite yet.
 */
export function getAppwrite(): AppwriteServices | null {
  if (!ENDPOINT || !PROJECT_ID) return null;
  if (!services) {
    const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);
    services = {
      client,
      account: new Account(client),
      tablesDB: new TablesDB(client),
      teams: new Teams(client),
    };
  }
  return services;
}
