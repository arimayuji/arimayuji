/**
 * Temporary diagnostic (2026-08-21): a breadcrumb trail written to
 * localStorage instead of shown via alert() directly. alert()s placed
 * inline in the "Iniciar corrida" flow weren't appearing even on a
 * confirmed-fresh build — the leading hypothesis is the WebView/Activity
 * getting torn down and recreated mid-click (e.g. by the native permission
 * flow), which would wipe any in-memory JS state and any alert() queued
 * but not yet shown before that happens. localStorage survives that; a
 * fresh mount can read back what the previous attempt actually reached
 * before whatever wiped it. Remove once the native "nothing happens"
 * report is root-caused.
 */
const KEY = "xanthus:diag-trail";

export function logDiag(step: string): void {
  try {
    const prev = window.localStorage.getItem(KEY);
    const trail = prev ? JSON.parse(prev) : [];
    trail.push(`${new Date().toISOString().slice(11, 23)} ${step}`);
    window.localStorage.setItem(KEY, JSON.stringify(trail));
  } catch {
    // best-effort diagnostic; never let logging itself break the flow
  }
}

/** Reads back and clears the trail — call once on mount to see what the previous attempt reached. */
export function drainDiagTrail(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    window.localStorage.removeItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
