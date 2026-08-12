import type { DecisionTopic } from "../evidence";
import { computeVdot, paceZonesFromVdot } from "./vdot";
import { buildVolumeRamp } from "./volumeProgression";
import { buildWeekSessions, phaseForWeek } from "./periodization";
import type { GeneratedPlan, PlannedWeek, RunnerProfile } from "./types";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const TAPER_WEEKS = 2;

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Turns a runner's inputs into a full plan — every number here traces to a
 * function in this module (VDOT, the volume ramp, the phase/session split),
 * never to a model call. `now` is injectable for testing; defaults to the
 * real clock.
 */
export function generatePlan(profile: RunnerProfile, now: Date = new Date()): GeneratedPlan {
  const goalDate = new Date(`${profile.goalDate}T00:00:00`);
  const msUntilGoal = goalDate.getTime() - now.getTime();

  if (!Number.isFinite(msUntilGoal) || msUntilGoal <= 0) {
    return {
      weeks: [],
      paceZones: null,
      evidenceTopics: [],
      warning: "A data da meta já passou (ou é inválida) — ajuste a data pra gerar um plano.",
    };
  }

  const totalWeeks = Math.max(1, Math.round(msUntilGoal / MS_PER_WEEK));
  const taperWeeks = Math.min(TAPER_WEEKS, Math.max(0, totalWeeks - 1));
  const rampWeekCount = totalWeeks - taperWeeks;

  const ramp = buildVolumeRamp(profile.currentWeeklyKm, totalWeeks, taperWeeks);

  const weeks: PlannedWeek[] = ramp.map((entry) => {
    const phase = phaseForWeek(entry.weekIndex, rampWeekCount, entry.isTaper);
    const sessions = buildWeekSessions(entry.km, phase, profile.weeklyRunDays);
    return {
      weekNumber: entry.weekIndex + 1,
      startDate: toIsoDate(addDays(now, entry.weekIndex * 7)),
      phase,
      totalKm: entry.km,
      sessions,
    };
  });

  const evidenceTopics: DecisionTopic[] = ["volume_progression", "periodization", "taper"];
  const paceZones = profile.recentRace
    ? paceZonesFromVdot(computeVdot(profile.recentRace.distanceMeters, profile.recentRace.timeSeconds))
    : null;
  if (paceZones) evidenceTopics.push("pace_zones");

  const warning =
    totalWeeks < 4
      ? "Menos de 4 semanas até a meta — não dá tempo de progredir volume com segurança, então o plano abaixo é praticamente só manutenção + taper."
      : undefined;

  return { weeks, paceZones, evidenceTopics, warning };
}
