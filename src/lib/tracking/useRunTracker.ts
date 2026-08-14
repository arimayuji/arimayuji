"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Ewma,
  FILTER_CONFIG,
  ScalarKalman,
  findGpsGaps,
  haversineMeters,
  isFixUsable,
  isLikelyDrift,
  isPlausibleStep,
  totalGapSeconds,
  type GpsGap,
  type LatLon,
} from "./geoFilter";
import { speak, unlockSpeech } from "./speech";
import { WakeLockController } from "./wakeLock";
import {
  clearActiveRun,
  saveActiveRun,
  saveCompletedRun,
  type CompletedRun,
  type PauseEvent,
  type RunTrack,
  type StoredPoint,
} from "./storage";
import { buildDistanceTimeSeries, ghostDeltaSeconds, type GhostSeriesPoint } from "./ghostRun";

export type RunStatus = "idle" | "warming" | "tracking" | "paused" | "finished";
export type GpsQuality = "searching" | "weak" | "good";

/** Same shape as the persisted `PauseEvent`, except `endedAt` is null while the pause is still ongoing. */
export interface LivePauseEvent {
  startedAt: number;
  endedAt: number | null;
  reason?: string;
}

export interface RunGoal {
  distanceMeters?: number;
  durationSeconds?: number;
}

export interface StartOptions {
  announceIntervalMeters?: number;
  goal?: RunGoal;
  /** A previously completed run to race against, compared by distance vs elapsed time only. */
  ghostRun?: CompletedRun;
}

export interface RunTrackerState {
  status: RunStatus;
  /** The id this run will be saved under — set the moment `start()` is called, null before that. Exposed so a caller can key something else (e.g. a live-sharing session) to the same run without duplicating id generation. */
  runId: string | null;
  gpsQuality: GpsQuality;
  distanceMeters: number;
  elapsedSeconds: number;
  currentPaceSecPerKm: number | null;
  goal: RunGoal | null;
  forecastSecondsRemaining: number | null;
  paceNeededSecPerKm: number | null;
  error: string | null;
  finishedRun: CompletedRun | null;
  /** Positive = ahead of the ghost, negative = behind. See `ghostDeltaSeconds` for the convention. Null with no ghost, or past its max distance. */
  ghostDeltaSeconds: number | null;
  /** The delta at the moment the run was finished, kept alongside `finishedRun` for the summary — not persisted into the saved record. */
  finishedGhostDeltaSeconds: number | null;
  /** The trace so far, for drawing the live route map — same points that end up in `finishedRun.points`. */
  points: StoredPoint[];
  /** Every pause so far this run, oldest first — the current one (if paused right now) has `endedAt: null`. */
  pauseEvents: LivePauseEvent[];
}

const PERSIST_INTERVAL_MS = 10_000;
const TICK_INTERVAL_MS = 1000;

function newRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useRunTracker() {
  const [state, setState] = useState<RunTrackerState>({
    status: "idle",
    runId: null,
    gpsQuality: "searching",
    distanceMeters: 0,
    elapsedSeconds: 0,
    currentPaceSecPerKm: null,
    goal: null,
    forecastSecondsRemaining: null,
    paceNeededSecPerKm: null,
    error: null,
    finishedRun: null,
    ghostDeltaSeconds: null,
    finishedGhostDeltaSeconds: null,
    points: [],
    pauseEvents: [],
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
  /**
   * Filtered step distances too small to clear `isLikelyDrift` on their own,
   * held here instead of thrown away. A walker's real per-fix movement can
   * sit under that floor for several fixes in a row even while genuinely
   * moving the whole time — accumulating lets that movement clear the floor
   * (and get credited in full) a fix or two later instead of every small
   * step being individually discarded as noise.
   */
  const pendingDriftMetersRef = useRef(0);

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
  const pauseEventsRef = useRef<LivePauseEvent[]>([]);

  const ghostSeriesRef = useRef<GhostSeriesPoint[] | null>(null);

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
        pendingDriftMetersRef.current = 0;
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
        pendingDriftMetersRef.current = 0;
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

      // Position-delta drift detection alone punishes slow movement: a
      // walker at ~1.2m/s can cover under 5m between two fixes even while
      // genuinely moving the whole time, and deciding "is this drift"
      // per fix has no way to tell that apart from standing still with the
      // same few metres of GPS jitter. Two independent signals correct for
      // it: the chip's own Doppler-derived speed doesn't share that
      // ambiguity (this file's header already names it as preferred over a
      // derived distance/time speed, for exactly this reason), and holding
      // each too-small step in `pendingDriftMetersRef` instead of discarding
      // it outright means real movement that's slow rather than absent still
      // clears the bar a fix or two later — credited in full, not lost.
      pendingDriftMetersRef.current += filteredStep;
      const stationary =
        isLikelyDrift(pendingDriftMetersRef.current, accuracy) &&
        (speed === null || speed < FILTER_CONFIG.stoppedSpeedMps);
      if (!stationary) {
        distanceRef.current += pendingDriftMetersRef.current;
        pendingDriftMetersRef.current = 0;
        // A new array, not `.push()` on the old one: `state.points` below is
        // this same reference, and `route-map.tsx` depends on it by identity
        // (`useMemo(..., [points])`) to know a new fix arrived — mutating in
        // place would leave that memo (and the live marker riding on it)
        // frozen at wherever the run happened to be on the first render.
        pointsRef.current = [...pointsRef.current, { lat: filteredLat, lon: filteredLon, timestamp }];
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
        const ghostDelta = ghostSeriesRef.current
          ? ghostDeltaSeconds(ghostSeriesRef.current, distanceRef.current, computeElapsedSeconds())
          : null;
        return {
          ...s,
          distanceMeters: distanceRef.current,
          currentPaceSecPerKm,
          forecastSecondsRemaining,
          paceNeededSecPerKm,
          ghostDeltaSeconds: ghostDelta,
          points: pointsRef.current,
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
    // Once denied, the browser won't prompt again on its own — the raw
    // GeolocationPositionError message ("User denied Geolocation") doesn't
    // tell anyone that, or where to go fix it, so this is the one error
    // code worth a message written for a person instead of passed through.
    const message =
      err.code === err.PERMISSION_DENIED
        ? "Localização bloqueada pro Xanthus. Ativa em Ajustes do aparelho → Apps → Xanthus → Permissões → Localização, aí volta aqui."
        : err.message;
    setState((s) => ({ ...s, error: message }));
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
      pendingDriftMetersRef.current = 0;
      pauseEventsRef.current = [];
      lastAnnounceDistanceRef.current = 0;
      lastAnnounceTimeRef.current = null;
      announceIntervalRef.current = options?.announceIntervalMeters ?? 1000;
      ghostSeriesRef.current = options?.ghostRun ? buildDistanceTimeSeries(options.ghostRun) : null;

      void wakeLockRef.current.acquire();
      beginWatch();

      setState({
        status: "warming",
        runId: runIdRef.current,
        gpsQuality: "searching",
        distanceMeters: 0,
        elapsedSeconds: 0,
        currentPaceSecPerKm: null,
        goal: options?.goal ?? null,
        forecastSecondsRemaining: null,
        paceNeededSecPerKm: null,
        error: null,
        finishedRun: null,
        ghostDeltaSeconds: null,
        finishedGhostDeltaSeconds: null,
        points: [],
        pauseEvents: [],
      });
    },
    [beginWatch],
  );

  const pause = useCallback(() => {
    clearWatch();
    stopTicking();
    void wakeLockRef.current.release();
    pauseStartedAtRef.current = Date.now();
    pauseEventsRef.current = [
      ...pauseEventsRef.current,
      { startedAt: pauseStartedAtRef.current, endedAt: null },
    ];
    setState((s) =>
      s.status === "tracking"
        ? { ...s, status: "paused", pauseEvents: pauseEventsRef.current }
        : s,
    );
  }, [clearWatch, stopTicking]);

  /** Tags the reason on the pause currently in progress — a no-op if called outside a pause. */
  const setPauseReason = useCallback((reason: string) => {
    const events = pauseEventsRef.current;
    const last = events[events.length - 1];
    if (!last || last.endedAt !== null) return;
    pauseEventsRef.current = [...events.slice(0, -1), { ...last, reason }];
    setState((s) => ({ ...s, pauseEvents: pauseEventsRef.current }));
  }, []);

  const resume = useCallback(() => {
    if (pauseStartedAtRef.current !== null) {
      pausedAccumMsRef.current += Date.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = null;
      const events = pauseEventsRef.current;
      const last = events[events.length - 1];
      if (last && last.endedAt === null) {
        pauseEventsRef.current = [...events.slice(0, -1), { ...last, endedAt: Date.now() }];
      }
    }
    justResumedRef.current = true;
    void wakeLockRef.current.acquire();
    beginWatch();
    startTicking();
    setState((s) => ({ ...s, status: "tracking", pauseEvents: pauseEventsRef.current }));
  }, [beginWatch, startTicking]);

  const finish = useCallback(
    (extra?: { tracks?: RunTrack[]; shoeName?: string }) => {
      clearWatch();
      stopTicking();
      void wakeLockRef.current.release();

      const finishedAt = Date.now();
      // Finishing while still paused would otherwise leave the last pause event open forever,
      // and (same as `resume()`) the open pause's duration has to be folded into the running
      // total before it's cleared, or `computeElapsedSeconds()` below stops excluding it.
      if (pauseStartedAtRef.current !== null) {
        pausedAccumMsRef.current += finishedAt - pauseStartedAtRef.current;
        const events = pauseEventsRef.current;
        const last = events[events.length - 1];
        if (last && last.endedAt === null) {
          pauseEventsRef.current = [...events.slice(0, -1), { ...last, endedAt: finishedAt }];
        }
        pauseStartedAtRef.current = null;
      }
      const pauseEvents: PauseEvent[] = pauseEventsRef.current.map((e) => ({
        startedAt: e.startedAt,
        endedAt: e.endedAt ?? finishedAt,
        ...(e.reason ? { reason: e.reason } : {}),
      }));

      // `clearWatch()` during a manual pause means no fixes arrive for its whole
      // duration either, so the raw point gap it leaves behind would otherwise
      // double-count as a "GPS silently stopped" gap on top of the pause that
      // already accounts for that time below.
      const overlapsAnyPause = (gap: GpsGap) =>
        pauseEvents.some((p) => gap.startedAt < p.endedAt && gap.endedAt > p.startedAt);
      const gpsGaps = findGpsGaps(pointsRef.current).filter((g) => !overlapsAnyPause(g));

      const movingSeconds = Math.max(0, computeElapsedSeconds() - totalGapSeconds(gpsGaps));

      const run: CompletedRun = {
        id: runIdRef.current,
        startedAt: startedAtRef.current ?? finishedAt,
        finishedAt,
        distanceMeters: distanceRef.current,
        points: pointsRef.current,
        movingSeconds,
        ...(extra?.tracks?.length ? { tracks: extra.tracks } : {}),
        ...(extra?.shoeName?.trim() ? { shoeName: extra.shoeName.trim() } : {}),
        ...(pauseEvents.length ? { pauseEvents } : {}),
        ...(gpsGaps.length ? { gpsGaps } : {}),
      };
      void saveCompletedRun(run);
      void clearActiveRun();

      const finishedGhostDelta = ghostSeriesRef.current
        ? ghostDeltaSeconds(ghostSeriesRef.current, distanceRef.current, movingSeconds)
        : null;

      setState((s) => ({
        ...s,
        status: "finished",
        finishedRun: run,
        finishedGhostDeltaSeconds: finishedGhostDelta,
      }));
      return run;
    },
    [clearWatch, stopTicking, computeElapsedSeconds],
  );

  const reset = useCallback(() => {
    setState({
      status: "idle",
      runId: null,
      gpsQuality: "searching",
      distanceMeters: 0,
      elapsedSeconds: 0,
      currentPaceSecPerKm: null,
      goal: null,
      forecastSecondsRemaining: null,
      paceNeededSecPerKm: null,
      error: null,
      finishedRun: null,
      ghostDeltaSeconds: null,
      finishedGhostDeltaSeconds: null,
      points: [],
      pauseEvents: [],
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

  return { state, start, pause, resume, finish, reset, setPauseReason };
}
