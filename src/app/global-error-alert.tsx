"use client";

import { useEffect } from "react";

/**
 * Temporary diagnostic: shows any uncaught error or unhandled promise
 * rejection as a plain alert(), app-wide. Installed while debugging the
 * "Iniciar corrida faz nada" report on the native Android build, where
 * there's no remote devtools access — alert() blocks and is impossible to
 * miss, unlike console.error which needs USB debugging to see. Remove once
 * that's root-caused; this is not meant to ship long-term.
 */
export function GlobalErrorAlert() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      alert(`Erro: ${event.message}\n${event.error?.stack ?? ""}`);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? `${reason.message}\n${reason.stack ?? ""}` : String(reason);
      alert(`Promise rejeitada: ${message}`);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
