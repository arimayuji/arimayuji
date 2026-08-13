"use client";

import { useId } from "react";
import type { Achievement, RarityTier } from "@/lib/tracking/achievements";
import { HORSE_BUST_PATHS } from "../horse-mark";

/**
 * The item that comes out of the box: a gem-cut chrome plate, not a
 * ribbon-and-circle medal — same reason the PR card never used one (see
 * pr-badge.tsx). It carries the horse bust, the distance and a stamped serial.
 *
 * Two things make it read as metal rather than coloured plastic. The face uses
 * the shoe showcase's 19-stop hard-edged chrome ramp verbatim, only re-hued
 * (see `tintedStops`); and each facet of the cut rim is filled by *sampling*
 * that same ramp at the position its outward normal faces the light, with no
 * interpolation, so neighbouring facets jump between blown-out white and ink
 * the way real bevels do.
 */

const CHROME_STOPS: ReadonlyArray<readonly [number, string]> = [
  [0, "#ffffff"],
  [4, "#d3dee7"],
  [12, "#8d9cab"],
  [20, "#63707e"],
  [26, "#aab8c5"],
  [28, "#ffffff"],
  [32, "#ffffff"],
  [34, "#9fadbb"],
  [39, "#39434e"],
  [41, "#101519"],
  [48, "#0e1317"],
  [52, "#48535e"],
  [58, "#8d9baa"],
  [66, "#c3cfda"],
  [72, "#eef4f9"],
  [76, "#ffffff"],
  [82, "#cfdae3"],
  [92, "#93a1af"],
  [100, "#b9c5d1"],
];

interface TierPaint {
  /** Hue at the top of the ramp and at the bottom. Equal for the plain metals; */
  hue: number;
  /** apart for diamante and platina, which is what makes those two iridesce rather than just tint. */
  hue2: number;
  sat: number;
  tint: number;
  /** Drives the rarity glow, the light inside the box and the card tint. */
  glow: string;
  /** The same rarity as text on the light theme — `glow` is tuned to sit on black and washes out on white. */
  glowOnLight: string;
  /** Engraving colour — dark enough to stay legible across the whole ramp. */
  ink: string;
}

export const TIER_PAINT: Record<RarityTier, TierPaint> = {
  bronze: { hue: 21, hue2: 21, sat: 0.54, tint: 0.72, glow: "#c9772f", glowOnLight: "#8a4a15", ink: "#2a170a" },
  prata: { hue: 212, hue2: 212, sat: 0.09, tint: 0.32, glow: "#c6d3e2", glowOnLight: "#46505c", ink: "#12171d" },
  ouro: { hue: 43, hue2: 43, sat: 0.74, tint: 0.78, glow: "#f0b429", glowOnLight: "#8a6207", ink: "#2a1f04" },
  diamante: { hue: 186, hue2: 205, sat: 0.55, tint: 0.5, glow: "#68e2ff", glowOnLight: "#0e6a83", ink: "#052029" },
  platina: { hue: 286, hue2: 168, sat: 0.42, tint: 0.44, glow: "#d6b8ff", glowOnLight: "#6742a8", ink: "#150a26" },
};

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((((h % 360) + 360) % 360) / 60);
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] :
    hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const at = (i: 0 | 1 | 2) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${at(0)} ${at(1)} ${at(2)})`;
}

/** Each grey stop keeps its lightness and gains the tier's hue — the ramp's shape, which is what sells chrome, survives intact. */
function tintedStops(paint: TierPaint, hueShift: number, tintScale: number) {
  return CHROME_STOPS.map(([offset, hex]) => {
    const grey = hexToRgb(hex);
    const lightness = (grey[0] + grey[1] + grey[2]) / 3 / 255;
    const hue = paint.hue + (paint.hue2 - paint.hue) * (offset / 100) + hueShift;
    return [offset, mix(grey, hslToRgb(hue, paint.sat, lightness), paint.tint * tintScale)] as const;
  });
}

/** Nearest stop at or below `position`, never blended — a facet is one flat plane catching one value. */
function sampleRamp(stops: ReadonlyArray<readonly [number, string]>, position: number): string {
  let out = stops[0][1];
  for (const [offset, color] of stops) {
    if (offset <= position) out = color;
  }
  return out;
}

const CENTER = 60;

/**
 * Widest the engraved label may be, in viewBox units. Sized for the *hexagon*
 * — the fewest facets the cut ever has, so the narrowest face at the label's
 * height — which is what keeps "1/2 milha" from running off the plate the way
 * a fixed size does.
 */
const LABEL_MAX_WIDTH = 58;
const MONO_ADVANCE = 0.6;

const labelFontSize = (label: string) =>
  Math.min(14, LABEL_MAX_WIDTH / (MONO_ADVANCE * Math.max(label.length, 1)));

function polygon(sides: number, radius: number, rotationDeg: number): Array<[number, number]> {
  return Array.from({ length: sides }, (_, i) => {
    const angle = ((i / sides) * 360 + rotationDeg - 90) * (Math.PI / 180);
    return [CENTER + radius * Math.cos(angle), CENTER + radius * Math.sin(angle)] as [number, number];
  });
}

const toPath = (points: Array<[number, number]>) =>
  points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") + " Z";

/** Stamped twice, light offset under dark, so the mark survives both the blown-out and the ink bands of the ramp. */
function Engraved({
  children,
  ink,
  offset = 2.4,
}: {
  children: React.ReactNode;
  ink: string;
  offset?: number;
}) {
  return (
    <>
      <g transform={`translate(${offset} ${offset})`} stroke="#ffffff" opacity="0.55">
        {children}
      </g>
      <g stroke={ink} opacity="0.92">
        {children}
      </g>
    </>
  );
}

export function AchievementPlate({
  achievement,
  label,
  compact = false,
  className = "block h-auto w-full",
}: {
  achievement: Achievement;
  label: string;
  compact?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const paint = TIER_PAINT[achievement.tier];
  const stops = tintedStops(paint, achievement.hueShift, achievement.tintScale);

  const outer = polygon(achievement.facets, 56, achievement.faceSpin);
  const inner = polygon(achievement.facets, 41, achievement.faceSpin);

  const facets = outer.map((point, i) => {
    const next = outer[(i + 1) % outer.length];
    const midAngle = ((i + 0.5) / outer.length) * 360 + achievement.faceSpin - 90;
    const delta = ((midAngle - achievement.lightAngle + 540) % 360) - 180;
    const facing = (1 - Math.cos((delta * Math.PI) / 180)) / 2;
    return {
      d: toPath([point, next, inner[(i + 1) % inner.length], inner[i]]),
      fill: sampleRamp(stops, facing * 100),
    };
  });

  const horse = HORSE_BUST_PATHS.map((d) => <path key={d} d={d} />);

  return (
    <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-face`} x1="0" y1="8" x2="0" y2="112" gradientUnits="userSpaceOnUse">
          {stops.map(([offset, color]) => (
            <stop key={offset} offset={`${offset}%`} stopColor={color} />
          ))}
        </linearGradient>
        <clipPath id={`${uid}-face-clip`}>
          <path d={toPath(inner)} />
        </clipPath>
      </defs>

      <g strokeLinecap="round" strokeLinejoin="round">
        {facets.map((facet) => (
          <path key={facet.d} d={facet.d} fill={facet.fill} stroke="#0b0f13" strokeWidth="0.7" />
        ))}
        <path d={toPath(outer)} stroke="#0b0f13" strokeWidth="2" />
        <path d={toPath(inner)} fill={`url(#${uid}-face)`} stroke="#0b0f13" strokeWidth="1.6" />

        <g clipPath={`url(#${uid}-face-clip)`}>
          <path d="M -10 30 L 130 6 L 130 22 L -10 46 Z" fill="#ffffff" opacity="0.4" />
          <path d="M -10 78 L 130 56 L 130 63 L -10 85 Z" fill="#ffffff" opacity="0.24" />
        </g>

        <g
          transform={`translate(39.8 ${compact ? 30 : 25.5}) scale(${compact ? 0.44 : 0.37})`}
          strokeWidth="5"
        >
          <Engraved ink={paint.ink}>{horse}</Engraved>
        </g>

        {!compact && (
          <g fontFamily="ui-monospace, monospace" textAnchor="middle" stroke="none">
            <text x="60.7" y="78.7" fontSize={labelFontSize(label)} fontWeight="700" fill="#ffffff" opacity="0.5">
              {label}
            </text>
            <text x="60" y="78" fontSize={labelFontSize(label)} fontWeight="700" fill={paint.ink} opacity="0.92">
              {label}
            </text>
            <text x="60.4" y="88.4" fontSize="5.4" letterSpacing="0.7" fill="#ffffff" opacity="0.45">
              {achievement.serial}
            </text>
            <text x="60" y="88" fontSize="5.4" letterSpacing="0.7" fill={paint.ink} opacity="0.7">
              {achievement.serial}
            </text>
          </g>
        )}
      </g>
    </svg>
  );
}
