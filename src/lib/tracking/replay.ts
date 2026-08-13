import { GPS_GAP_THRESHOLD_SECONDS, haversineMeters } from "./geoFilter";
import { stretchStarts } from "./routeProjection";
import type { StoredPoint } from "./storage";

/**
 * Playing a finished run back as it actually happened.
 *
 * The cursor advances over the run's *own* clock, not over its geometry: a
 * kilometre the athlete crawled takes longer to draw than one they surged,
 * which is the whole point — a distance-driven sweep would flatten the run
 * into a shape and lose the part worth watching. Stretches where tracking
 * gapped cost zero playback time and are never drawn across, exactly like
 * `routeSegments` refuses to draw a straight line over ground that was never
 * recorded.
 */

/** Rolling window behind the head, in run-seconds, that the live pace readout averages over. */
const PACE_WINDOW_SECONDS = 25;
/** Below this the window is too short for the average to mean anything — the readout stays "--:--" instead of printing a number off two fixes. */
const MIN_PACE_WINDOW_SECONDS = 8;

export interface ReplayTimeline {
  /** Cumulative meters at each point index, gap jumps excluded. */
  meters: number[];
  /** Cumulative seconds at each point index, gap stretches contributing nothing. */
  seconds: number[];
  totalMeters: number;
  totalSeconds: number;
}

/** Null when there's nothing to play back — fewer than two fixes, or a trace with no elapsed time at all. */
export function buildReplayTimeline(
  points: Pick<StoredPoint, "lat" | "lon" | "timestamp">[],
): ReplayTimeline | null {
  if (points.length < 2) return null;

  const meters = [0];
  const seconds = [0];
  for (let i = 1; i < points.length; i++) {
    const elapsed = (points[i].timestamp - points[i - 1].timestamp) / 1000;
    const gapped = elapsed >= GPS_GAP_THRESHOLD_SECONDS || elapsed < 0;
    meters[i] = meters[i - 1] + (gapped ? 0 : haversineMeters(points[i - 1], points[i]));
    seconds[i] = seconds[i - 1] + (gapped ? 0 : elapsed);
  }

  const totalSeconds = seconds[seconds.length - 1];
  if (totalSeconds <= 0) return null;

  return { meters, seconds, totalMeters: meters[meters.length - 1], totalSeconds };
}

export interface ReplayFrame {
  /** Last point the head has fully passed. */
  index: number;
  /** How far the head sits between `index` and `index + 1`, 0–1. */
  fraction: number;
  meters: number;
  seconds: number;
  /** Distance and time covered in the trailing window, for the live pace readout. Zero seconds means "not enough yet". */
  windowMeters: number;
  windowSeconds: number;
}

/** Largest index whose cumulative value is at or below `target` — ties resolve forward, so a gap (two equal entries) lands the head after it. */
function lastIndexAtOrBelow(values: number[], target: number): number {
  let low = 0;
  let high = values.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (values[mid] <= target) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** The head's position and readout at `progress` (0–1) through the run's own elapsed time. */
export function replayFrameAt(timeline: ReplayTimeline, progress: number): ReplayFrame {
  const { meters, seconds, totalSeconds, totalMeters } = timeline;
  const clamped = Math.min(1, Math.max(0, progress));
  const target = clamped * totalSeconds;

  const index = lastIndexAtOrBelow(seconds, target);
  const span = index + 1 < seconds.length ? seconds[index + 1] - seconds[index] : 0;
  const fraction = span > 0 ? Math.min(1, (target - seconds[index]) / span) : 0;

  const headMeters =
    span > 0 ? meters[index] + (meters[index + 1] - meters[index]) * fraction : meters[index];

  const windowStart = lastIndexAtOrBelow(seconds, Math.max(0, target - PACE_WINDOW_SECONDS));
  const windowSeconds = target - seconds[windowStart];
  const windowMeters = headMeters - meters[windowStart];

  return {
    index,
    fraction,
    meters: clamped === 1 ? totalMeters : headMeters,
    seconds: clamped === 1 ? totalSeconds : target,
    windowMeters,
    windowSeconds: windowSeconds >= MIN_PACE_WINDOW_SECONDS ? windowSeconds : 0,
  };
}

export interface ReplayCursor {
  head: ReplayFrame;
  /** Start of the hot stretch just behind the head, drawn brighter than the rest — what makes the direction of travel readable at a glance. */
  tail: ReplayFrame;
}

/** Length of that hot stretch, as a share of the whole run — a share rather than a fixed distance so it stays the same size on screen whatever the run's length. */
const TAIL_FRACTION = 0.09;

export function replayCursorAt(timeline: ReplayTimeline, progress: number): ReplayCursor {
  return {
    head: replayFrameAt(timeline, progress),
    tail: replayFrameAt(timeline, progress - TAIL_FRACTION),
  };
}

/**
 * The drawn part of the route between two cursors: the same per-stretch split
 * the finished trace uses, cut off at `to` (and at `from`, when given), with
 * both ends interpolated between their neighbouring fixes so the line grows
 * smoothly instead of snapping from fix to fix. `values` is one entry per
 * point in whatever space the caller draws in — `[lon, lat]` for the basemap,
 * projected `{x, y}` for the fallback.
 */
export function replayStretches<T>(
  points: Pick<StoredPoint, "timestamp">[],
  values: T[],
  lerp: (from: T, to: T, fraction: number) => T,
  to: ReplayFrame,
  from?: ReplayFrame,
): T[][] {
  const starts = stretchStarts(points);
  const stretches: T[][] = [];

  for (let s = 0; s < starts.length; s++) {
    const stretchStart = starts[s];
    if (stretchStart > to.index) break;
    const stretchEnd = (starts[s + 1] ?? points.length) - 1;
    if (from && stretchEnd < from.index) continue;

    const drawn: T[] = [];
    let first = stretchStart;
    if (from && from.index >= stretchStart) {
      first = from.index;
      if (from.fraction > 0 && from.index + 1 <= stretchEnd) {
        drawn.push(lerp(values[from.index], values[from.index + 1], from.fraction));
        first = from.index + 1;
      }
    }

    const last = Math.min(stretchEnd, to.index);
    for (let i = first; i <= last; i++) drawn.push(values[i]);
    if (last === to.index && to.fraction > 0 && to.index + 1 <= stretchEnd) {
      drawn.push(lerp(values[to.index], values[to.index + 1], to.fraction));
    }

    if (drawn.length >= 2) stretches.push(drawn);
  }

  return stretches;
}

/** Where the head itself sits, in the same space as `values`. */
export function replayHead<T>(
  values: T[],
  frame: ReplayFrame,
  lerp: (from: T, to: T, fraction: number) => T,
): T {
  const next = values[frame.index + 1];
  if (!next || frame.fraction === 0) return values[frame.index];
  return lerp(values[frame.index], next, frame.fraction);
}
