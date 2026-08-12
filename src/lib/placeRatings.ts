/**
 * Live community layer on top of the curated seed list in `src/lib/places.ts`.
 * Every rating is a real Appwrite row, written by a signed-in account — there
 * is no anonymous rating, matching the "nível de identidade" decision for the
 * whole app. One row per (place, person): a second submission overwrites the
 * first rather than piling up duplicates, via a deterministic row ID.
 */
import { ID, type Models, Permission, Query, Role } from "appwrite";
import { APPWRITE_DATABASE_ID, TABLES, getAppwrite } from "./appwrite";
import type { PlaceCriteria } from "./places";

export type Visibility = "public" | "friends" | "private";
export type CriteriaKey = keyof PlaceCriteria;

export const CRITERIA_KEYS: CriteriaKey[] = ["seguranca", "percurso", "estrutura", "iluminacao", "fluxo"];

export interface PlaceRating extends Models.Row {
  placeId: string;
  userId: string;
  seguranca: number;
  percurso: number;
  estrutura: number;
  iluminacao: number;
  fluxo: number;
  note?: string;
  visibility: Visibility;
}

function ratingRowId(placeId: string, userId: string): string {
  return `${placeId}_${userId}`;
}

/**
 * Every rating currently visible to the caller for a place. Row-level
 * permissions (set in `submitRating`) already restrict this to public rows
 * plus the caller's own — no extra filtering needed here.
 */
export async function getRatingsForPlace(placeId: string): Promise<PlaceRating[]> {
  const appwrite = getAppwrite();
  if (!appwrite) return [];
  const result = await appwrite.tablesDB.listRows<PlaceRating>({
    databaseId: APPWRITE_DATABASE_ID,
    tableId: TABLES.placeRatings,
    queries: [Query.equal("placeId", placeId), Query.orderDesc("$createdAt"), Query.limit(50)],
  });
  return result.rows;
}

export async function getMyRating(placeId: string, userId: string): Promise<PlaceRating | null> {
  const appwrite = getAppwrite();
  if (!appwrite) return null;
  try {
    return await appwrite.tablesDB.getRow<PlaceRating>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.placeRatings,
      rowId: ratingRowId(placeId, userId),
    });
  } catch {
    return null;
  }
}

export interface RatingInput {
  seguranca: number;
  percurso: number;
  estrutura: number;
  iluminacao: number;
  fluxo: number;
  note: string;
  visibility: Visibility;
}

/**
 * Upsert by deterministic row ID. `visibility: "friends"` reads as
 * `"private"` for now — the Appwrite Team that would grant a friend read
 * access doesn't exist yet, so promising a friends-only row would be a lie
 * about who can actually see it. Only `"public"` grants `Role.any()`.
 */
export async function submitRating(placeId: string, userId: string, input: RatingInput): Promise<PlaceRating> {
  const appwrite = getAppwrite();
  if (!appwrite) throw new Error("Appwrite não configurado");
  const rowId = ratingRowId(placeId, userId);
  const data = { placeId, userId, ...input };
  const permissions = [
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
    ...(input.visibility === "public" ? [Permission.read(Role.any())] : [Permission.read(Role.user(userId))]),
  ];
  try {
    return await appwrite.tablesDB.updateRow<PlaceRating>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.placeRatings,
      rowId,
      data,
      permissions,
    });
  } catch {
    return await appwrite.tablesDB.createRow<PlaceRating>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.placeRatings,
      rowId,
      data,
      permissions,
    });
  }
}

export type CriteriaAverages = Record<CriteriaKey, { average: number; count: number }>;

/** Null when nobody has rated yet — callers should fall back to the curated score, not show a zero. */
export function averageRatings(ratings: PlaceRating[]): CriteriaAverages | null {
  if (ratings.length === 0) return null;
  const averages = {} as CriteriaAverages;
  for (const key of CRITERIA_KEYS) {
    const sum = ratings.reduce((total, rating) => total + rating[key], 0);
    averages[key] = { average: sum / ratings.length, count: ratings.length };
  }
  return averages;
}

export { ID };
