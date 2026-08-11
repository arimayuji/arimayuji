"use client";

import { useEffect } from "react";

/**
 * Scroll-triggered reveal for the landing page.
 *
 * Everything animated on scroll is marked with `data-reveal` in the markup and
 * starts hidden *only* inside a `prefers-reduced-motion: no-preference` block
 * in globals.css. This component flips the attribute to "in" once the element
 * has been seen, which is what the animation rules key off of. If this script
 * never runs (JS disabled), the <noscript> override on the page keeps
 * everything visible, and with reduced motion the hidden state never applies
 * in the first place — so no path leaves content stuck invisible.
 */
export function Reveal() {
  useEffect(() => {
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    if (targets.length === 0) return;

    const show = (el: HTMLElement) => {
      el.dataset.reveal = "in";
    };

    if (typeof IntersectionObserver === "undefined") {
      targets.forEach(show);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target as HTMLElement);
          observer.unobserve(entry.target);
        }
      },
      // Fire a little before the element is fully on screen so the motion
      // reads as "arriving with the scroll", not "popping in late".
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}
