"use client";

import { useState } from "react";
import {
  defaultAvailableWeekdays,
  GOAL_DISTANCE_OPTIONS,
  WEEKDAY_FULL_LABELS,
  WEEKDAY_LABELS,
} from "@/lib/runnerProfile";
import { pickLongRunDay } from "@/lib/plan/periodization";

/**
 * Shared between the mobile/always-editable `GoalCard` (page.tsx) and the
 * desktop first-run `GoalWizard` (goal-wizard.tsx) — pulled out to its own
 * module specifically so neither of those two files has to import the
 * other (page.tsx already imports GoalWizard for the empty-state branch;
 * GoalWizard importing back from page.tsx would be a circular import).
 */

/** Matches what the plan engine itself clamps to (periodization.ts: "at least 2 — long + one more, at most 6 — always 1 rest day"), not an arbitrary UI choice. */
export const MIN_WEEKLY_DAYS = 2;
export const MAX_WEEKLY_DAYS = 6;

const DISTANCE_TILE: Record<number, { main: string; sub: string }> = {
  5000: { main: "5", sub: "km" },
  10000: { main: "10", sub: "km" },
  21097: { main: "Meia", sub: "21 km" },
  42195: { main: "Maratona", sub: "42 km" },
};

/** True for any distance that isn't one of the four fixed race tiles — a custom 15K, 10 miles converted to meters, whatever someone actually signed up for. */
function isPresetDistance(meters: number | undefined): boolean {
  return meters !== undefined && GOAL_DISTANCE_OPTIONS.some((option) => option.meters === meters);
}

const CUSTOM_VALUE = "custom";

/**
 * Big number + unit, not a squeezed-in label on a segmented button — a race
 * distance is the single most consequential choice on this screen. A 5th
 * tile, "Personalizada", reveals a plain km input for anything the four
 * presets don't cover (15K, 10 miles, a local prova with an odd distance);
 * it opens by itself whenever `selected` already holds a non-preset value,
 * so a profile someone set up before this existed — or synced from
 * elsewhere — still shows its real number instead of looking unset.
 *
 * At `lg:` this whole tile grid swaps for a real `<select>` — the touch-tile
 * treatment is right for a thumb on a phone, but stretched onto a desktop
 * browser it read as an oversized widget instead of a form control ("vamos
 * aplicar formulários mesmo... o design de widget não funciona", 2026-09-02).
 * Both markups share the same `selected`/`onSelect` state and the same
 * custom-km input below, so picking a distance in one never desyncs from
 * the other if the viewport crosses the breakpoint mid-session.
 */
export function DistanceTileGrid({
  selected,
  onSelect,
}: {
  selected: number | undefined;
  onSelect: (meters: number) => void;
}) {
  const [customOpen, setCustomOpen] = useState(() => !isPresetDistance(selected) && selected !== undefined);
  const [customKm, setCustomKm] = useState(() =>
    !isPresetDistance(selected) && selected !== undefined ? String(selected / 1000).replace(".", ",") : "",
  );
  const customSelected = customOpen || (!isPresetDistance(selected) && selected !== undefined);

  const handleCustomChange = (raw: string) => {
    const cleaned = raw.replace(/[^0-9,.]/g, "").slice(0, 6);
    setCustomKm(cleaned);
    const km = Number(cleaned.replace(",", "."));
    if (Number.isFinite(km) && km > 0) onSelect(Math.round(km * 1000));
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 lg:hidden">
        {GOAL_DISTANCE_OPTIONS.map((option) => {
          const isSelected = !customSelected && selected === option.meters;
          const tile = DISTANCE_TILE[option.meters];
          return (
            <button
              key={option.meters}
              type="button"
              onClick={() => {
                setCustomOpen(false);
                onSelect(option.meters);
              }}
              aria-pressed={isSelected}
              className={`pr-press flex h-16 flex-col items-center justify-center gap-0.5 rounded-xl border active:scale-95 ${
                isSelected
                  ? "border-transparent bg-accent text-accent-foreground"
                  : "border-border bg-background text-foreground"
              }`}
            >
              <span className="text-lg font-extrabold">{tile.main}</span>
              <span className="text-xs font-semibold opacity-75">{tile.sub}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCustomOpen(true)}
          aria-pressed={customSelected}
          className={`pr-press col-span-2 flex h-12 items-center justify-center gap-1.5 rounded-xl border active:scale-95 ${
            customSelected
              ? "border-transparent bg-accent text-accent-foreground"
              : "border-border bg-background text-foreground"
          }`}
        >
          <span className="text-sm font-bold">Personalizada</span>
          {customSelected && customKm && (
            <span className="text-sm font-semibold opacity-75">· {customKm} km</span>
          )}
        </button>
      </div>

      {/* Desktop web: a real <select>, not a tile grid — see this
          function's own comment for why. */}
      <select
        value={customSelected ? CUSTOM_VALUE : (selected ?? "")}
        onChange={(event) => {
          if (event.target.value === CUSTOM_VALUE) {
            setCustomOpen(true);
            return;
          }
          setCustomOpen(false);
          onSelect(Number(event.target.value));
        }}
        className="hidden h-10 w-full rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-accent lg:block"
      >
        {selected === undefined && !customSelected && (
          <option value="" disabled>
            Escolher distância
          </option>
        )}
        {GOAL_DISTANCE_OPTIONS.map((option) => (
          <option key={option.meters} value={option.meters}>
            {DISTANCE_TILE[option.meters].main} ({DISTANCE_TILE[option.meters].sub})
          </option>
        ))}
        <option value={CUSTOM_VALUE}>Personalizada</option>
      </select>

      {customOpen && (
        <div className="mt-2.5 flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={customKm}
            onChange={(event) => handleCustomChange(event.target.value)}
            placeholder="Ex: 15"
            autoFocus
            className="h-12 w-28 rounded-xl border border-border bg-background px-3 text-lg font-bold outline-none focus:border-accent lg:h-9 lg:rounded-md lg:text-sm lg:font-medium"
          />
          <span className="text-sm font-semibold text-muted lg:text-xs">km</span>
        </div>
      )}
    </div>
  );
}

/**
 * Which weekdays the athlete can run — replaces the old "how many days per
 * week" slider outright, rather than sitting next to it. The count was never
 * the real question: `periodization.ts` used to hardcode the long run onto
 * Sunday and quality onto Thursday no matter what, so anyone who can't run
 * Sundays got a plan whose biggest session landed on a day they'd never do,
 * every single week. Picking days answers both questions at once (the count
 * is just the list's length), so there is strictly more information here and
 * one fewer control.
 *
 * `value` undefined means a profile from before this existed: the picker
 * pre-selects `defaultAvailableWeekdays(weeklyRunDays)`, which is exactly the
 * set of days that profile's plan is already using — so opening this shows
 * the current plan, never a blank slate or a silently different week. Nothing
 * is persisted until a day is actually toggled.
 */
export function WeekdayPicker({
  value,
  weeklyRunDays,
  onChange,
}: {
  value: number[] | undefined;
  weeklyRunDays: number | undefined;
  onChange: (days: number[]) => void;
}) {
  const selected = value ?? defaultAvailableWeekdays(weeklyRunDays);
  const selectedSet = new Set(selected);
  const atMax = selected.length >= MAX_WEEKLY_DAYS;
  const atMin = selected.length <= MIN_WEEKLY_DAYS;

  const toggle = (day: number) => {
    const isOn = selectedSet.has(day);
    // The bounds aren't cosmetic: under 2 days there's no room for a long run
    // plus anything else, and 7 would leave the week with no rest day at all.
    if (isOn ? atMin : atMax) return;
    const next = isOn ? selected.filter((d) => d !== day) : [...selected, day].sort((a, b) => a - b);
    onChange(next);
  };

  const longDay = WEEKDAY_FULL_LABELS[pickLongRunDay(selected)];

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 lg:gap-1.5">
        {WEEKDAY_LABELS.map((label, day) => {
          const isOn = selectedSet.has(day);
          const locked = isOn ? atMin : atMax;
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggle(day)}
              aria-pressed={isOn}
              aria-label={WEEKDAY_FULL_LABELS[day]}
              disabled={locked}
              className={`pr-press flex h-12 items-center justify-center rounded-xl border text-[11px] font-bold active:scale-95 lg:h-9 lg:rounded-md lg:text-xs lg:font-semibold ${
                isOn
                  ? "border-transparent bg-accent text-accent-foreground"
                  : "border-border bg-background text-muted"
              } ${locked ? "opacity-45" : ""}`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        {selected.length} dias por semana · longão no {longDay}
      </p>
    </div>
  );
}
