/**
 * A route the athlete drew by hand on a map (click to add a point, no
 * street-snapping — this project already ruled out paying for a routing
 * backend like OSRM/Valhalla, see the GPS-precision research in
 * PROJECT-CONTEXT.md), saved so it can be looked at again or sent to a
 * specific friend.
 *
 * Creating a route is a plain client write — the row only ever grants its
 * own creator read/update/delete at creation time, a permission every
 * signed-in session already holds over itself. This is architecturally
 * identical to `placeRatings.ts`'s `submitRating`, which does the exact
 * same thing live in production with no Function in the path. Sharing
 * with a friend is different: it grants `Permission.read` to someone who
 * is NOT the caller, which Appwrite's client SDK refuses outright — that
 * one write goes through `client-actions`'s `share-custom-route` action
 * instead (same root cause already fixed for `friendships.ts`,
 * `liveRuns.ts`, and `runsSync.ts`'s `shareRunWithCoaches`).
 *
 * Same degrade-to-empty/false convention as the rest of the backend layer.
 */
import { ExecutionMethod, ID, type Models, Permission, Query, Role } from "appwrite";
import { APPWRITE_DATABASE_ID, CLIENT_ACTIONS_FUNCTION_ID, TABLES, getAppwrite } from "./appwrite";
import { getCurrentAccount } from "./auth";
import { haversineMeters, type LatLon } from "./tracking/geoFilter";
import type { StoredPoint } from "./tracking/storage";

export interface CustomRoute extends Models.Row {
  ownerId: string;
  name: string;
  /** JSON-encoded StoredPoint[] — see parseCustomRoutePoints. */
  points: string;
  distanceMeters: number;
}

/** Sum of haversine legs over a clicked/drawn route — the single source of truth for both the live readout while drawing and the `distanceMeters` saved with the route. */
export function routeDistanceMeters(points: LatLon[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

/** Never trust a stored string is still valid JSON of the right shape — degrades to an empty route rather than failing the whole screen. */
export function parseCustomRoutePoints(route: CustomRoute): StoredPoint[] {
  try {
    const parsed = JSON.parse(route.points) as unknown;
    return Array.isArray(parsed) ? (parsed as StoredPoint[]) : [];
  } catch {
    return [];
  }
}

/**
 * Friend ids currently granted read on this route, derived from
 * `$permissions` rather than a separate stored list — same technique
 * `client-actions`'s `hasCoachPermission` already uses server-side to know
 * whether a coach can read a run, just read here client-side off a row the
 * caller already has.
 */
export function sharedFriendIds(route: CustomRoute): string[] {
  return (route.$permissions ?? [])
    .map((permission) => /^read\("user:([^"]+)"\)$/.exec(permission)?.[1])
    .filter((id): id is string => typeof id === "string" && id !== route.ownerId);
}

/**
 * Plain client write — see this file's own comment for why route creation
 * never needs `client-actions`. Synthesizes monotonically-increasing fake
 * timestamps (there's no real GPS clock for a hand-drawn route) so the
 * saved row free-rides on every helper that already expects
 * `StoredPoint[]` (`projectRoute`, the existing `RouteMap`, etc).
 */
export async function createCustomRoute(name: string, points: LatLon[]): Promise<CustomRoute | null> {
  const appwrite = getAppwrite();
  if (!appwrite) return null;
  const account = await appwrite.account.get();
  const ownerId = account.$id;
  const startMs = Date.now();
  const storedPoints: StoredPoint[] = points.map((point, index) => ({
    lat: point.lat,
    lon: point.lon,
    timestamp: startMs + index * 1000,
  }));
  try {
    return await appwrite.tablesDB.createRow<CustomRoute>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.customRoutes,
      rowId: ID.unique(),
      data: {
        ownerId,
        name,
        points: JSON.stringify(storedPoints),
        distanceMeters: routeDistanceMeters(points),
      },
      permissions: [
        Permission.read(Role.user(ownerId)),
        Permission.update(Role.user(ownerId)),
        Permission.delete(Role.user(ownerId)),
      ],
    });
  } catch {
    return null;
  }
}

export async function listMyCustomRoutes(): Promise<CustomRoute[]> {
  const appwrite = getAppwrite();
  if (!appwrite) return [];
  const account = await getCurrentAccount();
  if (!account) return [];
  try {
    const result = await appwrite.tablesDB.listRows<CustomRoute>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.customRoutes,
      queries: [Query.equal("ownerId", account.id), Query.orderDesc("$createdAt"), Query.limit(100)],
    });
    return result.rows;
  } catch {
    return [];
  }
}

/** Routes readable but not owned by the caller — `rowSecurity` already limits `listRows` to rows the caller can read (own + shared with them), so excluding "own" here is enough to leave only what friends shared. */
export async function listRoutesSharedWithMe(): Promise<CustomRoute[]> {
  const appwrite = getAppwrite();
  if (!appwrite) return [];
  const account = await getCurrentAccount();
  if (!account) return [];
  try {
    const result = await appwrite.tablesDB.listRows<CustomRoute>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.customRoutes,
      queries: [Query.notEqual("ownerId", account.id), Query.orderDesc("$createdAt"), Query.limit(100)],
    });
    return result.rows;
  } catch {
    return [];
  }
}

export async function getCustomRoute(id: string): Promise<CustomRoute | null> {
  const appwrite = getAppwrite();
  if (!appwrite) return null;
  try {
    return await appwrite.tablesDB.getRow<CustomRoute>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.customRoutes,
      rowId: id,
    });
  } catch {
    return null;
  }
}

/** Only the owner actually holds `delete` on the row (granted at creation) — a friend calling this on a route shared with them simply fails silently, same convention as `deletePlanOverride`. */
export async function deleteCustomRoute(id: string): Promise<boolean> {
  const appwrite = getAppwrite();
  if (!appwrite) return false;
  try {
    await appwrite.tablesDB.deleteRow({ databaseId: APPWRITE_DATABASE_ID, tableId: TABLES.customRoutes, rowId: id });
    return true;
  } catch {
    return false;
  }
}

export type ShareCustomRouteResult = { ok: true } | { ok: false; reason: "unavailable" | "forbidden" | "failed" };

/** Sends the FULL desired set of friend ids who should see this route — the Function replaces the friend-read grants wholesale rather than only adding, so an unchecked friend loses access here too. */
export async function shareCustomRoute(routeId: string, friendIds: string[]): Promise<ShareCustomRouteResult> {
  const appwrite = getAppwrite();
  if (!appwrite) return { ok: false, reason: "unavailable" };
  try {
    const execution = await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ action: "share-custom-route", routeId, friendIds }),
    });
    const body = JSON.parse(execution.responseBody || "{}") as { ok?: boolean; error?: string };
    if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300 || !body.ok) {
      return { ok: false, reason: body.error === "forbidden" ? "forbidden" : "failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
