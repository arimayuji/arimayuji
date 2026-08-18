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
 * A wordmark rides alongside the icon now — an icon-only badge this small
 * read as "some app" rather than specifically Xanthus (the one other place
 * with an unmissable "Xanthus" — /run's own header during a live recording,
 * run/page.tsx — is exactly the comparison that made the icon-only version
 * here feel anonymous). Same bold/caps/tracking treatment as that header's
 * text, just smaller.
 *
 * Not a link: there's no in-shell "home" to send it to (the marketing
 * landing page at `/` deliberately sits outside this shell, see
 * app-shell.tsx) — purely a visual anchor.
 */
export function BrandMark() {
  return (
    <div
      aria-hidden="true"
      className="fixed left-4 z-40 flex h-10 items-center gap-1.5 rounded-full border border-border bg-background/92 py-0 pr-3.5 pl-2.5 shadow-sm backdrop-blur-md"
      style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
    >
      <svg viewBox="0 0 100 100" className="h-5 w-5 shrink-0 text-accent">
        <g fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          {HORSE_BUST_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </svg>
      <span className="text-xs font-bold tracking-wide text-foreground uppercase">Xanthus</span>
    </div>
  );
}
