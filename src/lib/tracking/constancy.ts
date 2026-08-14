/**
 * Weekly consistency, not a daily streak.
 *
 * The unit is the week on purpose: a training plan prescribes rest days
 * (`buildWeekSessions` in `plan/periodization.ts` always leaves at least
 * one), so a daily streak would fight the plan engine outright, and the
 * research behind this feature is explicit that daily streaks push people
 * to train through pain. A week is judged met-or-not as a whole instead.
 *
 * A week can also be *protected* rather than met or missed — logging a pain
 * check-in during that week does it automatically, silently, no dialog to
 * confirm. That's the direct translation of Duolingo's streak-freeze design
 * (applied retroactively, no "use your freeze?" prompt) into a shape that
 * also rewards the honest behaviour of reporting pain instead of pushing
 * through it. A missed week is never shown as a failure — just not yet met.
 */
import type { CompletedRun, PainCheckIn } from "./storage";
import { mondayOf, weeklyBuckets, type WeekBucket } from "./stats";

export type WeeklyTargetKind = "runs" | "km";

export interface WeeklyTarget {
  kind: WeeklyTargetKind;
  value: number;
}

export interface ConstancyWeek {
  weekStart: number;
  met: boolean;
  /** A pain check-in was logged sometime during this week — the week neither counts against the athlete nor inflates the "met" count. */
  protected: boolean;
  /** This calendar week hasn't finished yet — still being written, never judged met or missed while it's still in progress. */
  inProgress: boolean;
  /** Before the athlete's first-ever recorded run — blank in the grid, never a red mark for a week the app couldn't have seen. */
  beforeFirstRun: boolean;
  bucket: WeekBucket;
}

function weekMeetsTarget(bucket: WeekBucket, target: WeeklyTarget): boolean {
  if (target.kind === "runs") return bucket.runCount >= target.value;
  return bucket.distanceMeters / 1000 >= target.value;
}

/** Every calendar week from `weeks` weeks ago through the current (possibly still in progress) one, oldest first — same "every slot present" shape `weeklyBuckets` already uses. */
export function computeConstancyWeeks(
  runs: CompletedRun[],
  painCheckIns: Pick<PainCheckIn, "reportedAt">[],
  target: WeeklyTarget,
  weeks: number,
  now = Date.now(),
): ConstancyWeek[] {
  const buckets = weeklyBuckets(runs, weeks, now);
  const currentWeekStart = mondayOf(now);
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const firstRunWeekStart = runs.length > 0 ? mondayOf(Math.min(...runs.map((r) => r.startedAt))) : null;

  return buckets.map((bucket) => {
    const inProgress = bucket.weekStart === currentWeekStart;
    const beforeFirstRun = firstRunWeekStart === null || bucket.weekStart < firstRunWeekStart;
    const weekEnd = bucket.weekStart + weekMs;
    const protectedWeek =
      !inProgress &&
      !beforeFirstRun &&
      painCheckIns.some((c) => c.reportedAt >= bucket.weekStart && c.reportedAt < weekEnd);
    return {
      weekStart: bucket.weekStart,
      met: !inProgress && !beforeFirstRun && weekMeetsTarget(bucket, target),
      protected: protectedWeek,
      inProgress,
      beforeFirstRun,
      bucket,
    };
  });
}

export interface ConstancyTally {
  met: number;
  /** Every week that counted for or against the athlete — not in progress, not before their first run, not protected. Never padded out to the full window requested, so a new account doesn't read as a string of misses. */
  judged: number;
}

/** Headline count: weeks met, out of every judged week since the first recorded run. Protected weeks count neither for nor against, so they're excluded from both sides rather than counted as a miss. */
export function tallyConstancy(weeks: ConstancyWeek[]): ConstancyTally {
  const judged = weeks.filter((w) => !w.inProgress && !w.beforeFirstRun && !w.protected);
  return { met: judged.filter((w) => w.met).length, judged: judged.length };
}
