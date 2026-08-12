/**
 * Daniels–Gilbert VDOT: a "VDOT" score for pace zones, computed from the
 * two public equations behind the model (Daniels & Gilbert, *Oxygen Power*,
 * 1979) — not the book's printed tables, which are copyrighted. See
 * `src/lib/evidence` fact `vdot-pace-zones` for the source and the
 * evidence-strength note (empirical model, not a lab VO2max test).
 *
 * "VDOT" is a trademark of the Daniels estate — used here only as the
 * established name for the calculation, never as a feature/product name.
 */

/** Oxygen cost (mL/kg/min) of running at velocity `v` (m/min). */
function oxygenCost(v: number): number {
  return -4.6 + 0.182258 * v + 0.000104 * v * v;
}

/** Fraction of VO2max sustainable for `t` minutes — fades from ~100% (short) toward ~80% (long). */
function sustainableFraction(t: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
}

/** VDOT implied by a race performance. */
export function computeVdot(distanceMeters: number, timeSeconds: number): number {
  const velocity = distanceMeters / (timeSeconds / 60); // m/min
  const durationMinutes = timeSeconds / 60;
  return oxygenCost(velocity) / sustainableFraction(durationMinutes);
}

/**
 * Inverts `oxygenCost`: the velocity (m/min) whose oxygen cost equals
 * `fraction * vdot`. Solves the quadratic `0.000104v² + 0.182258v + (-4.6 -
 * target) = 0` for its positive root.
 */
function velocityForVo2Target(vo2Target: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - vo2Target;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

function velocityToSecPerKm(velocityMetersPerMin: number): number {
  return 60000 / velocityMetersPerMin;
}

/**
 * Intensity fractions of VDOT per zone, from the research summary's ranges
 * (Easy 59–74%, Marathon ~84%, Threshold ~88%, Interval ~98%, Repetition
 * ~105%) — single representative values, not the book's exact cutoffs.
 */
const ZONE_FRACTIONS = {
  easy: 0.665, // midpoint of the 59–74% range
  marathon: 0.84,
  threshold: 0.88,
  interval: 0.98,
  repetition: 1.05,
} as const;

export interface PaceZonesResult {
  vdot: number;
  easySecPerKm: number;
  marathonSecPerKm: number;
  thresholdSecPerKm: number;
  intervalSecPerKm: number;
  repetitionSecPerKm: number;
}

export function paceZonesFromVdot(vdot: number): PaceZonesResult {
  return {
    vdot,
    easySecPerKm: velocityToSecPerKm(velocityForVo2Target(ZONE_FRACTIONS.easy * vdot)),
    marathonSecPerKm: velocityToSecPerKm(velocityForVo2Target(ZONE_FRACTIONS.marathon * vdot)),
    thresholdSecPerKm: velocityToSecPerKm(velocityForVo2Target(ZONE_FRACTIONS.threshold * vdot)),
    intervalSecPerKm: velocityToSecPerKm(velocityForVo2Target(ZONE_FRACTIONS.interval * vdot)),
    repetitionSecPerKm: velocityToSecPerKm(
      velocityForVo2Target(ZONE_FRACTIONS.repetition * vdot),
    ),
  };
}

const ZONE_TO_FIELD = {
  easy: "easySecPerKm",
  marathon: "marathonSecPerKm",
  threshold: "thresholdSecPerKm",
  interval: "intervalSecPerKm",
  repetition: "repetitionSecPerKm",
} as const satisfies Record<import("./types").PaceZoneName, keyof PaceZonesResult>;

export function paceForZone(
  zones: PaceZonesResult,
  zone: import("./types").PaceZoneName,
): number {
  return zones[ZONE_TO_FIELD[zone]];
}

/**
 * Riegel's formula: predicts the equivalent time at `targetDistanceMeters`
 * from a known performance. The exponent is an empirical fit, not a
 * physiological law — it drifts toward ~1.04 for elite athletes and ~1.10–
 * 1.12 for low-mileage runners, and the default here (1.06) is the
 * general-population value. See evidence fact `riegel-race-prediction`.
 */
export function predictRaceTime(
  known: { distanceMeters: number; timeSeconds: number },
  targetDistanceMeters: number,
  exponent = 1.06,
): number {
  return known.timeSeconds * (targetDistanceMeters / known.distanceMeters) ** exponent;
}
