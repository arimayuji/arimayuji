/**
 * Race/fitness data about the runner, persisted for real — same
 * localStorage pattern as `preferences.ts`. Kept as its own module rather
 * than folded into preferences: this is personal athlete data, not a
 * general app setting. Most of it feeds the plan engine (`src/lib/plan`);
 * `weightKg` doesn't — it exists only so `src/lib/calories.ts` has a real
 * body mass to estimate energy cost from, and is never inferred or
 * defaulted, since a calorie estimate built on a guessed weight is just a
 * fabricated number with extra steps.
 *
 * `currentWeeklyKm` is deliberately *not* stored here — it's computed from
 * real recorded runs (see `estimateWeeklyKm` in `tracking/storage.ts`)
 * every time a plan is generated, so it can never drift from what actually
 * happened.
 */

export type WeeklyTargetKind = "runs" | "km";

export interface RunnerProfile {
  goalDistanceMeters?: number;
  /** ISO date (yyyy-mm-dd). */
  goalDate?: string;
  /**
   * ISO date (yyyy-mm-dd) the current plan's week 1 is anchored to — set
   * automatically the moment a goal is (re)configured, never chosen
   * directly. Without this, `/plano` had no notion of "week 3 of 12": it
   * called `generatePlan(profile, new Date())` on every visit, which always
   * measures from *today* to the goal date and always hands back week 1 as
   * "the current week" — a plan that silently restarts itself every time
   * the screen opens, never actually progressing. Anchoring the full
   * 12-week (or whatever) shape to a fixed start date lets "today" instead
   * be a lookup into which week of that fixed plan is current.
   */
  planStartDate?: string;
  recentRaceDistanceMeters?: number;
  recentRaceTimeSeconds?: number;
  weeklyRunDays?: number;
  weightKg?: number;
  /** The athlete's own weekly consistency target (see tracking/constancy.ts) — one unit or the other, never both, since it's "did I keep showing up" measured one way, not a combined score. */
  weeklyTargetKind?: WeeklyTargetKind;
  weeklyTargetValue?: number;
}

export const GOAL_DISTANCE_OPTIONS = [
  { meters: 5000, label: "5 km" },
  { meters: 10000, label: "10 km" },
  { meters: 21097, label: "Meia (21 km)" },
  { meters: 42195, label: "Maratona (42 km)" },
] as const;

export const DEFAULT_RUNNER_PROFILE: RunnerProfile = {};

const STORAGE_KEY = "xanthus:runner-profile";

function sanitize(raw: unknown): RunnerProfile {
  if (typeof raw !== "object" || raw === null) return DEFAULT_RUNNER_PROFILE;
  const value = raw as Partial<Record<keyof RunnerProfile, unknown>>;

  const profile: RunnerProfile = {};
  if (typeof value.goalDistanceMeters === "number" && value.goalDistanceMeters > 0) {
    profile.goalDistanceMeters = value.goalDistanceMeters;
  }
  if (typeof value.goalDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.goalDate)) {
    profile.goalDate = value.goalDate;
  }
  if (typeof value.planStartDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.planStartDate)) {
    profile.planStartDate = value.planStartDate;
  }
  if (
    typeof value.recentRaceDistanceMeters === "number" &&
    value.recentRaceDistanceMeters > 0
  ) {
    profile.recentRaceDistanceMeters = value.recentRaceDistanceMeters;
  }
  if (typeof value.recentRaceTimeSeconds === "number" && value.recentRaceTimeSeconds > 0) {
    profile.recentRaceTimeSeconds = value.recentRaceTimeSeconds;
  }
  if (
    typeof value.weeklyRunDays === "number" &&
    value.weeklyRunDays >= 2 &&
    value.weeklyRunDays <= 6
  ) {
    profile.weeklyRunDays = value.weeklyRunDays;
  }
  if (typeof value.weightKg === "number" && value.weightKg >= 25 && value.weightKg <= 250) {
    profile.weightKg = value.weightKg;
  }
  if (value.weeklyTargetKind === "runs" || value.weeklyTargetKind === "km") {
    profile.weeklyTargetKind = value.weeklyTargetKind;
  }
  if (typeof value.weeklyTargetValue === "number" && value.weeklyTargetValue > 0) {
    profile.weeklyTargetValue = value.weeklyTargetValue;
  }
  return profile;
}

export function loadRunnerProfile(): RunnerProfile {
  if (typeof window === "undefined") return DEFAULT_RUNNER_PROFILE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_RUNNER_PROFILE;
    return sanitize(JSON.parse(stored));
  } catch {
    return DEFAULT_RUNNER_PROFILE;
  }
}

/** Today, as an ISO date — the plan always anchors to a whole day, never a timestamp, so "today" reads the same regardless of what hour it's called at. */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A changed goal (distance or date) invalidates every week the old plan had
 * already computed — they were built against a race that no longer applies.
 * Rather than make every caller remember to also reset `planStartDate`,
 * this one place does it whenever the patch actually changes either goal
 * field (not merely re-sends the same value the profile already had), plus
 * the very first time a goal is set at all. `/plano` then always has a
 * `planStartDate` the moment `hasGoal` is true, with no separate
 * "not anchored yet" state to handle downstream.
 */
export function saveRunnerProfile(patch: Partial<RunnerProfile>): RunnerProfile {
  const current = loadRunnerProfile();
  const goalChanged =
    ("goalDistanceMeters" in patch && patch.goalDistanceMeters !== current.goalDistanceMeters) ||
    ("goalDate" in patch && patch.goalDate !== current.goalDate);
  const nextGoalDistance = patch.goalDistanceMeters ?? current.goalDistanceMeters;
  const nextGoalDate = patch.goalDate ?? current.goalDate;
  const startingFreshGoal = Boolean(nextGoalDistance && nextGoalDate) && (goalChanged || !current.planStartDate);

  const next = sanitize({
    ...current,
    ...patch,
    ...(startingFreshGoal ? { planStartDate: todayIsoDate() } : {}),
  });
  if (typeof window === "undefined") return next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage disabled: the profile simply doesn't persist across reloads.
  }
  return next;
}
