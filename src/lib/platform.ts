import { Capacitor } from "@capacitor/core";

/** True inside a Capacitor-wrapped native app (Android/iOS), false in any browser/PWA context. */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/** True only inside the native Android shell — false on iOS, web, and PWA. */
export function isAndroidPlatform(): boolean {
  return Capacitor.getPlatform() === "android";
}

/** True only inside the native iOS shell — false on Android, web, and PWA. */
export function isIOSPlatform(): boolean {
  return Capacitor.getPlatform() === "ios";
}

/**
 * True when the app is running detached from browser chrome — an installed
 * PWA in standalone display mode, iOS's own "Adicionar à Tela de Início"
 * flag, or a Capacitor native build (which has no browser chrome to detach
 * from in the first place, so it always counts).
 */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  if (isNativePlatform()) return true;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's own flag — it never sets display-mode via matchMedia.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
