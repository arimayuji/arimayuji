/**
 * Reads a run's matching watch workout from the phone's own health store —
 * Apple HealthKit on iOS, Google Health Connect on Android, via the
 * `capacitor-health` plugin (native-only; there is no browser equivalent).
 * Xanthus never talks to a watch directly: every watch already syncs its
 * own workouts into one of those two stores on its own, so reading from the
 * store is the only integration point that works across brands (Apple
 * Watch, Garmin, Fitbit, Samsung, Coros, ...) with one code path.
 *
 * `HEALTH_DATA_ENABLED` gates the whole thing off for now — same pattern
 * `PHONE_AUTH_ENABLED` in auth.ts already uses for a feature whose code is
 * ready but whose real-world prerequisite isn't: the iOS App ID needs the
 * HealthKit *capability* enabled in the Apple Developer Portal (an App
 * Store Connect / developer.apple.com step, not something this repo can
 * do), and the Android manifest queries/permissions below only take effect
 * once Health Connect is actually installed on the test device. Flip this
 * to `true` once that capability is turned on; nothing else needs to
 * change. See PROJECT-CONTEXT.md's "Funcionalidades planejadas" section
 * for the full phased plan this is part of.
 */
import { Health, type HealthPermission, type PermissionResponse, type Workout } from "capacitor-health";
import type { CompletedRun } from "./tracking/storage";
import { isNativePlatform } from "./platform";

export const HEALTH_DATA_ENABLED = true;

/**
 * Read-only, and only what the "essa corrida" card actually shows —
 * READ_WORKOUTS to find the matching entry, heart rate/calories/steps to
 * fill it in. No write permissions, no route (Xanthus already has its own
 * GPS trace and doesn't need the watch's).
 */
const REQUIRED_PERMISSIONS: HealthPermission[] = [
  "READ_WORKOUTS",
  "READ_HEART_RATE",
  "READ_TOTAL_CALORIES",
  "READ_STEPS",
];

/** `PermissionResponse.permissions` is an array of single-key `{permissionName: granted}` records, not one flat object — flatten it before asking "did we get everything". */
function allGranted(response: PermissionResponse): boolean {
  return response.permissions.every((entry) => Object.values(entry).every(Boolean));
}

/** Android: false almost always means the Health Connect app itself isn't installed — see `Health.showHealthConnectInPlayStore()` for the recovery path, not called here since this is a background read, not a place to launch the Play Store from. */
export async function isHealthAvailable(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const { available } = await Health.isHealthAvailable();
    return available;
  } catch {
    return false;
  }
}

/**
 * Safe to call every time health data is wanted, not just once — per the
 * plugin's own docs, iOS returns immediately without re-prompting once the
 * athlete has already answered, and Android's OS-level permission dialog
 * behaves the same way. There's still an explicit product-level consent
 * step ahead of this (the "Ver como ficaria" card in /perfil, and its
 * eventual real replacement) — this function is the mechanical permission
 * check/request underneath that screen, not a substitute for it.
 */
export async function requestHealthPermissions(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const response = await Health.requestHealthPermissions({ permissions: REQUIRED_PERMISSIONS });
    return allGranted(response);
  } catch {
    return false;
  }
}

export interface RunHealthData {
  avgHeartRateBpm: number | null;
  caloriesKcal: number | null;
  steps: number | null;
  /** The workout's own `sourceName` from HealthKit/Health Connect (e.g. "Apple Watch", "Garmin Connect") — shown so the number's origin is never a mystery. */
  source: string | null;
}

/** How much of `[start, end]` a workout's own interval covers, in ms — used to pick the best of possibly several watch workouts logged around the same time, not just the first one returned. */
function overlapMs(workout: Workout, start: number, end: number): number {
  const workoutStart = new Date(workout.startDate).getTime();
  const workoutEnd = new Date(workout.endDate).getTime();
  return Math.max(0, Math.min(workoutEnd, end) - Math.max(workoutStart, start));
}

/** Watch and phone clocks drift, and a workout is rarely started/stopped in the exact same second as Xanthus's own recording — padding the query window is what lets a real match still turn up instead of missing it by a few minutes on either end. */
const MATCH_PAD_MS = 10 * 60_000;

async function bestMatchingWorkout(startedAt: number, finishedAt: number): Promise<Workout | null> {
  const response = await Health.queryWorkouts({
    startDate: new Date(startedAt - MATCH_PAD_MS).toISOString(),
    endDate: new Date(finishedAt + MATCH_PAD_MS).toISOString(),
    includeHeartRate: true,
    includeRoute: false,
    includeSteps: true,
  });
  if (response.workouts.length === 0) return null;
  const best = response.workouts.reduce((a, b) =>
    overlapMs(b, startedAt, finishedAt) > overlapMs(a, startedAt, finishedAt) ? b : a,
  );
  return overlapMs(best, startedAt, finishedAt) > 0 ? best : null;
}

/**
 * The watch's own data for one specific run, or `null` when there's nothing
 * to show — flag off, web, health store unavailable, permission refused, or
 * no watch workout actually overlaps this run's time window (the athlete
 * ran without a watch, or wore one but the phone never synced with it).
 * Every one of those is the same "nothing here" result to the caller; none
 * of them is worth surfacing as an error on a screen about a run that
 * already saved and displayed fine from Xanthus's own GPS trace.
 */
export async function fetchRunHealthData(
  run: Pick<CompletedRun, "startedAt" | "finishedAt">,
): Promise<RunHealthData | null> {
  if (!HEALTH_DATA_ENABLED || !isNativePlatform()) return null;
  try {
    if (!(await isHealthAvailable())) return null;
    if (!(await requestHealthPermissions())) return null;
    const workout = await bestMatchingWorkout(run.startedAt, run.finishedAt);
    if (!workout) return null;
    const avgHeartRateBpm =
      workout.heartRate && workout.heartRate.length > 0
        ? Math.round(workout.heartRate.reduce((sum, sample) => sum + sample.bpm, 0) / workout.heartRate.length)
        : null;
    return {
      avgHeartRateBpm,
      caloriesKcal: workout.calories != null ? Math.round(workout.calories) : null,
      steps: workout.steps ?? null,
      source: workout.sourceName ?? null,
    };
  } catch {
    return null;
  }
}
