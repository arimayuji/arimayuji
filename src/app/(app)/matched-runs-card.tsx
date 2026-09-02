"use client";

import Link from "next/link";
import type { CompletedRun } from "@/lib/tracking/storage";
import { groupRunsByRoute, type MatchedRunGroup } from "@/lib/tracking/routeMatching";
import { projectRoute } from "@/lib/tracking/routeProjection";
import type { DistanceUnit } from "@/lib/preferences";
import { metersPerUnit, paceLabel } from "@/lib/units";
import { Card, CardTitle, delay } from "./ui";

const ICON_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M9 5.5 15.5 12 9 18.5" />
    </svg>
  );
}

function formatPaceValue(secPerUnit: number): string {
  const m = Math.floor(secPerUnit / 60);
  const s = Math.round(secPerUnit % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Same flattened-route SVG `projectRoute` produces for /run and /historico's map preview — real geometry, just smaller. */
function RouteThumb({ points }: { points: CompletedRun["points"] }) {
  const projected = projectRoute(points, { viewBoxSize: 56, paddingFraction: 0.12 });
  if (!projected) return null;

  return (
    <svg
      viewBox={`0 0 ${projected.viewBoxSize} ${projected.viewBoxSize}`}
      className="h-14 w-14 shrink-0 rounded-lg border border-border bg-background text-accent"
      role="img"
      aria-label="Traçado do trajeto"
    >
      {projected.polylines.map((points, i) => (
        <polyline
          key={i}
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

function TopGroupTeaser({ group, unit }: { group: MatchedRunGroup; unit: DistanceUnit }) {
  const unitMeters = metersPerUnit(unit);
  const first = group.runs[0];
  const last = group.runs[group.runs.length - 1];
  const firstPace = first.paceSecPerMeter * unitMeters;
  const lastPace = last.paceSecPerMeter * unitMeters;
  const improved = lastPace <= firstPace;

  return (
    <Link
      href={`/progresso/trajeto?anchor=${group.anchorRunId}`}
      className="-mx-1 flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-background"
    >
      <RouteThumb points={last.run.points} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{group.runs.length} corridas nesse trajeto</p>
        <p className="mt-0.5 flex items-baseline gap-1.5 text-xs text-muted">
          <span className="font-mono tabular-nums">{formatPaceValue(firstPace)}</span>
          <span aria-hidden="true">→</span>
          <span className={`font-mono font-semibold tabular-nums ${improved ? "text-good" : "text-foreground"}`}>
            {formatPaceValue(lastPace)}
          </span>
          <span>{paceLabel(unit)}</span>
        </p>
      </div>
      <ChevronIcon className="h-4 w-4 shrink-0 text-muted" />
    </Link>
  );
}

/**
 * "Corridas correspondentes" — Strava paywalls the equivalent ("Matched
 * runs": runs grouped by shared route, pace trend across repeats) as
 * Premium; this reuses runs already loaded for the rest of /progresso, so
 * there's no reason to. Shows only the most-repeated route as a teaser —
 * `groupRunsByRoute` returns every group with 2+ runs, but this card stays
 * the same compact shape as its siblings and links out to the full trajeto
 * list rather than growing to fit N routes.
 */
export function MatchedRunsCard({
  runs,
  unit,
  delayMs,
}: {
  runs: CompletedRun[];
  unit: DistanceUnit;
  delayMs: number;
}) {
  const groups = groupRunsByRoute(runs);
  if (groups.length === 0) return null;

  const [topGroup, ...rest] = groups;

  return (
    <Card
      className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
      style={delay(delayMs)}
    >
      <CardTitle>Corridas correspondentes</CardTitle>
      <TopGroupTeaser group={topGroup} unit={unit} />
      {rest.length > 0 && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
          +{rest.length} {rest.length === 1 ? "outro trajeto repetido" : "outros trajetos repetidos"}
        </p>
      )}
    </Card>
  );
}
