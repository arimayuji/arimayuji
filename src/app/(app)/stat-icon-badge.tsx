"use client";

import { HORSE_BUST_PATHS } from "../horse-mark";

/**
 * Small illustrated badges for the live-run stat cards (Distância, Tempo,
 * Chegada prevista) — chrome-and-glow generated art, same technique as the
 * distância emblem medallions (see emblem-badge.tsx): a real, once-generated
 * image per stat hosted statically on R2, with the *real* vector brand mark
 * (`HORSE_BUST_PATHS` — the compact bust variant, designed for exactly this
 * small-badge scale, unlike the full-body running pose the emblems use)
 * glowing on top. An image model asked for "the Xanthus horse" only ever
 * draws *a* horse, never *this* one, so the generated art stays abstract
 * (a motion trail, a stopwatch ring, a finish-line arc) and the recognisable
 * brand mark is drawn for real.
 */
const STAT_ICON_BASE_URL =
  process.env.NEXT_PUBLIC_TILES_BASE_URL ?? "https://pub-72a6391a200c440a9466c2e0d774e84f.r2.dev";

export type StatIconKey = "distancia" | "tempo" | "eta";

function statIconUrl(key: StatIconKey): string {
  return `${STAT_ICON_BASE_URL}/stat-icons/${key}.webp`;
}

export function StatIconBadge({
  icon,
  className = "block h-8 w-8",
}: {
  icon: StatIconKey;
  className?: string;
}) {
  return (
    <div className={`${className} relative shrink-0 overflow-hidden rounded-full`}>
      {/*
        Same "old CD" fix the distância emblem art needed: the plate only
        fills ~67-79% of its square frame (measured per image), leaving a
        dark backdrop margin that reads as a ring once cropped to a circle.
        scale-[1.45] zooms in past that margin so the plate's own edge
        reaches the container's edge.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer; a fixed R2 asset doesn't need next/image anyway. */}
      <img src={statIconUrl(icon)} alt="" className="h-full w-full scale-[1.45] object-cover" />
      <svg
        viewBox="0 0 100 100"
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <g fill="none" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <g stroke="#ffffff" opacity="0.5" style={{ filter: "blur(1.6px)" }}>
            {HORSE_BUST_PATHS.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
          <g stroke="#ffffff" opacity="0.92">
            {HORSE_BUST_PATHS.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}
