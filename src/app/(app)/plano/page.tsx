"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/reducedMotion";
import Link from "next/link";
import {
  Card,
  CardTitle,
  delay,
  ExampleBadge,
  Keywords,
  NoticeBadge,
  Screen,
  ScreenHeader,
  SPAN_COLUMNS,
  Stat,
} from "../ui";
import { GoalDatePicker } from "../date-picker";
import {
  activePainSignal,
  applyCoachOverride,
  computeCurrentPlanWeek,
  weekAdherence,
  ZONE_LABEL,
  ZONE_NUMBER,
  type PlannedSession as EngineSession,
  type PaceZoneName,
  type PaceZones,
  type PainSeverity,
  type SessionOutcome,
} from "@/lib/plan";
import { listPlanOverridesForStudent, type ParsedPlanOverride } from "@/lib/coachPlanOverrides";
import { getSelfPlanOverride, removeSelfPlanOverride, setSelfPlanOverride, type SelfPlanOverride } from "@/lib/selfPlanOverride";
import { suggestPlanForSelf, type PlanSuggestion, type SuggestPlanForSelfReason } from "@/lib/selfPlanSuggestion";
import { useAuth } from "@/lib/useAuth";
import { currentMondayIsoDate, type RunnerProfile } from "@/lib/runnerProfile";
import { useRunnerProfile } from "@/lib/useRunnerProfile";
import { syncRunnerProfile } from "@/lib/runnerProfileSync";
import { listRecoverySnapshots, type RecoverySnapshot } from "@/lib/recoverySync";
import {
  estimateWeeklyKm,
  listCompletedRuns,
  listPainCheckIns,
  type CompletedRun,
  type PainCheckIn,
} from "@/lib/tracking/storage";
import { formatPace } from "@/lib/tracking/geoFilter";
import { weeklyBuckets } from "@/lib/tracking/stats";
import { computeConstancyWeeks, tallyConstancy } from "@/lib/tracking/constancy";
import { usePreferences } from "@/lib/usePreferences";
import { RunFrequencyHeatmap } from "../run-frequency-heatmap";
import { ModalPortal } from "../modal-portal";
import {
  PlanKpiStrip,
  TrendChartRow,
  WeekDayTable,
  RecentRecordsCard,
  TrainingLoadCard,
  IntensityRingCard,
  PlanCalendar,
  RecoveryTrendCard,
} from "./plan-dashboard";
import { GoalWizard } from "./goal-wizard";
import { DistanceTileGrid, WeekdayPicker } from "./goal-fields";

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
 *   plus the goal/recent-race fields from /perfil. The full shape (which
 *   week is "week 3") is anchored to `planStartDate`, set once and never
 *   silently reshuffled just from opening this screen again — but the
 *   *volume* for the current week and every week after it does react to
 *   reality: once a week fully elapses, `computeCurrentPlanWeek` swaps in
 *   what was actually run that week and restarts the ramp from there for
 *   everything after (see `schedule.ts`'s `reprojectFromActual`) — a light
 *   week lowers what follows it, the way a coach would react to it, without
 *   the plan pretending week 1 never happened every time you look at it.
 */

export type SessionKind = "rest" | "easy" | "hard" | "long";

export interface DisplaySession {
  day: string;
  title: string;
  detail: string;
  km?: number;
  kind: SessionKind;
  /** Undefined for the illustrative example week and for a `/run` pre-fill — only the real current week has anything to compare against a recorded run. */
  outcome?: SessionOutcome;
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

export const KIND_STYLE: Record<SessionKind, { badge: string; text: string; label: string }> = {
  rest: { badge: "bg-border/40 text-muted", text: "text-muted", label: "descanso" },
  easy: { badge: "bg-good/15 text-good", text: "text-good", label: "leve" },
  hard: { badge: "bg-warn/15 text-warn", text: "text-warn", label: "forte" },
  long: { badge: "bg-accent/15 text-accent", text: "text-accent", label: "longo" },
};

const DAY_NAMES = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

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

function engineSessionToDisplay(session: EngineSession, day: string, outcome?: SessionOutcome): DisplaySession {
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
  return { day, title, detail, km: session.km > 0 ? session.km : undefined, kind, outcome };
}

/**
 * `over` shares `--warn` with `partial` on purpose, and deliberately never
 * gets `--bad`: "pulado" is the only outcome that is actually a miss.
 * Running well past the prescription isn't a failure to scold — it's the
 * risk signal the volume engine exists to catch, so it reads as attention,
 * not as a red mark. See `OVER_THRESHOLD` in plan/adherence.ts.
 */
export const OUTCOME_STYLE: Record<Exclude<SessionOutcome, "rest" | "upcoming">, { label: string; className: string }> = {
  done: { label: "feito", className: "bg-good/15 text-good" },
  partial: { label: "parcial", className: "bg-warn/15 text-warn" },
  over: { label: "acima", className: "bg-warn/15 text-warn" },
  skipped: { label: "pulado", className: "bg-bad/15 text-bad" },
};

/** Small checkmark/dash/x overlay on the session's kind badge — only rendered for a day that's already happened (`SessionRow` skips it for `"rest"`/`"upcoming"` itself). */
function OutcomeBadge({ outcome }: { outcome: Exclude<SessionOutcome, "rest" | "upcoming"> }) {
  const style = OUTCOME_STYLE[outcome];
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide ${style.className}`}
    >
      {style.label}
    </span>
  );
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
          <span className="flex items-center gap-1.5">
            {session.outcome && session.outcome !== "rest" && session.outcome !== "upcoming" && (
              <OutcomeBadge outcome={session.outcome} />
            )}
            <span className={`font-mono text-[10px] uppercase tracking-wide ${style.text}`}>{style.label}</span>
          </span>
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

/**
 * A horizontal bar per zone instead of a bare number grid — bar length is
 * velocity (1000/secPerKm) relative to the fastest zone (repetition, always
 * 100%), so the five zones read as an actual ramp of effort rather than five
 * unrelated numbers. The opacity step on top of that is purely decorative
 * (a visual "tier" cue matching the same ramp everywhere else in the app),
 * not a second encoding of the same value — the bar length alone already
 * carries the real magnitude, and the pace itself is still printed in full.
 */
function PaceZonesCard({ zones }: { zones: PaceZones }) {
  const rows: [PaceZoneName, number][] = [
    ["easy", zones.easySecPerKm],
    ["marathon", zones.marathonSecPerKm],
    ["threshold", zones.thresholdSecPerKm],
    ["interval", zones.intervalSecPerKm],
    ["repetition", zones.repetitionSecPerKm],
  ];
  const velocities = rows.map(([, secPerKm]) => 1000 / secPerKm);
  const maxVelocity = Math.max(...velocities);

  return (
    <Card
      className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
      style={delay(160)}
    >
      <CardTitle aside={<NoticeBadge>seu plano</NoticeBadge>}>Suas zonas de pace</CardTitle>
      <Keywords className="mb-4" items={["seu tempo recente", "fórmula vdot", "daniels & gilbert"]} />
      <div className="flex flex-col gap-3">
        {rows.map(([zone, secPerKm], index) => (
          <div key={zone} className="flex items-center gap-3">
            <span className="w-[92px] shrink-0 text-[11px] uppercase tracking-wide text-muted">
              {zoneDisplayLabel(zone)}
            </span>
            <div className="h-2 min-w-0 flex-1 rounded-full bg-border/50">
              <div
                className="h-2 rounded-full bg-accent"
                style={{
                  width: `${(velocities[index] / maxVelocity) * 100}%`,
                  opacity: 0.35 + (index / (rows.length - 1)) * 0.65,
                }}
              />
            </div>
            <span className="w-[68px] shrink-0 text-right font-mono text-sm font-semibold tabular-nums">
              {formatPace(secPerKm)}
              <span className="ml-0.5 text-[10px] font-normal text-muted">/km</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

const SELF_SUGGEST_ERROR_LABEL: Record<SuggestPlanForSelfReason, string> = {
  unavailable: "IA indisponível nesse build.",
  "no-history": "Precisa de pelo menos uma semana de corrida registrada pra pedir uma sugestão.",
  "missing-goal": "Falta configurar objetivo e data da prova antes de pedir uma sugestão.",
  "ai-not-configured": "IA não configurada nesse ambiente.",
  "ai-unavailable": "IA indisponível agora — tenta de novo em instantes.",
  "ai-invalid-response": "A IA devolveu algo inesperado — tenta de novo.",
  failed: "Não deu pra pedir a sugestão agora — tenta de novo.",
};

/**
 * The self-service twin of `week-plan-editor.tsx`'s "Sugerir com IA" —
 * same underlying mechanism (`selfPlanSuggestion.ts`), but the athlete asks
 * about their own current week, and — unlike the coach flow, where a human
 * still reviews/edits the draft before saving — the suggestion here only
 * ever takes effect after the athlete clicks through the disclaimer modal
 * below. Never rendered when a coach override already exists for this week
 * (see the call site in `PlanoPage`): a coach's explicit choice always wins.
 */
function SelfPlanSuggestionCard({
  weekStartDate,
  recentWeeksKm,
  goalDistanceMeters,
  goalDate,
  weeklyRunDays,
  availableWeekdays,
  recentRace,
  painSignal,
  signedIn,
  override,
  onApplied,
  onRemoved,
}: {
  weekStartDate: string;
  recentWeeksKm: number[];
  goalDistanceMeters: number;
  goalDate: string;
  weeklyRunDays?: number;
  availableWeekdays?: number[];
  recentRace?: { distanceMeters: number; timeSeconds: number };
  painSignal?: { severity: PainSeverity; region?: string };
  signedIn: boolean;
  override: SelfPlanOverride | null;
  onApplied: (override: SelfPlanOverride) => void;
  onRemoved: () => void;
}) {
  const [athleteNote, setAthleteNote] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [pendingSuggestion, setPendingSuggestion] = useState<PlanSuggestion | null>(null);
  const [removing, setRemoving] = useState(false);

  const handleSuggest = async () => {
    setSuggesting(true);
    setSuggestError(null);
    const result = await suggestPlanForSelf({
      weekStartDate,
      recentWeeksKm,
      goalDistanceMeters,
      goalDate,
      weeklyRunDays,
      availableWeekdays,
      recentRace,
      painSignal,
      athleteNote: athleteNote.trim() || undefined,
    });
    setSuggesting(false);
    if (!result.ok) {
      setSuggestError(SELF_SUGGEST_ERROR_LABEL[result.reason]);
      return;
    }
    setPendingSuggestion(result);
  };

  /** Only reachable from the disclaimer modal's own "Estou ciente" button — never called on the suggest response directly. */
  const handleAccept = () => {
    if (!pendingSuggestion) return;
    const accepted: SelfPlanOverride = {
      weekStartDate,
      totalKm: pendingSuggestion.totalKm,
      sessions: pendingSuggestion.sessions,
      note: pendingSuggestion.note || null,
      reasoning: pendingSuggestion.reasoning,
      generatedAt: Date.now(),
    };
    setSelfPlanOverride(accepted);
    setPendingSuggestion(null);
    setAthleteNote("");
    onApplied(accepted);
  };

  const handleRemove = () => {
    setRemoving(true);
    removeSelfPlanOverride(weekStartDate);
    setRemoving(false);
    onRemoved();
  };

  if (!signedIn) {
    return (
      <Card
        className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
        style={delay(230)}
      >
        <CardTitle aside={<NoticeBadge>experimental</NoticeBadge>}>Sugestão de treino com IA</CardTitle>
        <p className="text-sm leading-relaxed text-muted text-pretty">
          Entra na sua conta pra pedir uma sugestão pra essa semana, travada pelo mesmo motor de
          segurança do resto do app.
        </p>
      </Card>
    );
  }

  if (override) {
    return (
      <Card
        className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
        style={delay(230)}
      >
        <CardTitle aside={<NoticeBadge>sugerido por ia</NoticeBadge>}>
          Você aplicou uma sugestão de IA nessa semana
        </CardTitle>
        {override.reasoning && (
          <p className="mb-4 text-sm leading-relaxed text-pretty">{override.reasoning}</p>
        )}
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing}
          className="pr-press rounded-full bg-bad px-4 py-2 text-xs font-semibold text-white hover:bg-bad/90 active:scale-95 disabled:opacity-40 lg:rounded-md"
        >
          {removing ? "Removendo…" : "Remover sugestão"}
        </button>
      </Card>
    );
  }

  return (
    <Card
      className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
      style={delay(230)}
    >
      <CardTitle aside={<NoticeBadge>experimental</NoticeBadge>}>Sugestão de treino com IA</CardTitle>
      <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
        Pede uma sugestão pra essa semana específica, travada pelo mesmo limite seguro de
        progressão que o resto do app usa. Só 1 sugestão por semana.
      </p>
      <textarea
        value={athleteNote}
        onChange={(event) => setAthleteNote(event.target.value.slice(0, 300))}
        placeholder="Alguma coisa que eu deveria saber? (opcional, ex.: voltando de lesão)"
        rows={2}
        className="mb-3 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={handleSuggest}
        disabled={suggesting}
        className="pr-press w-full rounded-xl border border-accent px-4 py-3 text-sm font-semibold text-accent hover:bg-accent/[0.06] active:scale-95 disabled:opacity-40 lg:rounded-md"
      >
        {suggesting ? "Pensando…" : "Sugerir com IA"}
      </button>
      {suggestError && <p className="mt-3 text-xs leading-relaxed text-bad text-pretty">{suggestError}</p>}

      {pendingSuggestion && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
            onClick={() => setPendingSuggestion(null)}
          >
            <div
              role="dialog"
              aria-label="Sugestão de IA — aviso"
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-sm rounded-t-3xl bg-background p-5 pb-8 text-foreground sm:rounded-3xl lg:rounded-lg"
            >
              <div className="mx-auto mb-5 h-1 w-9 rounded-full bg-border" />
              <p className="mb-3 text-base font-bold">Antes de aplicar</p>
              <p className="mb-4 text-sm leading-relaxed text-muted text-pretty">
                Isso é uma sugestão gerada por IA, travada pelo mesmo motor de segurança do app —
                nunca sobe mais que o limite seguro de progressão.{" "}
                <strong className="text-foreground">
                  Não substitui orientação de um profissional de saúde/educação física.
                </strong>
              </p>
              {pendingSuggestion.reasoning && (
                <p className="mb-4 rounded-xl bg-surface p-3 text-xs leading-relaxed text-pretty">
                  {pendingSuggestion.reasoning}
                  {pendingSuggestion.capped && (
                    <>
                      {" "}
                      A IA sugeriu {pendingSuggestion.rawSuggestedTotalKm} km ao todo, mas o limite
                      seguro pra essa semana é {pendingSuggestion.capKm} km — os números acima já
                      foram ajustados pra caber nisso.
                    </>
                  )}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPendingSuggestion(null)}
                  className="pr-press flex-1 rounded-full border border-border px-4 py-3 text-sm font-semibold hover:bg-foreground/[0.04] active:scale-95 lg:rounded-md"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleAccept}
                  className="pr-press flex-1 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90 active:scale-95 lg:rounded-md"
                >
                  Estou ciente, aplicar essa semana
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
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
    <Card className="pr-enter lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" style={delay(60)}>
      <CardTitle aside={<NoticeBadge>montando</NoticeBadge>}>Montando seu plano</CardTitle>
      <ul className="flex flex-col gap-3.5">
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
  className,
  plainAt = "lg",
}: {
  profile: RunnerProfile;
  updateProfile: (patch: Partial<RunnerProfile>) => void;
  className?: string;
  /**
   * Which breakpoint drops the mobile Card's rounded/tinted chrome in favor
   * of the plain content its desktop caller already wraps. Defaults to
   * `"lg"` (the wide, `hasGoal` dashboard's own breakpoint, side-by-side
   * columns and all) — the empty-state screen's own instance passes `"md"`
   * instead, since that screen's plain-desktop treatment starts a
   * breakpoint earlier (see that render's own comment for why: a resized/
   * tablet-width browser window is a real desktop use case, not a phone).
   * A prop instead of always `"md"` because Tailwind needs the complete
   * class name written literally somewhere for its scanner to find it —
   * string-concatenating a breakpoint prefix onto a class name doesn't
   * work, so both variants are spelled out below and picked between.
   */
  plainAt?: "md" | "lg";
}) {
  const recentMinutes = profile.recentRaceTimeSeconds
    ? Math.floor(profile.recentRaceTimeSeconds / 60)
    : "";
  const recentSeconds = profile.recentRaceTimeSeconds ? profile.recentRaceTimeSeconds % 60 : "";

  const setRecentRaceTime = (minutes: number, seconds: number) => {
    const total = minutes * 60 + seconds;
    updateProfile({ recentRaceTimeSeconds: total > 0 ? total : undefined });
  };

  const plainChrome =
    plainAt === "md"
      ? "md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none"
      : "lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none";

  return (
    <Card className={`pr-enter ${plainChrome} ${className ?? ""}`} style={delay(80)}>
      <CardTitle>Meta de prova</CardTitle>

      <fieldset>
        <legend className="mb-2.5 block text-[11px] font-bold tracking-[0.05em] text-muted uppercase">
          Distância da prova
        </legend>
        <DistanceTileGrid
          selected={profile.goalDistanceMeters}
          onSelect={(meters) => updateProfile({ goalDistanceMeters: meters })}
        />
      </fieldset>

      <div className="mt-5 space-y-2">
        <p className="text-[11px] font-bold tracking-[0.05em] text-muted uppercase">Data da prova</p>
        <GoalDatePicker value={profile.goalDate} onChange={(goalDate) => updateProfile({ goalDate })} />
      </div>

      <fieldset className="mt-6 border-t border-border pt-5">
        <legend className="mb-2.5 block text-[11px] font-bold tracking-[0.05em] text-muted uppercase">
          Dias que você pode correr
        </legend>
        <WeekdayPicker
          value={profile.availableWeekdays}
          weeklyRunDays={profile.weeklyRunDays}
          onChange={(days) => updateProfile({ availableWeekdays: days, weeklyRunDays: days.length })}
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
              aria-label="Minutos"
              value={recentMinutes}
              onChange={(event) =>
                setRecentRaceTime(
                  Number(event.target.value.replace(/\D/g, "").slice(0, 2)) || 0,
                  Number(recentSeconds) || 0,
                )
              }
              className={`w-16 border-b-2 bg-transparent text-center text-3xl font-extrabold outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 lg:w-12 lg:text-xl lg:tracking-[-0.01em] ${
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
              aria-label="Segundos"
              value={recentSeconds}
              onChange={(event) =>
                setRecentRaceTime(
                  Number(recentMinutes) || 0,
                  Number(event.target.value.replace(/\D/g, "").slice(0, 2)) || 0,
                )
              }
              className={`w-16 border-b-2 bg-transparent text-center text-3xl font-extrabold outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 lg:w-12 lg:text-xl lg:tracking-[-0.01em] ${
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
    </Card>
  );
}

/** See `planRevealed`'s own comment — once this device has seen the "montando seu plano" build animation, it never plays again. */
const PLAN_BUILD_SEQUENCE_SEEN_KEY = "xanthus:plan-build-sequence-seen";

export default function PlanoPage() {
  const { account, profile: authProfile } = useAuth();
  const [profile, setRunnerProfile] = useRunnerProfile();
  /**
   * Every goal-editing call site below already calls `updateProfile({...})`
   * — wrapping the raw setter here (instead of touching each call site) is
   * what makes each of those edits also kick off a `syncRunnerProfile()`
   * round, gated on the opt-in, without duplicating that check six times.
   */
  const runSyncOptIn = authProfile?.runSyncOptIn ?? false;
  const updateProfile = useCallback(
    (patch: Partial<RunnerProfile>) => {
      setRunnerProfile(patch);
      if (runSyncOptIn) void syncRunnerProfile();
    },
    [setRunnerProfile, runSyncOptIn],
  );
  const [completedRuns, setCompletedRuns] = useState<CompletedRun[] | null>(null);
  const [painCheckIns, setPainCheckIns] = useState<PainCheckIn[]>([]);
  const [coachOverrides, setCoachOverrides] = useState<Map<string, ParsedPlanOverride>>(new Map());
  const [recoverySnapshots, setRecoverySnapshots] = useState<RecoverySnapshot[]>([]);
  const [selfOverride, setSelfOverrideState] = useState<SelfPlanOverride | null>(null);
  /**
   * Persisted, not just component state — this used to reset to `false`
   * on every mount, so navigating away from /plano and back replayed the
   * whole "montando seu plano" build animation every single time instead
   * of the one-time reveal it's meant to be. `localStorage` (not
   * `sessionStorage`, unlike Splash) because the intent here is "this
   * device has seen its plan built before", permanent, not "once per app
   * launch".
   */
  const [planRevealed, setPlanRevealed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(PLAN_BUILD_SEQUENCE_SEEN_KEY) === "1",
  );
  const [showExample, setShowExample] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const handleBuildSequenceDone = useCallback(() => {
    if (typeof window !== "undefined") localStorage.setItem(PLAN_BUILD_SEQUENCE_SEEN_KEY, "1");
    setPlanRevealed(true);
  }, []);

  useEffect(() => {
    listCompletedRuns().then(setCompletedRuns);
    listPainCheckIns().then(setPainCheckIns);
  }, []);

  // Only meaningful once signed in — a coach's override is keyed by the
  // real account ID, and there's no such thing as a coach for a local-only
  // athlete who never made an account.
  useEffect(() => {
    if (!account) return;
    listPlanOverridesForStudent(account.id).then(setCoachOverrides);
  }, [account]);

  // Reads happily from any device (a plain owner-only listRows, legal for
  // a direct client call) even though only a native device with a watch
  // ever *writes* a row — this is what lets the desktop dashboard below
  // show a trend synced from the phone. Empty for the vast majority of
  // accounts (two nested opt-ins + a paired watch), same as every other
  // desktop-only card here degrading to "nothing to show" rather than an
  // error.
  useEffect(() => {
    if (!account) return;
    listRecoverySnapshots(account.id).then(setRecoverySnapshots);
  }, [account]);

  const hasGoal = Boolean(profile.goalDistanceMeters && profile.goalDate);
  const loading = completedRuns === null;
  const weeklyKm = useMemo(() => (completedRuns ? estimateWeeklyKm(completedRuns) : 0), [completedRuns]);
  const hasHistory = weeklyKm > 0;

  /**
   * A goal set before `planStartDate` existed has no anchor yet —
   * `saveRunnerProfile` only stamps one at the moment a goal is actually
   * *changed*, not for a goal that was already sitting in storage the day
   * this feature shipped. Backfilling it here, once, the first time such a
   * profile is seen, is what keeps every hasGoal profile guaranteed to have
   * one from this point on, rather than `/plano` needing its own
   * "not anchored yet" fallback path forever.
   */
  useEffect(() => {
    if (hasGoal && !profile.planStartDate) updateProfile({ planStartDate: currentMondayIsoDate() });
  }, [hasGoal, profile.planStartDate, updateProfile]);

  /**
   * `computeCurrentPlanWeek` (src/lib/plan/schedule.ts) owns both the
   * anchoring (a fixed plan shape computed once against `planStartDate`,
   * not recomputed fresh every visit) and the "which week is today" lookup
   * into it — shared with `/run`'s own use of the same plan for pre-filling
   * today's session, so that math exists in exactly one place.
   */
  const current = useMemo(() => {
    if (!hasGoal || !hasHistory || !completedRuns) return null;
    return computeCurrentPlanWeek(profile, completedRuns, painCheckIns);
  }, [hasGoal, hasHistory, completedRuns, profile, painCheckIns]);
  const plan = current?.plan ?? null;
  /**
   * A coach's explicit choice for this exact week (looked up by
   * `startDate`, the same ISO Monday the engine already stamps every week
   * with) wins over both the engine's original prescription and its own
   * real-adherence reprojection — see `applyCoachOverride`'s own comment.
   */
  const coachOverride = current ? coachOverrides.get(current.currentWeek.startDate) : undefined;
  /**
   * A self-suggested override (accepted through the disclaimer in
   * `SelfPlanSuggestionCard`) applies the same way a coach's does, but only
   * when there isn't one — a coach's explicit choice is a human decision
   * and always wins over an unsupervised AI suggestion, see
   * /root/.claude/plans/cronograma-ia-autoatendimento.md.
   */
  const effectiveOverride = coachOverride ?? selfOverride ?? undefined;
  const currentWeek = current ? applyCoachOverride(current.currentWeek, effectiveOverride) : undefined;

  // Local-only, unlike coachOverrides above — see selfPlanOverride.ts. Read
  // during render rather than an effect (the "adjusting state when a
  // dependency changes" pattern React's own docs describe): a plain
  // `localStorage` read is synchronous and side-effect-free from React's
  // point of view, so there's nothing here an effect would add — this only
  // needs to re-run the one time `currentWeek.startDate` actually changes,
  // which the `loadedWeekKey` guard below detects without needing useEffect
  // at all (and without the extra render+flash an effect would cost).
  const weekKey = current?.currentWeek.startDate ?? null;
  const [loadedWeekKey, setLoadedWeekKey] = useState<string | null>(null);
  if (weekKey !== loadedWeekKey) {
    setLoadedWeekKey(weekKey);
    setSelfOverrideState(weekKey ? getSelfPlanOverride(weekKey) : null);
  }
  const adherence = useMemo(
    () => (currentWeek && completedRuns ? weekAdherence(currentWeek, completedRuns) : null),
    [currentWeek, completedRuns],
  );

  /**
   * The desktop dashboard's real running-history data (see plan-dashboard.tsx)
   * — computed here, once, from the same `completedRuns` the plan engine
   * itself already reads, and shared between the KPI strip, the trend
   * charts and the training-load card below instead of each recomputing its
   * own slice of `weeklyBuckets`.
   */
  const [{ distanceUnit }] = usePreferences();
  const buckets12 = useMemo(() => (completedRuns ? weeklyBuckets(completedRuns, 12) : []), [completedRuns]);
  const elevationStats = useMemo(() => {
    if (!completedRuns || buckets12.length === 0) return { totalMeters: 0, countedRuns: 0, totalRunsInWindow: 0 };
    const windowStart = buckets12[0].weekStart;
    const windowEnd = buckets12[buckets12.length - 1].weekStart + 7 * 24 * 60 * 60 * 1000;
    let totalMeters = 0;
    let countedRuns = 0;
    let totalRunsInWindow = 0;
    for (const run of completedRuns) {
      if (run.startedAt < windowStart || run.startedAt >= windowEnd) continue;
      totalRunsInWindow += 1;
      if (run.elevationGainMeters !== undefined) {
        totalMeters += run.elevationGainMeters;
        countedRuns += 1;
      }
    }
    return { totalMeters, countedRuns, totalRunsInWindow };
  }, [completedRuns, buckets12]);
  /**
   * Reuses the same weekly consistency target the athlete already set on
   * /progresso (`weeklyTargetKind`/`weeklyTargetValue`) rather than inventing
   * a second, differently-scoped "constancy" definition here — one number,
   * shown in two places. Null (not an empty tally) when no target is set at
   * all, so the KPI tile can point at /progresso instead of claiming 0/0.
   */
  const constancy = useMemo(() => {
    if (!completedRuns || !profile.weeklyTargetKind || !profile.weeklyTargetValue) return null;
    const weeks = computeConstancyWeeks(
      completedRuns,
      painCheckIns,
      { kind: profile.weeklyTargetKind, value: profile.weeklyTargetValue },
      16,
    );
    return { tally: tallyConstancy(weeks), weeks: weeks.filter((w) => !w.beforeFirstRun) };
  }, [completedRuns, painCheckIns, profile.weeklyTargetKind, profile.weeklyTargetValue]);

  if (loading) {
    return (
      <>
        <ScreenHeader panel compactOnWide hideTitle title="Plano" />
        <Screen panel>
          <Card className={`animate-pulse lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none ${SPAN_COLUMNS}`}>
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
            panel
            compactOnWide
            hideTitle
            title="Plano"
            badge={<NoticeBadge>seu plano</NoticeBadge>}
          />
          <Screen panel singleColumn>
            <PlanBuildSequence
              stages={plan.paceZones ? STAGES_WITH_PACE : STAGES_WITHOUT_PACE}
              onDone={handleBuildSequenceDone}
            />
          </Screen>
        </>
      );
    }

    const displaySessions = currentWeek.sessions.map((session, i) =>
      engineSessionToDisplay(session, DAY_NAMES[i], adherence?.[i]),
    );
    const actualKmSoFar = current?.weeksActualKm[current.currentWeekIndex] ?? null;
    const qualityCount = currentWeek.sessions.filter((s) => s.kind === "quality").length;
    const runCount = currentWeek.sessions.filter((s) => s.km > 0).length;
    /**
     * The same real weekly-volume numbers `generatePlan`'s own ramp is built
     * from — computed here, not read from any server table, since this
     * athlete's history already lives entirely on this device (see
     * `SelfPlanSuggestionCard`'s own comment). The last (current, partial)
     * week is dropped: only weeks strictly before the one being suggested
     * count as "trend", same convention `suggest-plan-override` follows
     * server-side for the coach flow.
     */
    const recentWeeksKm = completedRuns
      ? weeklyBuckets(completedRuns, 5)
          .slice(0, 4)
          .map((bucket) => Math.round((bucket.distanceMeters / 1000) * 10) / 10)
      : [];
    const activePain = activePainSignal(painCheckIns);
    const painSignalForAi = activePain ? { severity: activePain.severity, region: activePain.region } : undefined;

    return (
      <>
        <ScreenHeader
          wide
          compactOnWide
          hideTitle
          title="Plano"
          badge={<NoticeBadge>seu plano</NoticeBadge>}
          subtitle={`Semana ${currentWeek.weekNumber} de ${plan.weeks.length} — fase de ${PHASE_LABEL[currentWeek.phase]}`}
        />
        <Screen wide>
          {plan.warning && (
            <Card
              className="pr-enter border-warn/30 bg-warn/5 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-2"
              style={delay(60)}
            >
              <p className="text-sm leading-relaxed text-muted text-pretty">{plan.warning}</p>
            </Card>
          )}

          {plan.painAdjustment && (
            <Card
              className="pr-enter border-warn/30 bg-warn/5 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-2"
              style={delay(85)}
            >
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

          {coachOverride ? (
            <Card
              className="pr-enter border-accent/30 bg-accent/5 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-2"
              style={delay(95)}
            >
              <CardTitle aside={<NoticeBadge>treinador</NoticeBadge>}>
                Seu treinador definiu essa semana
              </CardTitle>
              <p className="text-sm leading-relaxed text-pretty">
                {coachOverride.note
                  ? coachOverride.note
                  : "O volume e as sessões abaixo vieram direto do seu treinador, não do cálculo automático."}
              </p>
            </Card>
          ) : selfOverride ? (
            <Card
              className="pr-enter border-accent/30 bg-accent/5 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-2"
              style={delay(95)}
            >
              <CardTitle aside={<NoticeBadge>sugerido por ia</NoticeBadge>}>
                Você aplicou uma sugestão de IA nessa semana
              </CardTitle>
              <p className="text-sm leading-relaxed text-pretty">
                {selfOverride.note ||
                  "O volume e as sessões abaixo vieram da sugestão que você aceitou, não do cálculo automático."}
              </p>
            </Card>
          ) : (
            current?.wasReprojected && (
              <Card
                className="pr-enter border-accent/30 bg-accent/5 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-2"
                style={delay(95)}
              >
                <CardTitle aside={<NoticeBadge>ajustado</NoticeBadge>}>
                  Ajustamos essa semana pelo que você realmente correu
                </CardTitle>
                <p className="text-sm leading-relaxed text-pretty">
                  O volume da semana passada saiu diferente do planejado, então a progressão a
                  partir de agora recomeça de onde você realmente está — nunca do número que o
                  plano só previa.
                </p>
              </Card>
            )
          )}

          {/*
            Desktop-only real running-history layer (see plan-dashboard.tsx)
            — a browser visit to this screen has the width to show more than
            just this week's prescription, so it also gets the actual trend
            behind it: volume/pace over the last 12 weeks, elevation, weekly
            consistency, recent PRs, training load. None of this exists on
            the phone-width layout below, and none of it changes what that
            layout renders — it's additive, not a reskin of the plan itself.
          */}
          <div className="hidden lg:block">
            <PlanKpiStrip
              totalKmPlanned={currentWeek.totalKm}
              actualKmSoFar={actualKmSoFar}
              buckets12={buckets12}
              elevationMeters={elevationStats.totalMeters}
              elevationRunsCounted={elevationStats.countedRuns}
              elevationRunsInWindow={elevationStats.totalRunsInWindow}
              constancy={constancy}
              weekNumber={currentWeek.weekNumber}
              totalWeeks={plan.weeks.length}
              goalDate={profile.goalDate!}
            />
            <div className="mt-6">
              <TrendChartRow buckets12={buckets12} targetKm={currentWeek.totalKm} />
            </div>
            <div className="mt-6 border-b border-border pb-6">
              <PlanCalendar weeks={plan.weeks} currentWeekNumber={currentWeek.weekNumber} />
            </div>
          </div>

          {completedRuns && (
            <div className="hidden border-b border-border pb-6 lg:block">
              <IntensityRingCard
                runs={completedRuns}
                recentRaceDistanceMeters={profile.recentRaceDistanceMeters}
                recentRaceTimeSeconds={profile.recentRaceTimeSeconds}
              />
            </div>
          )}

          {/* RecoveryTrendCard returns null for the vast majority of
              accounts — this needs a paired watch plus two nested opt-ins
              (see /perfil/sincronizacao) — so the wrapper (border includes)
              only renders at all once there's something to show, instead
              of leaving a stray empty divider line behind. */}
          {recoverySnapshots.length > 0 && (
            <div className="hidden border-b border-border pb-6 lg:block">
              <RecoveryTrendCard snapshots={recoverySnapshots} />
            </div>
          )}

          {completedRuns && (
            <div className="hidden lg:block">
              <RunFrequencyHeatmap runs={completedRuns} unit={distanceUnit} delayMs={140} />
            </div>
          )}

          {/*
            Three columns at `lg:`, not two — a 2-column split put the week
            alone on one side and everything else (pace, evidence, AI
            suggestion, goal) piled into a single much-taller column on the
            other, which just moved the "one big vertical stack" problem
            over rather than fixing it. Grouping by what each thing is
            (the week you act on / your numbers for it / your settings)
            keeps the three roughly even. `flex-row` only at `lg:`; below
            that every group still stacks via its own `flex flex-col`, in
            week → pace+AI → goal order — a deliberate reshuffle from the
            old single-column order (evidence used to sit right after pace
            zones, now it's its own full-width section at the end, below):
            evidence is reference reading, not something to act on, so it
            reads last on any width instead of interrupting the numbers a
            phone screen shows for this week.
          */}
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
            <div className="flex flex-col gap-5 lg:flex-[1.3]">
              <Card className="pr-enter lg:hidden" style={delay(110)}>
                <CardTitle
                  aside={
                    <NoticeBadge>
                      {coachOverride ? "treinador" : selfOverride ? "sugerido por ia" : "dados reais"}
                    </NoticeBadge>
                  }
                >
                  Semana {currentWeek.weekNumber} — {PHASE_LABEL[currentWeek.phase]}
                </CardTitle>
                <WeekStatsRow volumeKm={currentWeek.totalKm} sessions={runCount} hard={qualityCount} />
                {actualKmSoFar !== null && (
                  <p className="mb-4 -mt-2 text-xs leading-relaxed text-muted text-pretty">
                    Até agora você já correu <strong className="text-foreground">{actualKmSoFar} km</strong>{" "}
                    essa semana.
                  </p>
                )}
                <ul className="flex flex-col gap-3.5">
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

              {/* Same `displaySessions`, as a real table with a kind filter — see WeekDayTable's own comment. */}
              <div className="hidden lg:block">
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="font-mono text-sm font-semibold tracking-wide">Sua semana</h2>
                  <NoticeBadge>
                    {coachOverride ? "treinador" : selfOverride ? "sugerido por ia" : "dados reais"}
                  </NoticeBadge>
                </div>
                {actualKmSoFar !== null && (
                  <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
                    Até agora você já correu <strong className="text-foreground">{actualKmSoFar} km</strong>{" "}
                    essa semana, de {currentWeek.totalKm} km planejados.
                  </p>
                )}
                <WeekDayTable sessions={displaySessions} />
                <p className="mt-3 text-xs leading-relaxed text-muted">
                  Volume calculado do seu ritmo real das últimas semanas — não é o mesmo pra todo
                  mundo. O dia de cada sessão é organização nossa, não vem de estudo nenhum; volume,
                  intensidade e taper vêm.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-5 lg:flex-1">
              {plan.paceZones && <PaceZonesCard zones={plan.paceZones} />}

              {!coachOverride && (
                <SelfPlanSuggestionCard
                  weekStartDate={currentWeek.startDate}
                  recentWeeksKm={recentWeeksKm}
                  goalDistanceMeters={profile.goalDistanceMeters!}
                  goalDate={profile.goalDate!}
                  weeklyRunDays={profile.weeklyRunDays}
                  availableWeekdays={profile.availableWeekdays}
                  recentRace={
                    profile.recentRaceDistanceMeters && profile.recentRaceTimeSeconds
                      ? { distanceMeters: profile.recentRaceDistanceMeters, timeSeconds: profile.recentRaceTimeSeconds }
                      : undefined
                  }
                  painSignal={painSignalForAi}
                  signedIn={Boolean(account)}
                  override={selfOverride}
                  onApplied={setSelfOverrideState}
                  onRemoved={() => setSelfOverrideState(null)}
                />
              )}
            </div>

            <div className="flex flex-col gap-5 lg:flex-1">
              <GoalCard profile={profile} updateProfile={updateProfile} />
            </div>
          </div>

          {completedRuns && (
            <div className="hidden gap-6 border-b border-border pb-6 lg:grid lg:grid-cols-2 lg:divide-x lg:divide-border">
              <div className="lg:pr-6">
                <RecentRecordsCard runs={completedRuns} />
              </div>
              <div className="lg:pl-6">
                <TrainingLoadCard runs={completedRuns} buckets={buckets12} />
              </div>
            </div>
          )}

        </Screen>
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        panel
        compactOnWide
        hideTitle
        title="Plano"
        badge={showExample ? <ExampleBadge /> : undefined}
      />

      <Screen panel singleColumn>
        {/* Desktop: plain, centered, black-on-white — not the mobile card
            (rounded/tinted/pill-button) stretched wide. A browser tab isn't
            a phone screen, so this state shouldn't read like one.
            Breakpoint is `md:` (768px), not this file's usual `lg:`
            (1024px, where the sidebar/header chrome switches over) —
            reported directly against this exact screen: a resized desktop
            window or a tablet between those two widths was still getting
            the mobile card, just stretched wider, which is the same "native
            app re-rendered on web" complaint this whole pass exists to fix,
            not a real fix for it. GoalCard's own `plainAt="md"` below keeps
            its chrome-dropping in sync with this same threshold. */}
        <div className="hidden md:flex md:flex-col md:items-center md:py-10 md:text-center">
          <div className="w-full max-w-xl">
            <h2 className="text-xl font-semibold text-foreground lg:tracking-[-0.01em]">O que falta pro seu plano de verdade</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              O motor que monta o treino já existe — falta só o que ele precisa de você:
            </p>
            <ul className="mt-5 flex flex-col items-center gap-2 text-sm text-foreground">
              <li className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${hasGoal ? "bg-good" : "bg-warn"}`}
                  aria-hidden="true"
                />
                {hasGoal ? "Meta de prova definida" : "Definir distância e data da prova abaixo"}
              </li>
              <li className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${hasHistory ? "bg-good" : "bg-warn"}`}
                  aria-hidden="true"
                />
                {hasHistory
                  ? "Histórico recente disponível"
                  : "Grave algumas corridas no app do celular pra calibrar seu volume real"}
              </li>
            </ul>
            {/* No "Gravar uma corrida" CTA here on purpose — the browser is
                analysis-only (coach dashboard), tracking a run only happens
                in the native app. Linking to /run here would open a form
                for a GPS flow the desktop build can't actually run. */}
          </div>

          <div className="mt-10 w-full max-w-xl text-left">
            {hasGoal ? (
              <GoalCard profile={profile} updateProfile={updateProfile} plainAt="md" />
            ) : (
              <GoalWizard profile={profile} updateProfile={updateProfile} hasGoal={hasGoal} />
            )}
          </div>
        </div>

        <Card className="pr-enter border-warn/30 bg-warn/5 md:hidden" style={delay(60)}>
          <CardTitle>O que falta pro seu plano de verdade</CardTitle>
          <p className="text-sm leading-relaxed text-muted text-pretty">
            O motor que monta o treino já existe — falta só o que ele precisa de você:
          </p>
          <ul className="mt-3 flex flex-col gap-2.5 text-sm">
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
              className="pr-press mt-4 inline-block rounded-full bg-accent px-5 py-2.5 text-center text-sm font-semibold text-accent-foreground hover:bg-accent/90 active:scale-95"
            >
              Gravar uma corrida
            </Link>
          )}
        </Card>

        <GoalCard profile={profile} updateProfile={updateProfile} className="md:hidden" />

        {showExample ? (
          <>
            <Card
              className="pr-enter md:rounded-none md:border-0 md:border-t md:border-border md:bg-transparent md:p-0 md:pt-4 md:shadow-none"
              style={delay(110)}
            >
              <CardTitle aside={<ExampleBadge>semana de exemplo</ExampleBadge>}>
                Semana 3 de 12 — base
              </CardTitle>
              <WeekStatsRow volumeKm={TOTAL_DEMO_KM} sessions={DEMO_SESSION_COUNT} hard={1} />
              <ul className="flex flex-col gap-3.5">
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
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowExample(true)}
            className="pr-enter pr-press flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-5 py-4 text-left hover:bg-foreground/[0.04] active:bg-foreground/[0.08] md:rounded-none md:border-0 md:border-t md:border-border md:bg-transparent md:px-0 md:pt-4 md:pb-0"
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
