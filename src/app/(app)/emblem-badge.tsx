"use client";

import { useId } from "react";
import type { Emblem } from "@/lib/tracking/emblems";

/**
 * The lifetime-distance collectible itself: a round enamel pin, not a cut
 * metal plate — see emblems.ts for why this stays visually its own thing
 * rather than a variant of `AchievementPlate`. Three states share this one
 * component so the collection grid and the reveal modal never risk drifting
 * apart: `locked` (not reached yet — a dim outline, no hue), `sealed`
 * (reached but not yet opened — the real hue glows through a frosted face,
 * but the actual pattern stays hidden) and the fully `opened` design.
 */

const TAU = Math.PI * 2;

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const a = (angleDeg / 360) * TAU;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

function RimNotches({ count, spin }: { count: number; spin: number }) {
  const ticks = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 360 + spin;
    const [x1, y1] = polar(60, 60, 50, angle);
    const [x2, y2] = polar(60, 60, 56, angle);
    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
  });
  return (
    <g stroke="#0b0f13" strokeWidth="1.6" strokeLinecap="round" opacity="0.55">
      {ticks}
    </g>
  );
}

function PatternRing({ emblem, ink }: { emblem: Emblem; ink: string }) {
  const count = 10;
  const shapes = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 360 + emblem.spin;

    if (emblem.pattern === "rays") {
      const [x1, y1] = polar(60, 60, 18, angle);
      const [x2, y2] = polar(60, 60, 34, angle);
      return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
    }
    if (emblem.pattern === "dots") {
      const [x, y] = polar(60, 60, 34, angle);
      return <circle key={i} cx={x} cy={y} r="2.1" fill={ink} stroke="none" />;
    }
    if (emblem.pattern === "chevrons") {
      const tip = polar(60, 60, 36, angle);
      const left = polar(60, 60, 28, angle - 8);
      const right = polar(60, 60, 28, angle + 8);
      return (
        <polyline key={i} points={`${left[0]},${left[1]} ${tip[0]},${tip[1]} ${right[0]},${right[1]}`} />
      );
    }
    // waves
    const inner = polar(60, 60, 26, angle);
    const outer = polar(60, 60, i % 2 === 0 ? 36 : 30, angle + 180 / count);
    return <line key={i} x1={inner[0]} y1={inner[1]} x2={outer[0]} y2={outer[1]} />;
  });

  return (
    <g
      stroke={ink}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      opacity="0.8"
    >
      {shapes}
    </g>
  );
}

function LockIcon() {
  return (
    <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <rect x="49" y="58" width="22" height="17" rx="3" />
      <path d="M53.5 58v-6.5a6.5 6.5 0 0 1 13 0V58" />
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
  const hueA = `hsl(${emblem.hue} 72% 56%)`;
  const hueB = `hsl(${emblem.hue2} 72% 42%)`;
  const ink = "#0b0f13";

  if (state === "locked") {
    return (
      <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true">
        <circle cx="60" cy="60" r="48" fill="none" stroke="currentColor" strokeWidth="2" className="text-border" />
        <circle cx="60" cy="60" r="48" strokeDasharray="1.5 6" stroke="currentColor" strokeWidth="2" className="text-muted/50" />
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
          <radialGradient id={`${uid}-sealed`} cx="0.38" cy="0.32" r="0.85">
            <stop offset="0%" stopColor={hueA} stopOpacity="0.9" />
            <stop offset="100%" stopColor={hueB} stopOpacity="0.55" />
          </radialGradient>
        </defs>
        <circle cx="60" cy="60" r="52" fill={`url(#${uid}-sealed)`} opacity="0.35" />
        <circle cx="60" cy="60" r="48" fill="none" stroke={hueA} strokeWidth="2" strokeDasharray="3 4" />
        <g className="text-white/80">
          <LockIcon />
        </g>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}-face`} cx="0.35" cy="0.3" r="0.9">
          <stop offset="0%" stopColor={hueA} />
          <stop offset="100%" stopColor={hueB} />
        </radialGradient>
      </defs>

      <circle cx="60" cy="60" r="56" fill={ink} />
      <RimNotches count={emblem.notches} spin={emblem.spin} />
      <circle cx="60" cy="60" r="48" fill={`url(#${uid}-face)`} stroke={ink} strokeWidth="1.6" />
      <PatternRing emblem={emblem} ink="#ffffff" />
      <circle cx="60" cy="60" r="17" fill={ink} opacity="0.85" />

      <g fontFamily="ui-monospace, monospace" textAnchor="middle" fill="#ffffff">
        <text x="60" y="63" fontSize="15" fontWeight="700">
          {emblem.km >= 1000 ? `${emblem.km / 1000}k` : emblem.km}
        </text>
        <text x="60" y="72.5" fontSize="6" letterSpacing="1.4" opacity="0.75">
          KM
        </text>
      </g>
    </svg>
  );
}
