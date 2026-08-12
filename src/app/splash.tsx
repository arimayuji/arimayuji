"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const SESSION_KEY = "xanthus:splash-shown";
const MAX_MS = 4500;

/**
 * Shown once per browser session, before the app: the brand mark rearing up
 * and settling into a run. Skipped outright — not just muted, not shown as a
 * static frame — under reduced-motion, since forcing autoplaying media on
 * someone who opted out isn't "respecting" the preference.
 */
function shouldShow(): boolean {
  try {
    if (sessionStorage.getItem(SESSION_KEY) === "1") return false;
  } catch {
    return false; // storage disabled: skip rather than risk replaying every navigation
  }
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const noopSubscribe = () => () => {};

/**
 * Whether the splash should play at all, decided once from browser-only
 * state (sessionStorage + reduced-motion). `useSyncExternalStore` is what
 * lets the server snapshot stay "never show" while the client snapshot
 * reflects reality, without the hydration mismatch a plain
 * `useState(shouldShow)` would cause — same reasoning as `usePreferences`.
 */
function useShouldShowSplash(): boolean {
  return useSyncExternalStore(noopSubscribe, shouldShow, () => false);
}

export function Splash() {
  const shouldPlay = useShouldShowSplash();
  const [dismissed, setDismissed] = useState(false);
  const visible = shouldPlay && !dismissed;

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Storage disabled: the splash just replays next load — harmless.
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(dismiss, MAX_MS);
    return () => clearTimeout(timer);
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <div
      role="presentation"
      onClick={dismiss}
      className="fixed inset-0 z-50 bg-white"
    >
      {/* The source clip renders on a white ground (no alpha channel), so
          the overlay stays a fixed white rather than this app's theme
          background — on dark mode a themed backdrop would frame the video
          in a stark rectangle instead of the clip filling the screen. */}
      <video
        src="/xanthus-splash.mp4"
        autoPlay
        muted
        playsInline
        onEnded={dismiss}
        onError={dismiss}
        className="h-full w-full object-cover"
      />
      <p className="absolute inset-x-0 bottom-10 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-black/40">
        toque para continuar
      </p>
    </div>
  );
}
