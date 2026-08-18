import { haversineMeters } from "./geoFilter";
import type { CompletedRun, StoredPoint } from "./storage";

/**
 * "Personal record" = fastest time ever recorded to cover a standard
 * distance as a *contiguous split within a run*, not "total run distance
 * happened to be close to 5km". A 6km run has a 5km PR buried somewhere
 * inside it — same idea as Strava's PR badges scattered along the map.
 *
 * No segments database, no community-defined routes: just the round
 * distances a runner actually recognizes, computed from each run's own GPS
 * trace. Elevation/calories aren't tracked at all (no altitude sensor data
 * captured), so those parts of the reference screenshot aren't reproduced.
 */

/**
 * `unit` tags which distance-unit list (see `/historico`'s "Recordes
 * pessoais" toggle) each entry belongs to — `"both"` for the two race
 * distances that are the same physical distance either way, just named
 * differently (a half marathon is "21 km" or "13,1 milhas", never mixed
 * into a single list with 5 km and 1 milha at the same time).
 */
export const STANDARD_DISTANCES: readonly {
  meters: number;
  label: string;
  milesLabel?: string;
  unit: "km" | "mi" | "both";
}[] = [
  { meters: 1000, label: "1 km", unit: "km" },
  { meters: 5000, label: "5 km", unit: "km" },
  { meters: 10000, label: "10 km", unit: "km" },
  { meters: 804.672, label: "1/2 milha", unit: "mi" },
  { meters: 1609.344, label: "1 milha", unit: "mi" },
  { meters: 21097.5, label: "21 km", milesLabel: "13,1 milhas", unit: "both" },
  { meters: 42195, label: "42 km", milesLabel: "26,2 milhas", unit: "both" },
];

export interface RunRecord {
  targetMeters: number;
  label: string;
  splitSeconds: number;
  /** Null when this run is the first one ever to cover this distance. */
  previousBestSeconds: number | null;
  isNewRecord: boolean;
}

/**
 * Minimum time to cover `targetMeters` as a contiguous sub-interval of
 * `points`, or null if the run never covers that much ground. Two-pointer
 * sliding window over cumulative distance — O(n) since cumulative distance
 * is monotonic, so both pointers only ever move forward. The window's start
 * lands exactly on a recorded fix; its end is linearly interpolated between
 * the two points that straddle the target distance, since the true instant
 * the runner crossed the line rarely lands on a GPS sample.
 */
export function bestSplitSeconds(points: StoredPoint[], targetMeters: number): number | null {
  const n = points.length;
  if (n < 2 || targetMeters <= 0) return null;

  const cum = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1] + haversineMeters(points[i - 1], points[i]);
  }
  if (cum[n - 1] < targetMeters) return null;

  const t0 = points[0].timestamp;
  const elapsed = points.map((p) => (p.timestamp - t0) / 1000);

  let best = Infinity;
  let r = 0;
  for (let l = 0; l < n; l++) {
    if (r < l) r = l;
    while (r < n && cum[r] - cum[l] < targetMeters) r++;
    if (r >= n) break; // not enough distance left from here to the end

    const distBefore = cum[r - 1] - cum[l];
    const segDist = cum[r] - cum[r - 1];
    const frac = segDist > 0 ? (targetMeters - distBefore) / segDist : 0;
    const targetTime = elapsed[r - 1] + frac * (elapsed[r] - elapsed[r - 1]);

    const split = targetTime - elapsed[l];
    if (split < best) best = split;
  }
  return Number.isFinite(best) ? best : null;
}

/**
 * Every standard distance `run` covers, with whichever of `priorRuns` (this
 * run excluded — callers typically pass the runner's whole history including
 * the one just saved) held the previous best. O(distances × runs × points);
 * fine at personal-running-app scale, and only ever runs once when a run
 * finishes or the records list is displayed, never per render frame.
 */
export function computeRunRecords(run: CompletedRun, priorRuns: CompletedRun[]): RunRecord[] {
  // Filtering on `startedAt` (not just excluding `run.id`) is what makes this correct even if
  // a caller passes the *whole* history, including runs that happened after this one — a record
  // is only ever compared against what actually came before it.
  const others = priorRuns.filter((r) => r.id !== run.id && r.startedAt < run.startedAt);
  const records: RunRecord[] = [];

  for (const { meters, label } of STANDARD_DISTANCES) {
    const split = bestSplitSeconds(run.points, meters);
    if (split === null) continue;

    let previousBest: number | null = null;
    for (const prior of others) {
      const priorSplit = bestSplitSeconds(prior.points, meters);
      if (priorSplit !== null && (previousBest === null || priorSplit < previousBest)) {
        previousBest = priorSplit;
      }
    }

    records.push({
      targetMeters: meters,
      label,
      splitSeconds: split,
      previousBestSeconds: previousBest,
      isNewRecord: previousBest === null || split < previousBest,
    });
  }

  return records;
}

export interface AllTimeBest {
  targetMeters: number;
  label: string;
  milesLabel?: string;
  unit: "km" | "mi" | "both";
  splitSeconds: number;
  runId: string;
  achievedAt: number;
}

/** Current best split per standard distance across a runner's whole history, for a persistent "records" view. */
export function allTimeBests(runs: CompletedRun[]): AllTimeBest[] {
  const bests: AllTimeBest[] = [];
  for (const { meters, label, milesLabel, unit } of STANDARD_DISTANCES) {
    let best: AllTimeBest | null = null;
    for (const run of runs) {
      const split = bestSplitSeconds(run.points, meters);
      if (split !== null && (best === null || split < best.splitSeconds)) {
        best = {
          targetMeters: meters,
          label,
          milesLabel,
          unit,
          splitSeconds: split,
          runId: run.id,
          achievedAt: run.startedAt,
        };
      }
    }
    if (best) bests.push(best);
  }
  return bests;
}
