"use client";

import { useSyncExternalStore } from "react";
import { disconnect as disconnectAuth, isConnected as checkConnected } from "./auth";

/**
 * Connection status as an external store — same shape as `usePreferences`,
 * for the same reason: reading localStorage synchronously in an effect and
 * then calling setState isn't allowed, and this also keeps every screen that
 * cares (just /perfil today) in sync without each holding its own copy.
 */

let cache: boolean | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  cache ??= checkConnected();
  return cache;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useSpotifyConnected(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function disconnectSpotify(): void {
  disconnectAuth();
  cache = false;
  emit();
}
