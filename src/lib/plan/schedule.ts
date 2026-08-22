/**
 * Turns a persisted `RunnerProfile` (src/lib/runnerProfile.ts — the
 * on-device settings, not this module's own lighter `RunnerProfile` input
 * shape in types.ts) into "here's the actual plan, and here's the one week
 * of it that's current right now." Shared by `/plano` (shows the full
 * current week) and `/run` (only needs today's single session) so the
 * anchoring math — which week index today falls into, given a plan that's
 * a fixed shape computed once against `planStartDate` — exists in exactly
 * one place. Getting that math wrong two different ways in two screens is
 * a worse failure mode than a shared import.
 *
 * Also owns gap 1c from the Runna competitive analysis: `generatePlan`
 * itself only ever knows how to build a ramp from one snapshot of "current
 * weekly km" — it has no notion of a plan already in progress, so left
 * alone, the ramp for week 6 has no idea whether the athlete actually hit
 * week 5's target or fell way short of it. `reprojectFromActual` below is
 * the piece that closes that: once a week has fully elapsed, its real
 * recorded total (not the plan's guess) becomes the anchor the ramp
 * restarts from for every week after it — the way a coach reacts to a
 * missed (or exceeded) week, not by pretending it didn't happen.
 */
import { activePainSignal, type ActivePainSignal } from "./painSignal";
import { generatePlan } from "./generatePlan";
import { buildWeekSessions } from "./periodization";
import { buildVolumeRamp } from "./volumeProgression";
import { weekActualKm } from "./adherence";
import type { GeneratedPlan, PlannedWeek } from "./types";
import { estimateWeeklyKm, type CompletedRun, type PainCheckIn } from "../tracking/storage";
import { todayIsoDate, type RunnerProfile as PersistedRunnerProfile } from "../runnerProfile";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export interface CurrentPlanWeek {
  /**
   * Weeks before `currentWeekIndex` are exactly what `generatePlan`
   * produced — the original prescription, kept untouched on purpose so
   * `weekAdherence`/`weeksActualKm` have something real to compare against.
   * Weeks from `currentWeekIndex` onward have been re-anchored to the most
   * recent fully-elapsed week's real total, when one exists — see
   * `reprojectFromActual`.
   */
  plan: GeneratedPlan;
  /** Parallel to `plan.weeks` — real km actually run in that week's 7-day window, or `null` where nothing was recorded (including every week that hasn't started yet). */
  weeksActualKm: (number | null)[];
  currentWeek: PlannedWeek;
  currentWeekIndex: number;
  planStartDate: string;
  /** True when a past week's real total differed enough from the plan to actually move the ramp — the UI's cue to say "ajustamos sua semana" instead of silently changing numbers underneath the athlete. */
  wasReprojected: boolean;
}

/**
 * Rewrites `plan.weeks[currentWeekIndex..]` to project forward from the most
 * recent fully-elapsed week's real total, instead of the plan's own
 * hypothetical curve. Only the week's `totalKm`/`sessions` change — phase,
 * date and week number stay put, since those describe the calendar, not the
 * volume. A week with no real data anywhere behind it (very start of a
 * plan, or a long gap with no runs at all) is left exactly as
 * `generatePlan` built it — there's nothing real yet to anchor to, and
 * guessing would be worse than the plan's own evidence-based curve.
 */
function reprojectFromActual(
  plan: GeneratedPlan,
  weeksActualKm: (number | null)[],
  currentWeekIndex: number,
  weeklyRunDays: number | undefined,
): { plan: GeneratedPlan; wasReprojected: boolean } {
  let anchorKm: number | null = null;
  for (let i = currentWeekIndex - 1; i >= 0; i--) {
    if (weeksActualKm[i] !== null) {
      anchorKm = weeksActualKm[i];
      break;
    }
  }
  if (anchorKm === null || currentWeekIndex >= plan.weeks.length) {
    return { plan, wasReprojected: false };
  }

  const remaining = plan.weeks.slice(currentWeekIndex);
  const remainingTaperCount = remaining.filter((week) => week.phase === "taper").length;
  const rebuilt = buildVolumeRamp(anchorKm, remaining.length, remainingTaperCount, 0);

  let changed = false;
  const weeks = plan.weeks.map((week, i) => {
    if (i < currentWeekIndex) return week;
    const km = rebuilt[i - currentWeekIndex].km;
    if (km === week.totalKm) return week;
    changed = true;
    return { ...week, totalKm: km, sessions: buildWeekSessions(km, week.phase, weeklyRunDays) };
  });

  return { plan: { ...plan, weeks }, wasReprojected: changed };
}

/**
 * Null whenever `/plano` itself would show its "not enough data yet" empty
 * state (no goal configured, or no run history to calibrate volume from) —
 * callers that only care about today's session (`/run`) can treat null as
 * "nothing to pre-fill" without re-checking those two conditions themselves.
 */
export function computeCurrentPlanWeek(
  profile: PersistedRunnerProfile,
  completedRuns: readonly CompletedRun[],
  painCheckIns: readonly PainCheckIn[],
): CurrentPlanWeek | null {
  const weeklyKm = estimateWeeklyKm(completedRuns);
  if (!profile.goalDistanceMeters || !profile.goalDate || weeklyKm <= 0) return null;

  const planStartDate = profile.planStartDate ?? todayIsoDate();
  const activePain: ActivePainSignal | null = activePainSignal(painCheckIns);

  const basePlan = generatePlan(
    {
      recentRace:
        profile.recentRaceDistanceMeters && profile.recentRaceTimeSeconds
          ? { distanceMeters: profile.recentRaceDistanceMeters, timeSeconds: profile.recentRaceTimeSeconds }
          : undefined,
      currentWeeklyKm: weeklyKm,
      goalDistanceMeters: profile.goalDistanceMeters,
      goalDate: profile.goalDate,
      weeklyRunDays: profile.weeklyRunDays,
    },
    new Date(`${planStartDate}T00:00:00`),
    activePain,
  );

  if (basePlan.weeks.length === 0) return null;

  const currentWeekIndex = Math.min(
    Math.max(0, Math.floor((Date.now() - new Date(`${planStartDate}T00:00:00`).getTime()) / MS_PER_WEEK)),
    basePlan.weeks.length - 1,
  );

  const weeksActualKm = basePlan.weeks.map((week) => {
    const actual = weekActualKm(week, completedRuns);
    return actual > 0 ? Math.round(actual * 10) / 10 : null;
  });

  const { plan, wasReprojected } = reprojectFromActual(
    basePlan,
    weeksActualKm,
    currentWeekIndex,
    profile.weeklyRunDays,
  );
  const currentWeek = plan.weeks[currentWeekIndex];

  return { plan, weeksActualKm, currentWeek, currentWeekIndex, planStartDate, wasReprojected };
}

/** Monday-indexed (0..6) — matches `periodization.ts`'s `buildWeekSessions` slot order, not JS's own Sunday-first `Date.getDay()`. */
export function isoWeekday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * Today's single planned session, or null when there's no plan at all, or
 * today happens to land on a rest day — `/run` treats both the same way
 * (nothing to pre-fill), so it doesn't need to distinguish "no plan exists"
 * from "the plan says rest today."
 */
export function todaysSession(
  profile: PersistedRunnerProfile,
  completedRuns: readonly CompletedRun[],
  painCheckIns: readonly PainCheckIn[],
) {
  const current = computeCurrentPlanWeek(profile, completedRuns, painCheckIns);
  if (!current) return null;
  const session = current.currentWeek.sessions[isoWeekday(new Date())];
  return session && session.kind !== "rest" ? session : null;
}
