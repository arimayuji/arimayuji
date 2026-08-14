import type { CompletedRun } from "./storage";

/**
 * Lifetime-distance collectibles — total km ever run, not any single run's
 * own splits. Deliberately kept separate from the per-run PR achievements in
 * achievements.ts: those reveal their own design the moment they're earned
 * (the tier is derived from that run's improvement, so seeing it is the
 * point), while these stay a mystery shape in the collection until the
 * athlete actually taps to open one — closer to a sticker album than a
 * trophy case.
 */

/** Lifetime-km thresholds, ascending. Round numbers only — 21/42 are left out on purpose so a milestone never reads as "you ran a marathon", which already means something else in this app (a single run's own distance). */
export const EMBLEM_LADDER_KM: readonly number[] = [
  5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
];

export function totalDistanceMeters(runs: Pick<CompletedRun, "distanceMeters">[]): number {
  return runs.reduce((sum, run) => sum + run.distanceMeters, 0);
}

/** Every ladder milestone at or below `totalMeters`, ascending. */
export function crossedMilestones(totalMeters: number): number[] {
  const totalKm = totalMeters / 1000;
  return EMBLEM_LADDER_KM.filter((km) => totalKm >= km);
}

export interface NextMilestone {
  km: number;
  remainingMeters: number;
  /** 0–1 through the *current gap*, not from zero — so the bar isn't stuck reading "almost there" for months once the gap between rungs gets into the thousands. */
  progress: number;
}

/** The next uncrossed milestone, or null once the whole ladder is cleared. */
export function nextMilestone(totalMeters: number): NextMilestone | null {
  const totalKm = totalMeters / 1000;
  const next = EMBLEM_LADDER_KM.find((km) => km > totalKm);
  if (next === undefined) return null;
  const previous = [...EMBLEM_LADDER_KM].reverse().find((km) => km <= totalKm) ?? 0;
  const span = next - previous;
  return {
    km: next,
    remainingMeters: Math.max(0, next * 1000 - totalMeters),
    progress: span > 0 ? Math.min(1, Math.max(0, (totalKm - previous) / span)) : 0,
  };
}

/** Milestones this specific run's distance pushed the lifetime total past — for surfacing "you just unlocked X" right on the finish screen. */
export function milestonesJustCrossed(previousTotalMeters: number, newTotalMeters: number): number[] {
  const before = new Set(crossedMilestones(previousTotalMeters));
  return crossedMilestones(newTotalMeters).filter((km) => !before.has(km));
}

/** "5" or "2,5 mil" — shared between the finish-screen prompt and the collection page so the two never drift apart. */
export function formatEmblemKm(km: number): string {
  return km >= 1000 ? `${(km / 1000).toLocaleString("pt-BR")} mil` : km.toLocaleString("pt-BR");
}

// --- Deterministic visual identity, one fixed design per milestone ---

/** FNV-1a, 32-bit — same small dependency-free hash `achievements.ts` uses, so two different collectible systems don't need two hash implementations. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type EmblemPattern = "rays" | "dots" | "chevrons" | "waves";
const PATTERNS: readonly EmblemPattern[] = ["rays", "dots", "chevrons", "waves"];

export interface Emblem {
  km: number;
  hue: number;
  hue2: number;
  pattern: EmblemPattern;
  /** Notch count around the rim — grows with the milestone's position on the ladder, so a 10 000 km pin visibly carries more detail than a 5 km one. */
  notches: number;
  /** Rotates the whole rim pattern so two milestones with the same pattern don't line up identically. */
  spin: number;
}

/**
 * The seed is the milestone's own km value — fixed forever, unlike
 * `computeAchievement`'s per-run seed, since a lifetime milestone isn't tied
 * to any one run and has to look the same in the collection whether it was
 * just unlocked or opened again a year later.
 */
export function computeEmblem(km: number): Emblem {
  const seed = hash(`emblem|${km}`);
  const bits = (shift: number, mod: number) => (seed >>> shift) % mod;
  const tierIndex = Math.max(0, EMBLEM_LADDER_KM.indexOf(km));

  return {
    km,
    hue: bits(0, 360),
    hue2: bits(8, 360),
    pattern: PATTERNS[bits(16, PATTERNS.length)],
    notches: 8 + tierIndex * 2,
    spin: bits(20, 360),
  };
}
