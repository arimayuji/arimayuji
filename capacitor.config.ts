import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.xanthus.app",
  appName: "Xanthus",
  webDir: "out",
  server: {
    // Fixes both native logins (Apple and Google) crash-adjacent to a
    // different bug: `account.createSession({userId, secret})` — the shared
    // last step of both `nativeAppleSignIn` and `nativeGoogleSignIn` in
    // src/lib/auth.ts — was failing with Appwrite's own "Invalid Scheme"
    // error ("The scheme used (capacitor) in the Origin (capacitor://
    // localhost) is not supported... change it to
    // appwrite-callback-<PROJECT_ID>"), confirmed on a real device on both
    // providers. iOS's WKWebView runs under Capacitor's default `capacitor:`
    // scheme (can't be set to `http`/`https` — Capacitor's own restriction,
    // those are reserved), which Appwrite's session-creation origin check
    // rejects outright; Android already runs under `https://localhost` by
    // default, which passes, so this is scoped to iOS only.
    // "appwrite-callback-6a7cd5df0036246ce258" is the exact same literal
    // already registered as a CFBundleURLScheme in ios/App/App/Info.plist
    // for the OAuth2 browser-redirect deep link (matching
    // NEXT_PUBLIC_APPWRITE_PROJECT_ID, not a secret) — reusing it here as
    // the WebView's own origin is exactly the scheme Appwrite's error
    // message itself names as supported.
    // Known cost, accepted for a small closed beta: changing the WebView's
    // origin also changes what IndexedDB/localStorage the app can see —
    // any run history already saved locally on an iPhone under the old
    // `capacitor://localhost` origin becomes inaccessible (not deleted,
    // just orphaned) after this ships. Not verified yet whether reusing
    // this same scheme for both the WebView's own origin and the external
    // deep-link handler causes any navigation conflict — this could only
    // be confirmed on a real device, not in this environment.
    iosScheme: "appwrite-callback-6a7cd5df0036246ce258",
  },
  android: {
    // Without this, @capacitor-community/background-geolocation's fixes
    // stop arriving ~5 minutes after the screen locks — Capacitor's
    // default (non-legacy) Android bridge suspends the WebView's JS
    // context more aggressively than the plugin's foreground service can
    // work around on its own. See its README.
    useLegacyBridge: true,
  },
  plugins: {
    // Only Google is wired up (src/lib/auth.ts's nativeGoogleSignIn) — Apple
    // login already goes through its own dedicated plugin
    // (@capacitor-community/apple-sign-in), and this app has no
    // Facebook/Twitter login at all. Disabling the unused providers here
    // keeps their SDKs (and, for Facebook specifically, its AD_ID-related
    // permissions — see this plugin's own Play Console troubleshooting
    // notes) out of the native builds entirely, not just unused in JS.
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
    },
  },
};

export default config;
