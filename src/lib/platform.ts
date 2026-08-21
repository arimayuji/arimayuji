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
