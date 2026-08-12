/**
 * The basemap behind the GPS route (see src/app/(app)/route-map.tsx).
 *
 * `NEXT_PUBLIC_` is required for the same reason as the Appwrite vars: this
 * app is a static export with no server runtime, so the key is baked into the
 * client bundle at build time. A MapTiler key is a client-side credential by
 * design — their own examples put it straight in browser code, and it's
 * scoped by the origin allowlist in the MapTiler console, not by secrecy.
 */

const KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

/**
 * MapTiler's "Streets" pair — the styles that actually label streets, which
 * is what turns a trace into "the block I ran" instead of an abstract shape.
 * Both slugs verified against api.maptiler.com rather than guessed.
 */
const STYLE_SLUG = { light: "streets-v2", dark: "streets-v2-dark" } as const;

export type ColorScheme = keyof typeof STYLE_SLUG;

/**
 * Null when no key is configured — callers must treat that as "no basemap
 * available" and fall back to drawing the bare trace, the same contract
 * `getAppwrite()` has, so a checkout without the key still builds and still
 * shows where the run went.
 */
export function maptilerStyleUrl(scheme: ColorScheme): string | null {
  if (!KEY) return null;
  return `https://api.maptiler.com/maps/${STYLE_SLUG[scheme]}/style.json?key=${KEY}`;
}
