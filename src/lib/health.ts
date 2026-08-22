/**
 * Reads a run's matching watch workout — and recovery context around it —
 * from the phone's own health store: Apple HealthKit on iOS, Google Health
 * Connect on Android, via the `@capgo/capacitor-health` plugin (native-only;
 * there is no browser equivalent). Xanthus never talks to a watch directly:
 * every watch already syncs its own data into one of those two stores on
 * its own, so reading from the store is the only integration point that
 * works across brands (Apple Watch, Garmin, Fitbit, Samsung, Coros, ...)
 * with one code path.
 *
 * Switched from the `capacitor-health` (mley fork) plugin to this one —
 * same idea (one TypeScript API over HealthKit/Health Connect), but this
 * fork actually exposes resting heart rate, HRV, VO2 max and sleep, which
 * the previous one never did even at its latest version (confirmed by
 * reading both packages' own `definitions.d.ts`, not just their READMEs).
 * It's maintained by the same team already trusted for this app's GPS
 * plugin (`@capgo/background-geolocation`).
 *
 * `HEALTH_DATA_ENABLED` gates the whole thing off — same pattern
 * `PHONE_AUTH_ENABLED` in auth.ts already uses for a feature whose code is
 * ready but whose real-world prerequisite isn't.
 *
 * Turned back off in an LGPD/security audit pass: heart rate/calories/steps
 * are sensitive health data (LGPD Art. 11), and this was reading them
 * automatically on opening any run detail with no product-level consent
 * screen ahead of it — only the OS's own HealthKit/Health Connect
 * permission dialog, which is not the same thing as informed consent for
 * *this app's* use of the data. That gap has since been closed for real:
 * `/perfil/relogio` now has an explicit toggle (`healthDataConsent` in
 * preferences.ts, checked below on every call), and `/privacidade`
 * declares both data sources. See PROJECT-CONTEXT.md's "Funcionalidades
 * planejadas" section for the full phased plan this is part of — what's
 * left is re-enabling `HEALTH_DATA_ENABLED` itself and a real-device test.
 */
import { Health, type HealthDataType, type HealthSample, type Workout } from "@capgo/capacitor-health";
import type { CompletedRun } from "./tracking/storage";
import { isNativePlatform } from "./platform";
import { loadPreferences } from "./preferences";

export const HEALTH_DATA_ENABLED = false;

/**
 * Read-only, and only what this module actually turns into something the
 * app shows — no write permissions, no route (Xanthus already has its own
 * GPS trace and doesn't need the watch's), no nutrition/blood pressure/
 * blood glucose despite the plugin supporting them (nothing here would use
 * them, and requesting a permission this app can't explain the point of is
 * its own small LGPD smell).
 */
const REQUIRED_READ_TYPES: HealthDataType[] = [
  "workouts",
  "heartRate",
  "totalCalories",
  "distance",
  "steps",
  "restingHeartRate",
  "heartRateVariability",
  "vo2Max",
  "sleep",
];

/** Android: false almost always means Health Connect itself isn't installed — see `Health.openHealthConnectSettings()` for the recovery path, not called here since this is a background read, not a place to launch a settings screen from. */
export async function isHealthAvailable(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const { available } = await Health.isAvailable();
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
 * step ahead of this (`/perfil/relogio`'s toggle) — this function is the
 * mechanical permission check/request underneath that screen, not a
 * substitute for it.
 */
export async function requestHealthPermissions(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const status = await Health.requestAuthorization({ read: REQUIRED_READ_TYPES });
    return REQUIRED_READ_TYPES.every((type) => status.readAuthorized.includes(type));
  } catch {
    return false;
  }
}

function hasConsent(): boolean {
  return HEALTH_DATA_ENABLED && isNativePlatform() && loadPreferences().healthDataConsent;
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
    workoutType: "running",
    startDate: new Date(startedAt - MATCH_PAD_MS).toISOString(),
    endDate: new Date(finishedAt + MATCH_PAD_MS).toISOString(),
    limit: 20,
  });
  if (response.workouts.length === 0) return null;
  const best = response.workouts.reduce((a, b) =>
    overlapMs(b, startedAt, finishedAt) > overlapMs(a, startedAt, finishedAt) ? b : a,
  );
  return overlapMs(best, startedAt, finishedAt) > 0 ? best : null;
}

function average(samples: HealthSample[]): number | null {
  if (samples.length === 0) return null;
  return samples.reduce((sum, s) => sum + s.value, 0) / samples.length;
}

/**
 * Neither heart rate nor step count come attached to a `Workout` in this
 * plugin (unlike the previous one) — both are separate sample streams that
 * happen to fall inside the workout's own time window, so this reads them
 * the same way `HealthSample` reads anything else.
 */
async function samplesDuring(dataType: HealthDataType, startDate: string, endDate: string): Promise<HealthSample[]> {
  try {
    const { samples } = await Health.readSamples({ dataType, startDate, endDate, limit: 1000 });
    return samples;
  } catch {
    return [];
  }
}

/**
 * The watch's own data for one specific run, or `null` when there's nothing
 * to show — flag off, no consent, web, health store unavailable, permission
 * refused, or no watch workout actually overlaps this run's time window
 * (the athlete ran without a watch, or wore one but the phone never synced
 * with it). Every one of those is the same "nothing here" result to the
 * caller; none of them is worth surfacing as an error on a screen about a
 * run that already saved and displayed fine from Xanthus's own GPS trace.
 */
export async function fetchRunHealthData(
  run: Pick<CompletedRun, "startedAt" | "finishedAt">,
): Promise<RunHealthData | null> {
  if (!hasConsent()) return null;
  try {
    if (!(await isHealthAvailable())) return null;
    if (!(await requestHealthPermissions())) return null;
    const workout = await bestMatchingWorkout(run.startedAt, run.finishedAt);
    if (!workout) return null;

    const [heartRateSamples, stepSamples] = await Promise.all([
      samplesDuring("heartRate", workout.startDate, workout.endDate),
      samplesDuring("steps", workout.startDate, workout.endDate),
    ]);

    const avgHeartRateBpm = average(heartRateSamples);
    return {
      avgHeartRateBpm: avgHeartRateBpm !== null ? Math.round(avgHeartRateBpm) : null,
      caloriesKcal: workout.totalEnergyBurned != null ? Math.round(workout.totalEnergyBurned) : null,
      steps: stepSamples.length > 0 ? Math.round(stepSamples.reduce((sum, s) => sum + s.value, 0)) : null,
      source: workout.sourceName ?? null,
    };
  } catch {
    return null;
  }
}

export interface RecoveryContext {
  /** bpm — the most recent reading in the days before the run, not tied to the run's own window (resting HR is measured overnight/at rest, never during a workout). */
  restingHeartRateBpm: number | null;
  /** Milliseconds (SDNN) — same "most recent reading" reasoning as resting heart rate. */
  hrvMs: number | null;
  /** mL/min/kg — updates rarely (weeks, not days), so this looks back much further than the other three fields. */
  vo2Max: number | null;
  /** Hours actually asleep (excludes "awake"/"in bed" segments) in the ~20h before the run — covers a run any time the next day after a normal night's sleep. */
  sleepHours: number | null;
}

/** Most recent single value for `dataType` at or before `beforeMs`, or null if nothing was recorded in the lookback window. */
async function latestValue(dataType: HealthDataType, beforeMs: number, lookbackDays: number): Promise<number | null> {
  try {
    const { samples } = await Health.readSamples({
      dataType,
      startDate: new Date(beforeMs - lookbackDays * 24 * 60 * 60_000).toISOString(),
      endDate: new Date(beforeMs).toISOString(),
      limit: 1,
      ascending: false,
    });
    return samples[0]?.value ?? null;
  } catch {
    return null;
  }
}

const SLEEP_STATES_ASLEEP = new Set(["asleep", "rem", "deep", "light"]);

async function sleepHoursBefore(beforeMs: number): Promise<number | null> {
  const samples = await samplesDuring(
    "sleep",
    new Date(beforeMs - 20 * 60 * 60_000).toISOString(),
    new Date(beforeMs).toISOString(),
  );
  const asleep = samples.filter((s) => s.sleepState && SLEEP_STATES_ASLEEP.has(s.sleepState));
  if (asleep.length === 0) return null;
  const ms = asleep.reduce((sum, s) => sum + (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()), 0);
  return Math.round((ms / (60 * 60_000)) * 10) / 10;
}

/**
 * Recovery signals around a run — resting heart rate, HRV, VO2 max and last
 * night's sleep — new in the `@capgo/capacitor-health` switch. Distinct
 * function from `fetchRunHealthData` on purpose: these describe the
 * athlete's state going into the run, not the run itself, and none of them
 * comes from the matched `Workout` the way heart rate/calories/steps do.
 * `null` for the whole result when every field comes back empty — same
 * "nothing to show, not an error" convention as `fetchRunHealthData`.
 */
export async function fetchRecoveryContext(referenceMs: number): Promise<RecoveryContext | null> {
  if (!hasConsent()) return null;
  try {
    if (!(await isHealthAvailable())) return null;
    if (!(await requestHealthPermissions())) return null;

    const [restingHeartRateBpm, hrvMs, vo2Max, sleepHours] = await Promise.all([
      latestValue("restingHeartRate", referenceMs, 7),
      latestValue("heartRateVariability", referenceMs, 7),
      latestValue("vo2Max", referenceMs, 90),
      sleepHoursBefore(referenceMs),
    ]);

    if (restingHeartRateBpm === null && hrvMs === null && vo2Max === null && sleepHours === null) return null;
    return {
      restingHeartRateBpm: restingHeartRateBpm !== null ? Math.round(restingHeartRateBpm) : null,
      hrvMs: hrvMs !== null ? Math.round(hrvMs) : null,
      vo2Max: vo2Max !== null ? Math.round(vo2Max * 10) / 10 : null,
      sleepHours,
    };
  } catch {
    return null;
  }
}
