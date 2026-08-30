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
/**
 * Epoch ms of the last successful local write — stamped unconditionally by
 * `saveRunnerProfile()`, whether or not cross-device sync is even turned on,
 * so the timestamp is already meaningful the moment a device later opts in
 * (instead of "whichever device flips the toggle first arbitrarily wins").
 * Read by `runnerProfileSync.ts`'s last-write-wins comparison — see that
 * file for the full algorithm.
 */
const UPDATED_AT_STORAGE_KEY = "xanthus:runner-profile-updated-at";

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
 * The calendar Monday on or before today, as an ISO date — what
 * `planStartDate` actually gets stamped with (see below), so that every
 * plan's week boundaries land on real calendar weeks. This matters beyond
 * cosmetics: a coach has no way to see a student's own `planStartDate` (it
 * never leaves the student's device), so `/treinador/aluno`'s override
 * editor has to guess which ISO date each `PlannedWeek.startDate` will be —
 * and it guesses by picking calendar Mondays (`mondayOf` in
 * tracking/stats.ts). If plans could anchor to an arbitrary weekday, that
 * guess would only ever match by coincidence and coach overrides would
 * silently never apply.
 */
export function currentMondayIsoDate(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
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
    ...(startingFreshGoal ? { planStartDate: currentMondayIsoDate() } : {}),
  });
  if (typeof window === "undefined") return next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.localStorage.setItem(UPDATED_AT_STORAGE_KEY, String(Date.now()));
  } catch {
    // Storage disabled: the profile simply doesn't persist across reloads.
  }
  return next;
}

/** Epoch ms of the last local edit, or `null` if this device has never saved a profile (or storage is unavailable). */
export function loadRunnerProfileUpdatedAtMs(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(UPDATED_AT_STORAGE_KEY);
    if (!raw) return null;
    const ms = Number(raw);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

/**
 * The only path a cross-device sync *pull* is allowed to use — deliberately
 * bypasses `saveRunnerProfile()` entirely, never routing a remote snapshot
 * through its goal-change detection. That logic exists to catch an
 * *interactive* edit (comparing a patch against what this device already
 * had) and reacts by stamping `planStartDate` to "this Monday" — exactly
 * wrong for a pull, which is "adopt this already-anchored snapshot as-is,"
 * not a new goal being set on this device. Routing pulls through
 * `saveRunnerProfile` would risk clobbering a correctly-anchored
 * `planStartDate` the instant any goal field merely differs from local
 * state, even when the real cause is just "this is a different device's
 * data," not a fresh goal.
 *
 * `remoteUpdatedAtMs` is stamped as-is (not `Date.now()`) into the local
 * bookkeeping key: this write is exactly as "old" as the value it carries,
 * so a later sync comparison against another device stays honest.
 */
export function applySyncedRunnerProfile(remote: RunnerProfile, remoteUpdatedAtMs: number): RunnerProfile {
  const next = sanitize(remote);
  if (typeof window === "undefined") return next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.localStorage.setItem(UPDATED_AT_STORAGE_KEY, String(remoteUpdatedAtMs));
  } catch {
    // Storage disabled: the profile simply doesn't persist across reloads.
  }
  return next;
}
