"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * The three headline numbers on the hero's illustrative run-screen preview,
 * counting up from zero instead of appearing pre-filled — matches the pace
 * chart building in below it, on the same "numbers arrive, they aren't just
 * there" idea. Carved out of the otherwise server-rendered landing page as
 * its own small client island, since a `setInterval`/`requestAnimationFrame`
 * loop needs a client component and the rest of the page doesn't.
 */

const noopSubscribe = () => () => {};

function getPrefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Same shape as `plano/page.tsx`'s copy — a browser-only read decided once, without a hydration mismatch. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(noopSubscribe, getPrefersReducedMotion, () => false);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Counts from 0 to `target` over `durationMs`, starting after `startDelayMs`. Skips straight to `target` under reduced motion. */
function useCountUp(target: number, durationMs: number, startDelayMs: number): number {
  const reducedMotion = usePrefersReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    // Reduced motion skips the RAF loop entirely; the render below falls
    // back to `target` directly instead of syncing it into state here.
    if (reducedMotion) return;
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / durationMs);
      setValue(target * easeOutCubic(t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    const timer = setTimeout(() => {
      frame = requestAnimationFrame(tick);
    }, startDelayMs);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [target, durationMs, startDelayMs, reducedMotion]);

  return reducedMotion ? target : value;
}

function formatKm(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function formatMinSec(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function DistanceCountUp({
  km,
  durationMs = 1400,
  startDelayMs = 500,
}: {
  km: number;
  durationMs?: number;
  startDelayMs?: number;
}) {
  return <>{formatKm(useCountUp(km, durationMs, startDelayMs))}</>;
}

export function DurationCountUp({
  totalSeconds,
  durationMs = 1400,
  startDelayMs = 500,
}: {
  totalSeconds: number;
  durationMs?: number;
  startDelayMs?: number;
}) {
  return <>{formatMinSec(useCountUp(totalSeconds, durationMs, startDelayMs))}</>;
}
