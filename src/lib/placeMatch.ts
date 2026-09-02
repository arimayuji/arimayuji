/**
 * Pure GPS-to-place matching for the "ranking de lugares" leaderboard —
 * no Appwrite, no React, just geometry, so it's cheap to call once right
 * after a run finishes and again, in a loop, when scanning old history.
 *
 * **This matches an area, not a path.** The first version asked whether the
 * route ever came within 150 m of a place's traced `circuits` polyline,
 * which turned out to be false rigor: Ibirapuera's traced circuits are the
 * Volta do Lago and the Volta da Grade, but the park's own description
 * names a third route (the Pista de Cooper) that nobody traced, and the
 * park is far wider than 150 m either side of two lines. Someone who ran
 * 12 km inside Ibirapuera without following one of the two mapped loops
 * simply never matched — a real report, not a hypothetical. Asking "was
 * this run at this place" is the actual question; "did it follow this
 * exact path" never was.
 *
 * A place's area comes from its explicit `area` when set, otherwise from
 * the extent of its own `circuits`. Places with neither can't match, which
 * is now a cheap gap to close (a centre point and a radius per place)
 * rather than an expensive one (tracing a path per place).
 */
import { haversineMeters, type LatLon } from "./tracking/geoFilter";
import { RUNNING_PLACES, type RunningPlace } from "./places";

/**
 * Slack added around a circuit's own extent when deriving a place's area
 * from it. A traced loop is one route through a park, never its boundary,
 * so the park always reaches further than the line does — this is what
 * covers the paths nobody traced.
 */
const CIRCUIT_AREA_PADDING_METERS = 250;

/**
 * How much of a run has to fall inside a place's area to count as being
 * there. A share, not "any point ever" — that would credit a place to
 * anyone who merely ran past it on the way somewhere else, which is the
 * opposite failure of the one this file used to have. Half is deliberately
 * forgiving: running from home to a park, looping it, and running back
 * still counts as a run at the park.
 */
const MIN_INSIDE_SHARE = 0.5;

/** Every ~5th point is plenty — a run logs roughly one fix/second, far denser than place-matching needs. */
const SAMPLE_STRIDE = 5;

function sample<T>(items: T[], stride: number): T[] {
  return items.filter((_, i) => i % stride === 0);
}

export interface PlaceArea {
  lat: number;
  lon: number;
  radiusMeters: number;
}

/**
 * Where a place is and how far it reaches — explicit `area` first, then
 * derived from `circuits` (their centroid, plus the distance to the
 * furthest traced point, plus padding), then `null` for a place carrying
 * neither, which can never match.
 */
export function placeArea(place: RunningPlace): PlaceArea | null {
  if (place.area) return place.area;

  const points = place.circuits?.flatMap((circuit) => circuit.points) ?? [];
  if (points.length === 0) return null;

  const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const lon = points.reduce((sum, p) => sum + p.lon, 0) / points.length;
  const reach = points.reduce((max, p) => Math.max(max, haversineMeters({ lat, lon }, p)), 0);
  return { lat, lon, radiusMeters: reach + CIRCUIT_AREA_PADDING_METERS };
}

/** Share of `route`'s points that fall inside `area`, 0..1. */
function insideShare(route: LatLon[], area: PlaceArea): number {
  if (route.length === 0) return 0;
  const inside = route.filter((point) => haversineMeters(point, area) <= area.radiusMeters).length;
  return inside / route.length;
}

/**
 * Two shares this close are the same answer as far as "where was this run"
 * goes, so the tie-break below decides instead of a rounding difference.
 */
const SHARE_EPSILON = 0.05;

/**
 * The place `routePoints` best belongs to, or `null` when none holds at
 * least `MIN_INSIDE_SHARE` of it.
 *
 * Best match, not first match: areas are circles, so two nearby places can
 * genuinely both contain a run — and with a padded radius that is far more
 * likely than under the old 150 m-from-the-line rule. Four such overlaps
 * exist in the current catalog.
 *
 * **The tie-break is the smaller area, and it is load-bearing.** A circle
 * is a poor fit for a linear route: Marginal Pinheiros runs for kilometres,
 * so the circle derived from it is enormous and swallows Parque Burle Marx
 * whole. A run entirely inside Burle Marx therefore scores 1.0 against
 * *both*, and picking by share alone credited the Marginal — the bigger,
 * vaguer place — which is wrong twice over: it is the less specific answer
 * and it is not where the person ran. Preferring the tighter area encodes
 * "the more specific place wins", which is the honest reading whenever one
 * place sits inside another. Verified against the real catalog geometry,
 * not assumed: this exact case failed before the tie-break existed.
 */
export function matchPlaceForRoute(routePoints: LatLon[]): RunningPlace | null {
  if (routePoints.length === 0) return null;
  const route = sample(routePoints, SAMPLE_STRIDE);

  let best: RunningPlace | null = null;
  let bestShare = 0;
  let bestRadius = Infinity;
  for (const place of RUNNING_PLACES) {
    const area = placeArea(place);
    if (!area) continue;
    const share = insideShare(route, area);
    if (share < MIN_INSIDE_SHARE) continue;

    const clearlyBetter = share > bestShare + SHARE_EPSILON;
    const tiedButTighter = Math.abs(share - bestShare) <= SHARE_EPSILON && area.radiusMeters < bestRadius;
    if (clearlyBetter || tiedButTighter) {
      best = place;
      bestShare = share;
      bestRadius = area.radiusMeters;
    }
  }
  return best;
}

/**
 * The one label to show/search for "where did this run happen" — the
 * athlete's own typed-in name (`CompletedRun.placeName`, only ever set when
 * the catalog didn't already match) if there is one, otherwise a live
 * catalog match, otherwise nothing. Never both: a run that already matches
 * the catalog never gets asked for a manual name in the first place (see
 * `CompletedRun.placeName`'s own comment).
 */
export function resolvePlaceLabel(run: { points: LatLon[]; placeName?: string }): string | null {
  return run.placeName?.trim() || matchPlaceForRoute(run.points)?.name || null;
}
