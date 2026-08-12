import { GPS_GAP_THRESHOLD_SECONDS } from "./geoFilter";
import type { StoredPoint } from "./storage";

/**
 * Turns a GPS trace into an SVG-ready shape — not a basemap. There's no tile
 * provider here (no API key, no network call, matches the rest of the app's
 * offline-first, zero-dependency stance): this draws the literal outline of
 * where the run went, projected flat and fit to a square viewBox, the same
 * "your actual path, not a stylized illustration" idea the user asked for
 * ("se eu corri uma linha reta, vai chegar uma linha reta") — which cuts
 * both ways: where GPS tracking silently gapped, the line breaks there too
 * instead of drawing a straight line across ground that was never recorded.
 */

const METERS_PER_DEG_LAT = 111_320;

export interface ProjectedRoute {
  /** SVG `points` attribute value, one per unbroken stretch of tracking — split at any gap over `GPS_GAP_THRESHOLD_SECONDS`. */
  polylines: string[];
  /** Square viewBox side length, in the same units as `polylines`. */
  viewBoxSize: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/**
 * Projects lat/lon points to a flat, north-up, square viewBox — an
 * equirectangular approximation local to the run's own bounding box, which
 * is accurate enough at the scale of a single run (a few km at most) without
 * pulling in a real map-projection library.
 */
export function projectRoute(
  points: Pick<StoredPoint, "lat" | "lon" | "timestamp">[],
  { viewBoxSize = 100, paddingFraction = 0.12 }: { viewBoxSize?: number; paddingFraction?: number } = {},
): ProjectedRoute | null {
  if (points.length < 2) return null;

  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;
  const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos((centerLat * Math.PI) / 180);

  const flat = points.map((p) => ({
    x: (p.lon - centerLon) * metersPerDegLon,
    y: (p.lat - centerLat) * METERS_PER_DEG_LAT, // north-positive
  }));

  const xs = flat.map((p) => p.x);
  const ys = flat.map((p) => p.y);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  // A dead-straight or near-stationary trace has ~0 span on one axis — floor
  // it so the route doesn't get stretched into a degenerate hairline.
  const span = Math.max(spanX, spanY, 15);

  const usable = viewBoxSize * (1 - 2 * paddingFraction);
  const scale = usable / span;
  const half = viewBoxSize / 2;

  const project = (p: { x: number; y: number }) => ({
    x: half + p.x * scale,
    y: half - p.y * scale, // north (+y meters) is up, i.e. smaller SVG y
  });

  const projected = flat.map(project);

  const segments: { x: number; y: number }[][] = [[projected[0]]];
  for (let i = 1; i < projected.length; i++) {
    const dt = (points[i].timestamp - points[i - 1].timestamp) / 1000;
    if (dt >= GPS_GAP_THRESHOLD_SECONDS) segments.push([]); // start a new unbroken stretch
    segments[segments.length - 1].push(projected[i]);
  }
  const polylines = segments
    .filter((seg) => seg.length > 0)
    .map((seg) => seg.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" "));

  return {
    polylines,
    viewBoxSize,
    start: projected[0],
    end: projected[projected.length - 1],
  };
}
