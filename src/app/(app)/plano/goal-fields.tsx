"use client";

import { useState } from "react";
import { GOAL_DISTANCE_OPTIONS } from "@/lib/runnerProfile";

/**
 * Shared between the mobile/always-editable `GoalCard` (page.tsx) and the
 * desktop first-run `GoalWizard` (goal-wizard.tsx) — pulled out to its own
 * module specifically so neither of those two files has to import the
 * other (page.tsx already imports GoalWizard for the empty-state branch;
 * GoalWizard importing back from page.tsx would be a circular import).
 */

/** Matches what the plan engine itself clamps to (periodization.ts: "at least 2 — long + one more, at most 6 — always 1 rest day") — the stepper's own bounds, not an arbitrary UI choice. */
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

/**
 * Big number + unit, not a squeezed-in label on a segmented button — a race
 * distance is the single most consequential choice on this screen. A 5th
 * tile, "Personalizada", reveals a plain km input for anything the four
 * presets don't cover (15K, 10 miles, a local prova with an odd distance);
 * it opens by itself whenever `selected` already holds a non-preset value,
 * so a profile someone set up before this existed — or synced from
 * elsewhere — still shows its real number instead of looking unset.
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
      <div className="grid grid-cols-2 gap-2.5">
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
              className={`flex h-16 flex-col items-center justify-center gap-0.5 rounded-xl border transition-colors ${
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
          className={`col-span-2 flex h-12 items-center justify-center gap-1.5 rounded-xl border transition-colors ${
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
      {customOpen && (
        <div className="mt-2.5 flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={customKm}
            onChange={(event) => handleCustomChange(event.target.value)}
            placeholder="Ex: 15"
            autoFocus
            className="h-12 w-28 rounded-xl border border-border bg-background px-3 text-lg font-bold outline-none focus:border-accent"
          />
          <span className="text-sm font-semibold text-muted">km</span>
        </div>
      )}
    </div>
  );
}
