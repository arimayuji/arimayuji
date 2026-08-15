"use client";

import { useState, type CSSProperties } from "react";
import type { CompletedRun } from "@/lib/tracking/storage";
import type { DistanceUnit } from "@/lib/preferences";
import { formatDistance, unitLabel } from "@/lib/units";
import { Card, CardTitle, delay } from "./ui";

/** Shared by /historico (the raw log) and /progresso (the trends screen) — a calendar of when you ran fits both. */
const HEATMAP_WEEKS = 12;

/**
 * The calendar is gated on *days with a run*, not on runs: six treinos in the
 * same week would draw 83 blank squares and one dark one, which reads as "you
 * never run" rather than as a frequency pattern.
 */
const HEATMAP_MIN_DAYS = 6;

/** Monday-first, same week shape the plan screen uses. */
const WEEKDAY_INITIALS = ["S", "T", "Q", "Q", "S", "S", "D"];

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
});

const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "short" });

/**
 * "ter., 11 de ago." → "Ter., 11 de ago.". Done here rather than with CSS
 * `capitalize`, which would also upper-case the "de".
 */
function formatRunDate(date: Date): string {
  const text = dateFormatter.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type HeatDay = { date: Date; meters: number; future: boolean };

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Calendar of the last 12 weeks, one square per day, shaded by how far that
 * day went.
 *
 * The scale is relative to the runner's own biggest day in the window rather
 * than to fixed kilometre thresholds: on an absolute ramp anyone running 4 km
 * at a time gets an evenly pale grid that says nothing about their week.
 */
export function RunFrequencyHeatmap({
  runs,
  unit,
  delayMs = 75,
}: {
  runs: CompletedRun[];
  unit: DistanceUnit;
  delayMs?: number;
}) {
  const [active, setActive] = useState<number | null>(null);

  const metersByDay = new Map<string, number>();
  for (const run of runs) {
    const key = localDayKey(new Date(run.startedAt));
    metersByDay.set(key, (metersByDay.get(key) ?? 0) + run.distanceMeters);
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(today);
  start.setDate(start.getDate() - ((today.getDay() + 6) % 7) - (HEATMAP_WEEKS - 1) * 7);

  const days: HeatDay[] = [];
  for (let i = 0; i < HEATMAP_WEEKS * 7; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const future = date > today;
    days.push({
      date,
      meters: future ? 0 : (metersByDay.get(localDayKey(date)) ?? 0),
      future,
    });
  }

  const daysWithRun = days.filter((day) => day.meters > 0);
  if (daysWithRun.length < HEATMAP_MIN_DAYS) return null;

  const maxMeters = Math.max(...daysWithRun.map((day) => day.meters));
  const stepOf = (meters: number) =>
    meters <= 0 ? 0 : Math.min(4, Math.ceil((meters / maxMeters) * 4));

  const weeks = Array.from({ length: HEATMAP_WEEKS }, (_, w) => days.slice(w * 7, w * 7 + 7));
  const monthLabels = weeks.map((week, w) => {
    const month = week[0].date.getMonth();
    const neighbour = w === 0 ? weeks[1][0].date.getMonth() : weeks[w - 1][0].date.getMonth();
    if (w === 0 ? month !== neighbour : month === neighbour) return "";
    return monthFormatter.format(week[0].date).replace(".", "");
  });

  const activeDay = active === null ? null : days[active];
  const activeColumn = active === null ? 0 : Math.floor(active / 7);
  const activeRow = active === null ? 0 : active % 7;

  /*
   * The tooltip is anchored to the hovered square and then pushed back inside
   * the grid at the edges — a centred bubble on the first or last week would
   * hang off the card, which on a phone means the page itself scrolls
   * sideways.
   */
  const rowEdge = (row: number) => `(${row} * ((100% - 18px) / 7 + 3px))`;
  const tooltipAnchor: CSSProperties = {
    ...(activeColumn <= 2
      ? { left: 0 }
      : activeColumn >= HEATMAP_WEEKS - 3
        ? { right: 0 }
        : {
            left: `${((activeColumn + 0.5) / HEATMAP_WEEKS) * 100}%`,
            transform: "translateX(-50%)",
          }),
    ...(activeRow >= 3
      ? { bottom: `calc(100% - ${rowEdge(activeRow)} + 4px)` }
      : { top: `calc(${rowEdge(activeRow + 1)} + 1px)` }),
  };

  return (
    <Card className="pr-enter" style={delay(delayMs)}>
      <CardTitle>Frequência nas últimas 12 semanas</CardTitle>

      <div className="flex gap-1.5">
        <div className="w-3 shrink-0" aria-hidden="true" />
        <div className="grid flex-1 grid-cols-12 font-mono text-[9px] leading-none text-muted">
          {monthLabels.map((label, w) => (
            <span key={w} className="whitespace-nowrap">
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="relative mt-1.5 flex gap-1.5">
        {activeDay && (
          <div className="pointer-events-none absolute z-10" style={tooltipAnchor}>
            <span className="block rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-[11px] whitespace-nowrap tabular-nums">
              <span className="text-muted">{formatRunDate(activeDay.date)}</span>{" "}
              {activeDay.meters > 0
                ? `${formatDistance(activeDay.meters, unit)} ${unitLabel(unit)}`
                : "sem corrida"}
            </span>
          </div>
        )}

        <div
          className="grid w-3 shrink-0 grid-rows-7 gap-[3px] font-mono text-[9px] leading-none text-muted"
          aria-hidden="true"
        >
          {WEEKDAY_INITIALS.map((initial, i) => (
            <span key={i} className="flex items-center">
              {initial}
            </span>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-12 gap-[3px]">
          {weeks.map((week, w) => (
            <div key={w} className="grid grid-rows-7 gap-[3px]">
              {week.map((day, r) => {
                const index = w * 7 + r;

                if (day.future) {
                  return <div key={index} className="aspect-square" aria-hidden="true" />;
                }

                const step = stepOf(day.meters);
                const label = `${formatRunDate(day.date)} · ${
                  day.meters > 0
                    ? `${formatDistance(day.meters, unit)} ${unitLabel(unit)}`
                    : "sem corrida"
                }`;

                return (
                  <button
                    key={index}
                    type="button"
                    aria-label={label}
                    onMouseEnter={() => setActive(index)}
                    onMouseLeave={() => setActive((c) => (c === index ? null : c))}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive((c) => (c === index ? null : c))}
                    style={step > 0 ? { backgroundColor: `var(--pr-heat-${step})` } : undefined}
                    className={`aspect-square rounded-[3px] outline-none ring-foreground/40 hover:ring-2 focus-visible:ring-2 ${
                      step > 0 ? "border border-transparent" : "border border-border bg-background"
                    }`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted">
        <span>menos</span>
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ backgroundColor: `var(--pr-heat-${step})` }}
          />
        ))}
        <span>mais</span>
      </div>

      <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted">
        A escala é relativa ao seu próprio período: o tom mais forte é o maior dia destas
        12 semanas ({formatDistance(maxMeters, unit)} {unitLabel(unit)}). Dias sem corrida
        gravada ficam vazios.
      </p>
    </Card>
  );
}
