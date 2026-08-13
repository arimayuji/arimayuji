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

export interface RunnerProfile {
  goalDistanceMeters?: number;
  /** ISO date (yyyy-mm-dd). */
  goalDate?: string;
  recentRaceDistanceMeters?: number;
  recentRaceTimeSeconds?: number;
  weeklyRunDays?: number;
  weightKg?: number;
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

export function saveRunnerProfile(patch: Partial<RunnerProfile>): RunnerProfile {
  const next = sanitize({ ...loadRunnerProfile(), ...patch });
  if (typeof window === "undefined") return next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage disabled: the profile simply doesn't persist across reloads.
  }
  return next;
}
