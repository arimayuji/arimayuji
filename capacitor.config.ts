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
};

export default config;
