/**
 * Ghost run comparison — cumulative distance vs elapsed time only.
 *
 * This is deliberately NOT route/path matching: we never compare GPS
 * trajectories geometrically, only "at the distance you've covered right
 * now, how long did the ghost take to cover that same distance". Works off
 * `CompletedRun.points` + `startedAt`, no schema changes.
 */

import { haversineMeters } from "./geoFilter";
import type { CompletedRun } from "./storage";

export interface GhostSeriesPoint {
  distanceMeters: number;
  elapsedSeconds: number;
}

/** Cumulative distance/time series for a completed run, starting at {0, 0}. */
export function buildDistanceTimeSeries(run: CompletedRun): GhostSeriesPoint[] {
  const series: GhostSeriesPoint[] = [{ distanceMeters: 0, elapsedSeconds: 0 }];
  let cumulative = 0;
  let prev: CompletedRun["points"][number] | null = null;
  for (const point of run.points) {
    if (prev) {
      cumulative += haversineMeters(prev, point);
    }
    series.push({
      distanceMeters: cumulative,
      elapsedSeconds: (point.timestamp - run.startedAt) / 1000,
    });
    prev = point;
  }
  return series;
}

/**
 * How long the ghost took (in seconds since its own start) to reach
 * `distanceMeters`, linearly interpolated between the two bracketing series
 * entries. `null` when the series is empty or the ghost never reached that
 * distance — there's no honest comparison to make past where it stopped.
 */
export function ghostElapsedAtDistance(
  series: GhostSeriesPoint[],
  distanceMeters: number,
): number | null {
  if (series.length === 0) return null;
  const last = series[series.length - 1];
  if (distanceMeters > last.distanceMeters) return null;
  if (distanceMeters <= 0) return series[0].elapsedSeconds;

  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const curr = series[i];
    if (distanceMeters <= curr.distanceMeters) {
      const span = curr.distanceMeters - prev.distanceMeters;
      if (span <= 0) return curr.elapsedSeconds;
      const ratio = (distanceMeters - prev.distanceMeters) / span;
      return prev.elapsedSeconds + ratio * (curr.elapsedSeconds - prev.elapsedSeconds);
    }
  }
  return last.elapsedSeconds;
}

/**
 * Sign convention: POSITIVE delta means the athlete is AHEAD of the ghost
 * (faster) — the ghost took longer to reach this same distance. NEGATIVE
 * means the athlete is BEHIND (slower). `null` propagates whenever
 * `ghostElapsedAtDistance` can't give an honest answer (no ghost, or past
 * the ghost's max recorded distance).
 */
export function ghostDeltaSeconds(
  series: GhostSeriesPoint[],
  distanceMeters: number,
  athleteElapsedSeconds: number,
): number | null {
  const ghostElapsed = ghostElapsedAtDistance(series, distanceMeters);
  if (ghostElapsed === null) return null;
  return ghostElapsed - athleteElapsedSeconds;
}
