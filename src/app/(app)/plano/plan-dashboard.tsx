"use client";

import { useState } from "react";
import { allTimeBests, type AllTimeBest } from "@/lib/tracking/personalRecords";
import { formatPace } from "@/lib/tracking/geoFilter";
import { runMovingSeconds, type CompletedRun } from "@/lib/tracking/storage";
import { bucketPaceSecPerUnit, type WeekBucket } from "@/lib/tracking/stats";
import type { ConstancyTally, ConstancyWeek } from "@/lib/tracking/constancy";
import { PillTabs } from "../ui";
import { WeeklyBarChart, WeeklyPaceChart } from "./trend-charts";
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

function daysUntil(isoDate: string): number {
  const target = new Date(`${isoDate}T00:00:00`).getTime();
  return Math.ceil((target - Date.now()) / (24 * 60 * 60 * 1000));
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
