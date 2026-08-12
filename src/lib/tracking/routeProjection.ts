import { GPS_GAP_THRESHOLD_SECONDS, haversineMeters } from "./geoFilter";
import type { StoredPoint } from "./storage";

/**
 * The geometry of a GPS trace, in two shapes: `routeSegments` for drawing it
 * on a real basemap (see src/lib/maptiler.ts) and `projectRoute` for the
 * basemap-less fallback, flattened into a square SVG viewBox.
 *
 * Both split the trace the same way, and that split is the point: this is
 * the literal outline of where the run went, the "your actual path, not a
 * stylized illustration" idea the user asked for ("se eu corri uma linha
 * reta, vai chegar uma linha reta") — which cuts both ways. Where GPS
 * tracking silently gapped, the line breaks there too instead of drawing a
 * straight line across ground that was never recorded.
 */

const METERS_PER_DEG_LAT = 111_320;

/** Index where each unbroken stretch of tracking begins — a new one starts at any gap over `GPS_GAP_THRESHOLD_SECONDS`. */
function stretchStarts(points: Pick<StoredPoint, "timestamp">[]): number[] {
  const starts = [0];
  for (let i = 1; i < points.length; i++) {
    if ((points[i].timestamp - points[i - 1].timestamp) / 1000 >= GPS_GAP_THRESHOLD_SECONDS) starts.push(i);
  }
  return starts;
}

/**
 * The trace in GeoJSON `[lon, lat]` order, one LineString's worth of
 * coordinates per unbroken stretch. A stretch holding a single fix is
 * dropped — there's no line to draw between one point and nothing.
 */
export function routeSegments(
  points: Pick<StoredPoint, "lat" | "lon" | "timestamp">[],
): [number, number][][] {
  const starts = stretchStarts(points);
  return starts
    .map((from, i) => points.slice(from, starts[i + 1] ?? points.length))
    .filter((stretch) => stretch.length >= 2)
    .map((stretch) => stretch.map((p): [number, number] => [p.lon, p.lat]));
}

export interface ProjectedRoute {
  /** SVG `points` attribute value, one per unbroken stretch of tracking — split at any gap over `GPS_GAP_THRESHOLD_SECONDS`. */
  polylines: string[];
  /** Same projection, one entry per input point (no gap-splitting) — lets a caller slice an arbitrary index range (e.g. the fastest stretch) and stay pixel-aligned with the base route. */
  projected: { x: number; y: number }[];
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

  const starts = stretchStarts(points);
  const polylines = starts
    .map((from, i) => projected.slice(from, starts[i + 1] ?? projected.length))
    .map((seg) => seg.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" "));

  return {
    polylines,
    projected,
    viewBoxSize,
    start: projected[0],
    end: projected[projected.length - 1],
  };
}

export interface FastestStretch {
  /** Indices into the same points array passed to `projectRoute`, inclusive — bounding the fastest contiguous window found. */
  startIndex: number;
  endIndex: number;
}

/**
 * The fastest contiguous stretch of roughly `windowMeters`, found the same
 * sliding-window way `bestSplitSeconds` finds a PR split (see
 * personalRecords.ts) — reused here to highlight where the run was actually
 * surging, not just to time it. Never lets the window straddle a tracking
 * gap: a "fastest stretch" spanning ground that was never recorded would be
 * the same honesty violation `projectRoute`'s gap-splitting exists to avoid.
 */
export function findFastestStretch(
  points: Pick<StoredPoint, "lat" | "lon" | "timestamp">[],
  windowMeters: number,
): FastestStretch | null {
  const n = points.length;
  if (n < 3 || windowMeters <= 0) return null;

  const breaks = [...stretchStarts(points), n];

  let best: FastestStretch | null = null;
  let bestDuration = Infinity;

  for (let s = 0; s < breaks.length - 1; s++) {
    const from = breaks[s];
    const segLength = breaks[s + 1] - from;
    if (segLength < 2) continue;

    const cum = new Array<number>(segLength).fill(0);
    for (let i = 1; i < segLength; i++) {
      cum[i] = cum[i - 1] + haversineMeters(points[from + i - 1], points[from + i]);
    }
    if (cum[segLength - 1] < windowMeters) continue;

    const t0 = points[from].timestamp;
    const elapsed = Array.from({ length: segLength }, (_, i) => (points[from + i].timestamp - t0) / 1000);

    let r = 0;
    for (let l = 0; l < segLength; l++) {
      if (r < l) r = l;
      while (r < segLength && cum[r] - cum[l] < windowMeters) r++;
      if (r >= segLength) break;

      const duration = elapsed[r] - elapsed[l];
      if (duration < bestDuration) {
        bestDuration = duration;
        best = { startIndex: from + l, endIndex: from + r };
      }
    }
  }

  return best;
}
