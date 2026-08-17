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

// --- Artwork ---

/**
 * One real piece of art per milestone — commissioned once from an image
 * model (not generated per-device or per-run) and hosted as a static file
 * on the same R2 bucket the basemap tiles live on, so showing an emblem
 * costs one small image fetch and nothing at request time. The ladder is a
 * fixed, small set (see `EMBLEM_LADDER_KM`), which is exactly what makes
 * "generate it once, host it forever" work here — there's no per-user or
 * per-run variation to account for.
 */
const EMBLEM_IMAGE_BASE_URL =
  process.env.NEXT_PUBLIC_TILES_BASE_URL ?? "https://pub-72a6391a200c440a9466c2e0d774e84f.r2.dev";

export function emblemImageUrl(km: number): string {
  return `${EMBLEM_IMAGE_BASE_URL}/emblems/${km}.webp`;
}
