import { HORSE_BUST_PATHS } from "../horse-mark";

/**
 * Fixed top-left brand mark — the notification bell's (notification-bell.tsx)
 * mirror on the other corner, same chrome (border, background, height,
 * safe-area-aware position) so the two read as one header instead of two
 * unrelated floating buttons. Plain `currentColor` stroke, not the full
 * chrome-gradient treatment the home-screen icon uses (public/pwa-icon.svg)
 * — that gradient needs a large, high-contrast surface to read as metal;
 * at this badge size a flat accent-coloured mark, same weight
 * (`strokeWidth="6"`) already proven at small scale by stat-icon-badge.tsx,
 * stays legible instead of turning to noise.
 *
 * Not a link: there's no in-shell "home" to send it to (the marketing
 * landing page at `/` deliberately sits outside this shell, see
 * app-shell.tsx) — purely a visual anchor.
 */
export function BrandMark() {
  return (
    <div
      aria-hidden="true"
      className="fixed left-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/92 text-accent shadow-sm backdrop-blur-md"
      style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
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
