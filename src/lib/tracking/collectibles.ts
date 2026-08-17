import { metalForRank, type RankMetal } from "@/lib/rankMetal";
import { EMBLEM_LADDER_KM, formatEmblemKm } from "./emblems";
import { runMovingSeconds, type CompletedRun, type EmblemCategory } from "./storage";

/**
 * Two more lifetime ladders alongside the distance one in emblems.ts: metres
 * climbed and hours spent moving. Same "sticker album, not a feed" shape —
 * see emblems.ts for the reasoning — just summed over a different running
 * total. `collectibleDisplay` below is the one thing that actually needs to
 * know all three ladders exist; everywhere else (storage, badge art) stays
 * generic over `EmblemCategory`.
 */

/** Elevation gain thresholds in metres. 8849 and its 5x multiple are real mountain heights (Everest), not round numbers — see `ELEVATION_NICKNAME`. */
export const ELEVATION_LADDER_M: readonly number[] = [
  100, 250, 500, 1000, 2000, 3500, 5000, 8849, 15000, 25000, 44245,
];

/** Hours spent actually moving (not elapsed wall-clock), lifetime. */
export const TIME_LADDER_HOURS: readonly number[] = [
  5, 10, 25, 50, 100, 200, 350, 500, 750, 1000, 2000,
];

/** A real-world reference for a milestone, shown alongside the raw number instead of a bare "8.849 m". */
export const ELEVATION_NICKNAME: Readonly<Record<number, string>> = {
  8849: "Everest",
  44245: "5x Everest",
};

/**
 * Only counts runs whose gain has actually been computed — `elevationGainMeters`
 * is filled in lazily the first time a run's own detail screen is opened (see
 * `CompletedRun.elevationGainMeters`), not at save time, so a lifetime total
 * taken here can undercount until every run has been visited once. Same
 * trade-off the per-run calorie estimate already accepts for this field.
 */
export function totalElevationMeters(runs: Pick<CompletedRun, "elevationGainMeters">[]): number {
  return runs.reduce((sum, run) => sum + (run.elevationGainMeters ?? 0), 0);
}

export function totalMovingHours(runs: CompletedRun[]): number {
  return runs.reduce((sum, run) => sum + runMovingSeconds(run), 0) / 3600;
}

function crossed(ladder: readonly number[], total: number): number[] {
  return ladder.filter((v) => total >= v);
}

export interface NextLadderMilestone {
  value: number;
  remaining: number;
  /** 0–1 through the current gap, not from zero — same reasoning as `NextMilestone` in emblems.ts. */
  progress: number;
}

function next(ladder: readonly number[], total: number): NextLadderMilestone | null {
  const nextValue = ladder.find((v) => v > total);
  if (nextValue === undefined) return null;
  const previous = [...ladder].reverse().find((v) => v <= total) ?? 0;
  const span = nextValue - previous;
  return {
    value: nextValue,
    remaining: Math.max(0, nextValue - total),
    progress: span > 0 ? Math.min(1, Math.max(0, (total - previous) / span)) : 0,
  };
}

export const crossedElevationMilestones = (totalMeters: number): number[] =>
  crossed(ELEVATION_LADDER_M, totalMeters);
export const nextElevationMilestone = (totalMeters: number): NextLadderMilestone | null =>
  next(ELEVATION_LADDER_M, totalMeters);
export const crossedTimeMilestones = (totalHours: number): number[] => crossed(TIME_LADDER_HOURS, totalHours);
export const nextTimeMilestone = (totalHours: number): NextLadderMilestone | null =>
  next(TIME_LADDER_HOURS, totalHours);

export function formatElevationM(value: number): string {
  return `${value.toLocaleString("pt-BR")} m`;
}

export function formatTimeHours(value: number): string {
  return `${value.toLocaleString("pt-BR")} h`;
}

export interface CollectibleDisplay {
  /** The full rank-metal paint (Cobre, Bronze, ... Prisma) — see rankMetal.ts. Carries both the flat `accent`/`name` and the chrome-ramp fields the badge's face gradient needs. */
  metal: RankMetal;
  rank: number;
  /** Reveal-modal heading. */
  title: string;
  /** Reveal-modal body copy. */
  subtitle: string;
  /** Short caption under the collection-grid thumbnail. */
  gridLabel: string;
}

/** Everything the reveal modal and collection grid need to render a milestone, without either of them having to know which of the three ladders it belongs to. */
export function collectibleDisplay(category: EmblemCategory, value: number): CollectibleDisplay {
  if (category === "elevacao") {
    const nickname = ELEVATION_NICKNAME[value];
    return {
      metal: metalForRank(ELEVATION_LADDER_M.indexOf(value) + 1),
      rank: ELEVATION_LADDER_M.indexOf(value) + 1,
      title: nickname ? `${formatElevationM(value)} · ${nickname}` : `${formatElevationM(value)} de subida`,
      subtitle: "Ganho de elevação somado de todo o relevo que você já subiu correndo.",
      gridLabel: formatElevationM(value),
    };
  }
  if (category === "tempo") {
    return {
      metal: metalForRank(TIME_LADDER_HOURS.indexOf(value) + 1),
      rank: TIME_LADDER_HOURS.indexOf(value) + 1,
      title: `${formatTimeHours(value)} de corrida`,
      subtitle: "Tempo em movimento somado — cada minuto correndo, contado.",
      gridLabel: formatTimeHours(value),
    };
  }
  return {
    metal: metalForRank(EMBLEM_LADDER_KM.indexOf(value) + 1),
    rank: EMBLEM_LADDER_KM.indexOf(value) + 1,
    title: `${formatEmblemKm(value)} km na vida`,
    subtitle: "Soma de tudo que você já rodou dentro do Xanthus, corrida após corrida.",
    gridLabel: `${formatEmblemKm(value)} km`,
  };
}
