"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Ewma,
  FILTER_CONFIG,
  ScalarKalman,
  haversineMeters,
  isFixUsable,
  isLikelyDrift,
  isPlausibleStep,
  type LatLon,
} from "./geoFilter";
import { speak, unlockSpeech } from "./speech";
import { WakeLockController } from "./wakeLock";
import {
  clearActiveRun,
  saveActiveRun,
  saveCompletedRun,
  type CompletedRun,
  type RunTrack,
  type StoredPoint,
} from "./storage";

export type RunStatus = "idle" | "warming" | "tracking" | "paused" | "finished";
export type GpsQuality = "searching" | "weak" | "good";

export interface RunGoal {
  distanceMeters?: number;
  durationSeconds?: number;
}

export interface StartOptions {
  announceIntervalMeters?: number;
  goal?: RunGoal;
}

export interface RunTrackerState {
  status: RunStatus;
  gpsQuality: GpsQuality;
  distanceMeters: number;
  elapsedSeconds: number;
  currentPaceSecPerKm: number | null;
  goal: RunGoal | null;
  forecastSecondsRemaining: number | null;
  paceNeededSecPerKm: number | null;
  error: string | null;
  finishedRun: CompletedRun | null;
}

const PERSIST_INTERVAL_MS = 10_000;
const TICK_INTERVAL_MS = 1000;

function newRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useRunTracker() {
  const [state, setState] = useState<RunTrackerState>({
    status: "idle",
    gpsQuality: "searching",
    distanceMeters: 0,
    elapsedSeconds: 0,
    currentPaceSecPerKm: null,
    goal: null,
    forecastSecondsRemaining: null,
    paceNeededSecPerKm: null,
    error: null,
    finishedRun: null,
  });

  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef(new WakeLockController());
  const kalmanLatRef = useRef<ScalarKalman | null>(null);
  const kalmanLonRef = useRef<ScalarKalman | null>(null);
  const speedEwmaRef = useRef<Ewma | null>(null);

  const warmupCountRef = useRef(0);
  const lastRawRef = useRef<LatLon | null>(null);
  const lastFilteredRef = useRef<LatLon | null>(null);
  const lastFixTimestampRef = useRef<number | null>(null);
  const justResumedRef = useRef(false);

  const runIdRef = useRef<string>(newRunId());
  const startedAtRef = useRef<number | null>(null);
  const pausedAccumMsRef = useRef(0);
  const pauseStartedAtRef = useRef<number | null>(null);

  const announceIntervalRef = useRef(1000);
  const lastAnnounceDistanceRef = useRef(0);
  const lastAnnounceTimeRef = useRef<number | null>(null);

  const distanceRef = useRef(0);
  const pointsRef = useRef<StoredPoint[]>([]);
  const lastPersistRef = useRef(0);

  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const stopTicking = useCallback(() => {
    if (tickTimerRef.current !== null) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  const computeElapsedSeconds = useCallback(() => {
    if (startedAtRef.current === null) return 0;
    const pausedMs =
      pausedAccumMsRef.current +
      (pauseStartedAtRef.current !== null ? Date.now() - pauseStartedAtRef.current : 0);
    return Math.max(0, Math.floor((Date.now() - startedAtRef.current - pausedMs) / 1000));
  }, []);

  const startTicking = useCallback(() => {
    stopTicking();
    tickTimerRef.current = setInterval(() => {
      setState((s) => {
        if (s.status !== "tracking") return s;
        const elapsedSeconds = computeElapsedSeconds();
        const remainingMeters = s.goal?.distanceMeters
          ? Math.max(0, s.goal.distanceMeters - distanceRef.current)
          : null;
        const forecastSecondsRemaining =
          remainingMeters !== null && s.currentPaceSecPerKm
            ? (remainingMeters / 1000) * s.currentPaceSecPerKm
            : null;
        return { ...s, elapsedSeconds, forecastSecondsRemaining };
      });
    }, TICK_INTERVAL_MS);
  }, [computeElapsedSeconds, stopTicking]);

  const persistIfDue = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastPersistRef.current < PERSIST_INTERVAL_MS) return;
    lastPersistRef.current = now;
    void saveActiveRun({
      startedAt: startedAtRef.current ?? now,
      distanceMeters: distanceRef.current,
      points: pointsRef.current,
    });
  }, []);

  const handleFix = useCallback(
    (position: GeolocationPosition) => {
      const { latitude: lat, longitude: lon, accuracy, speed } = position.coords;
      const timestamp = position.timestamp;

      const quality: GpsQuality = accuracy <= 10 ? "good" : accuracy <= 25 ? "weak" : "searching";
      setState((s) => (s.gpsQuality === quality ? s : { ...s, gpsQuality: quality }));

      if (!isFixUsable(accuracy)) return;

      setState((s) => {
        if (s.status !== "warming") return s;
        warmupCountRef.current =
          accuracy <= FILTER_CONFIG.warmupAccuracyThreshold ? warmupCountRef.current + 1 : 0;
        if (warmupCountRef.current < FILTER_CONFIG.warmupFixesRequired) return s;

        // Warmup complete: the run clock starts now.
        kalmanLatRef.current = new ScalarKalman(FILTER_CONFIG.positionProcessNoise);
        kalmanLonRef.current = new ScalarKalman(FILTER_CONFIG.positionProcessNoise);
        speedEwmaRef.current = new Ewma(FILTER_CONFIG.speedSmoothingTauSeconds);
        lastRawRef.current = { lat, lon };
        lastFilteredRef.current = { lat, lon };
        lastFixTimestampRef.current = timestamp;
        startedAtRef.current = Date.now();
        lastAnnounceTimeRef.current = timestamp;
        startTicking();
        return { ...s, status: "tracking" };
      });

      if (
        lastRawRef.current === null ||
        lastFilteredRef.current === null ||
        lastFixTimestampRef.current === null ||
        kalmanLatRef.current === null ||
        kalmanLonRef.current === null ||
        speedEwmaRef.current === null
      ) {
        return; // still warming
      }

      if (justResumedRef.current) {
        justResumedRef.current = false;
        kalmanLatRef.current = new ScalarKalman(FILTER_CONFIG.positionProcessNoise);
        kalmanLonRef.current = new ScalarKalman(FILTER_CONFIG.positionProcessNoise);
        lastRawRef.current = { lat, lon };
        lastFilteredRef.current = { lat, lon };
        lastFixTimestampRef.current = timestamp;
        return;
      }

      const dt = (timestamp - lastFixTimestampRef.current) / 1000;
      if (dt <= 0) return; // duplicate or out-of-order fix

      const rawStep = haversineMeters(lastRawRef.current, { lat, lon });
      if (!isPlausibleStep(rawStep, dt)) return; // impossible jump, drop this fix

      const filteredLat = kalmanLatRef.current.update(lat, accuracy, dt);
      const filteredLon = kalmanLonRef.current.update(lon, accuracy, dt);
      const filteredPoint: LatLon = { lat: filteredLat, lon: filteredLon };
      const filteredStep = haversineMeters(lastFilteredRef.current, filteredPoint);

      const stationary = isLikelyDrift(filteredStep, accuracy);
      if (!stationary) {
        distanceRef.current += filteredStep;
        pointsRef.current.push({ lat: filteredLat, lon: filteredLon, timestamp });
      }

      const rawSpeed =
        speed !== null && !Number.isNaN(speed) && speed >= 0 ? speed : filteredStep / dt;
      const v = stationary || rawSpeed < FILTER_CONFIG.stoppedSpeedMps ? 0 : rawSpeed;
      const vSmooth = speedEwmaRef.current.update(v, dt);
      const currentPaceSecPerKm = vSmooth > 0.3 ? 1000 / vSmooth : null;

      lastRawRef.current = { lat, lon };
      lastFilteredRef.current = filteredPoint;
      lastFixTimestampRef.current = timestamp;

      let announced = false;
      if (
        lastAnnounceTimeRef.current !== null &&
        distanceRef.current - lastAnnounceDistanceRef.current >= announceIntervalRef.current
      ) {
        const splitDistance = distanceRef.current - lastAnnounceDistanceRef.current;
        const splitSeconds = (timestamp - lastAnnounceTimeRef.current) / 1000;
        const splitPaceSecPerKm = splitSeconds > 0 ? (splitSeconds / splitDistance) * 1000 : null;
        const km = distanceRef.current / 1000;
        if (splitPaceSecPerKm) {
          const m = Math.floor(splitPaceSecPerKm / 60);
          const s = Math.round(splitPaceSecPerKm % 60);
          speak(`${km.toFixed(1)} quilômetros. Pace ${m} e ${s.toString().padStart(2, "0")}.`);
        }
        lastAnnounceDistanceRef.current = distanceRef.current;
        lastAnnounceTimeRef.current = timestamp;
        announced = true;
      }

      persistIfDue(announced);

      setState((s) => {
        const remainingMeters = s.goal?.distanceMeters
          ? Math.max(0, s.goal.distanceMeters - distanceRef.current)
          : null;
        const forecastSecondsRemaining =
          remainingMeters !== null && currentPaceSecPerKm
            ? (remainingMeters / 1000) * currentPaceSecPerKm
            : null;
        const paceNeededSecPerKm =
          s.goal?.distanceMeters && s.goal?.durationSeconds
            ? Math.max(
                0,
                (s.goal.durationSeconds - computeElapsedSeconds()) /
                  (remainingMeters !== null ? remainingMeters / 1000 : 1),
              )
            : null;
        return {
          ...s,
          distanceMeters: distanceRef.current,
          currentPaceSecPerKm,
          forecastSecondsRemaining,
          paceNeededSecPerKm,
        };
      });
    },
    [computeElapsedSeconds, persistIfDue, startTicking],
  );

  const handleError = useCallback((err: GeolocationPositionError) => {
    if (err.code === err.TIMEOUT) {
      setState((s) => ({ ...s, gpsQuality: "searching" }));
      return; // keep the watch alive, GPS may recover (tunnel, tree cover, ...)
    }
    setState((s) => ({ ...s, error: err.message }));
  }, []);

  const beginWatch = useCallback(() => {
    watchIdRef.current = navigator.geolocation.watchPosition(handleFix, handleError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 30_000,
    });
  }, [handleError, handleFix]);

  const start = useCallback(
    (options?: StartOptions) => {
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
        setState((s) => ({ ...s, error: "Geolocalização não é suportada neste navegador." }));
        return;
      }

      unlockSpeech(); // must run synchronously inside this user-gesture handler for iOS

      runIdRef.current = newRunId();
      warmupCountRef.current = 0;
      lastRawRef.current = null;
      lastFilteredRef.current = null;
      lastFixTimestampRef.current = null;
      startedAtRef.current = null;
      pausedAccumMsRef.current = 0;
      pauseStartedAtRef.current = null;
      distanceRef.current = 0;
      pointsRef.current = [];
      lastAnnounceDistanceRef.current = 0;
      lastAnnounceTimeRef.current = null;
      announceIntervalRef.current = options?.announceIntervalMeters ?? 1000;

      void wakeLockRef.current.acquire();
      beginWatch();

      setState({
        status: "warming",
        gpsQuality: "searching",
        distanceMeters: 0,
        elapsedSeconds: 0,
        currentPaceSecPerKm: null,
        goal: options?.goal ?? null,
        forecastSecondsRemaining: null,
        paceNeededSecPerKm: null,
        error: null,
        finishedRun: null,
      });
    },
    [beginWatch],
  );

  const pause = useCallback(() => {
    clearWatch();
    stopTicking();
    void wakeLockRef.current.release();
    pauseStartedAtRef.current = Date.now();
    setState((s) => (s.status === "tracking" ? { ...s, status: "paused" } : s));
  }, [clearWatch, stopTicking]);

  const resume = useCallback(() => {
    if (pauseStartedAtRef.current !== null) {
      pausedAccumMsRef.current += Date.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = null;
    }
    justResumedRef.current = true;
    void wakeLockRef.current.acquire();
    beginWatch();
    startTicking();
    setState((s) => ({ ...s, status: "tracking" }));
  }, [beginWatch, startTicking]);

  const finish = useCallback(
    (extra?: { tracks?: RunTrack[]; shoeName?: string }) => {
      clearWatch();
      stopTicking();
      void wakeLockRef.current.release();

      const run: CompletedRun = {
        id: runIdRef.current,
        startedAt: startedAtRef.current ?? Date.now(),
        finishedAt: Date.now(),
        distanceMeters: distanceRef.current,
        points: pointsRef.current,
        ...(extra?.tracks?.length ? { tracks: extra.tracks } : {}),
        ...(extra?.shoeName?.trim() ? { shoeName: extra.shoeName.trim() } : {}),
      };
      void saveCompletedRun(run);
      void clearActiveRun();

      setState((s) => ({ ...s, status: "finished", finishedRun: run }));
      return run;
    },
    [clearWatch, stopTicking],
  );

  const reset = useCallback(() => {
    setState({
      status: "idle",
      gpsQuality: "searching",
      distanceMeters: 0,
      elapsedSeconds: 0,
      currentPaceSecPerKm: null,
      goal: null,
      forecastSecondsRemaining: null,
      paceNeededSecPerKm: null,
      error: null,
      finishedRun: null,
    });
  }, []);

  useEffect(() => {
    const wakeLock = wakeLockRef.current;
    return () => {
      clearWatch();
      stopTicking();
      void wakeLock.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, start, pause, resume, finish, reset };
}
