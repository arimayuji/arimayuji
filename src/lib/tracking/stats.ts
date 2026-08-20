/**
 * Aggregating completed runs into weekly/daily buckets for the /progresso
 * dashboard — pure functions over `CompletedRun[]`, no storage access of
 * their own, so they're cheap to unit-test and cheap to recompute on every
 * render at personal-app scale (same reasoning `allTimeBests` and
 * `estimateWeeklyKm` already lean on).
 */
import { runMovingSeconds, type CompletedRun } from "./storage";

/** Local-time Monday 00:00 on or before `ms` — weeks are grouped by calendar week, not a rolling 7-day window, so "esta semana" means the same thing here as it does on a physical calendar. */
export function mondayOf(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday .. 6 = Saturday
  const sinceMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - sinceMonday);
  return d.getTime();
}

/** Local-time midnight on or before `ms`. */
export function dayStartOf(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface WeekBucket {
  /** Monday 00:00 of this week, local time. */
  weekStart: number;
  distanceMeters: number;
  movingSeconds: number;
  runCount: number;
}

/** The last `weeks` calendar weeks including the current (possibly partial) one, oldest first — every week present even when empty, so a gap in training shows as a gap rather than a missing bar. */
export function weeklyBuckets(
  runs: CompletedRun[],
  weeks: number,
  now = Date.now(),
): WeekBucket[] {
  const currentWeekStart = mondayOf(now);
  const buckets: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    buckets.push({
      weekStart: currentWeekStart - i * 7 * 86_400_000,
      distanceMeters: 0,
      movingSeconds: 0,
      runCount: 0,
    });
  }
  const byWeekStart = new Map(buckets.map((b) => [b.weekStart, b]));
  for (const run of runs) {
    const bucket = byWeekStart.get(mondayOf(run.startedAt));
    if (!bucket) continue; // outside the requested window
    bucket.distanceMeters += run.distanceMeters;
    bucket.movingSeconds += runMovingSeconds(run);
    bucket.runCount += 1;
  }
  return buckets;
}

/** Pace in seconds per `unitMeters` (e.g. 1000 for km) for a week's combined distance/time — null for an empty week, never a division by zero dressed as a real number. */
export function bucketPaceSecPerUnit(
  bucket: Pick<WeekBucket, "distanceMeters" | "movingSeconds">,
  unitMeters: number,
): number | null {
  if (bucket.distanceMeters <= 0 || bucket.movingSeconds <= 0) return null;
  return bucket.movingSeconds / (bucket.distanceMeters / unitMeters);
}

export interface DayBucket {
  /** Midnight of this day, local time. */
  dayStart: number;
  distanceMeters: number;
  movingSeconds: number;
  runCount: number;
}

/** The last `days` calendar days including today, oldest first — same "every slot present, even empty" shape as `weeklyBuckets`. */
export function dailyBuckets(runs: CompletedRun[], days: number, now = Date.now()): DayBucket[] {
  const today = dayStartOf(now);
  const buckets: DayBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    buckets.push({ dayStart: today - i * 86_400_000, distanceMeters: 0, movingSeconds: 0, runCount: 0 });
  }
  const byDayStart = new Map(buckets.map((b) => [b.dayStart, b]));
  for (const run of runs) {
    const bucket = byDayStart.get(dayStartOf(run.startedAt));
    if (!bucket) continue;
    bucket.distanceMeters += run.distanceMeters;
    bucket.movingSeconds += runMovingSeconds(run);
    bucket.runCount += 1;
  }
  return buckets;
}

/** Sum of distance for runs that started within the calendar month containing `now`. */
export function monthToDateMeters(runs: CompletedRun[], now = Date.now()): number {
  const d = new Date(now);
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return runs
    .filter((run) => run.startedAt >= monthStart)
    .reduce((sum, run) => sum + run.distanceMeters, 0);
}
