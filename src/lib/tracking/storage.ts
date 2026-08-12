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
}

export interface CompletedRun {
  id: string;
  startedAt: number;
  finishedAt: number;
  distanceMeters: number;
  points: StoredPoint[];
  tracks?: RunTrack[];
  /**
   * Which shoe this run was logged under, by name. Deliberately just a
   * string, not a reference to a separate "shoe" catalog entity: there's no
   * rename/delete flow to keep in sync, and the per-shoe mileage view is
   * just a group-by over this field — no catalog to manage means no catalog
   * to get out of sync.
   */
  shoeName?: string;
}

const DB_NAME = "xanthus";
const DB_VERSION = 1;
const ACTIVE_STORE = "activeRun";
const RUNS_STORE = "runs";
const ACTIVE_KEY = "current";

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
