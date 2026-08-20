"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/** Below this, the bars are always shown regardless of direction — a screen that opens already scrolled down (e.g. returning to a long list) shouldn't open with the header/nav hidden, and a user who's basically back at the top shouldn't have to scroll further up just to get them back. */
const ALWAYS_VISIBLE_BELOW_PX = 30;
/** Ignores sub-pixel/rubber-band scroll noise so a stationary finger doesn't flicker the bars. */
const DIRECTION_THRESHOLD_PX = 6;

/**
 * Header/bottom-nav show-on-scroll-up, hide-on-scroll-down ("YouTube
 * effect") for the single scroll container AppShell renders content into.
 * Deliberately reads `scrollTop` from `scrollRef`'s element via a native
 * `scroll` listener rather than window scroll — the bars sit `position:
 * absolute` over that one container (see app-shell.tsx), never inside its
 * own scrolling flow, so hiding one never changes the container's scroll
 * height and can't feed back into another scroll event (the jitter this
 * would otherwise cause).
 */
export function useScrollChromeVisibility(scrollRef: RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(true);
  const lastScrollTop = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
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
  }, [scrollRef]);

  return visible;
}
