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
import { isNativePlatform } from "./platform";

/**
 * Two endpoints, one Appwrite project. Native (Android/iOS) always talks to
 * Appwrite directly — its WebView was never the cross-site cookie problem
 * described below. The browser instead goes through `worker/index.js`
 * (same origin as the site itself, `xanthus.app.br`), which proxies /v1/*
 * to the real endpoint server-side: the Appwrite session cookie set after
 * OAuth login lives on `nyc.cloud.appwrite.io`, a different site than
 * `xanthus.app.br`, so every `account.get()` call after login was
 * cross-site from the browser's point of view — browsers with third-party
 * cookie blocking (an increasingly common default, not an edge case)
 * silently dropped that cookie, reading the app back as "guests" even
 * though the login itself had just succeeded. See PROJECT-CONTEXT.md's
 * "Web (Sala de Treino...)" entry for the full history, including an
 * Appwrite custom-domain attempt that got stuck on a certificate that
 * never finished issuing on Appwrite's own side — this proxy needs no
 * cooperation from Appwrite at all.
 *
 * Falls back to the native endpoint if the web-only override isn't
 * configured (e.g. a local dev build that never set it) rather than
 * failing outright — the proxy is a browser-only refinement, not a
 * requirement for the app to run.
 */
const NATIVE_ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const WEB_ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_WEB_ENDPOINT || NATIVE_ENDPOINT;
const ENDPOINT = isNativePlatform() ? NATIVE_ENDPOINT : WEB_ENDPOINT;
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
  planOverrides: "plan_overrides",
  placeRatings: "place_ratings",
  placeRunStats: "place_run_stats",
  profileStats: "profile_stats",
  weeklyStats: "weekly_stats",
  runs: "runs",
  liveRuns: "live_runs",
  runComments: "run_comments",
  groupRuns: "group_runs",
  groupRunParticipants: "group_run_participants",
  contentIdeas: "content_ideas",
  cityRaces: "city_races",
  friendPresence: "friend_presence",
  runnerProfileSync: "runner_profile_sync",
  runSummaries: "run_summaries",
  recoverySnapshots: "recovery_snapshots",
  customRoutes: "custom_routes",
} as const;

/**
 * Matches appwrite-functions/client-actions's Function ID — one dispatcher
 * Function backing every privileged, client-invoked write this app needs
 * (deleting an account, sending the welcome email, joining a longão,
 * claiming the first row of an owned table, setting/suggesting a coach plan
 * override), instead of one Function per action.
 *
 * Why one Function instead of six: Appwrite Cloud's Free plan caps a
 * project at 2 Functions total (confirmed against appwrite.io/pricing,
 * 2026-08-22, after `appwrite functions create` refused a 3rd with "the
 * maximum number of functions allowed for the selected plan has reached").
 * Six actions, each needing its own privileged server-side check (the kind
 * of thing this file's other Function-ID comments explain — "is this
 * account a friend of the host," "is this the caller's own row," etc.) plus
 * two event-triggered cleanup Functions (see ROW_EVENTS below) would need
 * 8 Functions on a plan that allows 2. Folding every client-invoked action
 * into one dispatcher, keyed by a `body.action` field, and every
 * event-triggered one into a second dispatcher keyed by which table's
 * event fired, fits both real trigger *shapes* this app needs into exactly
 * the two slots the Free plan allows — see appwrite-functions/client-actions
 * and appwrite-functions/row-events for the actual dispatch logic, and
 * README.md for the one-time Appwrite Console setup (this dispatcher needs
 * the union of every action's API key scopes, since Appwrite grants scopes
 * per Function, not per action).
 */
export const CLIENT_ACTIONS_FUNCTION_ID = "client-actions";

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
