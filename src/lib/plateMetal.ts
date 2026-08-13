/**
 * The chrome ramp and the gem-cut geometry behind the achievement plate.
 *
 * Pulled out of the SVG component so the canvas share-card renderer draws the
 * *same* metal rather than a lookalike: the ramp's abrupt stops are the whole
 * reason it reads as polished metal instead of flat grey, and two hand-kept
 * copies would drift the moment one of them got tuned.
 */

import type { RarityTier } from "./tracking/achievements";

/**
 * Polished metal, top to bottom: sky, a narrow blown-out specular streak, a
 * hard drop into an ink trough, then the bounce back off the light below. The
 * abrupt stops matter more than the colours — blend them smoothly and the same
 * greys read as satin fabric instead of chrome.
 */
export const CHROME_STOPS: ReadonlyArray<readonly [number, string]> = [
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

export interface TierPaint {
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

export function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((((h % 360) + 360) % 360) / 60);
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] :
    hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const at = (i: 0 | 1 | 2) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${at(0)} ${at(1)} ${at(2)})`;
}

/** Each grey stop keeps its lightness and gains the tier's hue — the ramp's shape, which is what sells chrome, survives intact. */
export function tintedStops(
  paint: TierPaint,
  hueShift: number,
  tintScale: number,
): ReadonlyArray<readonly [number, string]> {
  return CHROME_STOPS.map(([offset, hex]) => {
    const grey = hexToRgb(hex);
    const lightness = (grey[0] + grey[1] + grey[2]) / 3 / 255;
    const hue = paint.hue + (paint.hue2 - paint.hue) * (offset / 100) + hueShift;
    return [offset, mix(grey, hslToRgb(hue, paint.sat, lightness), paint.tint * tintScale)] as const;
  });
}

/** Nearest stop at or below `position`, never blended — a facet is one flat plane catching one value. */
export function sampleRamp(stops: ReadonlyArray<readonly [number, string]>, position: number): string {
  let out = stops[0][1];
  for (const [offset, color] of stops) {
    if (offset <= position) out = color;
  }
  return out;
}

/** Centre of the plate's 0–120 art space. */
export const PLATE_CENTER = 60;

export function platePolygon(sides: number, radius: number, rotationDeg: number): Array<[number, number]> {
  return Array.from({ length: sides }, (_, i) => {
    const angle = ((i / sides) * 360 + rotationDeg - 90) * (Math.PI / 180);
    return [
      PLATE_CENTER + radius * Math.cos(angle),
      PLATE_CENTER + radius * Math.sin(angle),
    ] as [number, number];
  });
}

/**
 * Widest the engraved label may be, in the plate's art units. Sized for the
 * *hexagon* — the fewest facets the cut ever has, so the narrowest face at the
 * label's height — which is what keeps "1/2 milha" from running off the plate
 * the way a fixed size does.
 */
const LABEL_MAX_WIDTH = 58;
const MONO_ADVANCE = 0.6;

export const plateLabelFontSize = (label: string) =>
  Math.min(14, LABEL_MAX_WIDTH / (MONO_ADVANCE * Math.max(label.length, 1)));
