/**
 * GPS filtering pipeline for live pace tracking.
 *
 * Design basis (see project research): raw position deltas amplify GPS noise
 * (10m of error over 1s reads as ~36km/h). We filter position with a 2D
 * constant-velocity Kalman filter (`Kalman2D`) in a local metre frame,
 * prefer the GNSS chip's own Doppler-derived `coords.speed` (noise ~0.02m/s)
 * over a derived distance/time speed (noise ~1-10m/s) as both a filter
 * measurement and the primary signal for "is this person actually moving",
 * blend speed-integrated distance with position-delta distance depending on
 * how noise-dominated the current fix is, and smooth speed (never pace
 * directly, since pace = 1/speed is non-linear) with an EWMA on top of the
 * filter's own velocity estimate.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

export interface RawFix {
  lat: number;
  lon: number;
  accuracy: number;
  speed: number | null;
  timestamp: number;
}

const EARTH_RADIUS_M = 6371000;

export function haversineMeters(a: LatLon, b: LatLon): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass heading from `a` to `b`, 0–360° with 0 = north — the initial bearing of the great-circle path, not a flat-plane angle (which drifts noticeably at the distances a chase camera cares about). */
export function bearingDegrees(a: LatLon, b: LatLon): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const degrees = (Math.atan2(y, x) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

const METERS_PER_DEGREE_LAT = 111320;

/**
 * Local flat-earth East/North projection, metres, relative to `origin` —
 * valid at the few-kilometre scale a single run covers. Longitude degrees
 * shrink with `cos(latitude)`; latitude degrees don't, which is exactly the
 * ~8% error the old per-axis-in-degrees Kalman filter carried at Brazilian
 * latitudes by treating both the same.
 */
export function latLonToLocalMeters(origin: LatLon, point: LatLon): { e: number; n: number } {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const metersPerDegLon = METERS_PER_DEGREE_LAT * Math.cos(toRad(origin.lat));
  return {
    e: (point.lon - origin.lon) * metersPerDegLon,
    n: (point.lat - origin.lat) * METERS_PER_DEGREE_LAT,
  };
}

export function localMetersToLatLon(origin: LatLon, point: { e: number; n: number }): LatLon {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const metersPerDegLon = METERS_PER_DEGREE_LAT * Math.cos(toRad(origin.lat));
  return {
    lat: origin.lat + point.n / METERS_PER_DEGREE_LAT,
    lon: origin.lon + point.e / metersPerDegLon,
  };
}

/** `coords.speed`/`coords.heading` (heading: compass degrees, 0 = north) turned into an East/North velocity, the same frame `Kalman2D` tracks in. */
export function speedHeadingToVelocity(speedMps: number, headingDegrees: number): { ve: number; vn: number } {
  const rad = (headingDegrees * Math.PI) / 180;
  return { ve: speedMps * Math.sin(rad), vn: speedMps * Math.cos(rad) };
}

/**
 * The W3C Geolocation spec defines `coords.accuracy` as a 95% confidence
 * radius (metres), not a 1σ standard deviation — feeding it straight into a
 * Kalman filter's measurement-noise variance overstates how much the filter
 * should trust each fix. 1.96 is the z-score for a 95% CI on a normal
 * distribution.
 */
const GPS_ACCURACY_CONFIDENCE_Z = 1.96;

export function accuracyToPositionVarianceM2(accuracyMeters: number): number {
  const sigma = accuracyMeters / GPS_ACCURACY_CONFIDENCE_Z;
  return sigma * sigma;
}

/**
 * One axis (position + velocity, metres/seconds) of a constant-velocity
 * Kalman filter — the discretized "white noise acceleration" model (Bar-
 * Shalom et al.): between fixes, true acceleration is treated as unknown
 * zero-mean noise rather than assumed exactly zero, which is what lets the
 * filter track a runner's actual speed changes instead of lagging behind
 * them. `Kalman2D` below runs one of these per axis (east, north) — under
 * isotropic position/velocity measurement noise (true here: GPS accuracy is
 * a radius, not an ellipse) the two axes never develop cross-correlation, so
 * two independent 2-state filters are exactly equivalent to one 4-state
 * filter with zero cross terms, at a fraction of the code and risk of a
 * hand-rolled 4x4 matrix implementation.
 */
class AxisKalman1D {
  private pos: number;
  private vel: number;
  private Ppp: number;
  private Ppv: number;
  private Pvv: number;

  constructor(pos: number, vel: number, positionVarianceM2: number, velocityVarianceM2S2: number) {
    this.pos = pos;
    this.vel = vel;
    this.Ppp = positionVarianceM2;
    this.Ppv = 0;
    this.Pvv = velocityVarianceM2S2;
  }

  get position() {
    return this.pos;
  }

  get velocity() {
    return this.vel;
  }

  /** Predicted position variance — valid only right after `predict()`, before any `update*` call consumes it. */
  get positionVariance() {
    return this.Ppp;
  }

  predict(dtSeconds: number, accelVarianceMps2: number) {
    if (dtSeconds <= 0) return;
    this.pos += this.vel * dtSeconds;
    const dt2 = dtSeconds * dtSeconds;
    const dt3 = dt2 * dtSeconds;
    const newPpp = this.Ppp + 2 * this.Ppv * dtSeconds + this.Pvv * dt2 + (accelVarianceMps2 * dt3) / 3;
    const newPpv = this.Ppv + this.Pvv * dtSeconds + (accelVarianceMps2 * dt2) / 2;
    const newPvv = this.Pvv + accelVarianceMps2 * dtSeconds;
    this.Ppp = newPpp;
    this.Ppv = newPpv;
    this.Pvv = newPvv;
  }

  updatePosition(measurement: number, measurementVarianceM2: number) {
    const S = this.Ppp + measurementVarianceM2;
    const kp = this.Ppp / S;
    const kv = this.Ppv / S;
    const innovation = measurement - this.pos;
    this.pos += kp * innovation;
    this.vel += kv * innovation;
    const newPpp = this.Ppp - kp * this.Ppp;
    const newPpv = this.Ppv - kp * this.Ppv;
    const newPvv = this.Pvv - kv * this.Ppv;
    this.Ppp = newPpp;
    this.Ppv = newPpv;
    this.Pvv = newPvv;
  }

  updateVelocity(measurement: number, measurementVarianceM2S2: number) {
    const S = this.Pvv + measurementVarianceM2S2;
    const kp = this.Ppv / S;
    const kv = this.Pvv / S;
    const innovation = measurement - this.vel;
    this.pos += kp * innovation;
    this.vel += kv * innovation;
    const newPpp = this.Ppp - kp * this.Ppv;
    const newPpv = this.Ppv - kv * this.Ppv;
    const newPvv = this.Pvv - kv * this.Pvv;
    this.Ppp = newPpp;
    this.Ppv = newPpv;
    this.Pvv = newPvv;
  }
}

export interface Kalman2DState {
  e: number;
  n: number;
  ve: number;
  vn: number;
}

/**
 * 2D constant-velocity Kalman filter over a local East/North metre frame.
 * Replaces two independent scalar lat/lon filters that mixed degrees (a unit
 * where 1° of longitude isn't 1° of latitude in metres) with a measurement
 * noise number meant for metres. Feeds GPS speed+heading in as an optional
 * second, independent linear measurement of velocity (no EKF needed — both
 * position and velocity are observed linearly in this frame), which is the
 * chip's own Doppler-derived reading, far less noisy than a position delta.
 */
export class Kalman2D {
  private axisE: AxisKalman1D;
  private axisN: AxisKalman1D;

  constructor(state: Kalman2DState, initialPositionVarianceM2 = 100, initialVelocityVarianceM2S2 = 9) {
    this.axisE = new AxisKalman1D(state.e, state.ve, initialPositionVarianceM2, initialVelocityVarianceM2S2);
    this.axisN = new AxisKalman1D(state.n, state.vn, initialPositionVarianceM2, initialVelocityVarianceM2S2);
  }

  get state(): Kalman2DState {
    return { e: this.axisE.position, n: this.axisN.position, ve: this.axisE.velocity, vn: this.axisN.velocity };
  }

  predict(dtSeconds: number, accelProcessNoiseMps2: number) {
    const accelVarianceMps2 = accelProcessNoiseMps2 ** 2;
    this.axisE.predict(dtSeconds, accelVarianceMps2);
    this.axisN.predict(dtSeconds, accelVarianceMps2);
  }

  /**
   * Squared Mahalanobis distance of a candidate position fix against the
   * filter's current (post-`predict`, pre-`updatePosition`) estimate —
   * distributed χ²(2 dof) under a correctly-tuned model. This is the
   * "adaptive" plausibility gate: instead of a single fixed speed ceiling
   * for every situation, it asks "how surprising is this fix given how
   * uncertain the filter itself currently is", which tightens automatically
   * right after a good run of fixes and loosens automatically after a gap.
   */
  positionMahalanobisSquared(measuredE: number, measuredN: number, positionMeasurementVarianceM2: number): number {
    const dE = measuredE - this.axisE.position;
    const dN = measuredN - this.axisN.position;
    const sE = this.axisE.positionVariance + positionMeasurementVarianceM2;
    const sN = this.axisN.positionVariance + positionMeasurementVarianceM2;
    return (dE * dE) / sE + (dN * dN) / sN;
  }

  updatePosition(measuredE: number, measuredN: number, positionMeasurementVarianceM2: number) {
    this.axisE.updatePosition(measuredE, positionMeasurementVarianceM2);
    this.axisN.updatePosition(measuredN, positionMeasurementVarianceM2);
  }

  updateVelocity(measuredVe: number, measuredVn: number, velocityMeasurementVarianceM2S2: number) {
    this.axisE.updateVelocity(measuredVe, velocityMeasurementVarianceM2S2);
    this.axisN.updateVelocity(measuredVn, velocityMeasurementVarianceM2S2);
  }
}

/** Exponential moving average with a time-constant (seconds), for smoothing speed. */
export class Ewma {
  private value: number | null = null;
  constructor(private readonly tauSeconds: number) {}

  update(sample: number, dtSeconds: number): number {
    if (this.value === null) {
      this.value = sample;
      return this.value;
    }
    const alpha = 1 - Math.exp(-dtSeconds / this.tauSeconds);
    this.value += alpha * (sample - this.value);
    return this.value;
  }

  get current(): number | null {
    return this.value;
  }

  reset() {
    this.value = null;
  }
}

export const FILTER_CONFIG = {
  /** Discard fixes worse than this (meters). Anything looser is not usable for pace. */
  maxAcceptableAccuracy: 25,
  /** Fixes must be at least this good, `warmupFixesRequired` times in a row, to start the clock. */
  warmupAccuracyThreshold: 20,
  warmupFixesRequired: 3,
  /** A human cannot plausibly move faster than this between two fixes (m/s, ~43km/h w/ margin) — a cheap hard ceiling, independent of the Kalman filter's own internal state, so a filter whose covariance has drifted wide open (e.g. after a long gap) can never be talked into accepting an outright GPS teleport. */
  maxPlausibleSpeedMps: 12,
  /** Below this speed we treat the athlete as stopped, to avoid stationary GPS drift inflating distance. */
  stoppedSpeedMps: 0.5,
  /** EWMA time-constant for the "current pace" readout. 8s = responsive, 20s = very stable. */
  speedSmoothingTauSeconds: 12,
  /** How "agile" true acceleration is expected to be between fixes, m/s² std — the `Kalman2D` process noise. Tuned loose enough to track a runner's real speed changes (surges, hills) without lagging, tight enough to still reject noise. */
  accelProcessNoiseMps2: 1.2,
  /**
   * The adaptive plausibility gate: squared Mahalanobis distance beyond
   * which a position fix is rejected as an outlier rather than fed into the
   * filter. 9.21 = χ²(2 dof) 99% quantile — permissive on purpose, since a
   * false *rejection* here reproduces the exact "GPS looks fine but distance
   * is frozen" bug class this replaces `isPlausibleStep`'s fixed threshold
   * to fix, while a false *acceptance* is still caught by
   * `maxPlausibleSpeedMps` above.
   */
  positionGateChiSquareThreshold: 9.21,
  /** After this many consecutive gate rejections, trust the raw fix over the filter and re-seed it there instead of continuing to reject — the same escape hatch that fixed the original distance-freeze bug, now at the statistical-gate level instead of the raw-anchor level. */
  maxConsecutiveGateRejections: 3,
  /** Doppler-derived `coords.speed`+`coords.heading`, fed into the filter as a second, independent velocity measurement — a fixed variance rather than derived from `accuracy` (the spec doesn't relate the two), conservative relative to how precise Doppler speed actually is because heading still carries real angular error, especially at low speed. */
  velocityMeasurementVarianceM2S2: 0.36,
  /** Below this speed, `coords.heading` is too close to undefined/noisy to trust as a velocity direction — skip the velocity update rather than feed it garbage. */
  minSpeedForHeadingMps: 0.8,
  /**
   * When there's no Doppler `coords.speed` at all to decide stationarity
   * outright (rare — essentially every phone GNSS chip reports it, but not
   * guaranteed), the pending-drift buffer is bled down by this factor on any
   * fix the filter's own fused speed reads as stationary, instead of only
   * resetting once the buffer clears the drift floor. Without this, pure
   * position noise can accumulate for many fixes and eventually cross the
   * floor on its own, dumping a burst of fake "movement" into distance —
   * distinguishing real slow movement from sustained jitter using position
   * alone is a fundamentally harder problem than with Doppler speed
   * available, so this bounds the damage rather than claiming to solve it.
   */
  fallbackStationaryDecay: 0.4,
} as const;

export function isFixUsable(accuracy: number): boolean {
  return accuracy <= FILTER_CONFIG.maxAcceptableAccuracy;
}

export function isPlausibleStep(distanceMeters: number, dtSeconds: number): boolean {
  if (dtSeconds <= 0) return false;
  return distanceMeters / dtSeconds <= FILTER_CONFIG.maxPlausibleSpeedMps;
}

export function isLikelyDrift(distanceMeters: number, accuracy: number): boolean {
  return distanceMeters < Math.max(5, accuracy * 0.5);
}

/**
 * Below this, a gap between two consecutive recorded fixes is normal —
 * weak signal, tree cover, the 30s `watchPosition` timeout tolerating a
 * slow chip. Above it, JS was very likely suspended outright (screen
 * locked, app backgrounded) and nothing was tracked in between — there is
 * no way to tell "GPS took a while" from "the OS killed our background
 * execution" from inside the app, so both get treated the same way: an
 * honest gap, not silently bridged.
 */
export const GPS_GAP_THRESHOLD_SECONDS = 60;

export interface GpsGap {
  startedAt: number;
  endedAt: number;
}

/** Every stretch between consecutive recorded points wider than the gap threshold. Points must be chronological. */
export function findGpsGaps(points: { timestamp: number }[]): GpsGap[] {
  const gaps: GpsGap[] = [];
  for (let i = 1; i < points.length; i++) {
    const dt = (points[i].timestamp - points[i - 1].timestamp) / 1000;
    if (dt >= GPS_GAP_THRESHOLD_SECONDS) {
      gaps.push({ startedAt: points[i - 1].timestamp, endedAt: points[i].timestamp });
    }
  }
  return gaps;
}

export function totalGapSeconds(gaps: GpsGap[]): number {
  return gaps.reduce((sum, g) => sum + (g.endedAt - g.startedAt) / 1000, 0);
}

export function formatPace(secPerKm: number | null): string {
  if (secPerKm === null || !Number.isFinite(secPerKm) || secPerKm <= 0) return "--:--";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatDistanceKm(meters: number): string {
  return (meters / 1000).toFixed(2);
}

/** "3min 05s" / "12s" — an absolute duration delta, no sign shown (callers add their own ahead/behind framing). */
export function formatDeltaDuration(seconds: number): string {
  const total = Math.round(Math.abs(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}min ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
