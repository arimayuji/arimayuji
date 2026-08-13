import type { RunRecord } from "./personalRecords";

/**
 * Rarity and per-item variation for a personal record, computed entirely from
 * the run's own data.
 *
 * Nothing here is random or fetched: the tier comes from how much the athlete
 * actually beat their previous best by, and every visual variation comes from
 * a hash of stable facts about the achievement. Re-opening a two-year-old
 * record shows the exact same item it showed the day it was unlocked.
 */

export type RarityTier = "bronze" | "prata" | "ouro" | "diamante" | "platina";

export const TIER_LABEL: Record<RarityTier, string> = {
  bronze: "Bronze",
  prata: "Prata",
  ouro: "Ouro",
  diamante: "Diamante",
  platina: "Platina",
};

/**
 * Improvement breakpoints, as a fraction of the previous best split.
 *
 * Chosen against what a PR margin looks like in practice, not to spread the
 * tiers evenly. A runner chipping at an established 5 km time moves in
 * seconds: 1% of a 25:00 5 km is 15s, and most PRs a training log records are
 * under that — so sub-1% is bronze and bronze is meant to be the common case,
 * the tier you collect dozens of. 1–3% (15–45s on that same 25:00) is a
 * deliberate hard effort. 3–7% (45s–1:45) is a breakthrough: a race day, or a
 * training block landing. 7–15% is what happens when someone's fitness has
 * genuinely stepped up between attempts, common in a first season and rare
 * after. Past 15% the previous best was effectively not a real attempt — an
 * easy run that happened to be the only prior data point — which is exactly
 * the situation that should feel like a jackpot.
 *
 * Distance is deliberately *not* weighted in: 3% off a marathon is a harder
 * thing than 3% off a 1 km, but this app computes every standard distance as
 * a split inside whatever run happened, so a "1 km PR" is often just the fast
 * bit of a longer effort. Weighting by distance would reward the shape of the
 * run rather than the effort, so the ladder stays purely about the margin.
 */
const BREAKPOINTS: ReadonlyArray<readonly [number, RarityTier]> = [
  [0.15, "platina"],
  [0.07, "diamante"],
  [0.03, "ouro"],
  [0.01, "prata"],
];

const HALF_MARATHON_METERS = 21097.5;

/**
 * A first-ever at a distance has no prior to measure against, so any
 * percentage tier would be invented. Prata rather than bronze because a first
 * is genuinely more of an event than shaving four seconds off an existing
 * time, and rather than ouro because it took no measured improvement to earn.
 * The half-marathon-and-up bump is the one exception: covering 21 km for the
 * first time is a milestone in a way a first 1 km isn't.
 */
function firstEverTier(targetMeters: number): RarityTier {
  return targetMeters >= HALF_MARATHON_METERS ? "ouro" : "prata";
}

export function tierFor(record: RunRecord): RarityTier {
  const { previousBestSeconds, splitSeconds, targetMeters } = record;
  if (previousBestSeconds === null) return firstEverTier(targetMeters);
  if (!(previousBestSeconds > 0) || !(splitSeconds >= 0)) return "bronze";

  const improvement = (previousBestSeconds - splitSeconds) / previousBestSeconds;
  for (const [threshold, tier] of BREAKPOINTS) {
    if (improvement >= threshold) return tier;
  }
  return "bronze";
}

/** FNV-1a, 32-bit — small, dependency-free, and spreads adjacent inputs well enough for this. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** No vowels and no 0/1/O/I/S — a stamped serial has to survive being read aloud. */
const SERIAL_ALPHABET = "23456789ACDEFGHJKLMNPQRTUVWXYZ";

function serialFrom(seed: number): string {
  let n = seed;
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += SERIAL_ALPHABET[n % SERIAL_ALPHABET.length];
    n = Math.floor(n / SERIAL_ALPHABET.length) + 7;
  }
  return `${out.slice(0, 3)}-${out.slice(3)}`;
}

export interface Achievement {
  tier: RarityTier;
  /** Fraction of the previous best that was shaved off; null on a first-ever. */
  improvement: number | null;
  /** Stamped on the item's face — the thing that makes two same-tier items obviously not the same object. */
  serial: string;
  /** Sides of the cut plate, 6–10. */
  facets: number;
  /** Degrees the tier's metal hue is rotated by, ±12. */
  hueShift: number;
  /** Multiplier on how far the metal is pushed off neutral chrome. */
  tintScale: number;
  /** Where the key light sits, in degrees — decides which facets of the rim blow out and which go to ink. */
  lightAngle: number;
  /** Rotation of the whole cut, so the flat edge doesn't always land in the same place. */
  faceSpin: number;
}

/**
 * The seed is the run id, the distance and the achieved split, so it is unique
 * per achievement and fixed for as long as the run exists. `splitSeconds` is
 * quantised to milliseconds first: it comes out of a floating-point
 * interpolation, and an identical run re-derived on another device must not
 * hash differently over the last bits of a double.
 */
export function computeAchievement(runId: string, record: RunRecord): Achievement {
  const split = Number.isFinite(record.splitSeconds) ? Math.round(record.splitSeconds * 1000) : 0;
  const seed = hash(`${runId}|${record.targetMeters}|${split}`);
  const bits = (shift: number, mod: number) => (seed >>> shift) % mod;

  const previous = record.previousBestSeconds;
  const improvement =
    previous !== null && previous > 0 ? (previous - record.splitSeconds) / previous : null;

  return {
    tier: tierFor(record),
    improvement,
    serial: serialFrom(seed),
    facets: 6 + bits(0, 5),
    hueShift: bits(4, 25) - 12,
    tintScale: 0.86 + bits(9, 9) / 32,
    lightAngle: -100 + bits(13, 41),
    faceSpin: bits(18, 360) / 10 - 18,
  };
}
