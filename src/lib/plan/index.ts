export { computeVdot, paceForZone, paceZonesFromVdot, predictRaceTime } from "./vdot";
export { buildVolumeRamp, PAIN_VOLUME_ADJUSTMENT } from "./volumeProgression";
export { buildWeekSessions, phaseForWeek } from "./periodization";
export { generatePlan } from "./generatePlan";
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
