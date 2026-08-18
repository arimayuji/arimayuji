"use client";

import { useId } from "react";
import { HORSE_BUST_PATHS } from "../horse-mark";

/**
 * Top-left brand mark — the notification bell's (notification-bell.tsx)
 * mirror on the other corner, same chrome (border, height) so the two read
 * as one header instead of two unrelated badges. Deliberately NOT
 * `position: fixed`: it used to float pinned to the viewport the whole time
 * a screen was scrolled, which read as "stuck on top of my content" rather
 * than a header — this scrolls away with the rest of the screen like any
 * other top-of-page element (app-shell.tsx renders it as the first thing
 * inside the normal-flow column, ahead of `{children}`).
 *
 * Same moon-and-horse mark as the home-screen icon (public/pwa-icon.svg),
 * scaled down rather than the flat single-colour stroke this badge used
 * before — an athlete who has actually seen the app icon on their home
 * screen should recognise this as the same mark, not a simplified
 * placeholder. The gradient/clip ids are unique per instance (`useId`) so
 * this stays safe to mount more than once on a page despite inlining its
 * own `<defs>`.
 *
 * Not a link: there's no in-shell "home" to send it to (the marketing
 * landing page at `/` deliberately sits outside this shell, see
 * app-shell.tsx) — purely a visual anchor.
 */
export function BrandMark() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  return (
    <div
      aria-hidden="true"
      className="h-10 w-10 overflow-hidden rounded-full border border-border shadow-sm"
    >
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <defs>
          <radialGradient id={`${uid}-moon`} cx="0.38" cy="0.32" r="0.85">
            <stop offset="0%" stopColor="#aecaff" />
            <stop offset="45%" stopColor="#6b93f5" />
            <stop offset="78%" stopColor="#3861d1" />
            <stop offset="100%" stopColor="#152d6e" />
          </radialGradient>
          <clipPath id={`${uid}-leg`}>
            <path d={HORSE_BUST_PATHS[0]} />
          </clipPath>
          <radialGradient id={`${uid}-shine`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="35%" stopColor="#e4ebf5" />
            <stop offset="70%" stopColor="#9fb0c8" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#9fb0c8" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="50" fill={`url(#${uid}-moon)`} />
        <g transform="translate(50 47) scale(0.62) translate(-50 -50)">
          <path fill="#0b0e11" stroke="none" d={HORSE_BUST_PATHS[0]} />
          <g clipPath={`url(#${uid}-leg)`}>
            <ellipse cx="83" cy="87" rx="19" ry="24" fill={`url(#${uid}-shine)`} />
          </g>
        </g>
      </svg>
    </div>
  );
}
