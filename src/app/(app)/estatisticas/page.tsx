"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { listCompletedRuns, type CompletedRun } from "@/lib/tracking/storage";
import {
  bucketPaceSecPerUnit,
  dailyBuckets,
  monthToDateMeters,
  weeklyBuckets,
  type WeekBucket,
} from "@/lib/tracking/stats";
import { formatDistance, metersPerUnit, paceLabel, toUnit, unitLabel } from "@/lib/units";
import type { DistanceUnit } from "@/lib/preferences";
import { usePreferences } from "@/lib/usePreferences";
import { Card, CardTitle, delay, NoticeBadge, Screen, ScreenHeader, Stat } from "../ui";

/**
 * The dashboard `/historico`'s own summary card has been promising since it
 * started tracking data at all: total volume by week, pace evolution,
 * this-week-vs-last-week, this calendar month, and the last two weeks
 * day by day. Everything here is derived from the same `CompletedRun[]`
 * `/historico` already reads — no separate storage, nothing that can drift
 * from what the history screen itself shows.
 */

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; runs: CompletedRun[] };

const WEEKS_SHOWN = 8;
const DAYS_SHOWN = 14;
/** Below this many weeks with real distance in them, a pace line is a line through mostly nothing. */
const PACE_TREND_MIN_WEEKS = 4;

const WEEKDAY_LABEL = new Intl.DateTimeFormat("pt-BR", { weekday: "narrow" });
const MONTH_LABEL = new Intl.DateTimeFormat("pt-BR", { month: "long" });

function weekLabel(weekStart: number): string {
  const d = new Date(weekStart);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** `<Card>` shell every section below shares: title, optional delay, empty guard baked into the caller instead of here since the "nothing to show" copy differs per section. */
function Section({
  title,
  delayMs,
  children,
}: {
  title: string;
  delayMs: number;
  children: React.ReactNode;
}) {
  return (
    <Card className="pr-enter" style={delay(delayMs)}>
      <CardTitle>{title}</CardTitle>
      {children}
    </Card>
  );
}

function WeekComparison({ weeks, unit }: { weeks: WeekBucket[]; unit: DistanceUnit }) {
  const thisWeek = weeks[weeks.length - 1];
  const lastWeek = weeks[weeks.length - 2];
  const thisKm = toUnit(thisWeek.distanceMeters, unit);
  const lastKm = toUnit(lastWeek.distanceMeters, unit);
  const deltaKm = thisKm - lastKm;
  const hasComparison = lastWeek.distanceMeters > 0;

  return (
    <Section title="Essa semana" delayMs={40}>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Distância" value={formatDistance(thisWeek.distanceMeters, unit)} unit={unitLabel(unit)} />
        <Stat label="Corridas" value={String(thisWeek.runCount)} />
      </div>
      {hasComparison && (
        <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted">
          {deltaKm >= 0 ? (
            <>
              <span className="font-semibold text-good">
                +{deltaKm.toFixed(1)} {unitLabel(unit)}
              </span>{" "}
              a mais que a semana passada ({lastKm.toFixed(1)} {unitLabel(unit)}).
            </>
          ) : (
            <>
              <span className="font-semibold text-warn">
                {deltaKm.toFixed(1)} {unitLabel(unit)}
              </span>{" "}
              a menos que a semana passada ({lastKm.toFixed(1)} {unitLabel(unit)}).
            </>
          )}
        </p>
      )}
    </Section>
  );
}

function WeeklyVolumeChart({ weeks, unit }: { weeks: WeekBucket[]; unit: DistanceUnit }) {
  const maxMeters = Math.max(...weeks.map((w) => w.distanceMeters), 1);

  return (
    <Section title={`Rodagem por semana (últimas ${WEEKS_SHOWN})`} delayMs={70}>
      <div className="flex h-32 items-end gap-1.5">
        {weeks.map((week, index) => {
          const heightPct = week.distanceMeters > 0 ? Math.max(6, (week.distanceMeters / maxMeters) * 100) : 0;
          const isCurrent = index === weeks.length - 1;
          return (
            <div key={week.weekStart} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex h-32 w-full items-end">
                <div
                  className={`pr-bar w-full rounded-sm ${isCurrent ? "bg-accent/50" : "bg-accent"}`}
                  style={delay(100 + index * 45, { height: `${heightPct}%` } as CSSProperties)}
                  title={`Semana de ${weekLabel(week.weekStart)}: ${formatDistance(week.distanceMeters, unit)} ${unitLabel(unit)}`}
                />
              </div>
              <span className="font-mono text-[9px] text-muted">{weekLabel(week.weekStart)}</span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/** Line-chart geometry, the same cubic-bezier-with-horizontal-handles recipe the landing page's demo pace chart uses (src/app/page.tsx) — real data here instead of a fixed illustration. */
const CHART = { width: 320, height: 170, padLeft: 40, padRight: 10, padTop: 16, padBottom: 26 };
const PLOT_WIDTH = CHART.width - CHART.padLeft - CHART.padRight;
const PLOT_HEIGHT = CHART.height - CHART.padTop - CHART.padBottom;
const BASELINE_Y = CHART.padTop + PLOT_HEIGHT;

function PaceTrendChart({
  weeks,
  unit,
}: {
  weeks: WeekBucket[];
  unit: DistanceUnit;
}) {
  const unitMeters = metersPerUnit(unit);
  const series = weeks
    .map((week) => ({ weekStart: week.weekStart, paceSecPerUnit: bucketPaceSecPerUnit(week, unitMeters) }))
    .filter((point): point is { weekStart: number; paceSecPerUnit: number } => point.paceSecPerUnit !== null);

  if (series.length < PACE_TREND_MIN_WEEKS) {
    return (
      <Section title="Evolução de pace" delayMs={100}>
        <p className="text-xs leading-relaxed text-muted">
          Com {series.length} {series.length === 1 ? "semana" : "semanas"} de corrida ainda não dá
          pra falar em tendência — a partir de {PACE_TREND_MIN_WEEKS} semanas com corrida o gráfico
          passa a dizer alguma coisa.
        </p>
      </Section>
    );
  }

  const fastest = Math.min(...series.map((p) => p.paceSecPerUnit));
  const slowest = Math.max(...series.map((p) => p.paceSecPerUnit));
  // A flat pace across every week would divide by zero below — pad the domain
  // out so a single-value series still draws a flat line instead of NaN.
  const domainSlowest = slowest === fastest ? slowest + 30 : slowest;

  const chartX = (index: number) =>
    Number((CHART.padLeft + (index / (series.length - 1)) * PLOT_WIDTH).toFixed(2));
  const chartY = (paceSecPerUnit: number) => {
    const ratio = (paceSecPerUnit - fastest) / (domainSlowest - fastest);
    return Number((CHART.padTop + ratio * PLOT_HEIGHT).toFixed(2));
  };

  const points = series.map((p, i) => ({ x: chartX(i), y: chartY(p.paceSecPerUnit), ...p }));
  const linePath = points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const handle = Number(((point.x - previous.x) / 2).toFixed(2));
    return `${path} C ${previous.x + handle} ${previous.y}, ${point.x - handle} ${point.y}, ${point.x} ${point.y}`;
  }, "");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${BASELINE_Y} L ${points[0].x} ${BASELINE_Y} Z`;
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  const improved = lastPoint.paceSecPerUnit <= firstPoint.paceSecPerUnit;

  const formatPaceValue = (secPerUnit: number) => {
    const m = Math.floor(secPerUnit / 60);
    const s = Math.round(secPerUnit % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const LINE_DRAW_DELAY = 140;
  const LINE_DRAW_DURATION = 1400;

  return (
    <Section title="Evolução de pace" delayMs={100}>
      <svg
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        className="pr-svg h-auto w-full text-accent"
        role="img"
        aria-labelledby="pace-trend-title pace-trend-desc"
      >
        <title id="pace-trend-title">Evolução do pace médio semanal</title>
        <desc id="pace-trend-desc">
          Pace médio por semana com corrida registrada, de {formatPaceValue(firstPoint.paceSecPerUnit)}
          {" "}a {formatPaceValue(lastPoint.paceSecPerUnit)} por {unitLabel(unit)}.
        </desc>
        <defs>
          <linearGradient id="pace-trend-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path
          d={areaPath}
          fill="url(#pace-trend-area)"
          className="pr-area"
          style={delay(LINE_DRAW_DELAY, { "--pr-dur": `${LINE_DRAW_DURATION}ms` } as CSSProperties)}
        />
        <path
          d={linePath}
          pathLength={1}
          fill="none"
          className="pr-draw stroke-accent"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={delay(LINE_DRAW_DELAY, { "--pr-dur": `${LINE_DRAW_DURATION}ms` } as CSSProperties)}
        />

        {points.slice(0, -1).map((point, index) => (
          <circle
            key={point.weekStart}
            cx={point.x}
            cy={point.y}
            r="2.6"
            className="pr-pop fill-accent"
            fillOpacity="0.55"
            style={delay(
              LINE_DRAW_DELAY + (index / (points.length - 1)) * LINE_DRAW_DURATION + 80,
            )}
          />
        ))}

        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r="4.5"
          className={`pr-pop stroke-background ${improved ? "fill-good" : "fill-accent"}`}
          strokeWidth="2"
          style={delay(LINE_DRAW_DELAY + LINE_DRAW_DURATION)}
        />
        <text
          x={lastPoint.x}
          y={lastPoint.y - 12}
          textAnchor="end"
          className={`pr-pop font-mono ${improved ? "fill-good" : "fill-accent"}`}
          fontSize="11"
          fontWeight="600"
          style={delay(LINE_DRAW_DELAY + LINE_DRAW_DURATION + 40)}
        >
          {formatPaceValue(lastPoint.paceSecPerUnit)}
        </text>
      </svg>
      <p className="mt-1 text-center text-[10px] text-muted">{paceLabel(unit)}, por semana com corrida</p>
    </Section>
  );
}

function MonthCard({ runs, unit }: { runs: CompletedRun[]; unit: DistanceUnit }) {
  const meters = monthToDateMeters(runs);
  const label = MONTH_LABEL.format(new Date());
  return (
    <Section title={`Em ${label}`} delayMs={130}>
      <Stat label="Distância no mês" value={formatDistance(meters, unit)} unit={unitLabel(unit)} />
    </Section>
  );
}

function DailyVolumeChart({ runs, unit }: { runs: CompletedRun[]; unit: DistanceUnit }) {
  const days = useMemo(() => dailyBuckets(runs, DAYS_SHOWN), [runs]);
  const maxMeters = Math.max(...days.map((d) => d.distanceMeters), 1);

  return (
    <Section title={`Dia a dia (últimos ${DAYS_SHOWN} dias)`} delayMs={160}>
      <div className="flex h-24 items-end gap-1">
        {days.map((day, index) => {
          const heightPct = day.distanceMeters > 0 ? Math.max(8, (day.distanceMeters / maxMeters) * 100) : 0;
          const isToday = index === days.length - 1;
          return (
            <div key={day.dayStart} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end">
                <div
                  className={`pr-bar w-full rounded-sm ${isToday ? "bg-accent/50" : day.distanceMeters > 0 ? "bg-accent" : "bg-border"}`}
                  style={delay(180 + index * 25, { height: `${Math.max(heightPct, 4)}%` } as CSSProperties)}
                  title={`${new Date(day.dayStart).toLocaleDateString("pt-BR")}: ${formatDistance(day.distanceMeters, unit)} ${unitLabel(unit)}`}
                />
              </div>
              <span className="font-mono text-[8px] text-muted">
                {WEEKDAY_LABEL.format(new Date(day.dayStart))}
              </span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

export default function EstatisticasPage() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [{ distanceUnit: unit }] = usePreferences();

  useEffect(() => {
    let cancelled = false;
    listCompletedRuns()
      .then((runs) => {
        if (!cancelled) setLoad({ status: "ready", runs });
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runs = useMemo(() => (load.status === "ready" ? load.runs : []), [load]);
  const weeks = useMemo(() => weeklyBuckets(runs, WEEKS_SHOWN), [runs]);

  return (
    <>
      <ScreenHeader
        title="Estatísticas"
        subtitle="Rodagem, ritmo e frequência — tudo calculado sobre as corridas salvas neste aparelho."
        badge={runs.length > 0 ? <NoticeBadge>dados reais</NoticeBadge> : undefined}
      />

      <Screen>
        {load.status === "loading" && (
          <Card className="animate-pulse">
            <div className="h-4 w-32 rounded bg-border" />
            <div className="mt-4 h-14 rounded-xl bg-border/70" />
          </Card>
        )}

        {load.status === "error" && (
          <Card>
            <CardTitle>Não deu pra ler o histórico</CardTitle>
            <p className="text-sm leading-relaxed text-muted">
              O armazenamento local do navegador não respondeu. Em janela anônima ou com
              armazenamento bloqueado, as estatísticas não têm de onde vir.
            </p>
          </Card>
        )}

        {load.status === "ready" && runs.length === 0 && (
          <Card>
            <CardTitle>Nada pra mostrar ainda</CardTitle>
            <p className="text-sm leading-relaxed text-muted">
              Assim que a primeira corrida for salva, as estatísticas de rodagem, pace e
              frequência aparecem aqui.
            </p>
          </Card>
        )}

        {load.status === "ready" && runs.length > 0 && (
          <>
            <WeekComparison weeks={weeks} unit={unit} />
            <WeeklyVolumeChart weeks={weeks} unit={unit} />
            <PaceTrendChart weeks={weeks} unit={unit} />
            <MonthCard runs={runs} unit={unit} />
            <DailyVolumeChart runs={runs} unit={unit} />
          </>
        )}
      </Screen>
    </>
  );
}
