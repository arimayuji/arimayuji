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
import { Account, Client, Functions, type OAuthProvider, Storage, TablesDB, Teams } from "appwrite";

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;

/**
 * The custom URL scheme the native apps register (see AndroidManifest.xml
 * and Info.plist) so the OS can hand a finished OAuth login back to this
 * app instead of leaving the athlete stranded in the system browser —
 * `appwrite-callback-{PROJECT_ID}` is Appwrite's own documented convention
 * for this, not something invented here. Null with no project configured,
 * same as everything else in this file.
 */
export const OAUTH_CALLBACK_SCHEME = PROJECT_ID ? `appwrite-callback-${PROJECT_ID}` : null;

/** Where oauth-callback-listener.tsx (mounted once in layout.tsx) sends the athlete once the native OAuth round trip completes — carried through the callback URL's own query string since nothing else survives the trip out to the system browser and back. */
export const OAUTH_RETURN_TO_PARAM = "returnTo";

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
  placeRunStats: "place_run_stats",
  runs: "runs",
  liveRuns: "live_runs",
  runComments: "run_comments",
  groupRuns: "group_runs",
  groupRunParticipants: "group_run_participants",
} as const;

// Matches appwrite-functions/delete-account's Function ID — set this exact
// ID when creating the function in the Appwrite console (see README), same
// convention as TABLES above (a fixed, human-readable ID chosen at
// creation, not one Appwrite generates).
export const DELETE_ACCOUNT_FUNCTION_ID = "delete-account";

// Matches appwrite-functions/send-welcome-email's Function ID — same
// convention as DELETE_ACCOUNT_FUNCTION_ID above.
export const SEND_WELCOME_EMAIL_FUNCTION_ID = "send-welcome-email";

// Matches appwrite-functions/join-group-run's Function ID — same convention
// as DELETE_ACCOUNT_FUNCTION_ID above. Joining a "longão" is privileged
// (verifying "is this account a friend of the host" needs a scoped key,
// same reasoning as delete-account) rather than a plain client-side
// `createRow`, see that function's own comment for why.
export const JOIN_GROUP_RUN_FUNCTION_ID = "join-group-run";

// Matches the Storage bucket ID created in scripts/appwrite-setup.ts —
// same fixed-ID convention as the table/function IDs above.
export const AVATARS_BUCKET_ID = "avatars";

interface AppwriteServices {
  client: Client;
  account: Account;
  tablesDB: TablesDB;
  teams: Teams;
  functions: Functions;
  storage: Storage;
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
      functions: new Functions(client),
      storage: new Storage(client),
    };
  }
  return services;
}

/**
 * Builds the OAuth2 *token* login URL by hand rather than calling the SDK's
 * own `account.createOAuth2Token()` — that method, the moment `window`
 * exists, immediately does `window.location.href = url` itself and returns
 * nothing, which is exactly the in-app navigation the native flow (see
 * auth.ts's `signInWithGoogle`/`signInWithApple`) has to avoid: it needs
 * this URL to hand to the *system* browser instead, never to the app's own
 * WebView. Mirrors the SDK's own construction of
 * `/account/tokens/oauth2/{provider}` exactly, so a future SDK bump only
 * needs checking against this if that endpoint's shape ever changes.
 */
export function oauth2TokenUrl(
  provider: OAuthProvider,
  success: string,
  failure: string,
): string | null {
  if (!ENDPOINT || !PROJECT_ID) return null;
  const url = new URL(`${ENDPOINT}/account/tokens/oauth2/${encodeURIComponent(provider)}`);
  url.searchParams.set("success", success);
  url.searchParams.set("failure", failure);
  url.searchParams.set("project", PROJECT_ID);
  return url.toString();
}
