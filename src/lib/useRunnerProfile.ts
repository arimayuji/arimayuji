"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_RUNNER_PROFILE,
  loadRunnerProfile,
  saveRunnerProfile,
  type RunnerProfile,
} from "./runnerProfile";

/** Same `useSyncExternalStore` shape as `usePreferences` — see that file for why. */

let cache: RunnerProfile | null = null;
const listeners = new Set<() => void>();
let storageListenerAttached = false;

function emit(): void {
  for (const listener of listeners) listener();
}

function handleStorage(): void {
  cache = loadRunnerProfile();
  emit();
}

/** Re-reads the profile from localStorage and notifies every `useRunnerProfile()` subscriber — for a same-tab write that isn't the `storage` event (which only fires in *other* tabs/windows), e.g. `runnerProfileSync.ts` applying a pull. */
export function invalidateRunnerProfileCache(): void {
  handleStorage();
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

function getSnapshot(): RunnerProfile {
  cache ??= loadRunnerProfile();
  return cache;
}

function getServerSnapshot(): RunnerProfile {
  return DEFAULT_RUNNER_PROFILE;
}

export function useRunnerProfile(): [RunnerProfile, (patch: Partial<RunnerProfile>) => void] {
  const profile = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback((patch: Partial<RunnerProfile>) => {
    cache = saveRunnerProfile(patch);
    emit();
  }, []);

  return [profile, update];
}
