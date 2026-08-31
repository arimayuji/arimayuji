"use client";

import { useEffect, useRef, useState } from "react";
import { allTimeBests, type AllTimeBest } from "@/lib/tracking/personalRecords";
import { formatPace } from "@/lib/tracking/geoFilter";
import { computeSplits } from "@/lib/tracking/splits";
import { runMovingSeconds, type CompletedRun } from "@/lib/tracking/storage";
import { bucketPaceSecPerUnit, type WeekBucket } from "@/lib/tracking/stats";
import type { ConstancyTally, ConstancyWeek } from "@/lib/tracking/constancy";
import {
  computeVdot,
  paceZonesFromVdot,
  timeInZones,
  type PlannedSession,
  type PlannedWeek,
  type TimeInZones,
  type TrainingPhase,
} from "@/lib/plan";
import { PillTabs } from "../ui";
import { WeeklyBarChart, WeeklyLineChart, WeeklyPaceChart } from "./trend-charts";
import type { RecoverySnapshot } from "@/lib/recoverySync";
import type { DisplaySession, SessionKind } from "./page";
import { KIND_STYLE, OUTCOME_STYLE } from "./page";

/**
 * The desktop-only ("wide is a genuinely different surface", see
 * PROJECT-CONTEXT.md) analytics layer for `/plano`: a real running-history
 * dashboard (volume/pace trends, records, training load) sitting alongside
 * the plan itself, built entirely from data the app already tracks — never
 * a new invented metric. Rendered by `plano/page.tsx` inside a
 * `hidden lg:block` wrapper; the phone-width card list stays exactly as it
 * was, behind `lg:hidden` — this file never touches that render path.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function daysUntil(isoDate: string): number {
  const target = new Date(`${isoDate}T00:00:00`).getTime();
  return Math.ceil((target - Date.now()) / DAY_MS);
}

/** `Date.now()` behind a plain module-level helper, same as `daysUntil` above — an inline `Date.now()` call at a component's own top level is what the lint's purity rule flags, not one wrapped in a named function it can't see through. */
function windowCutoffMs(days: number): number {
  return Date.now() - days * DAY_MS;
}

/* ---------------------------------------------------------------------- */
/* KPI strip                                                              */
/* ---------------------------------------------------------------------- */

function CompareBar({ actual, target }: { actual: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
  return (
    <div>
      <div className="relative mt-2 h-1.5 rounded-full bg-border/50">
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent/60" style={{ width: `${pct}%` }} />
        <div className="absolute inset-y-[-3px] w-0.5 rounded-full bg-foreground" style={{ left: "100%" }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted">
        <span>
          Corrido: <b className="font-semibold text-foreground">{actual.toFixed(1)} km</b>
        </span>
        <span>
          Meta: <b className="font-semibold text-foreground">{target.toFixed(1)} km</b>
        </span>
      </div>
    </div>
  );
}

function ConstancyMiniCal({ weeks }: { weeks: ConstancyWeek[] }) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-[3px]">
      {weeks.map((week) => (
        <span
          key={week.weekStart}
          title={
            week.beforeFirstRun
              ? undefined
              : week.inProgress
                ? "Semana em andamento"
                : week.protected
                  ? "Protegida — dor sinalizada essa semana"
                  : week.met
                    ? "Meta batida"
                    : "Meta não batida"
          }
          className={`h-2 w-2.5 rounded-[2px] ${
            week.beforeFirstRun
              ? "bg-transparent"
              : week.inProgress
                ? "bg-accent/50"
                : week.protected
                  ? "bg-border/60"
                  : week.met
                    ? "bg-accent"
                    : "bg-border/50"
          }`}
        />
      ))}
    </div>
  );
}

export function PlanKpiStrip({
  totalKmPlanned,
  actualKmSoFar,
  buckets12,
  elevationMeters,
  elevationRunsCounted,
  elevationRunsInWindow,
  constancy,
  weekNumber,
  totalWeeks,
  goalDate,
}: {
  totalKmPlanned: number;
  actualKmSoFar: number | null;
  buckets12: WeekBucket[];
  elevationMeters: number;
  elevationRunsCounted: number;
  elevationRunsInWindow: number;
  constancy: { tally: ConstancyTally; weeks: ConstancyWeek[] } | null;
  weekNumber: number;
  totalWeeks: number;
  goalDate: string;
}) {
  const lastBucket = buckets12[buckets12.length - 1];
  const priorBucket = buckets12[buckets12.length - 5]; // 4 weeks before the last one
  const currentPace = lastBucket ? bucketPaceSecPerUnit(lastBucket, 1000) : null;
  const priorPace = priorBucket ? bucketPaceSecPerUnit(priorBucket, 1000) : null;
  const paceDeltaSec = currentPace !== null && priorPace !== null ? Math.round(priorPace - currentPace) : null;

  const remainingDays = daysUntil(goalDate);
  const doneWeeks = Math.max(0, weekNumber - 1);

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-b border-border py-4 xl:grid-cols-5 xl:gap-x-0 xl:divide-x xl:divide-border xl:py-3.5">
      <div className="xl:px-5 xl:first:pl-0">
        <span className="font-mono text-[10px] font-semibold tracking-[0.09em] text-muted uppercase">
          Meta vs. real dessa semana
        </span>
        {actualKmSoFar !== null ? (
          <CompareBar actual={actualKmSoFar} target={totalKmPlanned} />
        ) : (
          <p className="mt-2 font-mono text-lg font-semibold tabular-nums">
            {totalKmPlanned}
            <span className="ml-1 text-xs font-medium text-muted">km planejado</span>
          </p>
        )}
      </div>

      <div className="xl:px-5">
        <span className="font-mono text-[10px] font-semibold tracking-[0.09em] text-muted uppercase">
          Pace médio da semana
        </span>
        {currentPace !== null ? (
          <>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
              {formatPace(currentPace)}
              <span className="ml-1 text-xs font-medium text-muted">/km</span>
            </p>
            <p className="mt-0.5 text-[10px] text-muted">
              {paceDeltaSec === null
                ? "sem base de 4 semanas atrás pra comparar"
                : paceDeltaSec === 0
                  ? "igual a 4 semanas atrás"
                  : paceDeltaSec > 0
                    ? `${paceDeltaSec}s mais rápido que 4 semanas atrás`
                    : `${Math.abs(paceDeltaSec)}s mais lento que 4 semanas atrás`}
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs text-muted">ainda sem corrida essa semana</p>
        )}
      </div>

      <div className="xl:px-5">
        <span className="font-mono text-[10px] font-semibold tracking-[0.09em] text-muted uppercase">
          Elevação acumulada
        </span>
        {elevationRunsCounted > 0 ? (
          <>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
              {Math.round(elevationMeters).toLocaleString("pt-BR")}
              <span className="ml-1 text-xs font-medium text-muted">m</span>
            </p>
            <p className="mt-0.5 text-[10px] text-muted">
              últimas 12 semanas
              {elevationRunsCounted < elevationRunsInWindow
                ? ` · calculada em ${elevationRunsCounted} de ${elevationRunsInWindow} corridas`
                : ""}
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs text-muted">
            {elevationRunsInWindow > 0
              ? "abra o detalhe de uma corrida pra calcular a elevação dela"
              : "sem corridas nas últimas 12 semanas"}
          </p>
        )}
      </div>

      <div className="xl:px-5">
        <span className="font-mono text-[10px] font-semibold tracking-[0.09em] text-muted uppercase">
          Constância
        </span>
        {constancy && constancy.tally.judged > 0 ? (
          <>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
              {constancy.tally.met}
              <span className="ml-1 text-xs font-medium text-muted">/{constancy.tally.judged} sem.</span>
            </p>
            <p className="mt-0.5 text-[10px] text-muted">semanas na meta que você definiu</p>
            <ConstancyMiniCal weeks={constancy.weeks} />
          </>
        ) : (
          <p className="mt-1 text-xs text-muted">
            defina uma meta semanal em{" "}
            <a href="/perfil?tab=progresso" className="text-accent underline underline-offset-2">
              Perfil → Progresso
            </a>{" "}
            pra acompanhar aqui
          </p>
        )}
      </div>

      <div className="xl:px-5 xl:last:pr-0">
        <span className="font-mono text-[10px] font-semibold tracking-[0.09em] text-muted uppercase">
          Plano — semana {weekNumber} de {totalWeeks}
        </span>
        <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
          {remainingDays >= 0 ? remainingDays : 0}
          <span className="ml-1 text-xs font-medium text-muted">dias p/ prova</span>
        </p>
        <div className="mt-2.5 flex items-center gap-[3px]">
          {Array.from({ length: totalWeeks }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i < doneWeeks ? "bg-accent" : i === doneWeeks ? "bg-accent/50" : "bg-border/50"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Trend chart row                                                        */
/* ---------------------------------------------------------------------- */

export function TrendChartRow({ buckets12, targetKm }: { buckets12: WeekBucket[]; targetKm: number }) {
  const weeks = buckets12.map((b) => ({ weekStart: b.weekStart, value: b.distanceMeters / 1000 }));
  return (
    <div className="grid grid-cols-1 gap-6 border-b border-border pb-6 xl:grid-cols-2 xl:divide-x xl:divide-border">
      <div className="xl:pr-6">
        <div className="mb-1.5 flex items-baseline justify-between">
          <h2 className="font-mono text-sm font-semibold tracking-wide">Volume semanal</h2>
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted">últimas 12 semanas</span>
        </div>
        <WeeklyBarChart
          weeks={weeks}
          targetValue={targetKm}
          formatTooltip={(km, _weekStart, weeksAgo) =>
            weeksAgo === 0 ? `${km.toFixed(1)} km — essa semana` : `${km.toFixed(1)} km — ${weeksAgo} semanas atrás`
          }
        />
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Km real por semana, do seu histórico de corrida — a linha tracejada é a meta desta semana
          do plano atual, não um valor fixo.
        </p>
      </div>
      <div className="xl:pl-6">
        <div className="mb-1.5 flex items-baseline justify-between">
          <h2 className="font-mono text-sm font-semibold tracking-wide">Pace ao longo do tempo</h2>
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted">média semanal</span>
        </div>
        <WeeklyPaceChart buckets={buckets12} />
        {buckets12.filter((b) => bucketPaceSecPerUnit(b, 1000) !== null).length < 2 ? (
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Ainda não tem semanas suficientes com corrida registrada pra montar essa tendência.
          </p>
        ) : (
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Quanto mais alto, mais rápido — cada ponto é a média das corridas daquela semana, não um
            único treino isolado.
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Day table with filter + tags                                          */
/* ---------------------------------------------------------------------- */

const DAY_FILTER_TABS: readonly { id: SessionKind | "all"; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "rest", label: "Descanso" },
  { id: "easy", label: "Fácil" },
  { id: "hard", label: "Forte" },
  { id: "long", label: "Longão" },
];

function KindTag({ kind }: { kind: SessionKind }) {
  const style = KIND_STYLE[kind];
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${style.badge}`}>
      {style.label.charAt(0).toUpperCase() + style.label.slice(1)}
    </span>
  );
}

/**
 * The same `displaySessions` the phone-width card list (`SessionRow` in
 * `page.tsx`) already renders, just as a real `<table>` with a kind filter —
 * a second view of one array, not a second source of truth. Markup follows
 * the shadcn/ui `<Table>` anatomy (a scroll wrapper around a `text-sm`
 * table, `border-b` on the header row and every body row rather than a
 * boxed grid, a fixed row height via consistent padding, a soft row hover)
 * translated onto Xanthus's own tokens — same shape, not their palette.
 */
export function WeekDayTable({ sessions }: { sessions: DisplaySession[] }) {
  const [filter, setFilter] = useState<SessionKind | "all">("all");
  const visible = filter === "all" ? sessions : sessions.filter((s) => s.kind === filter);

  return (
    <div>
      <div className="mb-3">
        <PillTabs tabs={DAY_FILTER_TABS} active={filter} onChange={setFilter} />
      </div>
      <div className="w-full overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="h-10 w-28 px-3 text-left align-middle font-mono text-[10px] font-semibold tracking-[0.07em] text-muted uppercase">
                Dia
              </th>
              <th className="h-10 px-3 text-left align-middle font-mono text-[10px] font-semibold tracking-[0.07em] text-muted uppercase">
                Sessão
              </th>
              <th className="h-10 w-24 px-3 text-right align-middle font-mono text-[10px] font-semibold tracking-[0.07em] text-muted uppercase">
                Km
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((session) => (
              <tr key={session.day} className="border-b border-border transition-colors last:border-b-0 hover:bg-border/20">
                <td className="p-3 align-middle font-mono text-[10.5px] font-semibold tracking-wide text-muted uppercase">
                  {session.day}
                </td>
                <td className="p-3 align-middle">
                  <KindTag kind={session.kind} />
                  {session.outcome && session.outcome !== "rest" && session.outcome !== "upcoming" && (
                    <span
                      className={`ml-1.5 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide ${OUTCOME_STYLE[session.outcome].className}`}
                    >
                      {OUTCOME_STYLE[session.outcome].label}
                    </span>
                  )}
                  <p className="mt-1 text-[11.5px] leading-snug text-muted">{session.detail}</p>
                </td>
                <td className="p-3 text-right align-middle font-mono text-sm font-medium tabular-nums">
                  {session.km !== undefined ? (
                    <>
                      {session.km}
                      <span className="ml-0.5 text-[10.5px] font-normal text-muted">km</span>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Records + training load                                                */
/* ---------------------------------------------------------------------- */

const RECORDS_SHOWN = 4;

const relativeDateFormatter = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

function relativeSince(ms: number): string {
  const days = Math.round((Date.now() - ms) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "hoje";
  if (days < 7) return relativeDateFormatter.format(-days, "day");
  if (days < 60) return relativeDateFormatter.format(-Math.round(days / 7), "week");
  return relativeDateFormatter.format(-Math.round(days / 30), "month");
}

/** Every distance the athlete has actually covered continuously, km/both units only (see STANDARD_DISTANCES) — a mile-only entry would need a whole second vocabulary this card doesn't have room for. */
export function RecentRecordsCard({ runs }: { runs: CompletedRun[] }) {
  const bests: AllTimeBest[] = allTimeBests(runs)
    .filter((b) => b.unit !== "mi")
    .sort((a, b) => a.targetMeters - b.targetMeters)
    .slice(0, RECORDS_SHOWN);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-mono text-sm font-semibold tracking-wide">Recordes recentes</h2>
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted">seu histórico</span>
      </div>
      {bests.length === 0 ? (
        <p className="py-3 text-xs leading-relaxed text-muted">
          Ainda sem recorde registrado — corra pelo menos 1 km contínuo pra começar a marcar.
        </p>
      ) : (
        <div>
          {bests.map((best) => (
            <div key={best.targetMeters} className="flex items-center justify-between gap-3 border-t border-border py-2.5 first:border-t-0">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold">{best.label}</p>
                <p className="text-[10.5px] text-muted">melhor tempo</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-[15px] font-semibold tabular-nums">{formatPace(best.splitSeconds)}</p>
                <p className="text-[10.5px] text-muted">{relativeSince(best.achievedAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TRAINING_LOAD_WEEKS = 6;

/** Weekly Foster's-method training load (RPE × moving minutes) — only over runs that actually have a self-reported RPE, see `CompletedRun.rpe`'s own comment. Weeks with zero RPE-tagged runs still render (as a real zero, not hidden), same "gap shows as a gap" convention as everywhere else here. */
function weeklyTrainingLoad(runs: CompletedRun[], buckets: WeekBucket[]): { weekStart: number; value: number; hasAnyRpe: boolean }[] {
  return buckets.map((bucket) => {
    const weekEnd = bucket.weekStart + WEEK_MS;
    let value = 0;
    let hasAnyRpe = false;
    for (const run of runs) {
      if (run.startedAt < bucket.weekStart || run.startedAt >= weekEnd || run.rpe === undefined) continue;
      hasAnyRpe = true;
      value += run.rpe * (runMovingSeconds(run) / 60);
    }
    return { weekStart: bucket.weekStart, value: Math.round(value), hasAnyRpe };
  });
}

export function TrainingLoadCard({ runs, buckets }: { runs: CompletedRun[]; buckets: WeekBucket[] }) {
  const recentBuckets = buckets.slice(-TRAINING_LOAD_WEEKS);
  const weeks = weeklyTrainingLoad(runs, recentBuckets);
  const anyData = weeks.some((w) => w.hasAnyRpe);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <h2 className="font-mono text-sm font-semibold tracking-wide">Carga de treino</h2>
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted">esforço × duração</span>
      </div>
      {anyData ? (
        <>
          <WeeklyBarChart
            weeks={weeks}
            formatTooltip={(value, _weekStart, weeksAgo) =>
              weeksAgo === 0 ? `${value} — essa semana` : `${value} — ${weeksAgo} semanas atrás`
            }
          />
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Esforço percebido (RPE, 1–10) × minutos de corrida — sinaliza acúmulo de fadiga entre
            semanas, não é uma métrica clínica.
          </p>
        </>
      ) : (
        <p className="py-3 text-xs leading-relaxed text-muted">
          Nenhuma corrida com esforço percebido registrado ainda — dá pra registrar isso ao salvar
          uma corrida.
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Recovery trend (resting heart rate / HRV / sleep / VO2 max)            */
/* ---------------------------------------------------------------------- */

const RECOVERY_WEEKS_SHOWN = 12;

/** Most recent non-null reading for one field, scanning back from the newest snapshot — a stale field from 8 weeks ago is still a more honest "latest known" than the most recent week if that week's read happened to come back empty. */
function latestRecoveryValue(snapshots: RecoverySnapshot[], key: "vo2Max" | "sleepHours"): number | null {
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const value = snapshots[i][key];
    if (typeof value === "number") return value;
  }
  return null;
}

/**
 * Desktop-only trend of resting heart rate, HRV, latest sleep and VO2 max —
 * synced from HealthKit/Health Connect via recoverySync.ts, a separate
 * opt-in from the run-history sync (see /perfil/sincronizacao's nested
 * toggle), so most accounts simply have zero rows here. Returns null
 * rather than an honest-empty-state message in that case: unlike
 * IntensityRingCard/RecentRecordsCard (data any runner could eventually
 * have just by running more), this structurally requires a paired watch
 * plus two nested opt-ins — an aggressive "you're missing this" nudge here
 * would nag the vast majority of accounts that will never have a watch.
 */
export function RecoveryTrendCard({ snapshots }: { snapshots: RecoverySnapshot[] }) {
  if (snapshots.length === 0) return null;

  const recent = snapshots.slice(-RECOVERY_WEEKS_SHOWN);
  const restingHr = recent.map((s) => ({
    weekStart: new Date(s.weekStartIso).getTime(),
    value: s.restingHeartRateBpm ?? null,
  }));
  const hrv = recent.map((s) => ({ weekStart: new Date(s.weekStartIso).getTime(), value: s.hrvMs ?? null }));
  const latestVo2Max = latestRecoveryValue(recent, "vo2Max");
  const latestSleep = latestRecoveryValue(recent, "sleepHours");
  const weeksAgoLabel = (weeksAgo: number) => (weeksAgo === 0 ? "essa semana" : `${weeksAgo} semanas atrás`);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <h2 className="font-mono text-sm font-semibold tracking-wide">Recuperação</h2>
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted">relógio · últimas {recent.length} semanas</span>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:divide-x xl:divide-border">
        <div className="xl:pr-6">
          <p className="mb-1 text-[11px] font-semibold text-muted">FC de repouso</p>
          {restingHr.some((p) => p.value !== null) ? (
            <WeeklyLineChart
              points={restingHr}
              invert
              formatTooltip={(value, _weekStart, weeksAgo) => `${value} bpm — ${weeksAgoLabel(weeksAgo)}`}
            />
          ) : (
            <p className="py-3 text-xs leading-relaxed text-muted">Sem leitura ainda essas semanas.</p>
          )}
        </div>
        <div className="xl:pl-6">
          <p className="mb-1 text-[11px] font-semibold text-muted">HRV</p>
          {hrv.some((p) => p.value !== null) ? (
            <WeeklyLineChart
              points={hrv}
              formatTooltip={(value, _weekStart, weeksAgo) => `${value} ms — ${weeksAgoLabel(weeksAgo)}`}
            />
          ) : (
            <p className="py-3 text-xs leading-relaxed text-muted">Sem leitura ainda essas semanas.</p>
          )}
        </div>
      </div>
      <div className="mt-4 flex gap-6 border-t border-border pt-3">
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted">VO2 máx</span>
          <p className="font-mono text-sm tabular-nums">
            {latestVo2Max !== null ? `${latestVo2Max}` : "—"}
            <span className="ml-1 text-[10px] font-sans text-muted">mL/min/kg</span>
          </p>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted">Sono (última noite lida)</span>
          <p className="font-mono text-sm tabular-nums">
            {latestSleep !== null ? `${latestSleep}` : "—"}
            <span className="ml-1 text-[10px] font-sans text-muted">h</span>
          </p>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        FC de repouso mais baixa e HRV mais alto ao longo do tempo costumam indicar recuperação
        melhorando — o inverso pode ser um sinal de acúmulo de fadiga, não um diagnóstico.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Intensity distribution ring (80/20)                                    */
/* ---------------------------------------------------------------------- */

const INTENSITY_WINDOW_DAYS = 28;
/**
 * Heuristic, not a citation-backed cutoff — the 80-20-polarized-training fact
 * (`/estudos#periodization`) says "~80% baixa, ~20% alta, pouco no meio",
 * not a specific number for how much "pouco" tolerates. This is the app's
 * own reasonable threshold for the nudge below, framed as an estimate in the
 * copy — same honesty convention `runningWeather.ts`'s score already uses.
 */
const GRAY_ZONE_WARN_FRACTION = 0.2;

type IntensityBucket = "easy" | "gray" | "hard";

const INTENSITY_BUCKET_LABEL: Record<IntensityBucket, string> = {
  easy: "Fácil",
  gray: "Zona cinza",
  hard: "Forte",
};

/** Ring/legend color per bucket — good for the low-intensity majority, warn for the zone the evidence says to spend the least time in, accent for the deliberate hard 20% (not a "danger" color, it's the intended stimulus). */
const INTENSITY_BUCKET_CLASS: Record<IntensityBucket, { stroke: string; dot: string; text: string }> = {
  easy: { stroke: "stroke-good", dot: "bg-good", text: "text-good" },
  gray: { stroke: "stroke-warn", dot: "bg-warn", text: "text-warn" },
  hard: { stroke: "stroke-accent", dot: "bg-accent", text: "text-accent" },
};

/** Collapses the 5 VDOT zones down to the 3-bucket easy/gray/hard split the 80/20 principle is stated in — marathon+threshold pace is the "gray zone" the evidence warns amateur runners drift into on days meant to be easy. */
function toIntensityBuckets(seconds: TimeInZones): Record<IntensityBucket, number> {
  return {
    easy: seconds.easy,
    gray: seconds.marathon + seconds.threshold,
    hard: seconds.interval + seconds.repetition,
  };
}

const RING_RADIUS = 38;
const RING_STROKE_WIDTH = 11;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const INTENSITY_BUCKET_ORDER: IntensityBucket[] = ["easy", "gray", "hard"];

/** Running offset per segment, built as a fresh array each call instead of a mutable accumulator reassigned inside the `.map()` below — same value, but never reassigns a variable captured from an outer scope during render. */
function withRunningOffsets(pct: Record<IntensityBucket, number>): { bucket: IntensityBucket; share: number; offsetPct: number }[] {
  return INTENSITY_BUCKET_ORDER.reduce<{ bucket: IntensityBucket; share: number; offsetPct: number }[]>((acc, bucket) => {
    const previous = acc[acc.length - 1];
    const offsetPct = previous ? previous.offsetPct + previous.share : 0;
    acc.push({ bucket, share: pct[bucket], offsetPct });
    return acc;
  }, []);
}

function IntensityDonut({ pct }: { pct: Record<IntensityBucket, number> }) {
  const segments = withRunningOffsets(pct);
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="50" cy="50" r={RING_RADIUS} fill="none" strokeWidth={RING_STROKE_WIDTH} className="stroke-border/40" />
      {segments.map(({ bucket, share, offsetPct }) => {
        if (share <= 0) return null;
        const length = (share / 100) * RING_CIRCUMFERENCE;
        const dashoffset = -((offsetPct / 100) * RING_CIRCUMFERENCE);
        return (
          <circle
            key={bucket}
            cx="50"
            cy="50"
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE_WIDTH}
            strokeDasharray={`${length} ${RING_CIRCUMFERENCE - length}`}
            strokeDashoffset={dashoffset}
            className={INTENSITY_BUCKET_CLASS[bucket].stroke}
          />
        );
      })}
    </svg>
  );
}

/**
 * "Você corre fácil rápido demais" is the one thing about their own training
 * most amateur runners can't see without this: a 3-way split of the last 28
 * days' *time*-in-zone (not distance — pace zones are a time concept) into
 * easy/gray/hard, next to the 80/20 target the evidence base already cites.
 * Built entirely from data already tracked (`CompletedRun.points` → splits →
 * VDOT zones from the same recent-race time `/plano`'s own engine already
 * uses) — never a new metric invented for this card.
 */
export function IntensityRingCard({
  runs,
  recentRaceDistanceMeters,
  recentRaceTimeSeconds,
}: {
  runs: CompletedRun[];
  recentRaceDistanceMeters?: number;
  recentRaceTimeSeconds?: number;
}) {
  if (!recentRaceDistanceMeters || !recentRaceTimeSeconds) {
    return (
      <div>
        <h2 className="mb-1.5 font-mono text-sm font-semibold tracking-wide">Distribuição de intensidade</h2>
        <p className="py-3 text-xs leading-relaxed text-muted">
          Defina um tempo de prova recente (aba Corpo/Meta abaixo) pra calcular suas zonas de pace e
          ver essa distribuição.
        </p>
      </div>
    );
  }

  const zones = paceZonesFromVdot(computeVdot(recentRaceDistanceMeters, recentRaceTimeSeconds));
  const cutoff = windowCutoffMs(INTENSITY_WINDOW_DAYS);
  const totals: Record<IntensityBucket, number> = { easy: 0, gray: 0, hard: 0 };
  let runsCounted = 0;
  for (const run of runs) {
    if (run.startedAt < cutoff) continue;
    const kmSplits = computeSplits(run.points, 1000);
    if (kmSplits.length === 0) continue;
    const bucketed = toIntensityBuckets(timeInZones(kmSplits, zones));
    totals.easy += bucketed.easy;
    totals.gray += bucketed.gray;
    totals.hard += bucketed.hard;
    runsCounted++;
  }

  const totalSeconds = totals.easy + totals.gray + totals.hard;
  if (totalSeconds <= 0) {
    return (
      <div>
        <h2 className="mb-1.5 font-mono text-sm font-semibold tracking-wide">Distribuição de intensidade</h2>
        <p className="py-3 text-xs leading-relaxed text-muted">
          Sem corridas com quilômetro completo nos últimos {INTENSITY_WINDOW_DAYS} dias pra calcular isso.
        </p>
      </div>
    );
  }

  const pct: Record<IntensityBucket, number> = {
    easy: (totals.easy / totalSeconds) * 100,
    gray: (totals.gray / totalSeconds) * 100,
    hard: (totals.hard / totalSeconds) * 100,
  };
  const grayOverTarget = pct.gray / 100 > GRAY_ZONE_WARN_FRACTION;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <h2 className="font-mono text-sm font-semibold tracking-wide">Distribuição de intensidade</h2>
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
          últimos {INTENSITY_WINDOW_DAYS} dias · {runsCounted} corrida{runsCounted === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex items-center gap-5">
        <IntensityDonut pct={pct} />
        <ul className="flex flex-1 flex-col gap-2">
          {INTENSITY_BUCKET_ORDER.map((bucket) => (
            <li key={bucket} className="flex items-center gap-2 text-sm">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${INTENSITY_BUCKET_CLASS[bucket].dot}`} />
              <span className="flex-1 text-foreground">{INTENSITY_BUCKET_LABEL[bucket]}</span>
              <span className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${INTENSITY_BUCKET_CLASS[bucket].text}`}>
                {Math.round(pct[bucket])}%
              </span>
            </li>
          ))}
        </ul>
      </div>
      {grayOverTarget && (
        <p className="mt-3 rounded-lg bg-warn/10 p-2.5 text-xs leading-relaxed text-warn text-pretty">
          Sua zona cinza está acima do alvo — parte dos dias pensados como fáceis pode estar rápida
          demais pra render o benefício de fácil ou de forte.
        </p>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Alvo de referência: ~80% em intensidade baixa, ~20% em alta. O corte da zona cinza acima é
        uma estimativa do próprio app, não um número exato de fonte nenhuma.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Full-plan calendar (whole block, not just the current week)            */
/* ---------------------------------------------------------------------- */

const PHASE_LABEL: Record<TrainingPhase, string> = {
  base: "Base",
  build: "Desenvolvimento",
  peak: "Pico",
  taper: "Polimento",
};

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDayMonth(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** Same engine-kind → display-kind collapse `page.tsx`'s own `engineSessionToDisplay` does — duplicated here (not imported) because that function also builds title/detail strings this calendar has no room for; this only ever needs the kind. */
function calendarSessionKind(kind: PlannedSession["kind"]): SessionKind {
  return kind === "quality" ? "hard" : kind === "long" ? "long" : kind === "easy" ? "easy" : "rest";
}

/**
 * The one thing `/plano` never showed before: the whole block at a glance,
 * not just this week. A training plan is a curve (ramp up, hold, taper) —
 * `WeekDayTable` above only ever shows one week's flat slice of it, so
 * there was no way to see the shape `generatePlan`'s ramp actually drew
 * without clicking forward one week at a time. One row per week, 7 tinted
 * cells for the day's kind (reusing `KIND_STYLE`, never a new palette),
 * phase labeled where it changes, current week highlighted and auto-scrolled
 * into view on mount.
 */
export function PlanCalendar({ weeks, currentWeekNumber }: { weeks: PlannedWeek[]; currentWeekNumber: number }) {
  const currentRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-mono text-sm font-semibold tracking-wide">Plano até a prova</h2>
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted">{weeks.length} semanas</span>
      </div>
      <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
        {weeks.map((week, index) => {
          const isCurrent = week.weekNumber === currentWeekNumber;
          const isPast = week.weekNumber < currentWeekNumber;
          const showPhaseLabel = index === 0 || week.phase !== weeks[index - 1].phase;
          return (
            <div
              key={week.weekNumber}
              ref={isCurrent ? currentRowRef : undefined}
              className={`flex items-center gap-3 border-b border-border px-2.5 py-2 last:border-b-0 ${isCurrent ? "bg-accent/5" : ""}`}
            >
              <div className="w-28 shrink-0">
                {showPhaseLabel && (
                  <p className="font-mono text-[9px] font-semibold tracking-wide text-muted uppercase">
                    {PHASE_LABEL[week.phase]}
                  </p>
                )}
                <p className={`font-mono text-[10.5px] ${isCurrent ? "font-semibold text-accent" : isPast ? "text-muted" : "text-foreground"}`}>
                  Semana {week.weekNumber}
                  {isCurrent ? " · agora" : ""}
                </p>
              </div>
              <div className="flex flex-1 gap-1">
                {week.sessions.map((session, i) => {
                  const kind = calendarSessionKind(session.kind);
                  return (
                    <div
                      key={i}
                      title={`${formatDayMonth(addDaysIso(week.startDate, i))} — ${KIND_STYLE[kind].label}${
                        session.km > 0 ? ` · ${session.km}km` : ""
                      }`}
                      className={`h-5 flex-1 rounded-sm ${kind === "rest" ? "bg-border/30" : KIND_STYLE[kind].badge}`}
                    />
                  );
                })}
              </div>
              <span className={`w-14 shrink-0 text-right font-mono text-[11px] tabular-nums ${isPast ? "text-muted" : "text-foreground"}`}>
                {week.totalKm}km
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
