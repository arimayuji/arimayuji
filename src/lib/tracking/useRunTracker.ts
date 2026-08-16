"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Ewma,
  FILTER_CONFIG,
  Kalman2D,
  accuracyToPositionVarianceM2,
  findGpsGaps,
  haversineMeters,
  isFixUsable,
  isLikelyDrift,
  isPlausibleStep,
  latLonToLocalMeters,
  localMetersToLatLon,
  speedHeadingToVelocity,
  totalGapSeconds,
  type GpsGap,
  type LatLon,
} from "./geoFilter";
import { beginGeoWatch, endGeoWatch, type GeoError, type GeoFix } from "./geolocation";
import { isNativePlatform } from "../platform";
import { speak, unlockSpeech } from "./speech";
import { WakeLockController } from "./wakeLock";
import {
  clearActiveRun,
  saveActiveRun,
  saveCompletedRun,
  type ActiveRunSnapshot,
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

  const wakeLockRef = useRef(new WakeLockController());
  const kalmanRef = useRef<Kalman2D | null>(null);
  /** Fixed the moment the filter is (re-)seeded — every fix afterward projects into East/North metres relative to this point. */
  const originRef = useRef<LatLon | null>(null);
  const speedEwmaRef = useRef<Ewma | null>(null);
  /** Consecutive fixes the adaptive plausibility gate has rejected — see its use in `handleFix` for why this resets the filter instead of rejecting forever. */
  const consecutiveGateRejectionsRef = useRef(0);

  const warmupCountRef = useRef(0);
  const lastRawRef = useRef<LatLon | null>(null);
  const lastFilteredRef = useRef<LatLon | null>(null);
  const lastFixTimestampRef = useRef<number | null>(null);
  /**
   * Wall-clock (`Date.now()`) counterpart to `lastFixTimestampRef`, which
   * holds the GPS chip's own `position.timestamp` — some Android
   * WebView/Chrome builds are known to report a `timestamp` that doesn't
   * reliably advance between consecutive `watchPosition` callbacks (stuck
   * repeating the same value, or arriving out of order). When that happens,
   * every fix after the first reads as "duplicate or out-of-order" and gets
   * silently dropped forever — distance and pace freeze at zero for the rest
   * of the run despite a perfectly good, moving GPS signal, which is exactly
   * what "GPS bom mas não captando distância" turned out to be. `Date.now()`
   * has no equivalent failure mode at the once-a-second-or-slower cadence a
   * real fix stream runs at, so it's the fallback `dt` source rather than a
   * second reason to give up on the fix.
   */
  const lastFixWallClockRef = useRef<number | null>(null);
  const justResumedRef = useRef(false);
  /**
   * Set by `recover()`, read once by the warmup-completion branch below: a
   * recovered run must reseed the Kalman filter exactly like any other
   * warmup (its refs are `null` after a fresh app start — nothing persists
   * them), but must NOT stomp `startedAtRef`/`distanceRef`/`pointsRef` back
   * to "run just started now" the way a brand new run's warmup does.
   */
  const recoveringRef = useRef(false);
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
    endGeoWatch();
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
      id: runIdRef.current,
      startedAt: startedAtRef.current ?? now,
      distanceMeters: distanceRef.current,
      points: pointsRef.current,
    });
  }, []);

  const handleFix = useCallback(
    (fix: GeoFix) => {
      const { latitude: lat, longitude: lon, accuracy, speed, heading } = fix.coords;
      const timestamp = fix.timestamp;

      const quality: GpsQuality = accuracy <= 10 ? "good" : accuracy <= 25 ? "weak" : "searching";
      setState((s) => (s.gpsQuality === quality ? s : { ...s, gpsQuality: quality }));

      if (!isFixUsable(accuracy)) return;

      setState((s) => {
        if (s.status !== "warming") return s;
        warmupCountRef.current =
          accuracy <= FILTER_CONFIG.warmupAccuracyThreshold ? warmupCountRef.current + 1 : 0;
        if (warmupCountRef.current < FILTER_CONFIG.warmupFixesRequired) return s;

        // Warmup complete: the run clock starts now.
        originRef.current = { lat, lon };
        kalmanRef.current = new Kalman2D({ e: 0, n: 0, ve: 0, vn: 0 });
        speedEwmaRef.current = new Ewma(FILTER_CONFIG.speedSmoothingTauSeconds);
        consecutiveGateRejectionsRef.current = 0;
        lastRawRef.current = { lat, lon };
        lastFilteredRef.current = { lat, lon };
        lastFixTimestampRef.current = timestamp;
        lastFixWallClockRef.current = Date.now();
        if (recoveringRef.current) {
          // Keep the original run's start time and already-accumulated
          // distance/points (set by `recover()`) — only the filter itself
          // needed reseeding. The dead stretch between the last point before
          // the app died and this first fresh fix becomes a GPS gap at
          // `finish()`, same as a screen lock ever was.
          recoveringRef.current = false;
        } else {
          startedAtRef.current = Date.now();
        }
        lastAnnounceTimeRef.current = timestamp;
        pendingDriftMetersRef.current = 0;
        startTicking();
        return { ...s, status: "tracking" };
      });

      if (
        lastRawRef.current === null ||
        lastFilteredRef.current === null ||
        lastFixTimestampRef.current === null ||
        kalmanRef.current === null ||
        originRef.current === null ||
        speedEwmaRef.current === null
      ) {
        return; // still warming
      }

      if (justResumedRef.current) {
        justResumedRef.current = false;
        originRef.current = { lat, lon };
        kalmanRef.current = new Kalman2D({ e: 0, n: 0, ve: 0, vn: 0 });
        consecutiveGateRejectionsRef.current = 0;
        lastRawRef.current = { lat, lon };
        lastFilteredRef.current = { lat, lon };
        lastFixTimestampRef.current = timestamp;
        lastFixWallClockRef.current = Date.now();
        pendingDriftMetersRef.current = 0;
        return;
      }

      let dt = (timestamp - lastFixTimestampRef.current) / 1000;
      if (dt <= 0) {
        // See `lastFixWallClockRef`'s own comment — a chip/browser that
        // isn't advancing `position.timestamp` shouldn't be able to freeze
        // the run forever; fall back to wall-clock elapsed time instead of
        // dropping every fix as a false "duplicate".
        dt = lastFixWallClockRef.current === null ? 0 : (Date.now() - lastFixWallClockRef.current) / 1000;
        if (dt <= 0) return; // genuinely nothing to work with
      }

      // Cheap hard ceiling, independent of the Kalman filter's own state —
      // see `maxPlausibleSpeedMps`'s own comment for why this stays even
      // with the adaptive gate below.
      const rawStep = haversineMeters(lastRawRef.current, { lat, lon });
      if (!isPlausibleStep(rawStep, dt)) {
        // Drop the jump itself (don't credit distance for it), but still
        // slide the anchor up to this fix — otherwise one noisy raw point
        // right after warmup permanently jams `lastRawRef` at a stale
        // position, and every fix afterward computes its step from that
        // same stale point forever, each one just as "implausible" as the
        // last. That reads as "good signal, distance frozen at 0" from the
        // outside, since `gpsQuality` above updates on every fix regardless
        // of what happens here.
        lastRawRef.current = { lat, lon };
        lastFixTimestampRef.current = timestamp;
        lastFixWallClockRef.current = Date.now();
        return;
      }

      const kalman = kalmanRef.current;
      const origin = originRef.current;
      kalman.predict(dt, FILTER_CONFIG.accelProcessNoiseMps2);

      const measured = latLonToLocalMeters(origin, { lat, lon });
      const positionVarianceM2 = accuracyToPositionVarianceM2(accuracy);
      const mahalanobisSq = kalman.positionMahalanobisSquared(measured.e, measured.n, positionVarianceM2);

      if (mahalanobisSq > FILTER_CONFIG.positionGateChiSquareThreshold) {
        // The adaptive gate rejected this fix as an outlier relative to how
        // confident the filter currently is. Rejecting is right most of the
        // time — but a filter that's drifted (long gap, bad stretch of
        // fixes) can end up confidently wrong, and confidently-wrong is
        // exactly the state that reproduces the old "GPS looks fine, distance
        // is frozen" bug if every subsequent fix keeps getting rejected by a
        // filter that never gets to correct itself. After a few consecutive
        // rejections, trust the raw fix instead and re-seed fresh there.
        consecutiveGateRejectionsRef.current += 1;
        if (consecutiveGateRejectionsRef.current >= FILTER_CONFIG.maxConsecutiveGateRejections) {
          originRef.current = { lat, lon };
          kalmanRef.current = new Kalman2D({ e: 0, n: 0, ve: 0, vn: 0 });
          lastFilteredRef.current = { lat, lon };
          consecutiveGateRejectionsRef.current = 0;
        }
        lastRawRef.current = { lat, lon };
        lastFixTimestampRef.current = timestamp;
        lastFixWallClockRef.current = Date.now();
        return;
      }
      consecutiveGateRejectionsRef.current = 0;

      kalman.updatePosition(measured.e, measured.n, positionVarianceM2);

      // The GNSS chip's own Doppler-derived speed+heading is a second,
      // independent measurement of velocity — far less noisy than anything
      // derived from position deltas — fed in whenever it's actually usable
      // (heading is undefined/garbage below `minSpeedForHeadingMps`).
      if (
        speed !== null &&
        !Number.isNaN(speed) &&
        speed >= FILTER_CONFIG.minSpeedForHeadingMps &&
        heading !== null &&
        !Number.isNaN(heading)
      ) {
        const velocity = speedHeadingToVelocity(speed, heading);
        kalman.updateVelocity(velocity.ve, velocity.vn, FILTER_CONFIG.velocityMeasurementVarianceM2S2);
      }

      const fused = kalman.state;
      const filteredPoint = localMetersToLatLon(origin, { e: fused.e, n: fused.n });
      const kalmanSpeed = Math.hypot(fused.ve, fused.vn);
      const filteredStep = haversineMeters(lastFilteredRef.current, filteredPoint);

      // Position-delta summation alone has a structural positive bias — GPS
      // jitter always adds distance, never subtracts, since a step length is
      // never negative. Blending toward speed-integrated distance
      // (`kalmanSpeed·dt`, unbiased) as accuracy worsens corrects for that;
      // at good accuracy (<=8m) position deltas are trusted outright, at the
      // usable-fix floor (25m) speed integration is trusted outright.
      const positionTrust = Math.min(1, Math.max(0, (accuracy - 8) / (25 - 8)));
      const speedIntegratedStep = kalmanSpeed * dt;
      const distanceStep = (1 - positionTrust) * filteredStep + positionTrust * speedIntegratedStep;

      // The chip's raw Doppler `coords.speed` (noise ~0.02m/s) is the
      // PRIMARY authority on whether the athlete is actually moving —
      // deciding on its own, no position-based check involved, whenever
      // it's available. It has to be: a CV Kalman filter driven by position
      // alone (no velocity measurement — `heading` is only ever reported
      // while actually moving) can and does read a few metres of pure GPS
      // jitter as a plausible-looking spurious velocity, and if that fused
      // velocity were allowed to gate crediting, sustained jitter while
      // genuinely standing still eventually pushes `pendingDriftMetersRef`
      // past the drift floor and dumps the whole accumulated buffer into
      // distance as a false "movement" burst. The position-drift check below
      // only steps in as a fallback for the moments `speed` isn't reported —
      // exactly the case `pendingDriftMetersRef` accumulating (instead of
      // discarding) small steps was built for: a walker's real per-fix
      // movement can sit under the drift floor for a fix or two even while
      // genuinely moving, and accumulating lets it clear the floor and get
      // credited in full a fix or two later instead of being lost.
      pendingDriftMetersRef.current += distanceStep;
      const speedAvailable = speed !== null && !Number.isNaN(speed);
      const kalmanLooksStationary = kalmanSpeed < FILTER_CONFIG.stoppedSpeedMps;
      const stationary = speedAvailable
        ? speed < FILTER_CONFIG.stoppedSpeedMps
        : kalmanLooksStationary && isLikelyDrift(pendingDriftMetersRef.current, accuracy);
      if (!stationary) {
        distanceRef.current += pendingDriftMetersRef.current;
        pendingDriftMetersRef.current = 0;
        // A new array, not `.push()` on the old one: `state.points` below is
        // this same reference, and `route-map.tsx` depends on it by identity
        // (`useMemo(..., [points])`) to know a new fix arrived — mutating in
        // place would leave that memo (and the live marker riding on it)
        // frozen at wherever the run happened to be on the first render.
        pointsRef.current = [...pointsRef.current, { lat: filteredPoint.lat, lon: filteredPoint.lon, timestamp }];
      } else if (speedAvailable) {
        // Doppler itself said "not moving" — an authoritative call, not an
        // ambiguous one. Whatever position jitter built up in the buffer is
        // noise, not movement waiting to clear the drift floor; drop it so
        // it can't survive to cause a delayed false credit once `speed`
        // becomes unavailable or crosses back above the threshold.
        pendingDriftMetersRef.current = 0;
      } else if (kalmanLooksStationary) {
        // No Doppler at all this fix, but the filter's own fused speed still
        // reads stationary — see `fallbackStationaryDecay`'s own comment.
        pendingDriftMetersRef.current *= FILTER_CONFIG.fallbackStationaryDecay;
      }

      // The live pace readout used to trust the chip's raw Doppler `speed`
      // outright whenever present, bypassing the Kalman fusion that
      // `distanceStep` above already relies on. On devices/conditions where
      // raw Doppler speed reads persistently low while position fixes stay
      // accurate, that shows up exactly as reported: live pace stuck ~30%
      // slow for the whole run, only correcting in the finish-time summary
      // — which is derived from total distance, never from this raw speed
      // field. `kalmanSpeed` already folds the same raw Doppler reading in
      // as one measurement (see `kalman.updateVelocity` above) but keeps it
      // continuously corrected against position, so using it here too keeps
      // the live number honest against the same signal the rest of the run
      // relies on instead of an unfiltered sensor field with no fallback.
      const v = stationary ? 0 : kalmanSpeed;
      const vSmooth = speedEwmaRef.current.update(v, dt);
      const currentPaceSecPerKm = vSmooth > 0.3 ? 1000 / vSmooth : null;

      lastRawRef.current = { lat, lon };
      lastFilteredRef.current = filteredPoint;
      lastFixTimestampRef.current = timestamp;
      lastFixWallClockRef.current = Date.now();

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

  const handleError = useCallback((err: GeoError) => {
    if (err.kind === "timeout") {
      setState((s) => ({ ...s, gpsQuality: "searching" }));
      return; // keep the watch alive, GPS may recover (tunnel, tree cover, ...)
    }
    // Once denied, the OS won't prompt again on its own — the raw error
    // message doesn't tell anyone that, or where to go fix it, so this is
    // the one error kind worth a message written for a person instead of
    // passed through.
    const message =
      err.kind === "permission-denied"
        ? "Localização bloqueada pro Xanthus. Ativa em Ajustes do aparelho → Apps → Xanthus → Permissões → Localização, aí volta aqui."
        : err.message;
    setState((s) => ({ ...s, error: message }));
  }, []);

  const beginWatch = useCallback(() => {
    beginGeoWatch(handleFix, handleError);
  }, [handleError, handleFix]);

  const start = useCallback(
    (options?: StartOptions) => {
      if (typeof navigator === "undefined" || (!isNativePlatform() && !("geolocation" in navigator))) {
        setState((s) => ({ ...s, error: "Geolocalização não é suportada neste navegador." }));
        return;
      }

      unlockSpeech(); // must run synchronously inside this user-gesture handler for iOS

      runIdRef.current = newRunId();
      warmupCountRef.current = 0;
      lastRawRef.current = null;
      lastFilteredRef.current = null;
      lastFixTimestampRef.current = null;
      lastFixWallClockRef.current = null;
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

  /**
   * Resumes a run whose process died mid-recording — screen locked with no
   * foreground service to keep it alive, Android reclaimed the memory, and
   * the app cold-started back into `status: "idle"` despite the run never
   * having reached `finish()`. `persistIfDue` already buffers distance/points
   * to IndexedDB every 10s during `start()`-ed runs specifically so this
   * snapshot exists to come back to; before this function read it back,
   * that buffer was write-only and the recorded run was simply gone.
   */
  const recover = useCallback(
    (snapshot: ActiveRunSnapshot) => {
      if (typeof navigator === "undefined" || (!isNativePlatform() && !("geolocation" in navigator))) {
        setState((s) => ({ ...s, error: "Geolocalização não é suportada neste navegador." }));
        return;
      }

      unlockSpeech();

      runIdRef.current = snapshot.id;
      warmupCountRef.current = 0;
      lastRawRef.current = null;
      lastFilteredRef.current = null;
      lastFixTimestampRef.current = null;
      lastFixWallClockRef.current = null;
      startedAtRef.current = snapshot.startedAt;
      pausedAccumMsRef.current = 0;
      pauseStartedAtRef.current = null;
      distanceRef.current = snapshot.distanceMeters;
      pointsRef.current = snapshot.points;
      pendingDriftMetersRef.current = 0;
      pauseEventsRef.current = [];
      // Ground already covered before the process died shouldn't replay a
      // voice announcement the instant fixes start flowing again.
      lastAnnounceDistanceRef.current = snapshot.distanceMeters;
      lastAnnounceTimeRef.current = null;
      announceIntervalRef.current = 1000;
      ghostSeriesRef.current = null;
      recoveringRef.current = true;

      void wakeLockRef.current.acquire();
      beginWatch();

      setState({
        status: "warming",
        runId: runIdRef.current,
        gpsQuality: "searching",
        distanceMeters: snapshot.distanceMeters,
        elapsedSeconds: 0,
        currentPaceSecPerKm: null,
        goal: null,
        forecastSecondsRemaining: null,
        paceNeededSecPerKm: null,
        error: null,
        finishedRun: null,
        ghostDeltaSeconds: null,
        finishedGhostDeltaSeconds: null,
        points: snapshot.points,
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

  return { state, start, pause, resume, finish, reset, setPauseReason, recover };
}
