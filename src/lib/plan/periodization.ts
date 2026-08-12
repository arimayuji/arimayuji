import type { PlannedSession, TrainingPhase } from "./types";

/**
 * Phase and weekly session shape. The evidence base backs two things here:
 * the ~80/20 easy/hard time split (Seiler; polarized-training trials) and
 * the taper's own rules (handled in `volumeProgression.ts`). Which exact day
 * gets which session is *not* an evidence-backed decision — it's an
 * ordinary scheduling choice, deliberately generic rather than copied from
 * any specific commercial program's day-by-day layout.
 *
 * Output is always exactly 7 sessions, index 0 = Monday .. 6 = Sunday — a
 * neutral shape a UI can zip with its own day-name labels.
 */

export function phaseForWeek(
  rampWeekIndex: number,
  rampWeekCount: number,
  isTaper: boolean,
): TrainingPhase {
  if (isTaper) return "taper";
  if (rampWeekCount <= 1) return "base";

  const progress = rampWeekIndex / (rampWeekCount - 1); // 0 (first week) .. 1 (last ramp week)
  if (progress < 0.5) return "base";
  if (progress < 0.85) return "build";
  return "peak";
}

const LONG_RUN_SHARE = 0.28;
const QUALITY_SHARE = 0.15; // only in build/peak/taper

/** Builds one week of 7 daily sessions (rest included) summing to ~weekKm. */
export function buildWeekSessions(
  weekKm: number,
  phase: TrainingPhase,
  weeklyRunDays = 4,
): PlannedSession[] {
  const runDays = Math.min(6, Math.max(2, weeklyRunDays)); // at least 2 (long + one more), at most 6 (always 1 rest day)
  const hasQuality = phase !== "base" && runDays >= 3;

  const longKm = round1(weekKm * LONG_RUN_SHARE);
  const qualityKm = hasQuality ? round1(weekKm * QUALITY_SHARE) : 0;
  const easyDaysCount = runDays - 1 - (hasQuality ? 1 : 0);
  const easyKmEach = easyDaysCount > 0 ? round1((weekKm - longKm - qualityKm) / easyDaysCount) : 0;

  // Slot order: Mon rest (post-long-run recovery is a universal enough convention
  // to default to), then distribute quality mid-week and easy runs around it,
  // long run always Sunday.
  const slots: PlannedSession[] = new Array(7)
    .fill(null)
    .map(() => ({ kind: "rest", km: 0 }) as PlannedSession);

  let easyRemaining = easyDaysCount;
  const easyPriority = [1, 2, 5]; // Tue, Wed, Sat — filled in that order before any other day
  for (const day of easyPriority) {
    if (easyRemaining <= 0) break;
    slots[day] = { kind: "easy", km: easyKmEach };
    easyRemaining--;
  }
  // Extremely high run-day counts spill onto Friday, then Monday itself.
  for (const day of [4, 0]) {
    if (easyRemaining <= 0) break;
    slots[day] = { kind: "easy", km: easyKmEach };
    easyRemaining--;
  }

  if (hasQuality) {
    slots[3] = { kind: "quality", km: qualityKm, paceZone: phase === "taper" ? "threshold" : "interval" };
  }
  slots[6] = { kind: "long", km: longKm };

  return slots;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
