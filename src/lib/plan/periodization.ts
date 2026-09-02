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

/**
 * Builds one week of 7 daily sessions (rest included) summing to ~weekKm.
 *
 * `availableWeekdays` (0 = Monday .. 6 = Sunday), when given, is the
 * athlete's real answer to "which days can you actually run" and defines
 * *both* which days get a session and how many there are — `weeklyRunDays`
 * is then ignored, since a list of days already carries its own count and
 * two sources for the same number could only ever disagree. Left unset (an
 * older profile, or one synced from a device that predates the picker), the
 * layout falls back to exactly what this function always did: Monday rest,
 * long run Sunday, quality Thursday, easy runs filling Tue/Wed/Sat first.
 */
export function buildWeekSessions(
  weekKm: number,
  phase: TrainingPhase,
  weeklyRunDays = 4,
  availableWeekdays?: readonly number[],
): PlannedSession[] {
  const days = normalizeWeekdays(availableWeekdays);
  const runDays = days ? days.length : Math.min(6, Math.max(2, weeklyRunDays)); // at least 2 (long + one more), at most 6 (always 1 rest day)
  const hasQuality = phase !== "base" && runDays >= 3;

  const longKm = round1(weekKm * LONG_RUN_SHARE);
  const qualityKm = hasQuality ? round1(weekKm * QUALITY_SHARE) : 0;
  const easyDaysCount = runDays - 1 - (hasQuality ? 1 : 0);
  const easyKmEach = easyDaysCount > 0 ? round1((weekKm - longKm - qualityKm) / easyDaysCount) : 0;

  const slots: PlannedSession[] = new Array(7)
    .fill(null)
    .map(() => ({ kind: "rest", km: 0 }) as PlannedSession);

  if (days) {
    const longDay = pickLongRunDay(days);
    const rest = days.filter((day) => day !== longDay);
    const qualityDay = hasQuality ? pickQualityDay(rest, longDay) : null;

    slots[longDay] = { kind: "long", km: longKm };
    if (qualityDay !== null) {
      slots[qualityDay] = { kind: "quality", km: qualityKm, paceZone: phase === "taper" ? "threshold" : "interval" };
    }
    for (const day of rest) {
      if (day === qualityDay) continue;
      slots[day] = { kind: "easy", km: easyKmEach };
    }
    return slots;
  }

  // Legacy layout, kept byte-for-byte so a profile that never answered the
  // weekday question keeps the plan it already had: Mon rest (post-long-run
  // recovery is a universal enough convention to default to), then quality
  // mid-week and easy runs around it, long run always Sunday.
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

/** Sorted, de-duplicated, in-range and within the same 2..6 bounds the day count always had — or `null` when there's nothing usable to honour. */
function normalizeWeekdays(raw: readonly number[] | undefined): number[] | null {
  if (!raw) return null;
  const days = [...new Set(raw.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort(
    (a, b) => a - b,
  );
  if (days.length < 2) return null;
  return days.length > 6 ? days.slice(0, 6) : days;
}

/**
 * The long run wants the day the athlete most likely has time for, so:
 * Sunday, else Saturday, else simply the last available day of the week —
 * which keeps the recovery-friendly property that whatever comes after it is
 * a rest day (there is none left in the week) for every possible selection.
 */
export function pickLongRunDay(days: readonly number[]): number {
  if (days.includes(6)) return 6;
  if (days.includes(5)) return 5;
  return days[days.length - 1];
}

/**
 * Quality goes as far from the long run as the week allows — the two hard
 * days of the week shouldn't sit back to back. Distance is measured
 * cyclically (the week wraps), and ties break toward the *later* day (`>=`,
 * over an ascending list) — which on a conventional Tue/Wed/Thu + Sunday
 * week lands quality on Thursday, the same day the legacy layout hardcoded,
 * so someone whose selection matches the old default sees no change at all.
 */
function pickQualityDay(candidates: readonly number[], longDay: number): number {
  let best = candidates[0];
  let bestGap = -1;
  for (const day of candidates) {
    const diff = Math.abs(day - longDay);
    const gap = Math.min(diff, 7 - diff);
    if (gap >= bestGap) {
      best = day;
      bestGap = gap;
    }
  }
  return best;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
