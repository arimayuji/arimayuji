"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/reducedMotion";
import Link from "next/link";
import {
  Card,
  CardTitle,
  delay,
  ExampleBadge,
  NoticeBadge,
  Screen,
  ScreenHeader,
  Stat,
} from "../ui";
import { getEvidenceById, getEvidenceForTopicRanked } from "@/lib/evidence";
import { EvidenceFactRow } from "../evidence-row";
import { GoalDatePicker } from "../date-picker";
import {
  activePainSignal,
  generatePlan,
  ZONE_NUMBER,
  type GeneratedPlan,
  type PlannedSession as EngineSession,
  type PaceZoneName,
  type PaceZones,
} from "@/lib/plan";
import { GOAL_DISTANCE_OPTIONS, type RunnerProfile } from "@/lib/runnerProfile";
import { useRunnerProfile } from "@/lib/useRunnerProfile";
import { estimateWeeklyKm, listCompletedRuns, listPainCheckIns, type PainCheckIn } from "@/lib/tracking/storage";
import { formatPace } from "@/lib/tracking/geoFilter";

/**
 * The plan screen has two real modes, not a mockup-vs-real toggle a person
 * flips — it's whichever one the athlete's own data supports right now:
 *
 * - **Not enough data**: no goal race set on /perfil, or no recent run
 *   history to calibrate volume from. Shows the illustrative example week
 *   (clearly labeled) plus exactly what's missing, so the empty state
 *   teaches instead of just apologizing.
 * - **Real plan**: `src/lib/plan`'s rules engine ran on real inputs — the
 *   athlete's actual recent weekly volume (from IndexedDB, never typed in)
 *   plus the goal/recent-race fields from /perfil. Recomputed on every
 *   visit from current reality, not a fixed plan cached from the day it was
 *   first generated — a light week last week lowers next week's ramp
 *   automatically, the way a coach would react to it.
 */

type SessionKind = "rest" | "easy" | "hard" | "long";

interface DisplaySession {
  day: string;
  title: string;
  detail: string;
  km?: number;
  kind: SessionKind;
}

const ICON_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** One glyph per session kind, in a tinted circle — same "icon in a badge" language as PrBadge, instead of the plain colored-dot-and-pill-chip list every training-plan screen defaults to. */
function KindIcon({ kind }: { kind: SessionKind }) {
  if (kind === "rest") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" {...ICON_STROKE}>
        <path d="M17 12.5A6.5 6.5 0 0 1 9.8 6a7 7 0 1 0 7.2 6.5z" />
      </svg>
    );
  }
  if (kind === "hard") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" {...ICON_STROKE}>
        <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
      </svg>
    );
  }
  if (kind === "long") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" {...ICON_STROKE}>
        <path d="M3 17c4-1 6-9 10-9s3 6 8 5" />
        <circle cx="20" cy="12.5" r="1.3" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" {...ICON_STROKE}>
      <path d="M3 13h4l2-4 3 8 2-6 2 2h5" />
    </svg>
  );
}

const KIND_STYLE: Record<SessionKind, { badge: string; text: string; label: string }> = {
  rest: { badge: "bg-border/40 text-muted", text: "text-muted", label: "descanso" },
  easy: { badge: "bg-good/15 text-good", text: "text-good", label: "leve" },
  hard: { badge: "bg-warn/15 text-warn", text: "text-warn", label: "forte" },
  long: { badge: "bg-accent/15 text-accent", text: "text-accent", label: "longo" },
};

const DAY_NAMES = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

const ZONE_LABEL: Record<PaceZoneName, string> = {
  easy: "Fácil",
  marathon: "Maratona",
  threshold: "Limiar",
  interval: "Intervalado",
  repetition: "Repetição",
};

/** "Z1 · Fácil" — the numbered vocabulary a watch or Strava already trained the athlete to recognize, paired with the descriptive name so it's not just a bare number. */
function zoneDisplayLabel(zone: PaceZoneName): string {
  return `Z${ZONE_NUMBER[zone]} · ${ZONE_LABEL[zone]}`;
}

const PHASE_LABEL: Record<string, string> = {
  base: "base",
  build: "construção",
  peak: "pico",
  taper: "taper",
};

const PAIN_SEVERITY_LABEL: Record<"leve" | "moderada" | "forte", string> = {
  leve: "leve",
  moderada: "moderada",
  forte: "forte",
};

const DEMO_WEEK: DisplaySession[] = [
  { day: "Segunda", title: "Descanso", detail: "Sem corrida. É no descanso que a adaptação acontece.", kind: "rest" },
  { day: "Terça", title: "Corrida leve", detail: "Ritmo de conversa, sem olhar o relógio.", km: 5, kind: "easy" },
  { day: "Quarta", title: "Força + mobilidade", detail: "20 min de agachamento, prancha e panturrilha.", kind: "rest" },
  { day: "Quinta", title: "Intervalado 6 × 400 m", detail: "Forte nos 400 m, 90 s de trote entre as repetições.", km: 6, kind: "hard" },
  { day: "Sexta", title: "Descanso", detail: "Perna leve pro fim de semana.", kind: "rest" },
  { day: "Sábado", title: "Rodagem", detail: "Confortável, terreno plano.", km: 6, kind: "easy" },
  { day: "Domingo", title: "Longão", detail: "Pace uns 40 s/km mais lento que o de prova.", km: 12, kind: "long" },
];

const TOTAL_DEMO_KM = DEMO_WEEK.reduce((sum, session) => sum + (session.km ?? 0), 0);
const DEMO_SESSION_COUNT = DEMO_WEEK.filter((session) => session.km !== undefined).length;

/** Real citations behind the *shape* of the example week — see EvidenceRow. */
const FEATURED_EVIDENCE_IDS = [
  "acsm-fitt-vp-gradual-progression",
  "80-20-polarized-training",
  "taper-2-weeks-exponential",
];

function engineSessionToDisplay(session: EngineSession, day: string): DisplaySession {
  const kind: SessionKind =
    session.kind === "quality" ? "hard" : session.kind === "long" ? "long" : session.kind === "easy" ? "easy" : "rest";
  const title =
    session.kind === "rest"
      ? "Descanso"
      : session.kind === "long"
        ? "Longão"
        : session.kind === "quality"
          ? `Forte${session.paceZone ? ` — ${ZONE_LABEL[session.paceZone]}` : ""}`
          : "Corrida leve";
  const detail =
    session.kind === "rest"
      ? "Sem corrida. É no descanso que a adaptação acontece."
      : session.kind === "long"
        ? "O mais longo da semana, em ritmo confortável."
        : session.kind === "quality"
          ? "O único treino forte da semana — o resto é fácil de propósito."
          : "Ritmo de conversa, sem olhar o relógio.";
  return { day, title, detail, km: session.km > 0 ? session.km : undefined, kind };
}

function SessionRow({ session, index, isLast }: { session: DisplaySession; index: number; isLast: boolean }) {
  const style = KIND_STYLE[session.kind];
  return (
    <li className="pr-enter flex gap-3" style={delay(160 + index * 40)}>
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${style.badge}`}>
        <KindIcon kind={session.kind} />
      </span>
      <div className={`min-w-0 flex-1 ${isLast ? "" : "border-b border-border pb-3"}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted">{session.day}</span>
          <span className={`font-mono text-[10px] uppercase tracking-wide ${style.text}`}>{style.label}</span>
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium">{session.title}</h3>
          {session.km !== undefined && (
            <span className="shrink-0 font-mono text-sm tabular-nums">
              {session.km}
              <span className="ml-0.5 text-xs text-muted">km</span>
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted text-pretty">{session.detail}</p>
      </div>
    </li>
  );
}

function PaceZonesCard({ zones }: { zones: PaceZones }) {
  const rows: [PaceZoneName, number][] = [
    ["easy", zones.easySecPerKm],
    ["marathon", zones.marathonSecPerKm],
    ["threshold", zones.thresholdSecPerKm],
    ["interval", zones.intervalSecPerKm],
    ["repetition", zones.repetitionSecPerKm],
  ];
  return (
    <Card className="pr-enter" style={delay(160)}>
      <CardTitle aside={<NoticeBadge>seu plano</NoticeBadge>}>Suas zonas de pace</CardTitle>
      <p className="mb-4 text-xs leading-relaxed text-muted text-pretty">
        Calculadas do seu tempo recente pela fórmula VDOT (Daniels &amp; Gilbert).
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {rows.map(([zone, secPerKm]) => (
          <div key={zone}>
            <span className="text-[11px] uppercase tracking-wide text-muted">{zoneDisplayLabel(zone)}</span>
            <p className="font-mono text-lg tabular-nums">
              {formatPace(secPerKm)}
              <span className="ml-1 text-xs text-muted">/km</span>
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * The stages `generatePlan()` actually runs through, in order — see
 * `src/lib/plan/vdot.ts`, `volumeProgression.ts` and `periodization.ts`.
 * The pace-related steps only apply when there's a recent race to derive a
 * VDOT from (`plan.paceZones` is null otherwise), so the list narrows rather
 * than claim a calculation that didn't happen.
 */
const STAGES_WITH_PACE = [
  "Calculando VDOT da sua prova recente",
  "Definindo suas zonas de pace",
  "Montando a progressão de volume",
  "Aplicando fases de periodização",
  "Ajustando o taper final",
] as const;

const STAGES_WITHOUT_PACE = [
  "Montando a progressão de volume",
  "Aplicando fases de periodização",
  "Ajustando o taper final",
] as const;

const STAGE_STEP_MS = 200;
const STAGE_HOLD_MS = 220;

type StageState = "pending" | "active" | "done";

function StageIcon({ state }: { state: StageState }) {
  if (state === "done") {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-good" fill="none" aria-hidden="true">
        <path
          d="M4.5 10.5l3.5 3.5L15.5 6.5"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (state === "active") {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 animate-spin text-accent" aria-hidden="true">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth={2.5} fill="none" strokeDasharray="24 44" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
      <span className="h-2 w-2 rounded-full bg-border" />
    </span>
  );
}

/**
 * A CI-pipeline-style step list played once right before the real plan
 * reveals — instant math given some visual weight, not an artificial delay.
 * Advances on its own timers (`STAGE_STEP_MS` apart); calls `onDone` after a
 * short hold on the fully-checked state.
 */
function PlanBuildSequence({ stages, onDone }: { stages: readonly string[]; onDone: () => void }) {
  const [doneCount, setDoneCount] = useState(0);

  useEffect(() => {
    if (doneCount >= stages.length) {
      const timer = setTimeout(onDone, STAGE_HOLD_MS);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setDoneCount((n) => n + 1), STAGE_STEP_MS);
    return () => clearTimeout(timer);
  }, [doneCount, stages.length, onDone]);

  return (
    <Card className="pr-enter" style={delay(60)}>
      <CardTitle aside={<NoticeBadge>montando</NoticeBadge>}>Montando seu plano</CardTitle>
      <ul className="flex flex-col gap-3">
        {stages.map((label, index) => {
          const state: StageState = index < doneCount ? "done" : index === doneCount ? "active" : "pending";
          return (
            <li key={label} className="flex items-center gap-3">
              <StageIcon state={state} />
              <span className={`text-sm ${state === "pending" ? "text-muted" : ""}`}>{label}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Matches what the plan engine itself clamps to (periodization.ts: "at least 2 — long + one more, at most 6 — always 1 rest day") — the stepper's own bounds, not an arbitrary UI choice. */
const MIN_WEEKLY_DAYS = 2;
const MAX_WEEKLY_DAYS = 6;

const DISTANCE_TILE: Record<number, { main: string; sub: string }> = {
  5000: { main: "5", sub: "km" },
  10000: { main: "10", sub: "km" },
  21097: { main: "Meia", sub: "21 km" },
  42195: { main: "Maratona", sub: "42 km" },
};

/** Big number + unit, not a squeezed-in label on a segmented button — a race distance is the single most consequential choice on this screen. */
function DistanceTileGrid({
  selected,
  onSelect,
}: {
  selected: number | undefined;
  onSelect: (meters: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {GOAL_DISTANCE_OPTIONS.map((option) => {
        const isSelected = selected === option.meters;
        const tile = DISTANCE_TILE[option.meters];
        return (
          <button
            key={option.meters}
            type="button"
            onClick={() => onSelect(option.meters)}
            aria-pressed={isSelected}
            className={`flex h-16 flex-col items-center justify-center gap-0.5 rounded-xl border transition-colors ${
              isSelected
                ? "border-transparent bg-accent text-accent-foreground"
                : "border-border bg-background text-foreground"
            }`}
          >
            <span className="text-lg font-extrabold">{tile.main}</span>
            <span className="text-xs font-semibold opacity-75">{tile.sub}</span>
          </button>
        );
      })}
    </div>
  );
}

/** –/+ over a continuous range, not a fixed 3-option pick — the plan engine already supports every value from 2 to 6, the old 3/4/5 buttons just never let you reach the rest. */
function WeeklyDaysStepper({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  return (
    <div className="flex h-16 items-center justify-between rounded-xl border border-border bg-background px-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(MIN_WEEKLY_DAYS, value - 1))}
        disabled={value <= MIN_WEEKLY_DAYS}
        aria-label="Menos dias por semana"
        className="flex h-11 w-11 items-center justify-center rounded-lg text-xl font-bold text-foreground disabled:opacity-30"
      >
        −
      </button>
      <span className="flex items-baseline gap-1.5">
        <span className="text-2xl font-extrabold">{value}</span>
        <span className="text-xs font-semibold text-muted">{value === 1 ? "dia/semana" : "dias/semana"}</span>
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(MAX_WEEKLY_DAYS, value + 1))}
        disabled={value >= MAX_WEEKLY_DAYS}
        aria-label="Mais dias por semana"
        className="flex h-11 w-11 items-center justify-center rounded-lg text-xl font-bold text-foreground disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

function VolumeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true" {...ICON_STROKE}>
      <path d="M4 19c4-6 6-10 8-10s3 6 8 6" />
    </svg>
  );
}

function SessionsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true" {...ICON_STROKE}>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M8 12l3 3 6-6" />
    </svg>
  );
}

function StrongIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true" {...ICON_STROKE}>
      <path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c0-2-1-3-1-3s2 1.5 2 5.5A5.5 5.5 0 0 1 6.5 18C5.7 13.4 8.8 11 12 2z" />
    </svg>
  );
}

/** Icon-labeled Volume/Sessões/Forte trio, shared by the real-plan card, the example-week card, and the build sequence's revealed week. */
function WeekStatsRow({ volumeKm, sessions, hard }: { volumeKm: number; sessions: number; hard: number }) {
  return (
    <div className="mb-5 grid grid-cols-3 gap-3 border-b border-border pb-4">
      <Stat icon={<VolumeIcon />} label="Volume" value={String(volumeKm)} unit="km" />
      <Stat icon={<SessionsIcon />} label="Sessões" value={String(sessions)} />
      <Stat icon={<StrongIcon />} label="Forte" value={String(hard)} />
    </div>
  );
}

/**
 * What feeds the plan engine — race distance/date drive the volume ramp and
 * taper, weekly days shape the week, recent race time (optional) gives real
 * pace zones instead of just volume. Lives here rather than on /perfil
 * because this is where it's used: right above the plan it produces, so
 * changing the goal and seeing the plan react is one screen, not two.
 */
function GoalCard({
  profile,
  updateProfile,
}: {
  profile: RunnerProfile;
  updateProfile: (patch: Partial<RunnerProfile>) => void;
}) {
  const recentMinutes = profile.recentRaceTimeSeconds
    ? Math.floor(profile.recentRaceTimeSeconds / 60)
    : "";
  const recentSeconds = profile.recentRaceTimeSeconds ? profile.recentRaceTimeSeconds % 60 : "";

  const setRecentRaceTime = (minutes: number, seconds: number) => {
    const total = minutes * 60 + seconds;
    updateProfile({ recentRaceTimeSeconds: total > 0 ? total : undefined });
  };

  return (
    <Card className="pr-enter" style={delay(80)}>
      <CardTitle aside={<NoticeBadge>salvo neste aparelho</NoticeBadge>}>Meta de prova</CardTitle>
      <p className="mb-4 text-xs leading-relaxed text-muted text-pretty">
        Distância e data viram a rampa de volume e o taper; o tempo recente (opcional) vira suas
        zonas de pace.
      </p>

      <fieldset>
        <legend className="mb-2.5 block text-[11px] font-bold tracking-[0.05em] text-muted uppercase">
          Distância da prova
        </legend>
        <DistanceTileGrid
          selected={profile.goalDistanceMeters}
          onSelect={(meters) => updateProfile({ goalDistanceMeters: meters })}
        />
      </fieldset>

      <div className="mt-5 space-y-1.5">
        <p className="text-[11px] font-bold tracking-[0.05em] text-muted uppercase">Data da prova</p>
        <GoalDatePicker value={profile.goalDate} onChange={(goalDate) => updateProfile({ goalDate })} />
      </div>

      <fieldset className="mt-6 border-t border-border pt-5">
        <legend className="mb-2.5 block text-[11px] font-bold tracking-[0.05em] text-muted uppercase">
          Dias de corrida por semana
        </legend>
        <WeeklyDaysStepper
          value={profile.weeklyRunDays ?? 4}
          onChange={(days) => updateProfile({ weeklyRunDays: days })}
        />
      </fieldset>

      <fieldset className="mt-6 border-t border-border pt-5">
        <legend className="text-sm font-medium">Seu tempo recente (opcional)</legend>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Uma prova ou treino forte recente numa distância conhecida — dá as suas zonas de pace
          reais. Sem isso o plano ainda calcula volume, só não mostra pace por zona.
        </p>
        <div className="mt-3">
          <DistanceTileGrid
            selected={profile.recentRaceDistanceMeters}
            onSelect={(meters) => updateProfile({ recentRaceDistanceMeters: meters })}
          />
        </div>
        <div className="mt-4 flex items-end justify-center gap-2.5">
          <div className="flex flex-col items-center gap-1.5">
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              placeholder="00"
              value={recentMinutes}
              onChange={(event) =>
                setRecentRaceTime(
                  Number(event.target.value.replace(/\D/g, "").slice(0, 2)) || 0,
                  Number(recentSeconds) || 0,
                )
              }
              className={`w-16 border-b-2 bg-transparent text-center text-3xl font-extrabold outline-none ${
                recentMinutes ? "border-accent" : "border-border"
              }`}
            />
            <span className="text-[11px] font-bold tracking-[0.05em] text-muted uppercase">min</span>
          </div>
          <span className="pb-5 text-2xl font-extrabold text-muted">:</span>
          <div className="flex flex-col items-center gap-1.5">
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              placeholder="00"
              value={recentSeconds}
              onChange={(event) =>
                setRecentRaceTime(
                  Number(recentMinutes) || 0,
                  Number(event.target.value.replace(/\D/g, "").slice(0, 2)) || 0,
                )
              }
              className={`w-16 border-b-2 bg-transparent text-center text-3xl font-extrabold outline-none ${
                recentSeconds ? "border-accent" : "border-border"
              }`}
            />
            <span className="text-[11px] font-bold tracking-[0.05em] text-muted uppercase">seg</span>
          </div>
        </div>
        {profile.recentRaceTimeSeconds && !profile.recentRaceDistanceMeters && (
          <p className="mt-2 text-center text-xs text-warn">Falta escolher a distância desse tempo.</p>
        )}
      </fieldset>

      <Link
        href="/estudos"
        className="mt-6 inline-block border-t border-border pt-5 text-sm text-accent underline underline-offset-2"
      >
        Ver os estudos por trás dele
      </Link>
    </Card>
  );
}

export default function PlanoPage() {
  const [profile, updateProfile] = useRunnerProfile();
  const [weeklyKm, setWeeklyKm] = useState<number | null>(null);
  const [painCheckIns, setPainCheckIns] = useState<PainCheckIn[]>([]);
  const [planRevealed, setPlanRevealed] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const handleBuildSequenceDone = useCallback(() => setPlanRevealed(true), []);

  useEffect(() => {
    listCompletedRuns().then((runs) => setWeeklyKm(estimateWeeklyKm(runs)));
    listPainCheckIns().then(setPainCheckIns);
  }, []);

  const hasGoal = Boolean(profile.goalDistanceMeters && profile.goalDate);
  const loading = weeklyKm === null;
  const hasHistory = (weeklyKm ?? 0) > 0;
  const activePain = useMemo(() => activePainSignal(painCheckIns), [painCheckIns]);

  const plan: GeneratedPlan | null = useMemo(() => {
    if (!hasGoal || !hasHistory || weeklyKm === null) return null;
    return generatePlan(
      {
        recentRace:
          profile.recentRaceDistanceMeters && profile.recentRaceTimeSeconds
            ? {
                distanceMeters: profile.recentRaceDistanceMeters,
                timeSeconds: profile.recentRaceTimeSeconds,
              }
            : undefined,
        currentWeeklyKm: weeklyKm,
        goalDistanceMeters: profile.goalDistanceMeters!,
        goalDate: profile.goalDate!,
        weeklyRunDays: profile.weeklyRunDays,
      },
      new Date(),
      activePain,
    );
  }, [hasGoal, hasHistory, weeklyKm, profile, activePain]);

  const currentWeek = plan?.weeks[0];

  if (loading) {
    return (
      <>
        <ScreenHeader title="Plano" />
        <Screen>
          <Card className="animate-pulse">
            <div className="h-4 w-32 rounded bg-border" />
            <div className="mt-4 h-24 rounded-xl bg-border/70" />
          </Card>
        </Screen>
      </>
    );
  }

  if (plan && currentWeek) {
    if (!planRevealed && !reducedMotion) {
      return (
        <>
          <ScreenHeader
            title="Plano"
            badge={<NoticeBadge>seu plano</NoticeBadge>}
            subtitle="Montando sua semana a partir do seu histórico real."
          />
          <Screen>
            <PlanBuildSequence
              stages={plan.paceZones ? STAGES_WITH_PACE : STAGES_WITHOUT_PACE}
              onDone={handleBuildSequenceDone}
            />
          </Screen>
        </>
      );
    }

    const displaySessions = currentWeek.sessions.map((session, i) =>
      engineSessionToDisplay(session, DAY_NAMES[i]),
    );
    const qualityCount = currentWeek.sessions.filter((s) => s.kind === "quality").length;
    const runCount = currentWeek.sessions.filter((s) => s.km > 0).length;

    return (
      <>
        <ScreenHeader
          title="Plano"
          badge={<NoticeBadge>seu plano</NoticeBadge>}
          subtitle={`Semana ${currentWeek.weekNumber} de ${plan.weeks.length} — fase de ${PHASE_LABEL[currentWeek.phase]}. Calculado do seu histórico real e recalculado sempre que você abre essa tela.`}
        />
        <Screen>
          {plan.warning && (
            <Card className="pr-enter border-warn/30 bg-warn/5" style={delay(60)}>
              <p className="text-sm leading-relaxed text-muted text-pretty">{plan.warning}</p>
            </Card>
          )}

          {plan.painAdjustment && (
            <Card className="pr-enter border-warn/30 bg-warn/5" style={delay(85)}>
              <CardTitle aside={<NoticeBadge>ajustado</NoticeBadge>}>
                Volume reduzido por causa da dor sinalizada
              </CardTitle>
              <p className="text-sm leading-relaxed text-pretty">
                Você sinalizou dor <strong>{PAIN_SEVERITY_LABEL[plan.painAdjustment.severity]}</strong> no
                perfil{plan.painAdjustment.factor < 1
                  ? ` — o volume dessa semana caiu ${Math.round((1 - plan.painAdjustment.factor) * 100)}%`
                  : " — o volume dessa semana ficou congelado, sem subir"}
                , e a progressão segura por {plan.painAdjustment.holdWeeks}{" "}
                {plan.painAdjustment.holdWeeks === 1 ? "semana" : "semanas"} antes de voltar a
                subir.
              </p>
              <Link
                href="/perfil"
                className="mt-3 inline-block text-xs text-accent underline underline-offset-2"
              >
                Atualizar como você está
              </Link>
            </Card>
          )}

          <Card className="pr-enter" style={delay(110)}>
            <CardTitle aside={<NoticeBadge>dados reais</NoticeBadge>}>
              Semana {currentWeek.weekNumber} — {PHASE_LABEL[currentWeek.phase]}
            </CardTitle>
            <WeekStatsRow volumeKm={currentWeek.totalKm} sessions={runCount} hard={qualityCount} />
            <ul className="flex flex-col gap-3">
              {displaySessions.map((session, index) => (
                <SessionRow
                  key={session.day}
                  session={session}
                  index={index}
                  isLast={index === displaySessions.length - 1}
                />
              ))}
            </ul>
            <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted">
              Volume calculado do seu ritmo real das últimas semanas — não é o mesmo pra todo
              mundo. O dia de cada sessão é organização nossa, não vem de estudo nenhum; volume,
              intensidade e taper vêm.
            </p>
          </Card>

          {plan.paceZones && <PaceZonesCard zones={plan.paceZones} />}

          <Card className="pr-enter" style={delay(260)}>
            <CardTitle aside={<NoticeBadge>citações reais</NoticeBadge>}>
              Por que essa semana tem essa cara
            </CardTitle>
            <ul className="flex flex-col gap-3">
              {plan.evidenceTopics.map((topic) => {
                const fact = getEvidenceForTopicRanked(topic)[0];
                return fact ? <EvidenceFactRow key={topic} fact={fact} topic={topic} /> : null;
              })}
            </ul>
            <Link
              href="/estudos"
              className="mt-4 inline-block border-t border-border pt-4 text-xs text-accent underline underline-offset-2"
            >
              Ver todos os estudos por trás do plano
            </Link>
          </Card>

          <GoalCard profile={profile} updateProfile={updateProfile} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title="Plano"
        badge={showExample ? <ExampleBadge /> : undefined}
        subtitle={
          showExample
            ? "Prévia de como o plano semanal vai ser apresentado. Ainda não é o seu plano."
            : "Defina sua meta e registre corridas pra gerar seu plano de verdade."
        }
      />

      <Screen>
        <Card className="pr-enter border-warn/30 bg-warn/5" style={delay(60)}>
          <CardTitle>O que falta pro seu plano de verdade</CardTitle>
          <p className="text-sm leading-relaxed text-muted text-pretty">
            O motor que monta o treino já existe — falta só o que ele precisa de você:
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li className="flex items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${hasGoal ? "bg-good" : "bg-warn"}`}
                aria-hidden="true"
              />
              {hasGoal ? "Meta de prova definida" : "Definir distância e data da prova abaixo"}
            </li>
            <li className="flex items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${hasHistory ? "bg-good" : "bg-warn"}`}
                aria-hidden="true"
              />
              {hasHistory
                ? "Histórico recente disponível"
                : "Gravar algumas corridas pra calibrar seu volume real"}
            </li>
          </ul>
          {!hasHistory && (
            <Link
              href="/run"
              className="mt-4 inline-block rounded-full bg-accent px-5 py-2.5 text-center text-sm font-semibold text-accent-foreground"
            >
              Gravar uma corrida
            </Link>
          )}
        </Card>

        <GoalCard profile={profile} updateProfile={updateProfile} />

        {showExample ? (
          <>
            <Card className="pr-enter" style={delay(110)}>
              <CardTitle aside={<ExampleBadge>semana de exemplo</ExampleBadge>}>
                Semana 3 de 12 — base
              </CardTitle>
              <WeekStatsRow volumeKm={TOTAL_DEMO_KM} sessions={DEMO_SESSION_COUNT} hard={1} />
              <ul className="flex flex-col gap-3">
                {DEMO_WEEK.map((session, index) => (
                  <SessionRow
                    key={session.day}
                    session={session}
                    index={index}
                    isLast={index === DEMO_WEEK.length - 1}
                  />
                ))}
              </ul>
              <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted">
                Números de demonstração. Assim que os dois itens acima estiverem prontos, essa tela
                vira o seu plano de verdade.
              </p>
            </Card>

            <Card className="pr-enter" style={delay(260)}>
              <CardTitle aside={<NoticeBadge>citações reais</NoticeBadge>}>
                Por que essa semana tem essa cara
              </CardTitle>
              <p className="mb-4 text-xs leading-relaxed text-muted text-pretty">
                A semana acima é inventada, mas o formato dela não é aleatório — cada decisão do
                motor de treino vem acompanhada da evidência por trás, com a força dela classificada.
                Aqui vai uma prévia real dessa mecânica.
              </p>
              <ul className="flex flex-col gap-3">
                {FEATURED_EVIDENCE_IDS.map((id) => {
                  const fact = getEvidenceById(id);
                  return fact ? <EvidenceFactRow key={id} fact={fact} topic={fact.topic} /> : null;
                })}
              </ul>
              <Link
                href="/estudos"
                className="mt-4 inline-block border-t border-border pt-4 text-xs text-accent underline underline-offset-2"
              >
                Ver todos os estudos
              </Link>
            </Card>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowExample(true)}
            className="pr-enter flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-5 py-4 text-left"
            style={delay(110)}
          >
            <span>
              <span className="block text-sm font-semibold">Ver uma amostra de como fica</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted text-pretty">
                Uma semana com números inventados só pra mostrar o formato — não é o seu plano.
              </span>
            </span>
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0 text-muted"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        )}
      </Screen>
    </>
  );
}
