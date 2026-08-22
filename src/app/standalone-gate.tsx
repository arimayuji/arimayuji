"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isNativePlatform } from "@/lib/platform";
import { usePreferences } from "@/lib/usePreferences";

const noopSubscribe = () => () => {};

/**
 * The marketing landing page (`page.tsx`, a Server Component — hooks can't
 * run there directly, hence this small client wrapper around it) is a pitch
 * for people who haven't tried Xanthus yet. The native app has no use for
 * it — it opens straight into the app instead, every time: `/run` for
 * almost everyone, or `/treinador` for the (rare) account currently in
 * "treinador" mode (see `AppMode` in preferences.ts) — same "which home"
 * decision `app-shell.tsx`'s bottom nav makes for tab 0.
 *
 * `useSyncExternalStore` reads the real value at first client render (rather
 * than a plain `useState` set inside an effect) — the earliest this can
 * possibly resolve in a static export with no server to decide it before the
 * HTML ships, so the pitch never actually paints, not even for one frame,
 * before redirecting away from it.
 */
export function StandaloneGate({ children }: { children: ReactNode }) {
  const native = useSyncExternalStore(noopSubscribe, isNativePlatform, () => false);
  const [{ appMode }] = usePreferences();
  const router = useRouter();

  useEffect(() => {
    if (native) router.replace(appMode === "treinador" ? "/treinador" : "/run");
  }, [native, appMode, router]);

  if (native) return null;
  return <>{children}</>;
}
