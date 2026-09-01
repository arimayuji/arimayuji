import { bucketPaceSecPerUnit, type WeekBucket } from "@/lib/tracking/stats";
import { formatPace } from "@/lib/tracking/geoFilter";

/**
 * Two small SVG trend charts for the desktop dashboard — real weekly running
 * history (`weeklyBuckets`), independent of whatever the plan engine is
 * prescribing for the current week. Same percentage-based viewBox and
 * `currentColor` convention as `Sparkline` in historico/detalhe/run-detail.tsx
 * (color comes from a wrapping `text-*` class, not a hardcoded fill), so both
 * inherit the app's light/dark tokens for free instead of hand-rolling a
 * palette here.
 */

const CHART_WIDTH = 100;
const CHART_HEIGHT = 34;
const TOP_PAD = 3;

function weekLabel(weekStart: number, weeksAgo: number): string {
  if (weeksAgo === 0) return "essa semana";
  return new Date(weekStart).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export interface WeeklyBarValue {
  weekStart: number;
  value: number;
}

/**
 * Generic weekly bar chart — one bar per week, every week in the window
 * renders (even a zero one), same "a gap shows as a gap" rule `weeklyBuckets`
 * documents. Shared by volume (km) and training load (RPE×min) below rather
 * than two near-identical chart components; only the values and the tooltip
 * text differ between them. `targetValue`, when given, draws as a dashed
 * reference line rather than another bar — a goal to compare against, not
 * another week of history.
 */
export function WeeklyBarChart({
  weeks,
  targetValue,
  formatTooltip,
}: {
  weeks: WeeklyBarValue[];
  targetValue?: number;
  formatTooltip: (value: number, weekStart: number, weeksAgo: number) => string;
}) {
  const values = weeks.map((w) => w.value);
  const max = Math.max(1, targetValue ?? 0, ...values);
  const n = weeks.length;
  const slot = CHART_WIDTH / n;
  const barWidth = slot * 0.6;
  const usableHeight = CHART_HEIGHT - TOP_PAD;
  // The bar-by-bar <title> tooltips only reach a mouse — a screen reader
  // gets nothing from an `aria-hidden` SVG. Reusing the same `formatTooltip`
  // every bar already renders gives a screen reader the exact same data a
  // sighted, mouse-using person gets from hovering each bar in turn.
  const ariaLabel = weeks.map((week, i) => formatTooltip(week.value, week.weekStart, n - 1 - i)).join(", ");

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT + 6}`}
      preserveAspectRatio="none"
      className="h-36 w-full text-accent"
      role="img"
      aria-label={ariaLabel}
    >
      <line x1="0" y1={CHART_HEIGHT} x2={CHART_WIDTH} y2={CHART_HEIGHT} className="text-border" stroke="currentColor" strokeWidth="0.3" />
      {targetValue !== undefined && targetValue > 0 && (
        <line
          x1="0"
          x2={CHART_WIDTH}
          y1={CHART_HEIGHT - (targetValue / max) * usableHeight}
          y2={CHART_HEIGHT - (targetValue / max) * usableHeight}
          className="text-foreground/50"
          stroke="currentColor"
          strokeWidth="0.4"
          strokeDasharray="1.4 1.2"
        />
      )}
      {weeks.map((week, i) => {
        const height = (week.value / max) * usableHeight;
        const x = i * slot + (slot - barWidth) / 2;
        const isCurrent = i === n - 1;
        return (
          <rect
            key={week.weekStart}
            x={x}
            y={CHART_HEIGHT - height}
            width={barWidth}
            height={height}
            rx={barWidth * 0.15}
            fill="currentColor"
            opacity={isCurrent ? 1 : 0.5}
          >
            <title>{formatTooltip(week.value, week.weekStart, n - 1 - i)}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export interface WeeklyLinePoint {
  weekStart: number;
  value: number | null;
}

/**
 * Generic weekly line chart — one point per week, gaps break the line
 * instead of connecting across them, same honesty rule as the pace chart
 * below (which this predates conceptually but doesn't share code with, to
 * avoid re-verifying an already-shipped chart just to extract a generic).
 * `invert` plots a *smaller* value higher on the chart — for a metric
 * where "down and to the right" reads as improvement (resting heart rate),
 * not the default "up is more" reading (HRV). Returns null with fewer than
 * 2 known points.
 */
export function WeeklyLineChart({
  points,
  invert = false,
  formatTooltip,
}: {
  points: WeeklyLinePoint[];
  invert?: boolean;
  formatTooltip: (value: number, weekStart: number, weeksAgo: number) => string;
}) {
  const known = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (known.length < 2) return null;

  const min = Math.min(...known);
  const max = Math.max(...known);
  const span = max - min;
  const n = points.length;
  const slot = CHART_WIDTH / n;

  const plotted = points.map((p, i) => {
    if (p.value === null) return null;
    const x = i * slot + slot / 2;
    const ratio = span > 0 ? (p.value - min) / span : 0.5;
    const y = invert
      ? TOP_PAD + ratio * (CHART_HEIGHT - TOP_PAD)
      : CHART_HEIGHT - TOP_PAD - ratio * (CHART_HEIGHT - TOP_PAD);
    return { x, y, value: p.value };
  });

  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  for (const p of plotted) {
    if (p === null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push(p);
    }
  }
  if (current.length) segments.push(current);

  const firstKnownIndex = plotted.findIndex((p) => p !== null);
  const lastKnownIndex = plotted.map((p) => p !== null).lastIndexOf(true);
  const ariaLabel = points
    .map((p, i) => (p.value !== null ? formatTooltip(p.value, p.weekStart, n - 1 - i) : null))
    .filter((label): label is string => label !== null)
    .join(", ");

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT + 6}`}
      preserveAspectRatio="none"
      className="h-24 w-full text-accent"
      role="img"
      aria-label={ariaLabel}
    >
      <line x1="0" y1={CHART_HEIGHT} x2={CHART_WIDTH} y2={CHART_HEIGHT} className="text-border" stroke="currentColor" strokeWidth="0.3" />
      {segments.map((segment, si) => (
        <path
          key={si}
          d={segment.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {plotted.map((p, i) =>
        p ? (
          <circle key={i} cx={p.x} cy={p.y} r={i === firstKnownIndex || i === lastKnownIndex ? 1.6 : 1} fill="currentColor">
            <title>{formatTooltip(p.value, points[i].weekStart, n - 1 - i)}</title>
          </circle>
        ) : null,
      )}
    </svg>
  );
}

/**
 * Weekly average pace over the same window, plotted so *higher on the chart
 * reads as faster* (the opposite of a raw seconds axis) — the direct label
 * on the endpoints is what actually states the pace, the line is only the
 * trend. Weeks with no completed distance (`bucketPaceSecPerUnit` returns
 * null) break the line instead of connecting across the gap — a week you
 * didn't run has no pace to report, joining across it would draw a trend
 * that doesn't exist. Returns null when fewer than 2 weeks have a real pace
 * to compare, so the caller can show an honest empty state instead of a
 * chart with nothing to show.
 */
export function WeeklyPaceChart({ buckets }: { buckets: WeekBucket[] }) {
  const paces = buckets.map((b) => bucketPaceSecPerUnit(b, 1000));
  const known = paces.filter((p): p is number => p !== null);
  if (known.length < 2) return null;

  const min = Math.min(...known); // fastest
  const max = Math.max(...known); // slowest
  const span = max - min;
  const n = buckets.length;
  const slot = CHART_WIDTH / n;

  const points = paces.map((pace, i) => {
    if (pace === null) return null;
    const x = i * slot + slot / 2;
    const y = span > 0 ? TOP_PAD + ((pace - min) / span) * (CHART_HEIGHT - TOP_PAD) : CHART_HEIGHT / 2;
    return { x, y, pace };
  });

  // Break into contiguous segments across null gaps rather than one path with holes.
  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  for (const p of points) {
    if (p === null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push(p);
    }
  }
  if (current.length) segments.push(current);

  const firstKnownIndex = points.findIndex((p) => p !== null);
  const lastKnownIndex = points.map((p) => p !== null).lastIndexOf(true);
  const ariaLabel = paces
    .map((pace, i) => (pace !== null ? `${weekLabel(buckets[i].weekStart, n - 1 - i)}: ${formatPace(pace)} por km` : null))
    .filter((label): label is string => label !== null)
    .join(", ");

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT + 6}`}
      preserveAspectRatio="none"
      className="h-36 w-full text-accent"
      role="img"
      aria-label={ariaLabel}
    >
      <line x1="0" y1={CHART_HEIGHT} x2={CHART_WIDTH} y2={CHART_HEIGHT} className="text-border" stroke="currentColor" strokeWidth="0.3" />
      {segments.map((segment, si) => (
        <path
          key={si}
          d={segment.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {points.map((p, i) =>
        p ? (
          <circle key={i} cx={p.x} cy={p.y} r={i === firstKnownIndex || i === lastKnownIndex ? 1.6 : 1} fill="currentColor">
            <title>
              {weekLabel(buckets[i].weekStart, n - 1 - i)} — {formatPace(p.pace)}/km
            </title>
          </circle>
        ) : null,
      )}
    </svg>
  );
}
