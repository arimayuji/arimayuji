import { haversineMeters } from "./geoFilter";
import type { StoredPoint } from "./storage";

export interface Split {
  index: number;
  /** Equal to `unitMeters` for every split except a trailing partial one. */
  distanceMeters: number;
  durationSeconds: number;
}

/**
 * One row per full unit of distance covered (km or mile, per `unitMeters`),
 * plus a trailing partial split when there's a meaningful remainder — same
 * cumulative-distance walk `bestSplitSeconds` uses for PRs, but boundary-
 * aligned instead of sliding, since a splits table means "every km", not
 * "the fastest km found anywhere in the run".
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

  const splits: Split[] = [];
  let searchFrom = 1;
  let boundaryTime = 0;
  let target = unitMeters;

  while (target <= total) {
    let i = searchFrom;
    while (cum[i] < target) i++;

    const segDist = cum[i] - cum[i - 1];
    const frac = segDist > 0 ? (target - cum[i - 1]) / segDist : 0;
    const time = elapsed[i - 1] + frac * (elapsed[i] - elapsed[i - 1]);

    splits.push({ index: splits.length + 1, distanceMeters: unitMeters, durationSeconds: time - boundaryTime });

    boundaryTime = time;
    searchFrom = i;
    target += unitMeters;
  }

  const remaining = total - splits.length * unitMeters;
  if (remaining > unitMeters * 0.15) {
    splits.push({
      index: splits.length + 1,
      distanceMeters: remaining,
      durationSeconds: elapsed[n - 1] - boundaryTime,
    });
  }

  return splits;
}
