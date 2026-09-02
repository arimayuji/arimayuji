/**
 * Pure comparison between a planned week and what was actually recorded —
 * gap 1b/1c from the Runna competitive analysis. The engine in this
 * directory only ever knew how to prescribe a week; nothing matched a real
 * `CompletedRun` back against a `PlannedSession` to say whether it actually
 * happened, and nothing fed a week's real total back into the ramp for the
 * weeks after it. Both live here rather than in `schedule.ts` itself since
 * they're pure day/week arithmetic with no notion of "which week is
 * current" — `schedule.ts` is the one that knows that.
 */
import type { CompletedRun } from "../tracking/storage";
import type { PlannedWeek } from "./types";

export type SessionOutcome = "upcoming" | "done" | "partial" | "over" | "skipped" | "rest";

/**
 * How much of a planned session's distance has to actually show up that day
 * to count as "done" rather than "partial" — loose on purpose. This isn't
 * grading a workout, it's answering "did something like the planned session
 * happen," and a run that came up short by a park lap shouldn't read as a
 * miss the same way skipping entirely does.
 */
const DONE_THRESHOLD = 0.7;

/**
 * And the ceiling the scale was missing. Until this existed the comparison
 * only had a floor: a 1 km easy day answered with 12 km scored exactly the
 * same green "feito" as running it on the nose. For an app whose whole
 * pitch is a plan with a real safety ceiling, that is backwards — a day far
 * above what was prescribed is precisely the risk signal the volume engine
 * exists to prevent (`volumeProgression.ts`'s +10%/week and 30%/2-week
 * caps), and it was being congratulated.
 *
 * 1.5× is **an app heuristic, not a number from `evidence/facts.ts`** — the
 * corpus has progression limits for *weekly* volume, nothing per session,
 * and inventing a citation for this would be exactly the dishonesty the
 * rest of the plan engine avoids. Set where a normal overshoot still reads
 * as normal: finishing 5.4 km on a 5 km day is hitting the session, not
 * exceeding it.
 *
 * Deliberately not styled as a failure. Running more than planned isn't a
 * miss, and calling it one would be the scolding tone SOCIAL-CONTEXT.md
 * rules out — it's information the athlete should have, not a grade.
 */
const OVER_THRESHOLD = 1.5;

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Real km run within one calendar day, from local midnight to local midnight — a session is credited to the day it was run on, not the day it was scheduled for. */
function kmRunOn(dayStart: number, runs: readonly CompletedRun[]): number {
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const meters = runs
    .filter((run) => run.startedAt >= dayStart && run.startedAt < dayEnd)
    .reduce((sum, run) => sum + run.distanceMeters, 0);
  return meters / 1000;
}

/**
 * One outcome per day in `week.sessions` (Monday-first, same order
 * `buildWeekSessions` produces). A rest day is always `"rest"` regardless of
 * whether a run happened — an unplanned extra run doesn't turn a scheduled
 * rest day into a miss. A day that hasn't arrived yet is `"upcoming"`, even
 * today: the day isn't over, so "no run recorded yet" isn't the same claim
 * as "skipped."
 */
export function weekAdherence(
  week: Pick<PlannedWeek, "startDate" | "sessions">,
  runs: readonly CompletedRun[],
  now: Date = new Date(),
): SessionOutcome[] {
  const weekStart = new Date(`${week.startDate}T00:00:00`).getTime();
  const todayStart = startOfLocalDay(now.getTime());

  return week.sessions.map((session, dayIndex) => {
    if (session.kind === "rest") return "rest";
    const dayStart = weekStart + dayIndex * 24 * 60 * 60 * 1000;
    if (dayStart > todayStart) return "upcoming";

    const km = kmRunOn(dayStart, runs);
    if (dayStart === todayStart && km <= 0) return "upcoming";
    if (km <= 0) return "skipped";
    // `session.km > 0` guards the ratio: a non-rest session always carries
    // distance today, but a zero would make every run "over" by division.
    if (session.km > 0 && km >= session.km * OVER_THRESHOLD) return "over";
    return km >= session.km * DONE_THRESHOLD ? "done" : "partial";
  });
}

/** Real total km run within `week`'s 7-day window, regardless of which day — the week-level counterpart to `weekAdherence`'s per-day detail, used both to display "o que você realmente correu" and to anchor the ramp for the weeks that follow (see `schedule.ts`'s `reprojectFromActual`). */
export function weekActualKm(week: Pick<PlannedWeek, "startDate">, runs: readonly CompletedRun[]): number {
  const weekStart = new Date(`${week.startDate}T00:00:00`).getTime();
  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
  const meters = runs
    .filter((run) => run.startedAt >= weekStart && run.startedAt < weekEnd)
    .reduce((sum, run) => sum + run.distanceMeters, 0);
  return meters / 1000;
}
