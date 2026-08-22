/**
 * Wiping everything this device holds about the athlete — the local half of
 * the "apagar meus dados" story that `deleteAccount()` (auth.ts) covers on
 * the server side.
 *
 * Signing out deliberately does *not* call this on its own. Runs are stored
 * locally and work with no account at all, so an automatic wipe on logout
 * would destroy months of history for anyone who merely wanted to switch
 * Google accounts — the account and the run history are genuinely separate
 * things here, and the app must not pretend otherwise. The choice is offered
 * at the logout moment instead (see `sign-out-confirm.tsx`), which is where
 * the shared-device case that motivated this actually shows up.
 *
 * Deleting the whole IndexedDB database rather than emptying each store:
 * a store added later (the schema is on version 5 and has grown twice) would
 * silently survive a hand-maintained list of stores to clear, and "apagar
 * tudo" quietly leaving something behind is the exact failure this is meant
 * to prevent.
 */

const DB_NAME = "xanthus";
const STORAGE_PREFIX = "xanthus:";

function deleteDatabase(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve();
      return;
    }
    const req = indexedDB.deleteDatabase(DB_NAME);
    // `onblocked` fires when another tab still holds the database open. It is
    // resolved rather than rejected on purpose: the delete stays queued and
    // completes once that tab lets go, and there is nothing useful to show
    // the athlete in the meantime.
    req.onblocked = () => resolve();
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}

function clearNamespacedStorage(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    // Collected first, removed after: removing during the walk shifts every
    // later index down by one and silently skips half the keys.
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // Storage disabled — nothing was ever written to remove.
  }
}

/**
 * Erases recorded runs, shoes, pain check-ins and opened emblems
 * (IndexedDB), plus every `xanthus:`-prefixed preference — weight, race
 * times, goal, voice/vibration settings and the recorded privacy
 * acceptance. The acceptance going too is intentional: the next person to
 * pick up a shared device gets asked for their own.
 */
export async function clearLocalData(): Promise<void> {
  clearNamespacedStorage();
  await deleteDatabase();
}
