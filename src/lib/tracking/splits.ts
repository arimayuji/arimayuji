import { haversineMeters } from "./geoFilter";
import type { StoredPoint } from "./storage";

/** Samples per split's `paceCurveSecPerKm` — enough to read as a curve, not so many the per-row SVG gets heavy over a run with dozens of splits. */
const PACE_CURVE_SAMPLES = 12;

export interface Split {
  index: number;
  /** Equal to `unitMeters` for every split except a trailing partial one. */
  distanceMeters: number;
  durationSeconds: number;
  /**
   * Local pace (seconds per km) at `PACE_CURVE_SAMPLES` evenly spaced points
   * across this split's own distance — the windowed derivative of the
   * elapsed-time/cumulative-distance curve around each point, not a running
   * average from the split's start, so it reads as how pace actually rose
   * and fell through the kilometer instead of one flat number. Each
   * window's free to reach slightly past this split's own boundary into a
   * neighbour, so the curve doesn't taper falsely at the edges the way a
   * window clamped to the split alone would.
   */
  paceCurveSecPerKm: number[];
}

/**
 * One row per full unit of distance covered (km or mile, per `unitMeters`),
 * plus a trailing partial split for whatever's left over, however short —
 * same cumulative-distance walk `bestSplitSeconds` uses for PRs, but
 * boundary-aligned instead of sliding, since a splits table means "every
 * km", not "the fastest km found anywhere in the run". A 5.1km run gets 5
 * full-km rows and a 6th row for the last 100m, not 5 rows with the tail
 * silently dropped.
 */
export function computeSplits(
  points: Pick<StoredPoint, "lat" | "lon" | "timestamp">[],
  unitMeters: number,
): Split[] {
  const n = points.length;
  if (n < 2 || unitMeters <= 0) return [];

  const cum = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + haversineMeters(points[i - 1], points[i]);
  const total = cum[n - 1];
  if (total < unitMeters * 0.2) return [];

  const t0 = points[0].timestamp;
  const elapsed = points.map((p) => (p.timestamp - t0) / 1000);

  /** Elapsed seconds at an arbitrary cumulative distance, linearly interpolated between the two straddling points — clamped to the run's own range rather than extrapolated past either end. */
  function timeAtDistance(target: number): number {
    const clamped = Math.max(0, Math.min(total, target));
    if (clamped <= 0) return elapsed[0];
    if (clamped >= total) return elapsed[n - 1];
    let i = 1;
    while (cum[i] < clamped) i++;
    const segDist = cum[i] - cum[i - 1];
    const frac = segDist > 0 ? (clamped - cum[i - 1]) / segDist : 0;
    return elapsed[i - 1] + frac * (elapsed[i] - elapsed[i - 1]);
  }

  function paceCurve(splitStart: number, splitEnd: number): number[] {
    const span = splitEnd - splitStart;
    // A window a little under a fifth of the split wide on each side —
    // narrow enough to show real variation, wide enough that GPS-fix jitter
    // between individual points doesn't dominate the shape.
    const halfWindow = Math.max(30, span * 0.18);
    const curve: number[] = [];
    for (let s = 0; s < PACE_CURVE_SAMPLES; s++) {
      const at = splitStart + (span * (s + 0.5)) / PACE_CURVE_SAMPLES;
      const from = at - halfWindow;
      const to = at + halfWindow;
      const coveredMeters = Math.min(total, to) - Math.max(0, from);
      const dt = timeAtDistance(to) - timeAtDistance(from);
      curve.push(coveredMeters > 0 ? (dt / coveredMeters) * 1000 : NaN);
    }
    return curve;
  }

  const splits: Split[] = [];
  let searchFrom = 1;
  let boundaryTime = 0;
  let boundaryDistance = 0;
  let target = unitMeters;

  while (target <= total) {
    let i = searchFrom;
    while (cum[i] < target) i++;

    const segDist = cum[i] - cum[i - 1];
    const frac = segDist > 0 ? (target - cum[i - 1]) / segDist : 0;
    const time = elapsed[i - 1] + frac * (elapsed[i] - elapsed[i - 1]);

    splits.push({
      index: splits.length + 1,
      distanceMeters: unitMeters,
      durationSeconds: time - boundaryTime,
      paceCurveSecPerKm: paceCurve(boundaryDistance, target),
    });

    boundaryTime = time;
    boundaryDistance = target;
    searchFrom = i;
    target += unitMeters;
  }

  // > 1m, not > 0, so GPS/floating-point noise at an exact-km finish (e.g.
  // 5.0003km) doesn't tack on a meaningless near-zero-distance row.
  const remaining = total - splits.length * unitMeters;
  if (remaining > 1) {
    splits.push({
      index: splits.length + 1,
      distanceMeters: remaining,
      durationSeconds: elapsed[n - 1] - boundaryTime,
      paceCurveSecPerKm: paceCurve(boundaryDistance, total),
    });
  }

  return splits;
}
