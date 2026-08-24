import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.xanthus.app",
  appName: "Xanthus",
  webDir: "out",
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
