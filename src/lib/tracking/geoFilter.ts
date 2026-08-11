/**
 * GPS filtering pipeline for live pace tracking.
 *
 * Design basis (see project research): raw position deltas amplify GPS noise
 * (10m of error over 1s reads as ~36km/h). We filter position with a scalar
 * Kalman filter per axis, prefer the GNSS chip's own Doppler-derived
 * `coords.speed` over a derived distance/time speed, and smooth speed (never
 * pace directly, since pace = 1/speed is non-linear) with an EWMA.
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

/** Scalar Kalman filter for a single noisy signal (used once per axis). */
export class ScalarKalman {
  private value: number | null = null;
  private variance = 1;
  /** process noise: how "agile" the tracked quantity is expected to be */
  constructor(private readonly processNoise: number) {}

  update(measurement: number, measurementNoise: number, dtSeconds: number): number {
    if (this.value === null) {
      this.value = measurement;
      return this.value;
    }
    this.variance += dtSeconds * this.processNoise ** 2;
    const gain = this.variance / (this.variance + measurementNoise ** 2);
    this.value += gain * (measurement - this.value);
    this.variance *= 1 - gain;
    return this.value;
  }

  reset() {
    this.value = null;
    this.variance = 1;
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
  /** A human cannot plausibly move faster than this between two fixes (m/s, ~43km/h w/ margin). */
  maxPlausibleSpeedMps: 12,
  /** Below this speed we treat the athlete as stopped, to avoid stationary GPS drift inflating distance. */
  stoppedSpeedMps: 0.5,
  /** EWMA time-constant for the "current pace" readout. 8s = responsive, 20s = very stable. */
  speedSmoothingTauSeconds: 12,
  /** Kalman process noise for lat/lon, tuned for running/cycling pace of movement. */
  positionProcessNoise: 3,
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

export function formatPace(secPerKm: number | null): string {
  if (secPerKm === null || !Number.isFinite(secPerKm) || secPerKm <= 0) return "--:--";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatDistanceKm(meters: number): string {
  return (meters / 1000).toFixed(2);
}

export function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
