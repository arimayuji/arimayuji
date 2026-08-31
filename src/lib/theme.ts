"use client";

/**
 * Xanthus is light-mode only — the manual light/dark/system toggle was
 * removed after it read as broken in real use (see PROJECT-CONTEXT.md).
 * This stays a named export, returning the union type the map/basemap call
 * sites already expect, so a future reversal has one place to change
 * instead of every call site that asks "light or dark?".
 */
export function useEffectiveColorScheme(): "light" | "dark" | null {
  return "light";
}
