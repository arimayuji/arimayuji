"use client";

import { useEffect } from "react";
import { logDiag } from "@/lib/tracking/diagLog";

/**
 * Temporary diagnostic: logs any uncaught error or unhandled promise
 * rejection, app-wide. Installed while debugging the "Iniciar corrida faz
 * nada" report on the native Android build. Originally used alert() (no
 * remote devtools access at the time), but a blocking native dialog queues
 * up whatever taps land on the screen underneath while it's up and replays
 * them all the instant it closes — a real, self-inflicted cause of some of
 * the "screen resets on its own" reports. Now that `adb logcat` access is
 * available, console.error (tag "Capacitor/Console") shows the same thing
 * without that side effect. Remove once root-caused; not meant to ship
 * long-term.
 */
export function GlobalErrorAlert() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      console.error(`[diag] Erro: ${event.message}\n${event.error?.stack ?? ""}`);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? `${reason.message}\n${reason.stack ?? ""}` : String(reason);
      console.error(`[diag] Promise rejeitada: ${message}`);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // The breadcrumb trail (src/lib/tracking/diagLog.ts) proved start()
  // completes and sets status "warming" — then goes completely silent, no
  // JS exception, no further fix/tick log, and the app comes back at a
  // fresh idle mount. That's consistent with the whole process being torn
  // down (OS-level kill, e.g. an aggressive OEM battery manager reacting
  // to the foreground-location-service just starting) rather than a JS
  // crash — but a JS-level crash inside some other uninstrumented code path
  // would look identical from the trail alone. These page-lifecycle events
  // fire on an OS-triggered background/reclaim *before* the process actually
  // dies, so if any of these show up in the next trail, that confirms it's
  // lifecycle-driven; if none do, it points at something that kills the
  // process with no warning at all (a hard native crash).
  useEffect(() => {
    const onVisibility = () => logDiag(`visibilitychange -> ${document.visibilityState}`);
    const onPageHide = (event: PageTransitionEvent) => logDiag(`pagehide (persisted=${event.persisted})`);
    const onFreeze = () => logDiag("freeze");
    const onResume = () => logDiag("resume");
    const onBlur = () => logDiag("window blur");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("freeze", onFreeze);
    document.addEventListener("resume", onResume);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("freeze", onFreeze);
      document.removeEventListener("resume", onResume);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return null;
}
