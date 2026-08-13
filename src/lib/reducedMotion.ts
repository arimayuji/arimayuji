"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

function getPrefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Same `useSyncExternalStore` shape as `useShareSupport` — a browser-only read decided once, with no hydration mismatch. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(noopSubscribe, getPrefersReducedMotion, () => false);
}
