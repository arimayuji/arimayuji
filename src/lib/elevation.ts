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

/** One fix per `SAMPLE_SPACING_METERS` of cumulative distance, always including the first and last point. */
function downsample(points: Pick<StoredPoint, "lat" | "lon">[]): Pick<StoredPoint, "lat" | "lon">[] {
  if (points.length < 2) return points;

  const sampled = [points[0]];
  let sinceLastSample = 0;
  for (let i = 1; i < points.length; i++) {
    sinceLastSample += haversineMeters(points[i - 1], points[i]);
    if (sinceLastSample >= SAMPLE_SPACING_METERS) {
      sampled.push(points[i]);
      sinceLastSample = 0;
    }
  }
  const last = points[points.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
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
 * Total elevation gain in meters, or null when there's no MapTiler key
 * configured, the route is too short to mean anything, or the lookup
 * failed — a missing number, never an invented one.
 */
export async function computeElevationGain(
  points: Pick<StoredPoint, "lat" | "lon">[],
): Promise<number | null> {
  if (!MAPTILER_KEY || points.length < 2) return null;

  const sampled = downsample(points);

  try {
    const elevations: number[] = [];
    for (let i = 0; i < sampled.length; i += BATCH_SIZE) {
      elevations.push(...(await fetchElevationBatch(sampled.slice(i, i + BATCH_SIZE))));
    }

    let gain = 0;
    for (let i = 1; i < elevations.length; i++) {
      const delta = elevations[i] - elevations[i - 1];
      if (delta > NOISE_FLOOR_METERS) gain += delta;
    }
    return Math.round(gain);
  } catch {
    return null;
  }
}
