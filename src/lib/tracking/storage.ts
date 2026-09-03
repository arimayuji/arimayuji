/**
 * Minimal IndexedDB wrapper.
 *
 * Runs are buffered locally and flushed periodically during recording so a
 * reload/crash mid-run doesn't lose data, and nothing needs the network
 * while the athlete is out running.
 */

import type { GpsGap } from "./geoFilter";

export interface StoredPoint {
  lat: number;
  lon: number;
  timestamp: number;
}

/** A track logged as playing at some point during a run, added manually via the iTunes lookup. Optional — most runs have none. */
export interface RunTrack {
  name: string;
  artist: string;
  playedAt: number;
  /** Cover art URL from the iTunes lookup. */
  artworkUrl?: string;
}

/**
 * A stop during the run, with an optional reason — private detail, kept out
 * of `/compartilhar`'s share text and the illustrated share card on purpose.
 * Paused time is already excluded from `finishedAt - startedAt` upstream in
 * `useRunTracker`, so these entries are a log of *why*, not a correction to
 * any number: "parei pra beber água" without anyone comparing to a moving
 * pace that dipped to zero for two minutes.
 */
export interface PauseEvent {
  startedAt: number;
  endedAt: number;
  reason?: string;
}

/**
 * The meta the athlete configured before starting — not what actually
 * happened (`CompletedRun.distanceMeters`/`movingSeconds` are that).
 * Defined here (not in `useRunTracker.ts`, which imports it back) so
 * `CompletedRun` can reference it without an import cycle.
 */
export interface IntervalStep {
  phase: "work" | "rest";
  /** Meters — only on a "work" step, when the athlete chose distance-based reps. */
  distanceMeters?: number;
  /** Seconds — on every "rest" step, and on a "work" step when the athlete chose time-based reps. */
  durationSeconds?: number;
}

export interface RunGoal {
  distanceMeters?: number;
  durationSeconds?: number;
  /** A pace to hold, not a finish line — independent of the other two fields (a distance/duration goal is "get there by X"; this is "stay around this pace the whole time"). */
  targetPaceSecPerKm?: number;
  /**
   * A flattened, already-expanded work/rest sequence (work, rest, work,
   * rest, ..., work — never a trailing rest after the last rep) — built by
   * /run's "Intervalado" tab. Never combined with the three fields above:
   * an interval goal only ever sets this one.
   */
  intervalPlan?: IntervalStep[];
}

export interface CompletedRun {
  id: string;
  startedAt: number;
  finishedAt: number;
  distanceMeters: number;
  points: StoredPoint[];
  tracks?: RunTrack[];
  /**
   * Elapsed time with paused stretches subtracted out — what the runner
   * actually experiences as "how long did this take", matching the live
   * clock during tracking. Optional only because runs saved before this
   * field existed don't have it; use `runMovingSeconds()` below rather than
   * reading it directly so those old records still fall back sanely.
   */
  movingSeconds?: number;
  /**
   * Which shoe this run was logged under, by name. Still deliberately just a
   * string even though a `Shoe` catalog now exists: no foreign key, so
   * renaming or deleting a registered shoe never has to rewrite history, and
   * a shoe typed on /run that was never registered still counts. The
   * per-shoe mileage view stays a group-by over this field.
   */
  shoeName?: string;
  /** Every pause during this run, oldest first. Omitted entirely when there were none. */
  pauseEvents?: PauseEvent[];
  /**
   * Every stretch where GPS tracking silently stopped — screen locked, app
   * backgrounded — as opposed to a `PauseEvent`, which the runner triggered
   * on purpose. Already excluded from `movingSeconds` upstream in
   * `useRunTracker`, same as pauses; this is the record of *where*, so the
   * route map can break the line there instead of drawing a straight one
   * across ground that was never actually tracked. Omitted when there were
   * none.
   */
  gpsGaps?: GpsGap[];
  /**
   * Real terrain elevation gain in meters, from MapTiler's elevation API
   * (see src/lib/elevation.ts) — not the phone's own GPS altitude, which is
   * far too noisy to sum into a meaningful gain figure without a barometer.
   * Computed lazily and cached here the first time a run's detail screen is
   * opened, rather than on every save, since it costs a network round trip.
   * Undefined means "not computed yet", not "zero gain".
   */
  elevationGainMeters?: number;
  /**
   * Standard distances (in meters, matching `STANDARD_DISTANCES`) whose
   * achievement box has already been opened. Purely so revisiting an old run
   * doesn't replay the unboxing every single time — the achievement, its tier
   * and its artwork are all derived from the run itself, so losing this list
   * costs nothing but one extra animation. Undefined means "none opened yet".
   */
  openedRecordMeters?: number[];
  /**
   * Rate of perceived exertion, 1-10 (Borg CR10), self-reported right after
   * finishing. The one intensity signal GPS pace can't give on its own —
   * pace alone can't tell an easy day on a cool flat road from a genuinely
   * hard one fighting heat, hills or wind, so this is what session-RPE
   * training load (`rpe × minutes`, Foster's method) is computed from.
   * Undefined means "not reported", not "zero effort".
   */
  rpe?: number;
  /**
   * Where this run happened, typed in by hand — only ever asked for when
   * `matchPlaceForRoute` (placeMatch.ts) can't already resolve one from the
   * catalog (a run through several neighborhoods, or a park not seeded yet).
   * Product decision: reverse-geocoding it automatically was ruled out (an
   * extra paid/quota-limited API call per run) — the athlete just names it.
   * Never set for a run that already matches the catalog; see
   * `resolvePlaceLabel` for how the two sources combine into one label.
   */
  placeName?: string;
  /**
   * Which catalog place this run was already counted towards in the places
   * leaderboard, if any. `recordRunAtPlace` accumulates into a per-place
   * aggregate row — there is no per-run record on the server saying "this
   * one was already added" — so without a local marker the same run could
   * be counted twice by simply being confirmed on two screens. This is
   * that marker, and it is what let the confirmation move off the
   * just-finished screen: any surface can now offer it, and none can
   * double-count.
   */
  countedAtPlaceId?: string;
  /**
   * The goal configured before this run started — used to reconstruct the
   * right "repetir corrida" goal type/values on `/run` (see `goalTypeFromRunGoal`
   * there). Omitted for a "livre" run with no goal set, and for any run saved
   * before this field existed — "repetir" falls back to distance-only for those.
   */
  goal?: RunGoal;
}

/**
 * The registered shoes the athlete owns. Separate from `CompletedRun.shoeName`
 * on purpose: a run keeps carrying the shoe's name as a plain string, matched
 * against this catalog by name where needed, so registering, renaming or
 * deleting a shoe never has to rewrite run history.
 */
export interface Shoe {
  id: string;
  brand: string;
  name: string;
  /** Hex color, e.g. "#2f6fed" — feeds a separate not-yet-built 3D tint feature. */
  color: string;
  /** Data URL (not an object URL — this must survive a reload), personal reference only. */
  photoDataUrl?: string;
  createdAt: number;
}

/**
 * How the athlete says they're feeling. `"recuperado"` isn't a level of pain
 * — it's the explicit "the thing I reported before is gone now" signal, kept
 * in the same severity field instead of a separate boolean so the store is
 * just an append-only log and "current state" is always just "the latest
 * entry", never two fields that can disagree.
 */
export type PainSeverity = "leve" | "moderada" | "forte";

export interface PainCheckIn {
  id: string;
  reportedAt: number;
  severity: PainSeverity | "recuperado";
  /** Free text, e.g. "joelho direito" — personal reference only, never matched against anything. */
  region?: string;
}

const DB_NAME = "xanthus";
const DB_VERSION = 5;
const ACTIVE_STORE = "activeRun";
const RUNS_STORE = "runs";
const SHOES_STORE = "shoes";
const PAIN_STORE = "painCheckIns";
const EMBLEMS_STORE = "emblemsOpened";
const ACTIVE_KEY = "current";

/** The three lifetime ladders collectibles are tracked against — see emblems.ts (distância) and collectibles.ts (elevação, tempo). */
export type EmblemCategory = "distancia" | "elevacao" | "tempo";

function newShoeId(): string {
  return `shoe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function newCheckInId(): string {
  return `pain_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ACTIVE_STORE)) {
        db.createObjectStore(ACTIVE_STORE);
      }
      if (!db.objectStoreNames.contains(RUNS_STORE)) {
        db.createObjectStore(RUNS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SHOES_STORE)) {
        db.createObjectStore(SHOES_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PAIN_STORE)) {
        db.createObjectStore(PAIN_STORE, { keyPath: "id" });
      }
      // v4 kept one emblem ladder (distância only), keyed by its raw km
      // number. Two more ladders (elevação, tempo) now share this store, and
      // their milestone values can collide with a km value (e.g. 500 hours
      // vs 500 km), so the key has to carry the category too. Dropping and
      // recreating the store loses previously-opened flags — the one
      // one-time cost is a distance emblem the athlete already saw briefly
      // replaying its open animation, not any real data.
      if (db.objectStoreNames.contains(EMBLEMS_STORE)) {
        db.deleteObjectStore(EMBLEMS_STORE);
      }
      db.createObjectStore(EMBLEMS_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export interface ActiveRunSnapshot {
  id: string;
  startedAt: number;
  distanceMeters: number;
  points: StoredPoint[];
}

export async function saveActiveRun(snapshot: ActiveRunSnapshot): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await withStore(ACTIVE_STORE, "readwrite", (store) => store.put(snapshot, ACTIVE_KEY));
}

export async function loadActiveRun(): Promise<ActiveRunSnapshot | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  return withStore(ACTIVE_STORE, "readonly", (store) => store.get(ACTIVE_KEY));
}

export async function clearActiveRun(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await withStore(ACTIVE_STORE, "readwrite", (store) => store.delete(ACTIVE_KEY));
}

export async function saveCompletedRun(run: CompletedRun): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await withStore(RUNS_STORE, "readwrite", (store) => store.put(run));
}

/** Moving (paused-excluded) duration in seconds — falls back to wall-clock elapsed for runs saved before `movingSeconds` existed. */
export function runMovingSeconds(run: CompletedRun): number {
  if (run.movingSeconds !== undefined) return run.movingSeconds;
  return Math.max(0, Math.round((run.finishedAt - run.startedAt) / 1000));
}

export async function listCompletedRuns(): Promise<CompletedRun[]> {
  if (typeof indexedDB === "undefined") return [];
  return withStore(RUNS_STORE, "readonly", (store) => store.getAll());
}

/** Undefined both when the id doesn't exist and when storage is unavailable — the detail screen treats those the same ("not found"). */
export async function getCompletedRun(id: string): Promise<CompletedRun | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  return withStore<CompletedRun | undefined>(RUNS_STORE, "readonly", (store) => store.get(id));
}

/**
 * Drops a run that was just recorded but shouldn't count — a test, a false
 * start, whatever. `finish()` already writes the record immediately (so a
 * crash right after finishing can't lose it); this is the explicit undo for
 * "actually, don't keep that one", not a toggle on whether saving happens.
 */
export async function deleteCompletedRun(id: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await withStore(RUNS_STORE, "readwrite", (store) => store.delete(id));
}

/**
 * Persists a new set of tracks onto an already-saved run — used by the
 * finished-run screen to add manually-entered tracks after `finish()` has
 * already written the record without any. No-ops if the run can't be
 * found, which shouldn't normally happen.
 */
export async function updateRunTracks(runId: string, tracks: RunTrack[]): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const run = await withStore<CompletedRun | undefined>(RUNS_STORE, "readonly", (store) =>
    store.get(runId),
  );
  if (!run) return;
  run.tracks = tracks;
  await withStore(RUNS_STORE, "readwrite", (store) => store.put(run));
}

/** Marks a run as already counted towards a place's leaderboard — see `CompletedRun.countedAtPlaceId`. */
export async function markRunCountedAtPlace(runId: string, placeId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const run = await withStore<CompletedRun | undefined>(RUNS_STORE, "readonly", (store) =>
    store.get(runId),
  );
  if (!run) return;
  run.countedAtPlaceId = placeId;
  await withStore(RUNS_STORE, "readwrite", (store) => store.put(run));
}

/** Caches a lazily-computed elevation gain onto an already-saved run — see `CompletedRun.elevationGainMeters`. */
export async function updateRunElevationGain(runId: string, elevationGainMeters: number): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const run = await withStore<CompletedRun | undefined>(RUNS_STORE, "readonly", (store) =>
    store.get(runId),
  );
  if (!run) return;
  run.elevationGainMeters = elevationGainMeters;
  await withStore(RUNS_STORE, "readwrite", (store) => store.put(run));
}

/** Records the athlete's own effort rating for an already-saved run — see `CompletedRun.rpe`. */
export async function updateRunRpe(runId: string, rpe: number): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const run = await withStore<CompletedRun | undefined>(RUNS_STORE, "readonly", (store) =>
    store.get(runId),
  );
  if (!run) return;
  run.rpe = rpe;
  await withStore(RUNS_STORE, "readwrite", (store) => store.put(run));
}

/** Records the athlete's own typed-in place name for an already-saved run — see `CompletedRun.placeName`. An empty/whitespace-only name clears it (stored as `undefined`, not an empty string) rather than leaving a blank label around. */
export async function updateRunPlaceName(runId: string, placeName: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const run = await withStore<CompletedRun | undefined>(RUNS_STORE, "readonly", (store) =>
    store.get(runId),
  );
  if (!run) return;
  const trimmed = placeName.trim();
  if (trimmed) run.placeName = trimmed;
  else delete run.placeName;
  await withStore(RUNS_STORE, "readwrite", (store) => store.put(run));
}

/** Records that this run's achievement at `targetMeters` has been unboxed — see `CompletedRun.openedRecordMeters`. */
export async function markRecordOpened(runId: string, targetMeters: number): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const run = await withStore<CompletedRun | undefined>(RUNS_STORE, "readonly", (store) =>
    store.get(runId),
  );
  if (!run) return;
  const opened = run.openedRecordMeters ?? [];
  if (opened.includes(targetMeters)) return;
  run.openedRecordMeters = [...opened, targetMeters];
  await withStore(RUNS_STORE, "readwrite", (store) => store.put(run));
}

interface OpenedEmblemRow {
  id: string;
  category: EmblemCategory;
  value: number;
  openedAt: number;
}

const emblemRowId = (category: EmblemCategory, value: number): string => `${category}:${value}`;

/**
 * A milestone emblem's own store — not a field on `CompletedRun` like
 * `openedRecordMeters` is, since a lifetime milestone isn't tied to any one
 * run and has to stay readable even after the run that crossed it is later
 * deleted (a discarded test run, an accidental double-save).
 */
export async function markEmblemOpened(category: EmblemCategory, value: number): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const row: OpenedEmblemRow = { id: emblemRowId(category, value), category, value, openedAt: Date.now() };
  await withStore(EMBLEMS_STORE, "readwrite", (store) => store.put(row));
}

/** Every milestone the athlete has already tapped open, across all three ladders — see `markEmblemOpened`. */
export async function listOpenedEmblems(): Promise<Pick<OpenedEmblemRow, "category" | "value">[]> {
  if (typeof indexedDB === "undefined") return [];
  const rows = await withStore<OpenedEmblemRow[]>(EMBLEMS_STORE, "readonly", (store) => store.getAll());
  return rows.map((row) => ({ category: row.category, value: row.value }));
}

export async function createShoe(shoe: Omit<Shoe, "id" | "createdAt">): Promise<Shoe> {
  const record: Shoe = { ...shoe, id: newShoeId(), createdAt: Date.now() };
  if (typeof indexedDB === "undefined") return record;
  await withStore(SHOES_STORE, "readwrite", (store) => store.put(record));
  return record;
}

export async function updateShoe(shoe: Shoe): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await withStore(SHOES_STORE, "readwrite", (store) => store.put(shoe));
}

export async function deleteShoe(id: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await withStore(SHOES_STORE, "readwrite", (store) => store.delete(id));
}

/** Registered shoes, oldest first — the order they were added in. */
export async function listShoes(): Promise<Shoe[]> {
  if (typeof indexedDB === "undefined") return [];
  const shoes = await withStore<Shoe[]>(SHOES_STORE, "readonly", (store) => store.getAll());
  return shoes.sort((a, b) => a.createdAt - b.createdAt);
}

export interface ShoeSummary {
  name: string;
  totalMeters: number;
  runCount: number;
  lastUsedAt: number;
}

/** Distinct shoe names used across `runs`, each with total distance — sorted heaviest-used first. */
export function summarizeShoes(runs: CompletedRun[]): ShoeSummary[] {
  const byName = new Map<string, ShoeSummary>();
  for (const run of runs) {
    if (!run.shoeName) continue;
    const existing = byName.get(run.shoeName);
    if (existing) {
      existing.totalMeters += run.distanceMeters;
      existing.runCount += 1;
      existing.lastUsedAt = Math.max(existing.lastUsedAt, run.startedAt);
    } else {
      byName.set(run.shoeName, {
        name: run.shoeName,
        totalMeters: run.distanceMeters,
        runCount: 1,
        lastUsedAt: run.startedAt,
      });
    }
  }
  return [...byName.values()].sort((a, b) => b.totalMeters - a.totalMeters);
}

/** Logs how the athlete says they're feeling — an append-only entry, never edited or deleted. */
export async function reportPain(entry: {
  severity: PainSeverity | "recuperado";
  region?: string;
}): Promise<PainCheckIn> {
  const record: PainCheckIn = { ...entry, id: newCheckInId(), reportedAt: Date.now() };
  if (typeof indexedDB === "undefined") return record;
  await withStore(PAIN_STORE, "readwrite", (store) => store.put(record));
  return record;
}

/** Every check-in ever logged, newest first — callers derive "current state" from just the first entry. */
export async function listPainCheckIns(): Promise<PainCheckIn[]> {
  if (typeof indexedDB === "undefined") return [];
  const checkIns = await withStore<PainCheckIn[]>(PAIN_STORE, "readonly", (store) =>
    store.getAll(),
  );
  return checkIns.sort((a, b) => b.reportedAt - a.reportedAt);
}

/**
 * Average weekly distance (km) over the last `weeks` weeks of real runs —
 * the plan engine's starting point for a volume ramp. Never asked as a
 * manual input: it's derived from what actually happened, so it can't drift
 * from reality the way a typed-in guess would. Returns 0 when there isn't
 * enough recent history, which the caller treats as "not enough data for a
 * real plan yet".
 */
export function estimateWeeklyKm(runs: readonly CompletedRun[], weeks = 3, now = Date.now()): number {
  const windowStart = now - weeks * 7 * 24 * 60 * 60 * 1000;
  const metersInWindow = runs
    .filter((run) => run.startedAt >= windowStart)
    .reduce((sum, run) => sum + run.distanceMeters, 0);
  return metersInWindow / 1000 / weeks;
}
