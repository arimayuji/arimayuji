"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { listCompletedRuns, listPainCheckIns, type CompletedRun, type PainCheckIn } from "@/lib/tracking/storage";
import {
  bucketPaceSecPerUnit,
  dailyBuckets,
  monthToDateMeters,
  weeklyBuckets,
  type WeekBucket,
} from "@/lib/tracking/stats";
import {
  computeConstancyWeeks,
  tallyConstancy,
  type ConstancyWeek,
  type WeeklyTarget,
} from "@/lib/tracking/constancy";
import { formatDistance, metersPerUnit, paceLabel, toUnit, unitLabel } from "@/lib/units";
import type { DistanceUnit } from "@/lib/preferences";
import { usePreferences } from "@/lib/usePreferences";
import { useRunnerProfile } from "@/lib/useRunnerProfile";
import type { WeeklyTargetKind } from "@/lib/runnerProfile";
import { Card, CardTitle, delay, NoticeBadge, Screen, ScreenHeader, Stat } from "../ui";
import { PillSlider } from "../pill-slider";
import { RunFrequencyHeatmap } from "../run-frequency-heatmap";

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

const ICON_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function EmblemsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <circle cx="12" cy="10" r="6.2" />
      <path d="M9 15.3 7.6 21l4.4-2.6L16.4 21l-1.4-5.7" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M9 5.5 15.5 12 9 18.5" />
    </svg>
  );
}

/** Lives here rather than /perfil now — the collectible ladder is exactly the kind of thing this screen exists for, not a setting. */
function EmblemsCard() {
  return (
    <Card className="pr-enter" style={delay(45)}>
      <CardTitle aside={<NoticeBadge>salvo neste aparelho</NoticeBadge>}>Emblemas</CardTitle>
      <Link href="/emblemas" className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
          <EmblemsIcon className="h-5 w-5" />
        </span>
        <p className="flex-1 text-sm leading-relaxed text-muted text-pretty">
          Sua coleção de marcos de quilometragem — cada um escondido até você destravar e abrir.
        </p>
        <ChevronIcon className="h-4 w-4 shrink-0 text-muted" />
      </Link>
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

const CONSTANCY_WEEKS = 52;

/**
 * A weekly consistency ledger, not a daily streak — the athlete's own target
 * (N runs or X km, never both) judges whole calendar weeks instead of days,
 * since the plan engine always leaves at least one rest day and a daily
 * streak would fight that outright. A week with a logged pain check-in is
 * marked *protected* automatically — it counts neither for nor against, the
 * same "no dialog, just find it marked" idea behind a streak freeze, except
 * here it's earned by reporting pain honestly rather than by luck. See
 * tracking/constancy.ts for the full reasoning.
 */
function ConstancyCard({
  runs,
  painCheckIns,
}: {
  runs: CompletedRun[];
  painCheckIns: PainCheckIn[];
}) {
  const [profile, setProfile] = useRunnerProfile();
  const [draftKind, setDraftKind] = useState<WeeklyTargetKind>(profile.weeklyTargetKind ?? "runs");
  const [draftValue, setDraftValue] = useState(profile.weeklyTargetValue ?? (draftKind === "runs" ? 3 : 15));
  const [editing, setEditing] = useState(false);

  const target: WeeklyTarget | null = useMemo(
    () =>
      profile.weeklyTargetKind && profile.weeklyTargetValue
        ? { kind: profile.weeklyTargetKind, value: profile.weeklyTargetValue }
        : null,
    [profile.weeklyTargetKind, profile.weeklyTargetValue],
  );

  const weeks = useMemo(
    () => (target ? computeConstancyWeeks(runs, painCheckIns, target, CONSTANCY_WEEKS) : []),
    [runs, painCheckIns, target],
  );
  const tally = useMemo(() => tallyConstancy(weeks), [weeks]);
  const visibleWeeks = useMemo(() => weeks.filter((w) => !w.beforeFirstRun), [weeks]);

  const handleSaveTarget = () => {
    setProfile({ weeklyTargetKind: draftKind, weeklyTargetValue: draftValue });
    setEditing(false);
  };

  if (!target || editing) {
    return (
      <Section title="Constância" delayMs={50}>
        {!target && (
          <p className="mb-4 text-xs leading-relaxed text-muted text-pretty">
            Não é sobre nunca faltar — é sobre cumprir uma meta sua, semana após semana, no seu
            ritmo. Escolha como quer medir isso.
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDraftKind("runs")}
            aria-pressed={draftKind === "runs"}
            className={`min-h-11 flex-1 rounded-xl border px-3 text-sm font-medium ${
              draftKind === "runs"
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-background text-foreground"
            }`}
          >
            Corridas por semana
          </button>
          <button
            type="button"
            onClick={() => setDraftKind("km")}
            aria-pressed={draftKind === "km"}
            className={`min-h-11 flex-1 rounded-xl border px-3 text-sm font-medium ${
              draftKind === "km"
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-background text-foreground"
            }`}
          >
            Km por semana
          </button>
        </div>
        <div className="mt-4">
          <PillSlider
            min={draftKind === "runs" ? 1 : 5}
            max={draftKind === "runs" ? 7 : 100}
            step={draftKind === "runs" ? 1 : 5}
            value={draftValue}
            onChange={setDraftValue}
            formatValue={(v) => (draftKind === "runs" ? `${v}x` : `${v} km`)}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          {target && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold"
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveTarget}
            className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground"
          >
            Salvar meta
          </button>
        </div>
      </Section>
    );
  }

  return (
    <Section
      title="Constância"
      delayMs={50}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-2xl font-semibold tabular-nums">
            {tally.met}
            <span className="text-sm text-muted"> de {tally.judged} semanas</span>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Meta: {target.kind === "runs" ? `${target.value}x por semana` : `${target.value} km por semana`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDraftKind(target.kind);
            setDraftValue(target.value);
            setEditing(true);
          }}
          className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted"
        >
          Editar meta
        </button>
      </div>

      {visibleWeeks.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {visibleWeeks.map((week) => (
            <ConstancyCell key={week.weekStart} week={week} />
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-[10px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-good" /> cumprida
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] border border-accent/70 bg-accent/25" /> protegida
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-border" /> não cumprida
        </span>
      </div>
    </Section>
  );
}

function ConstancyCell({ week }: { week: ConstancyWeek }) {
  const dateLabel = new Date(week.weekStart).toLocaleDateString("pt-BR");
  if (week.inProgress) {
    return (
      <span
        title={`Semana de ${dateLabel} — em andamento`}
        className="h-2.5 w-2.5 rounded-[3px] border border-dashed border-muted"
      />
    );
  }
  if (week.protected) {
    return (
      <span
        title={`Semana de ${dateLabel} — protegida (dor registrada)`}
        className="h-2.5 w-2.5 rounded-[3px] border border-accent/70 bg-accent/25"
      />
    );
  }
  return (
    <span
      title={`Semana de ${dateLabel} — ${week.met ? "cumprida" : "não cumprida"}`}
      className={`h-2.5 w-2.5 rounded-[3px] ${week.met ? "bg-good" : "bg-border"}`}
    />
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
                  className={`pr-bar w-full rounded-md ${isCurrent ? "bg-accent/50" : "bg-accent"}`}
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
                  className={`pr-bar w-full rounded-md ${isToday ? "bg-accent/50" : day.distanceMeters > 0 ? "bg-accent" : "bg-border"}`}
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
  const [painCheckIns, setPainCheckIns] = useState<PainCheckIn[]>([]);
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
    listPainCheckIns().then((checkIns) => {
      if (!cancelled) setPainCheckIns(checkIns);
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
        title="Progresso"
        subtitle="Rodagem, ritmo, constância e conquistas — tudo calculado sobre as corridas salvas neste aparelho."
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
            <ConstancyCard runs={runs} painCheckIns={painCheckIns} />
            <EmblemsCard />
            <WeeklyVolumeChart weeks={weeks} unit={unit} />
            <RunFrequencyHeatmap runs={runs} unit={unit} delayMs={85} />
            <PaceTrendChart weeks={weeks} unit={unit} />
            <MonthCard runs={runs} unit={unit} />
            <DailyVolumeChart runs={runs} unit={unit} />
          </>
        )}
      </Screen>
    </>
  );
}
