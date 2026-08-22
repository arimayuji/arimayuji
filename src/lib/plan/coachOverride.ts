/**
 * Overlaying a coach's explicit choice for one week onto the engine's own
 * output — the "planilha" from `src/lib/coachPlanOverrides.ts` meets the
 * plan engine here, and only here: this file has no idea Appwrite exists,
 * it just merges two already-loaded values. `phase`/`startDate`/
 * `weekNumber` describe the calendar and always stay the engine's own —
 * only volume and the day-by-day session shape come from the coach.
 *
 * A coach's override wins over everything else that can touch a week's
 * numbers — the original prescription, and the real-adherence reprojection
 * `schedule.ts`'s `reprojectFromActual` computes — because it's the one
 * signal here that's an explicit human decision, not a formula's guess.
 */
import type { PlannedSession, PlannedWeek } from "./types";

export interface PlanOverrideSessions {
  totalKm: number;
  sessions: PlannedSession[];
}

export function applyCoachOverride<T extends PlanOverrideSessions>(
  week: PlannedWeek,
  override: T | undefined,
): PlannedWeek {
  if (!override) return week;
  return { ...week, totalKm: override.totalKm, sessions: override.sessions };
}
