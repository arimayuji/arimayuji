/**
 * Real terrain elevation gain via MapTiler's elevation API — not the phone's
 * own GPS altitude, which has no barometer behind it on most devices and is
 * far too noisy (tens of meters of error) to sum into an honest gain figure.
 * Same "no fake numbers" rule the evidence base and place ratings follow:
 * better to cost a network round trip than to show elevation gain invented
 * from noise.
 */
import { haversineMeters } from "./tracking/geoFilter";
import type { StoredPoint } from "./tracking/storage";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

/** MapTiler's own cap on coordinates per request. */
const BATCH_SIZE = 50;
/** Below this, two GPS fixes are functionally the same terrain sample — querying every raw fix would burn quota on noise, not new ground. */
const SAMPLE_SPACING_METERS = 20;
/** DEM tiles have their own resolution/rounding; treat anything under this as flat rather than "gain". */
const NOISE_FLOOR_METERS = 1.5;

export interface ElevationSample {
  /** Cumulative distance from the run's start, in meters. */
  distanceMeters: number;
  elevationMeters: number;
}

/** One fix per `SAMPLE_SPACING_METERS` of cumulative distance, always including the first and last point — each carrying the run's own cumulative distance at that fix, not just its lat/lon, so a caller can place it against splits later without re-walking the whole point list. */
function downsample(
  points: Pick<StoredPoint, "lat" | "lon">[],
): Array<{ point: Pick<StoredPoint, "lat" | "lon">; distanceMeters: number }> {
  if (points.length < 2) return points.map((point) => ({ point, distanceMeters: 0 }));

  const sampled = [{ point: points[0], distanceMeters: 0 }];
  let cumulative = 0;
  let sinceLastSample = 0;
  for (let i = 1; i < points.length; i++) {
    const step = haversineMeters(points[i - 1], points[i]);
    cumulative += step;
    sinceLastSample += step;
    if (sinceLastSample >= SAMPLE_SPACING_METERS) {
      sampled.push({ point: points[i], distanceMeters: cumulative });
      sinceLastSample = 0;
    }
  }
  const last = points[points.length - 1];
  if (sampled[sampled.length - 1].point !== last) sampled.push({ point: last, distanceMeters: cumulative });
  return sampled;
}

async function fetchElevationBatch(coords: Pick<StoredPoint, "lat" | "lon">[]): Promise<number[]> {
  const locations = coords.map((p) => `${p.lon},${p.lat}`).join(";");
  const res = await fetch(`https://api.maptiler.com/elevation/${locations}.json?key=${MAPTILER_KEY}`);
  if (!res.ok) throw new Error(`MapTiler elevation ${res.status}`);
  const rows: [number, number, number][] = await res.json();
  return rows.map((row) => row[2]);
}

/**
 * The route's terrain profile — cumulative distance paired with real DEM
 * elevation at each downsampled fix — or `null` under the same conditions
 * `computeElevationGain` bails on (no MapTiler key, too few points, lookup
 * failure). `computeElevationGain` and the "Parciais por km" elevation
 * toggle both build on this single fetch rather than each querying MapTiler
 * on its own.
 */
export async function computeElevationProfile(
  points: Pick<StoredPoint, "lat" | "lon">[],
): Promise<ElevationSample[] | null> {
  if (!MAPTILER_KEY || points.length < 2) return null;

  const sampled = downsample(points);
  try {
    const elevations: number[] = [];
    for (let i = 0; i < sampled.length; i += BATCH_SIZE) {
      elevations.push(...(await fetchElevationBatch(sampled.slice(i, i + BATCH_SIZE).map((s) => s.point))));
    }
    return sampled.map((s, i) => ({ distanceMeters: s.distanceMeters, elevationMeters: elevations[i] }));
  } catch {
    return null;
  }
}

/** Sums only the upward steps past the DEM noise floor — pulled out of `computeElevationGain` so a caller already holding a profile (e.g. the "Parciais por km" elevation toggle) can get the same total without a second MapTiler round trip. */
export function elevationGainFromProfile(profile: ElevationSample[]): number {
  let gain = 0;
  for (let i = 1; i < profile.length; i++) {
    const delta = profile[i].elevationMeters - profile[i - 1].elevationMeters;
    if (delta > NOISE_FLOOR_METERS) gain += delta;
  }
  return Math.round(gain);
}

/**
 * Total elevation gain in meters, or null when there's no MapTiler key
 * configured, the route is too short to mean anything, or the lookup
 * failed — a missing number, never an invented one.
 */
export async function computeElevationGain(
  points: Pick<StoredPoint, "lat" | "lon">[],
): Promise<number | null> {
  const profile = await computeElevationProfile(points);
  return profile ? elevationGainFromProfile(profile) : null;
}
