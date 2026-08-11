/**
 * Distance/pace presentation for the preferred unit.
 *
 * The tracker itself only ever deals in metres and seconds — nothing here is
 * used inside `src/lib/tracking/*`. This module exists so the history screen
 * can honour the unit chosen on /perfil without any conversion leaking into
 * the recording pipeline.
 */

import type { DistanceUnit } from "./preferences";

const METERS_PER_MILE = 1609.344;

export function metersPerUnit(unit: DistanceUnit): number {
  return unit === "mi" ? METERS_PER_MILE : 1000;
}

export function toUnit(meters: number, unit: DistanceUnit): number {
  return meters / metersPerUnit(unit);
}

/** "5.23" — two decimals, matching the recording screen's readout. */
export function formatDistance(meters: number, unit: DistanceUnit): string {
  return toUnit(meters, unit).toFixed(2);
}

/** Average pace as m:ss per chosen unit, or "--:--" when it can't be computed. */
export function formatAveragePace(
  meters: number,
  seconds: number,
  unit: DistanceUnit,
): string {
  const distance = toUnit(meters, unit);
  if (!Number.isFinite(distance) || distance <= 0 || seconds <= 0) return "--:--";
  const secondsPerUnit = seconds / distance;
  if (!Number.isFinite(secondsPerUnit)) return "--:--";
  const m = Math.floor(secondsPerUnit / 60);
  const s = Math.round(secondsPerUnit % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function unitLabel(unit: DistanceUnit): string {
  return unit === "mi" ? "mi" : "km";
}

export function paceLabel(unit: DistanceUnit): string {
  return unit === "mi" ? "min/mi" : "min/km";
}
