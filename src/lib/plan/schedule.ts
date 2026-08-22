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
 */
import { activePainSignal, type ActivePainSignal } from "./painSignal";
import { generatePlan } from "./generatePlan";
import type { GeneratedPlan, PlannedSession, PlannedWeek } from "./types";
import type { PainCheckIn } from "../tracking/storage";
import { todayIsoDate, type RunnerProfile as PersistedRunnerProfile } from "../runnerProfile";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export interface CurrentPlanWeek {
  plan: GeneratedPlan;
  currentWeek: PlannedWeek;
  currentWeekIndex: number;
  planStartDate: string;
}

/**
 * Null whenever `/plano` itself would show its "not enough data yet" empty
 * state (no goal configured, or no run history to calibrate volume from) —
 * callers that only care about today's session (`/run`) can treat null as
 * "nothing to pre-fill" without re-checking those two conditions themselves.
 */
export function computeCurrentPlanWeek(
  profile: PersistedRunnerProfile,
  weeklyKm: number,
  painCheckIns: readonly PainCheckIn[],
): CurrentPlanWeek | null {
  if (!profile.goalDistanceMeters || !profile.goalDate || weeklyKm <= 0) return null;

  const planStartDate = profile.planStartDate ?? todayIsoDate();
  const activePain: ActivePainSignal | null = activePainSignal(painCheckIns);

  const plan = generatePlan(
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

  if (plan.weeks.length === 0) return null;

  const currentWeekIndex = Math.min(
    Math.max(0, Math.floor((Date.now() - new Date(`${planStartDate}T00:00:00`).getTime()) / MS_PER_WEEK)),
    plan.weeks.length - 1,
  );
  const currentWeek = plan.weeks[currentWeekIndex];
  return { plan, currentWeek, currentWeekIndex, planStartDate };
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
  weeklyKm: number,
  painCheckIns: readonly PainCheckIn[],
): PlannedSession | null {
  const current = computeCurrentPlanWeek(profile, weeklyKm, painCheckIns);
  if (!current) return null;
  const session = current.currentWeek.sessions[isoWeekday(new Date())];
  return session && session.kind !== "rest" ? session : null;
}
