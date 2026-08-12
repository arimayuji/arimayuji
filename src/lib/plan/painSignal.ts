import type { PainCheckIn, PainSeverity } from "../tracking/storage";

export type { PainSeverity };

export interface ActivePainSignal {
  severity: PainSeverity;
  reportedAt: number;
  region?: string;
}

/**
 * If the athlete never comes back to log "recuperado" and never logs a
 * fresher check-in, an old signal shouldn't keep suppressing the ramp
 * forever — this is a practical cutoff so a forgotten check-in doesn't cap
 * volume for months, not a claim about how long any specific injury takes to
 * heal.
 */
const SIGNAL_EXPIRY_DAYS = 21;

/**
 * The most recent check-in is the whole state — no merging, no "worst of the
 * last N". A newer "leve" replaces an older "forte" on purpose: the athlete
 * is telling us how they are *now*, and a stale worse reading would just
 * make the plan more conservative than the athlete is currently asking for.
 */
export function activePainSignal(
  checkIns: readonly PainCheckIn[],
  now = Date.now(),
): ActivePainSignal | null {
  if (checkIns.length === 0) return null;
  const latest = checkIns.reduce((a, b) => (b.reportedAt > a.reportedAt ? b : a));
  const cutoff = now - SIGNAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  if (latest.reportedAt < cutoff) return null;
  if (latest.severity === "recuperado") return null;
  return { severity: latest.severity, reportedAt: latest.reportedAt, region: latest.region };
}
