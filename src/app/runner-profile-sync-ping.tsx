"use client";

import { useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { getCurrentAccount, getProfile } from "@/lib/auth";
import { syncRunnerProfile } from "@/lib/runnerProfileSync";
import { isNativePlatform } from "@/lib/platform";

/** Same throttle reasoning as `FriendPresencePing` — a quick app-switch and back shouldn't fire a fresh sync round-trip every time. */
const SYNC_THROTTLE_MS = 5 * 60_000;

/**
 * Mounted once in layout.tsx, same pattern as `FriendPresencePing`/
 * `PushRegistration`: a one-shot `syncRunnerProfile()` call on cold launch
 * and every app foreground (`resume` native, `visibilitychange` web) — this
 * is what lets a device pick up an edit made on another device without the
 * athlete having to open `/plano` first (that screen's own edit path calls
 * `syncRunnerProfile()` too, but only covers *this* device's own edits).
 *
 * Re-checks `Profile.runSyncOptIn` fresh on every tick rather than trusting
 * a cached value — same reasoning `FriendPresencePing` documents for
 * `nearbyOptIn`: this component's effect only runs once, but the toggle can
 * flip at any time from `/perfil/sincronizacao`.
 */
export function RunnerProfileSyncPing() {
  const lastSyncAtRef = useRef(0);

  useEffect(() => {
    async function tick() {
      const now = Date.now();
      if (now - lastSyncAtRef.current < SYNC_THROTTLE_MS) return;

      const account = await getCurrentAccount();
      if (!account) return;
      const profile = await getProfile(account.id);
      if (!profile?.runSyncOptIn) return;

      lastSyncAtRef.current = now;
      await syncRunnerProfile();
    }

    void tick();

    function onVisible() {
      if (document.visibilityState === "visible") void tick();
    }

    if (isNativePlatform()) {
      const subscription = App.addListener("resume", () => void tick());
      return () => {
        void subscription.then((handle) => handle.remove());
      };
    }

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return null;
}
