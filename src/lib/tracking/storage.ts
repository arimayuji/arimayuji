/**
 * Minimal IndexedDB wrapper.
 *
 * Runs are buffered locally and flushed periodically during recording so a
 * reload/crash mid-run doesn't lose data, and nothing needs the network
 * while the athlete is out running.
 */

export interface StoredPoint {
  lat: number;
  lon: number;
  timestamp: number;
}

/** A track that was playing (on Spotify or otherwise) at some point during a run. Optional — most runs have none. */
export interface RunTrack {
  name: string;
  artist: string;
  playedAt: number;
  /** Spotify track URI (`spotify:track:XXXXX`), when known — lets the run's tracks become a real playlist. */
  uri?: string;
  /** Cover art URL, from either Spotify's API or the iTunes lookup fallback — either source, display treats it the same. */
  artworkUrl?: string;
}

export interface CompletedRun {
  id: string;
  startedAt: number;
  finishedAt: number;
  distanceMeters: number;
  points: StoredPoint[];
  tracks?: RunTrack[];
  /**
   * Which shoe this run was logged under, by name. Still deliberately just a
   * string even though a `Shoe` catalog now exists: no foreign key, so
   * renaming or deleting a registered shoe never has to rewrite history, and
   * a shoe typed on /run that was never registered still counts. The
   * per-shoe mileage view stays a group-by over this field.
   */
  shoeName?: string;
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

const DB_NAME = "xanthus";
const DB_VERSION = 2;
const ACTIVE_STORE = "activeRun";
const RUNS_STORE = "runs";
const SHOES_STORE = "shoes";
const ACTIVE_KEY = "current";

function newShoeId(): string {
  return `shoe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

export async function listCompletedRuns(): Promise<CompletedRun[]> {
  if (typeof indexedDB === "undefined") return [];
  return withStore(RUNS_STORE, "readonly", (store) => store.getAll());
}

/**
 * Persists a new set of tracks onto an already-saved run — used by the
 * finished-run screen to add manually-entered tracks after `finish()` has
 * already written the record, since `finish()` only knows about
 * Spotify-auto-captured tracks at that point. No-ops if the run can't be
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

/**
 * Average weekly distance (km) over the last `weeks` weeks of real runs —
 * the plan engine's starting point for a volume ramp. Never asked as a
 * manual input: it's derived from what actually happened, so it can't drift
 * from reality the way a typed-in guess would. Returns 0 when there isn't
 * enough recent history, which the caller treats as "not enough data for a
 * real plan yet".
 */
export function estimateWeeklyKm(runs: CompletedRun[], weeks = 3, now = Date.now()): number {
  const windowStart = now - weeks * 7 * 24 * 60 * 60 * 1000;
  const metersInWindow = runs
    .filter((run) => run.startedAt >= windowStart)
    .reduce((sum, run) => sum + run.distanceMeters, 0);
  return metersInWindow / 1000 / weeks;
}
