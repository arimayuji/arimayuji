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

export interface CompletedRun {
  id: string;
  startedAt: number;
  finishedAt: number;
  distanceMeters: number;
  points: StoredPoint[];
}

const DB_NAME = "pegasus-run";
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
