"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { usePrefersReducedMotion } from "@/lib/reducedMotion";

/**
 * The three headline numbers on the hero's illustrative run-screen preview,
 * counting up from zero instead of appearing pre-filled — matches the pace
 * chart building in below it, on the same "numbers arrive, they aren't just
 * there" idea. Carved out of the otherwise server-rendered landing page as
 * its own small client island, since a `setInterval`/`requestAnimationFrame`
 * loop needs a client component and the rest of the page doesn't.
 *
 * Counting starts when the number's own element scrolls into view, not on
 * mount — the preview card can start below the fold on a phone, and a
 * mount-triggered count-up is already finished by the time someone actually
 * scrolls down to see it, which just reads as "no animation at all". Same
 * IntersectionObserver shape as reveal.tsx (0.12 threshold, fires once).
 */

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** True once the ref'd element has been scrolled into view (or immediately, if IntersectionObserver isn't available). */
function useInView(): [boolean, RefObject<HTMLSpanElement | null>] {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [visible, ref];
}

/** Counts from 0 to `target` over `durationMs` once visible, starting after `startDelayMs`. Jumps straight to `target` under reduced motion. */
function useCountUp(
  target: number,
  durationMs: number,
  startDelayMs: number,
): [number, RefObject<HTMLSpanElement | null>] {
  const reducedMotion = usePrefersReducedMotion();
  const [visible, ref] = useInView();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!visible || reducedMotion) return;
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
  }, [visible, reducedMotion, target, durationMs, startDelayMs]);

  const display = reducedMotion ? (visible ? target : 0) : value;
  return [display, ref];
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
  startDelayMs = 300,
}: {
  km: number;
  durationMs?: number;
  startDelayMs?: number;
}) {
  const [value, ref] = useCountUp(km, durationMs, startDelayMs);
  return <span ref={ref}>{formatKm(value)}</span>;
}

export function DurationCountUp({
  totalSeconds,
  durationMs = 1400,
  startDelayMs = 300,
}: {
  totalSeconds: number;
  durationMs?: number;
  startDelayMs?: number;
}) {
  const [value, ref] = useCountUp(totalSeconds, durationMs, startDelayMs);
  return <span ref={ref}>{formatMinSec(value)}</span>;
}
