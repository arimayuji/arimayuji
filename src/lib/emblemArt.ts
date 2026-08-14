/**
 * Generative art for the lifetime-distance emblems — flow-field ribbons over
 * a grained gradient field, the same recipe family as plotter/Art-Blocks-
 * style generative pieces, built entirely from SVG primitives (path curves +
 * `feTurbulence` for the grain) since there's no illustration pipeline or
 * external image generation available here. Everything is a pure function of
 * `(seed, tier)` — same two numbers in, same artwork out, forever.
 *
 * Deliberately abstract rather than a character/mascot: hand-authored SVG
 * illustration is the one thing this recipe can't do well, so the "art" is
 * the composition itself (palette, flow, grain, layer count) rather than a
 * drawn subject. `tier` (the milestone's position on the ladder, 0-indexed)
 * is the rarity axis — higher tiers get more ribbon layers, a wider palette
 * spread, and a shimmering multi-hue treatment instead of one restrained
 * palette, so a 10 000 km piece is visibly, not just numerically, rarer than
 * a 5 km one.
 */

import { hslToRgb, mix } from "./plateMetal";

/** Mulberry32 — small, dependency-free, good enough spectral quality for a handful of draws per emblem. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ten curated three-hue analogous spreads rather than random hues — the
 * difference between "these colours were chosen" and "these colours were
 * rolled". Each is a mood, not just a hue: warm/cool, muted/saturated
 * variation comes from `tier` and per-draw jitter, not from the palette
 * itself.
 */
const PALETTES: ReadonlyArray<{ name: string; hues: readonly [number, number, number] }> = [
  { name: "ember", hues: [14, 32, 355] },
  { name: "citrus", hues: [42, 55, 22] },
  { name: "forest", hues: [140, 104, 168] },
  { name: "ocean", hues: [200, 190, 226] },
  { name: "violet", hues: [265, 286, 248] },
  { name: "rose", hues: [330, 346, 302] },
  { name: "mint", hues: [162, 176, 142] },
  { name: "dusk", hues: [232, 258, 208] },
  { name: "gold", hues: [45, 36, 52] },
  { name: "coral", hues: [8, 22, 352] },
];

/** Flow-field heading at a point — layered sines standing in for Perlin noise, cheap and seed-stable without a noise library. */
function flowAngle(x: number, y: number, phase: number): number {
  return (
    Math.sin(x * 0.05 + phase) * 1.7 +
    Math.cos(y * 0.043 - phase * 1.3) * 1.7 +
    Math.sin((x + y) * 0.021 + phase * 0.6)
  );
}

interface Point {
  x: number;
  y: number;
}

/** Walks a ribbon through the flow field from a random edge point, clipped to the circular canvas. */
function traceRibbon(rng: () => number, phase: number, steps: number): Point[] {
  const startAngle = rng() * Math.PI * 2;
  const startRadius = 40 + rng() * 12;
  let x = 60 + Math.cos(startAngle) * startRadius;
  let y = 60 + Math.sin(startAngle) * startRadius;
  let heading = rng() * Math.PI * 2;
  const stepLength = 3.2 + rng() * 1.6;

  const points: Point[] = [{ x, y }];
  for (let i = 0; i < steps; i++) {
    heading += flowAngle(x, y, phase) * 0.09;
    x += Math.cos(heading) * stepLength;
    y += Math.sin(heading) * stepLength;
    if (Math.hypot(x - 60, y - 60) > 55) break;
    points.push({ x, y });
  }
  return points;
}

/** Quadratic-through-midpoints smoothing — the standard trick for turning a jittery polyline into a fair curve without a spline library. */
function smoothPath(points: Point[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
  return d;
}

export interface Ribbon {
  d: string;
  color: string;
  width: number;
  opacity: number;
}

export interface EmblemArt {
  paletteName: string;
  /** Background gradient, centre to edge. */
  bgInner: string;
  bgOuter: string;
  ribbons: Ribbon[];
  /** Seeds `feTurbulence` for a grain layer unique to this emblem. */
  grainSeed: number;
  grainFrequency: number;
  /** Last three rungs of the ladder: cycles through every palette hue instead of one, plus an extra shimmer layer — the "legendary" tier read at a glance. */
  prismatic: boolean;
  /** Representative colour for surrounding UI chrome (reveal modal headings, glow) — each emblem gets its own accent, not one shared brand colour. */
  accent: string;
}

export function computeEmblemArt(seed: number, tier: number): EmblemArt {
  const rng = mulberry32(seed);
  const palette = PALETTES[Math.floor(rng() * PALETTES.length)];
  const prismatic = tier >= 8;

  const hueAt = (i: number) =>
    prismatic ? (i * 360) / PALETTES.length + palette.hues[0] : palette.hues[i % palette.hues.length];

  const ribbonCount = 4 + Math.floor(tier * 0.7);
  const ribbons: Ribbon[] = Array.from({ length: ribbonCount }, (_, i) => {
    const hue = hueAt(i) + (rng() - 0.5) * 14;
    const sat = 0.55 + rng() * 0.35;
    const light = 0.5 + rng() * 0.24;
    const [r, g, b] = hslToRgb(hue, sat, light);
    const points = traceRibbon(rng, seed % 1000 + i * 37, 24 + Math.floor(rng() * 22));
    return {
      d: smoothPath(points),
      color: `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`,
      width: 1.6 + rng() * (2.6 + tier * 0.25),
      opacity: 0.4 + rng() * 0.45,
    };
  });

  const bgHue = palette.hues[0];
  const [innerR, innerG, innerB] = hslToRgb(bgHue, 0.4, 0.22);
  const [outerR, outerG, outerB] = hslToRgb(palette.hues[2], 0.5, 0.08);

  const accentHsl = hslToRgb(hueAt(1), 0.7, 0.62);

  return {
    paletteName: palette.name,
    bgInner: `rgb(${Math.round(innerR)} ${Math.round(innerG)} ${Math.round(innerB)})`,
    bgOuter: `rgb(${Math.round(outerR)} ${Math.round(outerG)} ${Math.round(outerB)})`,
    ribbons,
    grainSeed: seed % 4096,
    grainFrequency: 0.6 + rng() * 0.5,
    prismatic,
    accent: mix([Math.round(accentHsl[0]), Math.round(accentHsl[1]), Math.round(accentHsl[2])], [255, 255, 255], 0.08),
  };
}
