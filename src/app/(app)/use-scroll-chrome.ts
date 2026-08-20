"use client";

import { useEffect, useRef, useState } from "react";

/** Below this, the bars are always shown regardless of direction — a screen that opens already scrolled down (e.g. returning to a long list) shouldn't open with the header/nav hidden, and a user who's basically back at the top shouldn't have to scroll further up just to get them back. */
const ALWAYS_VISIBLE_BELOW_PX = 30;
/** Ignores sub-pixel/rubber-band scroll noise so a stationary finger doesn't flicker the bars. */
const DIRECTION_THRESHOLD_PX = 6;

/**
 * Header/bottom-nav show-on-scroll-up, hide-on-scroll-down ("YouTube
 * effect") for the single scroll container AppShell renders content into.
 * Deliberately reads `scrollTop` from the container element via a native
 * `scroll` listener rather than window scroll — the bars sit `position:
 * absolute` over that one container (see app-shell.tsx), never inside its
 * own scrolling flow, so hiding one never changes the container's scroll
 * height and can't feed back into another scroll event (the jitter this
 * would otherwise cause).
 *
 * Takes the DOM node itself, not a `RefObject` — AppShell's scroll container
 * unmounts and remounts as a fresh element every time immersive mode (see
 * `useImmersiveMode`) toggles off and on, e.g. leaving `/run` mid-recording
 * and coming back. A `RefObject` dependency doesn't re-run this effect when
 * only `.current` changes underneath it, so the very first version of this
 * hook kept its scroll listener attached to whatever node existed at mount
 * time — orphaned the moment that node was replaced, silently freezing the
 * bars in whatever visibility they last had. Passing the node itself (via
 * `useState` from a callback ref in AppShell) makes a node swap a real
 * prop change, so this effect re-attaches to the new element every time.
 */
export function useScrollChromeVisibility(el: HTMLElement | null): boolean {
  const [visible, setVisible] = useState(true);
  const lastScrollTop = useRef(0);

  useEffect(() => {
    if (!el) return;
    // Deferred a tick rather than called straight in the effect body — same
    // reasoning `useRunTracker.ts` documents for its own idle-refresh
    // effects: a synchronous `setState` here trips the cascading-render
    // lint rule. A fresh node (see the hook's own comment above) should
    // always start with the bars shown, same as a fresh route.
    void Promise.resolve().then(() => setVisible(true));
    lastScrollTop.current = el.scrollTop;

    const handleScroll = () => {
      const top = el.scrollTop;
      if (top < ALWAYS_VISIBLE_BELOW_PX) {
        setVisible(true);
        lastScrollTop.current = top;
        return;
      }
      const delta = top - lastScrollTop.current;
      if (Math.abs(delta) < DIRECTION_THRESHOLD_PX) return;
      setVisible(delta < 0);
      lastScrollTop.current = top;
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [el]);

  return visible;
}
