/**
 * "Calendário de corridas de rua" — read-only client for the `city_races`
 * table, refreshed weekly by the sync-city-races scheduled action inside
 * client-actions (see that Function's own comment for the two sources:
 * the Corrida Perfeita API nationwide, the FPA API for São Paulo state).
 *
 * Public data, so this reads the table directly (`Role.any()` read
 * permission) — no Function round trip needed, same as the static
 * `RunningPlace` catalog in places.ts, just live instead of hand-seeded.
 */
import { Query, type Models } from "appwrite";
import { APPWRITE_DATABASE_ID, TABLES, getAppwrite } from "./appwrite";

export type CityRaceSource = "corrida_perfeita" | "fpa";

export interface CityRace extends Models.Row {
  name: string;
  date: string;
  endDate: string | null;
  city: string;
  state: string;
  distancesKm: number[];
  registrationUrl: string | null;
  source: CityRaceSource;
}

export interface CityRaceFilters {
  /** UF, e.g. "SP" — omit for every state. */
  state?: string;
  /** Case-sensitive exact match against the stored city name (the sources rarely agree on accents/casing, so this is best-effort, not a search). */
  city?: string;
  limit?: number;
}

/**
 * Every race from today onward, soonest first. Filtering by name/city text
 * beyond the exact `city` match is left to the caller (client-side, same
 * as /historico's search) — the dataset is small enough (low thousands at
 * most) that a second round trip per keystroke isn't worth it.
 */
export async function listUpcomingCityRaces(filters: CityRaceFilters = {}): Promise<CityRace[]> {
  const appwrite = getAppwrite();
  if (!appwrite) return [];

  const queries = [
    Query.greaterThanEqual("date", new Date().toISOString()),
    Query.orderAsc("date"),
    Query.limit(filters.limit ?? 500),
  ];
  if (filters.state) queries.push(Query.equal("state", filters.state));
  if (filters.city) queries.push(Query.equal("city", filters.city));

  try {
    const result = await appwrite.tablesDB.listRows<CityRace>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.cityRaces,
      queries,
    });
    return result.rows;
  } catch {
    return [];
  }
}
