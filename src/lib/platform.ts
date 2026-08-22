import { Capacitor } from "@capacitor/core";

/** True inside a Capacitor-wrapped native app (Android/iOS), false in any browser context. */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/** True only inside the native Android shell — false on iOS and web. */
export function isAndroidPlatform(): boolean {
  return Capacitor.getPlatform() === "android";
}

/** True only inside the native iOS shell — false on Android and web. */
export function isIOSPlatform(): boolean {
  return Capacitor.getPlatform() === "ios";
}

/** The real, public web origin — never the native app's own WebView. */
const PUBLIC_ORIGIN = "https://xanthus.app.br";

/**
 * The origin to build a shareable link against. Inside the native app,
 * `window.location.origin` resolves to the WebView's own internal scheme
 * (`https://localhost` on Android, `capacitor://localhost` on iOS) since
 * the whole site ships bundled in the app — a link built from that is
 * dead the instant it leaves the device it was shared from. Every link
 * meant for someone else to open (share a run, join a longão, an invite)
 * needs this instead of `window.location.origin` directly.
 */
export function publicOrigin(): string {
  return isNativePlatform() ? PUBLIC_ORIGIN : window.location.origin;
}
