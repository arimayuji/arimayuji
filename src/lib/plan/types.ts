/**
 * The rules engine: plain arithmetic over the formulas and safety limits in
 * `src/lib/evidence`, never an AI model. An LLM asked to "generate a training
 * plan" can hallucinate a pace or a volume jump that hurts someone — these
 * numbers come from the same cited sources as the /plano evidence card
 * instead, and every decision this engine makes can point back to the
 * `DecisionTopic` that justified it.
 */

export interface RecentRace {
  distanceMeters: number;
  timeSeconds: number;
}

export interface RunnerProfile {
  /** A recent all-out effort, if the athlete has one — unlocks real pace zones (VDOT). Without it, the engine can still shape volume/periodization, just not paces. */
  recentRace?: RecentRace;
  /** Current comfortable weekly volume, in km — the ramp's starting point. */
  currentWeeklyKm: number;
  goalDistanceMeters: number;
  /** ISO date (yyyy-mm-dd) of the goal race. */
  goalDate: string;
  /** How many days a week the athlete runs. Defaults to 4 if omitted. */
  weeklyRunDays?: number;
}

export interface PaceZones {
  vdot: number;
  /** Seconds per km for each training intensity. */
  easySecPerKm: number;
  marathonSecPerKm: number;
  thresholdSecPerKm: number;
  intervalSecPerKm: number;
  repetitionSecPerKm: number;
}

export type TrainingPhase = "base" | "build" | "peak" | "taper";

export type SessionKind = "rest" | "easy" | "quality" | "long";

export type PaceZoneName = "easy" | "marathon" | "threshold" | "interval" | "repetition";

export interface PlannedSession {
  kind: SessionKind;
  km: number;
  /** Only set for "quality" sessions — which pace zone the effort targets. */
  paceZone?: PaceZoneName;
}

export interface PlannedWeek {
  weekNumber: number;
  startDate: string; // ISO date
  phase: TrainingPhase;
  totalKm: number;
  sessions: PlannedSession[];
}

export interface AppliedPainAdjustment {
  severity: "leve" | "moderada" | "forte";
  reportedAt: number;
  factor: number;
  holdWeeks: number;
}

export interface GeneratedPlan {
  weeks: PlannedWeek[];
  paceZones: PaceZones | null;
  /** Which evidence topics actually informed this plan — for the UI to look up citations without hardcoding fact ids. */
  evidenceTopics: import("../evidence").DecisionTopic[];
  /** Set when the input couldn't produce a safe plan (e.g. goal date already past). Never throws — always returns something explainable. */
  warning?: string;
  /** Set when an active pain check-in changed this plan's starting volume — see `PAIN_VOLUME_ADJUSTMENT`. */
  painAdjustment?: AppliedPainAdjustment;
}
