"use client";

import { useEffect } from "react";
import { isNativePlatform } from "@/lib/platform";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // Redundant (and untested) inside a Capacitor build, which already serves bundled local assets.
    if (isNativePlatform()) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installability is a nice-to-have; a failed registration shouldn't break the app.
    });
  }, []);

  return null;
}
