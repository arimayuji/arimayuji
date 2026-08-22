/**
 * "Z1"–"Z5" — the numbered-zone vocabulary runners already know from a watch
 * or Strava, mapped onto the VDOT pace zones this app already computes
 * (`vdot.ts`). Z1 is the easiest (the "easy" target pace), Z5 the hardest
 * ("repetition"); nothing new is calculated here, this just gives the
 * existing five zones a number and a way to say how long a real run spent
 * in each one.
 */
import type { Split } from "../tracking/splits";
import type { PaceZoneName, PaceZones } from "./types";
import { paceForZone } from "./vdot";

/** Portuguese display name per zone — shared by `/plano` and `/run`'s "usar treino de hoje" chip, so the two screens never drift into calling the same zone two different things. */
export const ZONE_LABEL: Record<PaceZoneName, string> = {
  easy: "Fácil",
  marathon: "Maratona",
  threshold: "Limiar",
  interval: "Intervalado",
  repetition: "Repetição",
};

/** Zone order from easiest to hardest — Z1 through Z5. */
export const ZONE_ORDER: PaceZoneName[] = [
  "easy",
  "marathon",
  "threshold",
  "interval",
  "repetition",
];

export const ZONE_NUMBER: Record<PaceZoneName, number> = {
  easy: 1,
  marathon: 2,
  threshold: 3,
  interval: 4,
  repetition: 5,
};

/** Pace (sec/km) at the midpoint between each pair of adjacent zone targets — a run's actual split pace is compared against these to decide which zone it counts toward. Descending, matching `ZONE_ORDER`'s target paces (Z1 slowest, Z5 fastest). */
function zoneBoundaries(zones: PaceZones): number[] {
  const targets = ZONE_ORDER.map((zone) => paceForZone(zones, zone));
  const boundaries: number[] = [];
  for (let i = 0; i < targets.length - 1; i++) boundaries.push((targets[i] + targets[i + 1]) / 2);
  return boundaries;
}

/** Which zone a pace (seconds per km) falls into. Slower than every zone target still counts as Z1 (easy); faster than every target counts as Z5 (repetition) — there's no zone below or above the five VDOT defines. */
export function classifyPace(paceSecPerKm: number, zones: PaceZones): PaceZoneName {
  const boundaries = zoneBoundaries(zones);
  let zoneIndex = 0;
  for (const boundary of boundaries) {
    if (paceSecPerKm > boundary) break;
    zoneIndex++;
  }
  return ZONE_ORDER[zoneIndex];
}

export type TimeInZones = Record<PaceZoneName, number>;

/**
 * Seconds spent in each pace zone across a run, one split at a time — each
 * split's own average pace decides its zone, since a km split is the
 * finest-grained real speed signal GPS splits give without raw per-second
 * data. A run with no splits (too short) returns all zeros, not an error.
 */
export function timeInZones(
  splits: Pick<Split, "distanceMeters" | "durationSeconds">[],
  zones: PaceZones,
): TimeInZones {
  const result: TimeInZones = { easy: 0, marathon: 0, threshold: 0, interval: 0, repetition: 0 };
  for (const split of splits) {
    if (split.distanceMeters <= 0 || split.durationSeconds <= 0) continue;
    const paceSecPerKm = (split.durationSeconds / split.distanceMeters) * 1000;
    result[classifyPace(paceSecPerKm, zones)] += split.durationSeconds;
  }
  return result;
}
