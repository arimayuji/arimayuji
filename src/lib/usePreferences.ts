"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type Preferences,
} from "./preferences";

/**
 * localStorage preferences as an external store.
 *
 * `useSyncExternalStore` is the right shape here rather than "read in an
 * effect and setState": it renders the server snapshot during hydration (so
 * markup matches) and swaps to the stored values immediately afterwards, and
 * every screen reading preferences stays in sync — change the unit on /perfil
 * and an open /historico updates, including across tabs via the `storage`
 * event.
 */

let cache: Preferences | null = null;
const listeners = new Set<() => void>();
let storageListenerAttached = false;

function emit(): void {
  for (const listener of listeners) listener();
}

function handleStorage(): void {
  cache = loadPreferences();
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!storageListenerAttached) {
    window.addEventListener("storage", handleStorage);
    storageListenerAttached = true;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && storageListenerAttached) {
      window.removeEventListener("storage", handleStorage);
      storageListenerAttached = false;
    }
  };
}

/** Must be referentially stable between reads, hence the module-level cache. */
function getSnapshot(): Preferences {
  cache ??= loadPreferences();
  return cache;
}

function getServerSnapshot(): Preferences {
  return DEFAULT_PREFERENCES;
}

export function usePreferences(): [Preferences, (patch: Partial<Preferences>) => void] {
  const preferences = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback((patch: Partial<Preferences>) => {
    cache = savePreferences(patch);
    emit();
  }, []);

  return [preferences, update];
}
