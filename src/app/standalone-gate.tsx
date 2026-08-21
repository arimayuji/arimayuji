"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isNativePlatform } from "@/lib/platform";

const noopSubscribe = () => () => {};

/**
 * The marketing landing page (`page.tsx`, a Server Component — hooks can't
 * run there directly, hence this small client wrapper around it) is a pitch
 * for people who haven't tried Xanthus yet. The native app has no use for
 * it — it opens straight into `/run` instead, every time.
 *
 * `useSyncExternalStore` reads the real value at first client render (rather
 * than a plain `useState` set inside an effect) — the earliest this can
 * possibly resolve in a static export with no server to decide it before the
 * HTML ships, so the pitch never actually paints, not even for one frame,
 * before redirecting away from it.
 */
export function StandaloneGate({ children }: { children: ReactNode }) {
  const native = useSyncExternalStore(noopSubscribe, isNativePlatform, () => false);
  const router = useRouter();

  useEffect(() => {
    if (native) router.replace("/run");
  }, [native, router]);

  if (native) return null;
  return <>{children}</>;
}
