/**
 * Pure GPS-to-place matching for the "ranking de lugares" leaderboard —
 * no Appwrite, no React, just geometry, so it's cheap to call once right
 * after a run finishes and again, in a loop, when scanning old history.
 *
 * `RunningPlace` (src/lib/places.ts) has no canonical center+radius — the
 * only geographic data any place carries is `circuits`, optional OSM-traced
 * polylines, present on only some of the (currently 6) seeded places. A
 * place with no `circuits` simply can't be matched in this version; that's
 * an accepted v1 gap, not a bug — most runs won't match anything yet, and
 * that's expected until the catalog grows.
 */
import { haversineMeters, type LatLon } from "./tracking/geoFilter";
import { RUNNING_PLACES, type RunningPlace } from "./places";

/** A route point within this of any point on a place's mapped circuit counts as "at that place" — loose enough to forgive GPS drift, tight enough that two parks a few blocks apart don't both match. Checked against the circuit's own polyline, not a single centroid: a big loop like Ibirapuera's 5.4km circuit can easily span more than this radius end to end, so a centroid-only check would miss a run on the far side of the loop from its middle. */
const MATCH_RADIUS_METERS = 150;

/** Every ~5th point is plenty to detect "was this route ever near this circuit" — a run logs roughly one fix/second, far denser than place-matching needs, and this keeps the point-to-point comparison below cheap even against a long, GPS-point-heavy circuit. */
const SAMPLE_STRIDE = 5;

function sample<T>(items: T[], stride: number): T[] {
  return items.filter((_, i) => i % stride === 0);
}

/**
 * The first `RunningPlace` any point of `routePoints` falls within
 * `MATCH_RADIUS_METERS` of any point of any of its `circuits`, or `null` if
 * none do. Places without `circuits` never match — see this file's header
 * comment. Deliberately "first match wins" rather than "closest of all
 * matches" — with only a handful of seeded places today, two ever matching
 * the same run isn't a real scenario worth scoring every candidate for.
 */
export function matchPlaceForRoute(routePoints: LatLon[]): RunningPlace | null {
  if (routePoints.length === 0) return null;
  const route = sample(routePoints, SAMPLE_STRIDE);
  for (const place of RUNNING_PLACES) {
    const circuitPoints = sample(place.circuits?.flatMap((circuit) => circuit.points) ?? [], SAMPLE_STRIDE);
    if (circuitPoints.length === 0) continue;
    const isNearby = route.some((point) =>
      circuitPoints.some((circuitPoint) => haversineMeters(point, circuitPoint) <= MATCH_RADIUS_METERS),
    );
    if (isNearby) return place;
  }
  return null;
}
