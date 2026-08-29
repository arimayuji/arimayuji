"use client";

import { useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { Geolocation } from "@capacitor/geolocation";
import { getCurrentAccount, getProfile } from "@/lib/auth";
import { refreshMyPresence } from "@/lib/friendPresence";
import { isNativePlatform } from "@/lib/platform";

/** At most one ping per this many ms, even across several quick app-resume events (switching apps and back shouldn't spam a fresh GPS read every time). */
const PING_THROTTLE_MS = 10 * 60_000;

/**
 * "Correr por amigo por perto" — mounted once in layout.tsx, same pattern as
 * `OAuthCallbackListener`/`PushRegistration`. Deliberately a one-shot
 * position read on app foreground (cold launch + every `resume`/tab-visible
 * event), never a continuous watch: this is a "you just opened the app,
 * here's roughly where you are" check-in, not a live tracker — see
 * `src/lib/friendPresence.ts`'s own header comment for why that's a
 * separate table from `live_runs` entirely.
 *
 * Re-checks `Profile.nearbyOptIn` fresh on every ping rather than trusting
 * a cached value from `useAuth()` — this component's own effect only runs
 * once, but the opt-in can be flipped at any time from `/perfil` in a
 * completely different part of the tree.
 */
export function FriendPresencePing() {
  const lastPingAtRef = useRef(0);

  useEffect(() => {
    async function ping() {
      const now = Date.now();
      if (now - lastPingAtRef.current < PING_THROTTLE_MS) return;

      const account = await getCurrentAccount();
      if (!account) return;
      const profile = await getProfile(account.id);
      if (!profile?.nearbyOptIn) return;

      lastPingAtRef.current = now;
      try {
        const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: false });
        await refreshMyPresence(position.coords.latitude, position.coords.longitude);
      } catch {
        // Permission denied, GPS timeout, whatever — never worth surfacing
        // for a background check-in nobody is looking at.
      }
    }

    void ping();

    function onVisible() {
      if (document.visibilityState === "visible") void ping();
    }

    if (isNativePlatform()) {
      const subscription = App.addListener("resume", () => void ping());
      return () => {
        void subscription.then((handle) => handle.remove());
      };
    }

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return null;
}
