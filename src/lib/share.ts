"use client";

import { useSyncExternalStore } from "react";

export type ShareSupport = "share" | "clipboard";

const noopSubscribe = () => () => {};

/** Static per-browser capability, not state that changes — same `useSyncExternalStore` shape as `usePrefersReducedMotion` elsewhere, so the client-only read never causes a hydration mismatch. */
export function useShareSupport(): ShareSupport {
  return useSyncExternalStore(
    noopSubscribe,
    () => (typeof navigator.share === "function" ? "share" : "clipboard"),
    () => "clipboard",
  );
}
