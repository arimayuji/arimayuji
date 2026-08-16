"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isStandaloneDisplay } from "@/lib/platform";

const noopSubscribe = () => () => {};

/**
 * The marketing landing page (`page.tsx`, a Server Component — hooks can't
 * run there directly, hence this small client wrapper around it) is a pitch
 * for people who haven't tried Xanthus yet. Someone who already installed it
 * and taps the home-screen icon isn't that person — they want the app, not
 * the pitch for it, every single time they open it. `manifest.ts`'s
 * `start_url` still has to point at `/` (there's no way to make an installed
 * PWA's start URL conditional), so this is the client-side equivalent:
 * detect standalone display mode and hand off to `/run` immediately, and
 * render nothing in the meantime rather than the landing page underneath.
 *
 * `useSyncExternalStore` reads the real value at first client render (rather
 * than a plain `useState` set inside an effect) — the earliest this can
 * possibly resolve in a static export with no server to decide it before the
 * HTML ships, so the pitch never actually paints, not even for one frame,
 * before redirecting away from it.
 */
export function StandaloneGate({ children }: { children: ReactNode }) {
  const standalone = useSyncExternalStore(noopSubscribe, isStandaloneDisplay, () => false);
  const router = useRouter();

  useEffect(() => {
    if (standalone) router.replace("/run");
  }, [standalone, router]);

  if (standalone) return null;
  return <>{children}</>;
}
