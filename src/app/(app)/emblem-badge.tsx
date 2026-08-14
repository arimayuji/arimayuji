"use client";

import { useId, useMemo } from "react";
import { computeEmblemArt } from "@/lib/emblemArt";
import type { Emblem } from "@/lib/tracking/emblems";

/**
 * The lifetime-distance collectible itself — generative flow-field art (see
 * emblemArt.ts) inside a round frame, not a hand-drawn plate. Three states
 * share this one component so the collection grid and the reveal modal never
 * risk drifting apart: `locked` (not reached yet — a dim outline, nothing
 * computed), `sealed` (reached but not yet opened — the piece's own palette
 * glows through a grained mystery field, but the actual composition stays
 * hidden) and the fully `opened` artwork.
 */

const TAU = Math.PI * 2;

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const a = (angleDeg / 360) * TAU;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

function LockIcon() {
  return (
    <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <rect x="49" y="58" width="22" height="17" rx="3" />
      <path d="M53.5 58v-6.5a6.5 6.5 0 0 1 13 0V58" />
    </g>
  );
}

/** Grain filter shared by the sealed and opened states — the noise field is what keeps a flat gradient from reading as a plain colour swatch. */
function GrainFilter({ id, seed, frequency }: { id: string; seed: number; frequency: number }) {
  return (
    <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence
        type="fractalNoise"
        baseFrequency={frequency}
        numOctaves={2}
        seed={seed}
        stitchTiles="stitch"
        result="noise"
      />
      <feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0" />
    </filter>
  );
}

/** Top three rungs of the ladder only: a thin rainbow dial ringing the frame, the "legendary" tell at a glance. */
function PrismaticRing() {
  const count = 60;
  const ticks = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 360;
    const hue = (i / count) * 360;
    const [x1, y1] = polar(60, 60, 57, angle);
    const [x2, y2] = polar(60, 60, 60, angle);
    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={`hsl(${hue} 85% 62%)`} />;
  });
  return (
    <g strokeWidth="1.4" strokeLinecap="round" opacity="0.85">
      {ticks}
    </g>
  );
}

export function EmblemBadge({
  emblem,
  state,
  className = "block h-auto w-full",
}: {
  emblem: Emblem;
  state: "locked" | "sealed" | "opened";
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const art = useMemo(() => computeEmblemArt(emblem.seed, emblem.tier), [emblem.seed, emblem.tier]);

  if (state === "locked") {
    return (
      <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true">
        <circle cx="60" cy="60" r="48" fill="none" stroke="currentColor" strokeWidth="2" className="text-border" />
        <circle
          cx="60"
          cy="60"
          r="48"
          strokeDasharray="1.5 6"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted/50"
        />
        <text
          x="60"
          y="70"
          textAnchor="middle"
          fontFamily="ui-monospace, monospace"
          fontSize="30"
          fontWeight="700"
          fill="currentColor"
          className="text-muted/40"
        >
          ?
        </text>
      </svg>
    );
  }

  if (state === "sealed") {
    return (
      <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true">
        <defs>
          <radialGradient id={`${uid}-bg`} cx="0.4" cy="0.35" r="0.85">
            <stop offset="0%" stopColor={art.bgInner} />
            <stop offset="100%" stopColor={art.bgOuter} />
          </radialGradient>
          <GrainFilter id={`${uid}-grain`} seed={art.grainSeed} frequency={art.grainFrequency} />
          <clipPath id={`${uid}-clip`}>
            <circle cx="60" cy="60" r="48" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${uid}-clip)`}>
          <circle cx="60" cy="60" r="52" fill={`url(#${uid}-bg)`} />
          <rect x="0" y="0" width="120" height="120" filter={`url(#${uid}-grain)`} style={{ mixBlendMode: "overlay" }} />
        </g>
        <circle cx="60" cy="60" r="48" fill="none" stroke={art.accent} strokeWidth="2" strokeDasharray="3 4" />
        <g className="text-white/85">
          <LockIcon />
        </g>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}-bg`} cx="0.4" cy="0.35" r="0.9">
          <stop offset="0%" stopColor={art.bgInner} />
          <stop offset="100%" stopColor={art.bgOuter} />
        </radialGradient>
        <GrainFilter id={`${uid}-grain`} seed={art.grainSeed} frequency={art.grainFrequency} />
        <clipPath id={`${uid}-clip`}>
          <circle cx="60" cy="60" r="56" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${uid}-clip)`}>
        <circle cx="60" cy="60" r="60" fill={`url(#${uid}-bg)`} />
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {art.ribbons.map((ribbon, i) => (
            <path key={i} d={ribbon.d} stroke={ribbon.color} strokeWidth={ribbon.width} opacity={ribbon.opacity} />
          ))}
        </g>
        <rect
          x="0"
          y="0"
          width="120"
          height="120"
          filter={`url(#${uid}-grain)`}
          style={{ mixBlendMode: "overlay" }}
          opacity="0.8"
        />
      </g>

      {art.prismatic && <PrismaticRing />}
      <circle cx="60" cy="60" r="56" fill="none" stroke="#0b0f13" strokeWidth="2" opacity="0.55" />
    </svg>
  );
}
