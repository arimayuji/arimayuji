"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Card, CardTitle, delay, ExampleBadge, NoticeBadge, Screen, ScreenHeader, Stat } from "../ui";
import { getEvidenceById, getEvidenceForTopicRanked, strengthLabel, type EvidenceFact } from "@/lib/evidence";
import {
  activePainSignal,
  generatePlan,
  type GeneratedPlan,
  type PlannedSession as EngineSession,
  type PaceZoneName,
  type PaceZones,
} from "@/lib/plan";
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

const KIND_STYLE: Record<SessionKind, { rail: string; chip: string; label: string }> = {
  rest: { rail: "bg-border", chip: "border-border text-muted", label: "descanso" },
  easy: { rail: "bg-good", chip: "border-good/40 text-good", label: "leve" },
  hard: { rail: "bg-warn", chip: "border-warn/40 text-warn", label: "forte" },
  long: { rail: "bg-accent", chip: "border-accent/40 text-accent", label: "longo" },
};

const DAY_NAMES = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

const ZONE_LABEL: Record<PaceZoneName, string> = {
  easy: "Fácil",
  marathon: "Maratona",
  threshold: "Limiar",
  interval: "Intervalado",
  repetition: "Repetição",
};

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
      <span className={`mt-1 w-1 shrink-0 rounded-full ${style.rail}`} aria-hidden="true" />
      <div className={`min-w-0 flex-1 ${isLast ? "" : "border-b border-border pb-3"}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted">{session.day}</span>
          <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${style.chip}`}>
            {style.label}
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

function EvidenceFactRow({ fact }: { fact: EvidenceFact }) {
  return (
    <li className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <span className="font-mono text-[10px] uppercase tracking-wide text-accent">
        {strengthLabel(fact.strength)}
      </span>
      <p className="mt-1 text-sm leading-relaxed text-pretty">{fact.claim}</p>
      {fact.source.url ? (
        <a
          href={fact.source.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-xs text-muted underline underline-offset-2 hover:text-accent"
        >
          {fact.source.name}
        </a>
      ) : (
        <p className="mt-1 text-xs text-muted">{fact.source.name}</p>
      )}
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
            <span className="text-[11px] uppercase tracking-wide text-muted">{ZONE_LABEL[zone]}</span>
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

const noopSubscribe = () => () => {};

function getPrefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Same `useSyncExternalStore` shape as `splash.tsx`'s `useShouldShowSplash`
 * — a browser-only read decided once, without the hydration mismatch a
 * plain `useState(getPrefersReducedMotion)` would risk.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(noopSubscribe, getPrefersReducedMotion, () => false);
}

export default function PlanoPage() {
  const [profile] = useRunnerProfile();
  const [weeklyKm, setWeeklyKm] = useState<number | null>(null);
  const [painCheckIns, setPainCheckIns] = useState<PainCheckIn[]>([]);
  const [planRevealed, setPlanRevealed] = useState(false);
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
            <div className="mb-5 grid grid-cols-3 gap-3 border-b border-border pb-4">
              <Stat label="Volume" value={String(currentWeek.totalKm)} unit="km" />
              <Stat label="Sessões" value={String(runCount)} />
              <Stat label="Forte" value={String(qualityCount)} />
            </div>
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
                return fact ? <EvidenceFactRow key={topic} fact={fact} /> : null;
              })}
            </ul>
          </Card>
        </Screen>
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title="Plano"
        badge={<ExampleBadge />}
        subtitle="Prévia de como o plano semanal vai ser apresentado. Ainda não é o seu plano."
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
              {hasGoal ? "Meta de prova definida" : "Definir distância e data da prova no perfil"}
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
          <Link
            href="/perfil"
            className="mt-4 inline-block rounded-full bg-accent px-5 py-2.5 text-center text-sm font-semibold text-accent-foreground"
          >
            Ir pro perfil
          </Link>
        </Card>

        <Card className="pr-enter" style={delay(110)}>
          <CardTitle aside={<ExampleBadge>semana de exemplo</ExampleBadge>}>
            Semana 3 de 12 — base
          </CardTitle>
          <div className="mb-5 grid grid-cols-3 gap-3 border-b border-border pb-4">
            <Stat label="Volume" value={String(TOTAL_DEMO_KM)} unit="km" />
            <Stat label="Sessões" value={String(DEMO_SESSION_COUNT)} />
            <Stat label="Forte" value="1" />
          </div>
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
              return fact ? <EvidenceFactRow key={id} fact={fact} /> : null;
            })}
          </ul>
        </Card>
      </Screen>
    </>
  );
}
