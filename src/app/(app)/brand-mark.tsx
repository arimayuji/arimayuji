import { HORSE_BUST_PATHS } from "../horse-mark";

/**
 * Top-left brand mark — the notification bell's (notification-bell.tsx)
 * mirror on the other corner, same chrome (border, background, height) so
 * the two read as one header instead of two unrelated badges. Deliberately
 * NOT `position: fixed`: it used to float pinned to the viewport the whole
 * time a screen was scrolled, which read as "stuck on top of my content"
 * rather than a header — this scrolls away with the rest of the screen
 * like any other top-of-page element (app-shell.tsx renders it as the
 * first thing inside the normal-flow column, ahead of `{children}`).
 * Plain `currentColor` stroke, not the full chrome-gradient treatment the
 * home-screen icon uses (public/pwa-icon.svg) — that gradient needs a
 * large, high-contrast surface to read as metal; at this badge size a flat
 * accent-coloured mark, same weight (`strokeWidth="6"`) already proven at
 * small scale by stat-icon-badge.tsx, stays legible instead of turning to
 * noise.
 *
 * Not a link: there's no in-shell "home" to send it to (the marketing
 * landing page at `/` deliberately sits outside this shell, see
 * app-shell.tsx) — purely a visual anchor.
 */
export function BrandMark() {
  return (
    <div
      aria-hidden="true"
      className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/92 text-accent shadow-sm backdrop-blur-md"
    >
      <svg viewBox="0 0 100 100" className="h-5 w-5">
        <g fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          {HORSE_BUST_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </svg>
    </div>
  );
}
