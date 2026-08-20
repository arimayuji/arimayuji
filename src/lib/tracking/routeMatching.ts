import { haversineMeters } from "./geoFilter";
import { runMovingSeconds, type CompletedRun, type StoredPoint } from "./storage";

/**
 * "Corridas correspondentes" — Strava paywalls the equivalent (grouping runs
 * that followed the same route, with a pace-trend line across repeats) as
 * "Matched runs". No segments database, no server: everything here runs
 * entirely over a runner's own already-loaded `CompletedRun[]`, the same
 * data /progresso and /historico already read — zero extra storage, zero
 * server cost, so there's no reason not to give it away.
 *
 * Matching is intentionally cheap and approximate rather than a real
 * Fréchet/DTW route-similarity library: a runner recognizes "I ran this
 * loop again" by eye, and a start-point + total-distance + coarse-shape
 * check reproduces that recognition well enough for a personal app's own
 * history (dozens to low hundreds of runs), without pulling in real
 * geometry-matching machinery for a comparison that never needs to
 * generalize beyond "this one runner's own routes".
 */

const START_PROXIMITY_METERS = 150;
const DISTANCE_TOLERANCE_FRACTION = 0.15;
const SHAPE_SAMPLE_COUNT = 20;
const SHAPE_MAX_AVG_DEVIATION_METERS = 100;
const MIN_GROUP_SIZE = 2;
const MIN_RUN_POINTS = 2;

function withinDistanceTolerance(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(a, b) * DISTANCE_TOLERANCE_FRACTION;
}

/**
 * `count` points evenly spaced by *distance along the route*, not by index —
 * two runs of the same loop rarely log the same number of GPS fixes (pace,
 * signal quality, phone vs. watch source all vary), so comparing point[i] to
 * point[i] directly would compare unrelated moments of the run. Same
 * cumulative-distance technique as `bestSplitSeconds` in personalRecords.ts.
 */
function resampleByDistance(points: StoredPoint[], count: number): StoredPoint[] {
  const n = points.length;
  const cum = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1] + haversineMeters(points[i - 1], points[i]);
  }
  const total = cum[n - 1];

  const samples: StoredPoint[] = [];
  let cursor = 0;
  for (let s = 0; s < count; s++) {
    const targetDist = (s / (count - 1)) * total;
    while (cursor < n - 2 && cum[cursor + 1] < targetDist) cursor++;
    const segDist = cum[cursor + 1] - cum[cursor];
    const frac = segDist > 0 ? (targetDist - cum[cursor]) / segDist : 0;
    const a = points[cursor];
    const b = points[cursor + 1];
    samples.push({
      lat: a.lat + (b.lat - a.lat) * frac,
      lon: a.lon + (b.lon - a.lon) * frac,
      timestamp: a.timestamp,
    });
  }
  return samples;
}

function averageShapeDeviationMeters(a: CompletedRun, b: CompletedRun): number {
  const ra = resampleByDistance(a.points, SHAPE_SAMPLE_COUNT);
  const rb = resampleByDistance(b.points, SHAPE_SAMPLE_COUNT);
  let sum = 0;
  for (let i = 0; i < SHAPE_SAMPLE_COUNT; i++) sum += haversineMeters(ra[i], rb[i]);
  return sum / SHAPE_SAMPLE_COUNT;
}

/**
 * Cheapest checks first (start proximity, then total distance) so the
 * expensive resample-and-compare shape check only ever runs on pairs that
 * already cleared both — most candidate pairs across a real history bail out
 * before it.
 */
function sameRoute(anchor: CompletedRun, candidate: CompletedRun): boolean {
  if (haversineMeters(anchor.points[0], candidate.points[0]) > START_PROXIMITY_METERS) return false;
  if (!withinDistanceTolerance(anchor.distanceMeters, candidate.distanceMeters)) return false;
  return averageShapeDeviationMeters(anchor, candidate) <= SHAPE_MAX_AVG_DEVIATION_METERS;
}

export interface MatchedRun {
  run: CompletedRun;
  paceSecPerMeter: number;
}

export interface MatchedRunGroup {
  /** The earliest run in the group — its route shape is what every later run in the group was matched against. */
  anchorRunId: string;
  /** Oldest to newest. */
  runs: MatchedRun[];
}

/**
 * Groups runs by route repetition, most-repeated route first. Greedy and
 * anchor-based: each run joins the first existing group whose *anchor* (the
 * group's oldest run, chronologically) it matches — not compared against
 * every member — which keeps this O(groups) per run instead of O(group
 * size²), and treats the first time a route was run as the shape every
 * later repeat is judged against, which is exactly the "same loop again"
 * question this answers.
 *
 * Only groups with 2+ runs are returned: a single run isn't a "repeated"
 * route, and doesn't belong in this feature at all — /historico already
 * shows the run's own splits and PR badges for that.
 */
export function groupRunsByRoute(runs: CompletedRun[]): MatchedRunGroup[] {
  const candidates = runs
    .filter((r) => r.points.length >= MIN_RUN_POINTS && r.distanceMeters > 0)
    .sort((a, b) => a.startedAt - b.startedAt);

  const groups: CompletedRun[][] = [];
  for (const run of candidates) {
    const group = groups.find((g) => sameRoute(g[0], run));
    if (group) {
      group.push(run);
    } else {
      groups.push([run]);
    }
  }

  return groups
    .filter((g) => g.length >= MIN_GROUP_SIZE)
    .map((g) => ({
      anchorRunId: g[0].id,
      runs: g.map((run) => ({ run, paceSecPerMeter: runMovingSeconds(run) / run.distanceMeters })),
    }))
    .sort((a, b) => b.runs.length - a.runs.length);
}
