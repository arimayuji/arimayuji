/**
 * The inputs the plan engine (`src/lib/plan`) needs, persisted for real —
 * same localStorage pattern as `preferences.ts`. Kept as its own module
 * rather than folded into preferences: this is race/fitness data specific
 * to plan generation, not a general app setting.
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
