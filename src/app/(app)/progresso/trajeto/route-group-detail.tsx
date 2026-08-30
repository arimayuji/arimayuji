"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { formatElapsed } from "@/lib/tracking/geoFilter";
import { listCompletedRuns, runMovingSeconds, type CompletedRun } from "@/lib/tracking/storage";
import { groupRunsByRoute, type MatchedRunGroup } from "@/lib/tracking/routeMatching";
import { usePreferences } from "@/lib/usePreferences";
import { formatAveragePace, formatDistance, metersPerUnit, paceLabel, unitLabel } from "@/lib/units";
import type { DistanceUnit } from "@/lib/preferences";
import { RouteMap } from "../../route-map";
import { Card, CardTitle, delay, Screen, ScreenHeader } from "../../ui";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const fullDateFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" });

type LoadState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "ready"; group: MatchedRunGroup };

/** Same cubic-bezier-line-with-gradient-area recipe as /progresso's PaceTrendChart, x-axis swapped for repeats of this one route instead of calendar weeks. */
const CHART = { width: 320, height: 150, padLeft: 40, padRight: 10, padTop: 16, padBottom: 26 };
const PLOT_WIDTH = CHART.width - CHART.padLeft - CHART.padRight;
const PLOT_HEIGHT = CHART.height - CHART.padTop - CHART.padBottom;
const BASELINE_Y = CHART.padTop + PLOT_HEIGHT;

function formatPaceValue(secPerUnit: number): string {
  const m = Math.floor(secPerUnit / 60);
  const s = Math.round(secPerUnit % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function RepeatsPaceChart({ group, unit }: { group: MatchedRunGroup; unit: DistanceUnit }) {
  const unitMeters = metersPerUnit(unit);
  const series = group.runs.map((r) => ({
    startedAt: r.run.startedAt,
    paceSecPerUnit: r.paceSecPerMeter * unitMeters,
  }));

  if (series.length < 2) return null;

  const fastest = Math.min(...series.map((p) => p.paceSecPerUnit));
  const slowest = Math.max(...series.map((p) => p.paceSecPerUnit));
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

  const LINE_DRAW_DELAY = 60;
  const LINE_DRAW_DURATION = 1200;

  return (
    <svg
      viewBox={`0 0 ${CHART.width} ${CHART.height}`}
      className="pr-svg h-auto w-full text-accent"
      role="img"
      aria-labelledby="repeats-trend-title"
    >
      <title id="repeats-trend-title">Pace em cada repetição desse trajeto</title>
      <defs>
        <linearGradient id="repeats-trend-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      <path
        d={areaPath}
        fill="url(#repeats-trend-area)"
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

      {points.map((point, index) => (
        <circle
          key={point.startedAt}
          cx={point.x}
          cy={point.y}
          r={index === points.length - 1 ? 4.5 : 2.6}
          className={`pr-pop ${
            index === points.length - 1
              ? `stroke-background stroke-2 ${improved ? "fill-good" : "fill-accent"}`
              : "fill-accent"
          }`}
          fillOpacity={index === points.length - 1 ? 1 : 0.55}
          style={delay(
            LINE_DRAW_DELAY + (index / (points.length - 1)) * LINE_DRAW_DURATION + 80,
          )}
        >
          <title>{`${dateFormatter.format(new Date(point.startedAt))}: ${formatPaceValue(point.paceSecPerUnit)} ${paceLabel(unit)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function RunListRow({ run, unit, delayMs }: { run: CompletedRun; unit: DistanceUnit; delayMs: number }) {
  const seconds = runMovingSeconds(run);
  return (
    <li className="pr-enter border-t border-border first:border-t-0" style={delay(delayMs)}>
      <Link
        href={`/historico/detalhe?id=${run.id}`}
        className="-mx-1 flex items-center justify-between gap-3 rounded-lg px-1 py-2.5 text-sm hover:bg-background"
      >
        <span className="text-muted">
          {fullDateFormatter.format(new Date(run.startedAt))}
        </span>
        <span className="flex items-baseline gap-3 font-mono text-xs tabular-nums">
          <span className="text-muted">
            {formatDistance(run.distanceMeters, unit)} {unitLabel(unit)}
          </span>
          <span className="text-muted">{formatElapsed(seconds)}</span>
          <span className="font-semibold text-foreground">
            {formatAveragePace(run.distanceMeters, seconds, unit)}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function RouteGroupDetail({ anchorRunId }: { anchorRunId: string }) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [{ distanceUnit: unit }] = usePreferences();

  useEffect(() => {
    let cancelled = false;
    listCompletedRuns()
      .then((runs) => {
        if (cancelled) return;
        const group = groupRunsByRoute(runs).find((g) => g.anchorRunId === anchorRunId);
        setLoad(group ? { status: "ready", group } : { status: "not-found" });
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: "not-found" });
      });
    return () => {
      cancelled = true;
    };
  }, [anchorRunId]);

  const runsNewestFirst = useMemo(
    () => (load.status === "ready" ? [...load.group.runs].reverse() : []),
    [load],
  );

  if (load.status === "loading") {
    return (
      <Screen>
        <Card className="animate-pulse">
          <div className="h-4 w-32 rounded bg-border" />
          <div className="mt-4 h-14 rounded-xl bg-border/70" />
        </Card>
      </Screen>
    );
  }

  if (load.status === "not-found") {
    return (
      <Screen>
        <Card>
          <CardTitle>Trajeto não encontrado</CardTitle>
          <p className="text-sm leading-relaxed text-muted">
            Esse trajeto pode ter parado de se repetir (menos de duas corridas parecidas no
            histórico) ou a corrida que o ancorava foi apagada.
          </p>
          <Link href="/perfil?tab=progresso" className="mt-2 inline-block text-sm text-accent underline underline-offset-2">
            Voltar pro progresso
          </Link>
        </Card>
      </Screen>
    );
  }

  const { group } = load;
  const anchorRun = group.runs[0].run;

  return (
    <>
      <ScreenHeader
        title="Trajeto repetido"
        subtitle={`${group.runs.length} corridas seguiram aproximadamente o mesmo caminho.`}
      />
      <Screen>
        <Card className="pr-enter" style={delay(30)}>
          <RouteMap points={anchorRun.points} />
        </Card>

        <Card className="pr-enter" style={delay(60)}>
          <CardTitle>Evolução do pace</CardTitle>
          <RepeatsPaceChart group={group} unit={unit} />
          <p className="mt-1 text-center text-[10px] text-muted">{paceLabel(unit)}, por repetição</p>
        </Card>

        <Card className="pr-enter" style={delay(90)}>
          <CardTitle>Todas as corridas</CardTitle>
          <ul className="flex flex-col">
            {runsNewestFirst.map((r, index) => (
              <RunListRow key={r.run.id} run={r.run} unit={unit} delayMs={100 + index * 30} />
            ))}
          </ul>
        </Card>
      </Screen>
    </>
  );
}
