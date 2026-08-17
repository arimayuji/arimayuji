"use client";

/**
 * Effective light/dark, resolved from the user's manual choice
 * (`Preferences.theme`, /perfil) or the OS when that choice is "system".
 *
 * The blocking inline script in layout.tsx sets/removes `.dark` on <html>
 * before first paint — killing the flash of the wrong theme a React effect
 * would cause, since Preferences only lives in localStorage and the server
 * render can't know it. `applyTheme` below is the same logic, kept in sync
 * afterwards by `ThemeSync`. Everything downstream — Tailwind's `dark:`
 * variant (see the `@custom-variant` in globals.css), the CSS custom
 * properties, and the map basemap colors — reads that one class instead of
 * re-deriving the OS preference on its own.
 */

import { useSyncExternalStore } from "react";
import type { ThemeMode } from "./preferences";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return systemPrefersDark();
}

/**
 * Applies `mode` to <html>. While `mode` is "system", also keeps listening
 * for OS changes so an already-open tab follows a live theme switch instead
 * of needing a reload. Returns the cleanup for that listener.
 */
export function applyTheme(mode: ThemeMode): () => void {
  const root = document.documentElement;
  root.classList.toggle("dark", resolveIsDark(mode));

  if (mode !== "system") return () => {};

  const query = window.matchMedia(DARK_QUERY);
  const onChange = () => root.classList.toggle("dark", query.matches);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/**
 * The resolved scheme as a plain string, for the spots (map basemap style,
 * route/halo colors) that need one rather than a CSS variable. Null on the
 * server and during hydration — same `useSyncExternalStore` shape those
 * callers already used before this was centralized — since guessing wrong
 * here would flash the wrong basemap style.
 */
export function useEffectiveColorScheme(): "light" | "dark" | null {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => null,
  );
}
