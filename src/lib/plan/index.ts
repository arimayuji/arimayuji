export { computeVdot, paceForZone, paceZonesFromVdot, predictRaceTime } from "./vdot";
export { classifyPace, timeInZones, ZONE_LABEL, ZONE_NUMBER, ZONE_ORDER } from "./zones";
export type { TimeInZones } from "./zones";
export { buildVolumeRamp, PAIN_VOLUME_ADJUSTMENT } from "./volumeProgression";
export { buildWeekSessions, phaseForWeek } from "./periodization";
export { generatePlan } from "./generatePlan";
export { computeCurrentPlanWeek, isoWeekday, todaysSession, type CurrentPlanWeek } from "./schedule";
export { weekAdherence, weekActualKm, type SessionOutcome } from "./adherence";
export { applyCoachOverride, type PlanOverrideSessions } from "./coachOverride";
export { activePainSignal } from "./painSignal";
export type { ActivePainSignal, PainSeverity } from "./painSignal";
export type {
  AppliedPainAdjustment,
  GeneratedPlan,
  PaceZoneName,
  PaceZones,
  PlannedSession,
  PlannedWeek,
  RecentRace,
  RunnerProfile,
  SessionKind,
  TrainingPhase,
} from "./types";
