"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import {
  FILTER_CONFIG,
  GPS_GAP_THRESHOLD_SECONDS,
  Kalman2D,
  accuracyToPositionVarianceM2,
  findGpsGaps,
  formatDistanceKm,
  formatElapsed,
  formatPace,
  haversineMeters,
  isFixUsable,
  isLikelyDrift,
  isPlausibleStep,
  latLonToLocalMeters,
  localMetersToLatLon,
  pedometerGapDistanceMeters,
  smoothRoutePoints,
  speedHeadingToVelocity,
  totalGapSeconds,
  type GpsGap,
  type LatLon,
} from "./geoFilter";
import {
  beginGeoWatch,
  beginLiveActivity,
  endGeoWatch,
  endLiveActivity,
  sendWatchUpdate,
  updateLiveActivityContent,
  updateLiveNotification,
  type GeoError,
  type GeoFix,
} from "./geolocation";
import { isNativePlatform } from "../platform";
import { projectRoute } from "./routeProjection";
import { unlockSpeech } from "./speech";
import { announceCarbGelReminder, announceDistancePace, unlockVoiceBank } from "./voiceBank";
import { WakeLockController } from "./wakeLock";
import {
  connectHeartRateMonitor,
  disconnectHeartRateMonitor,
  type HeartRateConnectionState,
} from "./heartRateMonitor";
import {
  clearActiveRun,
  saveActiveRun,
  saveCompletedRun,
  type ActiveRunSnapshot,
  type CompletedRun,
  type PauseEvent,
  type RunGoal,
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

export type { RunGoal };
export type { HeartRateConnectionState };

export interface StartOptions {
  announceIntervalMeters?: number;
  /** Only read when `announceMode` is "time". */
  announceIntervalSeconds?: number;
  /** "distance" (default) triggers on `announceIntervalMeters` covered since the last announcement; "time" triggers on `announceIntervalSeconds` elapsed instead — useful on a treadmill or a route so winding that a fixed distance interval lands unpredictably. */
  announceMode?: "distance" | "time";
  /** "voz" (default) speaks the split; "vibracao" fires one haptic tap instead — see preferences.ts's `AnnounceStyle`. Distinct from `vibrateOnPaceDelay` below: this replaces the regular split cue, that adds a separate behind-schedule warning. */
  announceStyle?: "voz" | "vibracao";
  /** Which recorded voice bank speaks the announcements — see voiceBank.ts's `VoiceGender`. Irrelevant (but harmless) when `announceStyle` is "vibracao". */
  voiceGender?: "female" | "male";
  goal?: RunGoal;
  /** A previously completed run to race against, compared by distance vs elapsed time only. */
  ghostRun?: CompletedRun;
  /** Native haptic tap when cumulative time behind `goal.targetPaceSecPerKm` crosses `PACE_DELAY_VIBRATION_THRESHOLD_SECONDS` — see its own comment. No effect without a "ritmo" goal. */
  vibrateOnPaceDelay?: boolean;
  /**
   * Voice reminder to take a carbohydrate gel, fired on an elapsed-time
   * cadence (`carbReminderIntervalSeconds`), independent of `announceMode`
   * above — that setting is about when to announce *pace*, this is about
   * when to eat, and ACSM/ISSN guidance scales carb need with duration of
   * effort, not pace or distance. That's also why this fires even when no
   * `goal` is set at all: unlike `forecastSecondsRemaining`, it needs
   * nothing but the run clock to be correct.
   */
  carbReminderEnabled?: boolean;
  /** Only read when `carbReminderEnabled` is true — minutes between reminders, converted to seconds by the caller. */
  carbReminderIntervalSeconds?: number;
  /** iOS only, ignored elsewhere — see `preferences.ts`'s `iosSkipRoadSnapping` for the accuracy trade-off this makes. */
  iosSkipRoadSnapping?: boolean;
  /** A previously paired BLE heart rate monitor (`preferences.ts`'s `heartRateMonitorDeviceId`) to connect to opportunistically — never blocks `start()` if the connection fails or the sensor is out of range. */
  heartRateMonitorDeviceId?: string;
}

export interface RunTrackerState {
  status: RunStatus;
  /** The id this run will be saved under — set the moment `start()` is called, null before that. Exposed so a caller can key something else (e.g. a live-sharing session) to the same run without duplicating id generation. */
  runId: string | null;
  gpsQuality: GpsQuality;
  distanceMeters: number;
  elapsedSeconds: number;
  currentPaceSecPerKm: number | null;
  /** Pace since the last completed whole kilometer, live and continuously updating — distinct from `currentPaceSecPerKm` (a smoothed instant reading) and from a run-so-far average, which the UI computes itself from `distanceMeters`/`elapsedSeconds`. Null until the first km mark exists (nothing to split yet) or the split has zero distance/duration. */
  currentKmPaceSecPerKm: number | null;
  goal: RunGoal | null;
  forecastSecondsRemaining: number | null;
  paceNeededSecPerKm: number | null;
  error: string | null;
  finishedRun: CompletedRun | null;
  /** Positive = ahead of the ghost, negative = behind. See `ghostDeltaSeconds` for the convention. Null with no ghost, or past its max distance. */
  ghostDeltaSeconds: number | null;
  /** `currentPaceSecPerKm - goal.targetPaceSecPerKm` — positive means running slower than the target, negative means faster. Null with no pace goal, or before pace itself has a reading. */
  paceDeltaSecPerKm: number | null;
  /** The delta at the moment the run was finished, kept alongside `finishedRun` for the summary — not persisted into the saved record. */
  finishedGhostDeltaSeconds: number | null;
  /** The trace so far, for drawing the live route map — same points that end up in `finishedRun.points`. */
  points: StoredPoint[];
  /** Every pause so far this run, oldest first — the current one (if paused right now) has `endedAt: null`. */
  pauseEvents: LivePauseEvent[];
  /** `Date.now()` at the moment a carb-gel reminder last fired, so a caller can drive a one-shot toast off it via `useEffect` — the voice cue itself doesn't need this, only the visual accessibility-parity toast does. Null until the first reminder of the run. */
  carbReminderFiredAt: number | null;
  /** Latest BPM reading from a paired BLE heart rate monitor — null with no monitor paired, or before the first reading arrives. First time FC is shown to the athlete themselves (`liveHeartRateRef` in run/page.tsx has always existed, but only ever fed a coach's live view via `LiveRun.heartRateBpm`, never this hook's own state). */
  heartRateBpm: number | null;
  /** "disconnected" whenever nothing is paired — never "connecting"/"unavailable" without a `heartRateMonitorDeviceId` actually set on `start()`. */
  heartRateConnection: HeartRateConnectionState;
}

const PERSIST_INTERVAL_MS = 10_000;
const TICK_INTERVAL_MS = 1000;

/**
 * Cumulative-schedule-behind vibration, for a "ritmo" goal
 * (`goal.targetPaceSecPerKm`) — deliberately NOT the same signal as
 * `paceDeltaSecPerKm` (current pace vs target, shown on screen as the
 * "PaceDeltaPill"): that's instantaneous and noisy enough on its own that
 * vibrating off it would buzz constantly during completely normal pace
 * wobble. This instead compares total elapsed time against
 * `targetPaceSecPerKm × distance so far` — "how far behind schedule am I,
 * total" — which only drifts meaningfully when actually running slower
 * than the goal for a sustained stretch, not from moment-to-moment noise.
 * Two thresholds (not one) give it hysteresis: crossing
 * PACE_DELAY_VIBRATION_THRESHOLD_SECONDS fires the tap and arms the
 * "already alerted" state; only dropping back under
 * PACE_DELAY_CLEAR_THRESHOLD_SECONDS disarms it, so hovering right at the
 * edge can't fire repeatedly.
 */
const PACE_DELAY_VIBRATION_THRESHOLD_SECONDS = 20;
const PACE_DELAY_CLEAR_THRESHOLD_SECONDS = 10;

/**
 * Two heavy taps, not one — real-device feedback (2026-08-29) called the
 * previous single `Haptics.notification({ type: Warning })` too faint to
 * notice mid-run (phone in an armband/pocket, not in hand). A double pulse
 * reads as deliberate rather than a stray buzz, the same reason a phone's
 * own "do not disturb" override pattern is never a single tap. Exported
 * (not just used below) so /perfil's "Testar vibração" button previews
 * this exact pattern instead of a different, weaker one.
 */
export function firePaceDelayVibration() {
  void Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
  setTimeout(() => {
    void Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
  }, 180);
}

/** Below this much time left in a run with a known goal, a carb-gel reminder is suppressed — no point telling someone to fuel this close to the finish. See `StartOptions.carbReminderEnabled`'s own comment for why there's no such suppression when no goal is set at all. */
const CARB_REMINDER_SUPPRESS_NEAR_FINISH_SECONDS = 300;

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
    currentKmPaceSecPerKm: null,
    goal: null,
    forecastSecondsRemaining: null,
    paceNeededSecPerKm: null,
    error: null,
    finishedRun: null,
    ghostDeltaSeconds: null,
    paceDeltaSecPerKm: null,
    finishedGhostDeltaSeconds: null,
    points: [],
    pauseEvents: [],
    carbReminderFiredAt: null,
    heartRateBpm: null,
    heartRateConnection: "disconnected",
  });

  const wakeLockRef = useRef(new WakeLockController());
  const kalmanRef = useRef<Kalman2D | null>(null);
  /** Fixed the moment the filter is (re-)seeded — every fix afterward projects into East/North metres relative to this point. */
  const originRef = useRef<LatLon | null>(null);
  /**
   * Trailing (timestamp, cumulative-distance) samples for the live "ritmo"
   * readout — see its computation further down for why this replaced an
   * EWMA over the GPS chip's own Doppler-derived speed.
   */
  const paceWindowRef = useRef<{ t: number; d: number }[]>([]);

  /** Cached from `StartOptions` at `start()` — mirrors `state.goal.targetPaceSecPerKm`/`vibrateOnPaceDelay`, but read from a ref rather than state so the per-fix vibration check doesn't need a `setState` round trip. */
  const targetPaceSecPerKmRef = useRef<number | undefined>(undefined);
  const vibrateOnPaceDelayRef = useRef(false);
  /** The whole `StartOptions.goal`, cached for `finish()` to persist onto `CompletedRun` — `finish` is a stable `useCallback` without `state.goal` in its deps, same reason every other per-run input above lives in a ref. */
  const goalRef = useRef<RunGoal | null>(null);
  /** Cached from `StartOptions.announceStyle` — read from a ref for the same reason as `vibrateOnPaceDelayRef` above (the per-fix/per-tick split check can't afford a `setState` round trip). */
  const announceStyleRef = useRef<"voz" | "vibracao">("voz");
  /** Hysteresis state for the vibration above — true while already alerted for the current bout of falling behind. */
  const paceDelayAlertedRef = useRef(false);
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
  /**
   * Android-only step count (see `GeoFix.stepCount`'s own comment) as of the
   * last processed fix — compared against the new fix's count whenever a
   * real GPS gap (`dt >= GPS_GAP_THRESHOLD_SECONDS`) is detected, to correct
   * distance with `pedometerGapDistanceMeters` instead of trusting the
   * Kalman filter's straight-line cord across it. `null` on iOS or whenever
   * the sensor/permission wasn't available — the gap-correction branch
   * below already treats that as "fall back to today's behavior."
   */
  const lastStepCountRef = useRef<number | null>(null);
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
  const announceIntervalSecondsRef = useRef(300);
  const announceModeRef = useRef<"distance" | "time">("distance");
  const voiceGenderRef = useRef<"female" | "male">("female");
  const lastAnnounceDistanceRef = useRef(0);
  const lastAnnounceTimeRef = useRef<number | null>(null);

  /**
   * Delivers a regular split cue per `announceStyleRef` — speaks the pace,
   * or fires one haptic tap in its place (best-effort, same reasoning as
   * the pace-delay vibration above: nothing useful to do mid-run if the
   * OS rejects it). Not `useCallback`-wrapped: it only closes over refs
   * (stable identities, never stale), so it's cheap to recreate every
   * render and safe to call from the `[]`-deps callbacks below without
   * listing it as a dependency.
   */
  function announceSplit(distanceMeters: number, paceMinutes: number, paceSeconds: number) {
    if (announceStyleRef.current === "vibracao") {
      void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    } else {
      announceDistancePace(distanceMeters, paceMinutes, paceSeconds, voiceGenderRef.current);
    }
  }

  const carbReminderEnabledRef = useRef(false);
  const carbReminderIntervalSecondsRef = useRef(45 * 60);
  const iosSkipRoadSnappingRef = useRef(false);
  /** Elapsed seconds (not wall-clock) at the last reminder — 0 at `start()`, so the first reminder fires once `elapsedSeconds` itself crosses the interval. */
  const lastCarbReminderElapsedRef = useRef(0);

  /**
   * Marks the start of the kilometer currently in progress, for the live
   * "pace do km atual" stat — deliberately its own tracker rather than
   * reusing `lastAnnounceDistanceRef` above: that one advances by whatever
   * `announceIntervalMeters` the athlete picked for voice cues (250m–5000m),
   * while this always marks real whole-kilometer boundaries regardless of
   * that setting, since "current km" only means one thing.
   */
  const kmMarkDistanceRef = useRef(0);
  const kmMarkTimeRef = useRef<number | null>(null);

  const distanceRef = useRef(0);
  const pointsRef = useRef<StoredPoint[]>([]);
  const lastPersistRef = useRef(0);
  const pauseEventsRef = useRef<LivePauseEvent[]>([]);

  /**
   * Throttles the lock-screen notification / Live Activity refresh — shared
   * by `handleFix` and the ticking `setInterval` below so neither path
   * double-fires the native bridge call. `handleFix` is the path that
   * actually matters once the app is backgrounded: Android suspends this
   * hook's `setInterval` (Chromium pauses a background WebView's JS timers),
   * but the background-geolocation plugin keeps delivering real GPS fixes
   * to `handleFix` via a native→JS bridge call regardless — that's also why
   * the on-screen numbers were always *correct* the instant the app was
   * reopened, just never pushed to the notification while backgrounded.
   * Keyed off the fix's own `timestamp` (not `Date.now()`) so a burst of
   * fixes delivered all at once after a gap doesn't spam several updates.
   */
  const lastNotificationUpdateAtRef = useRef(0);

  const ghostSeriesRef = useRef<GhostSeriesPoint[] | null>(null);

  /** The paired sensor's id for the run in progress, if any — set by `start()`/`recover()`, read by the app-resume reconnect effect below and cleared on `finish()`/`reset()`. Null means "no monitor paired", same as `preferences.ts`'s own field. */
  const heartRateDeviceIdRef = useRef<string | null>(null);
  /** Mirrors `state.status`/`state.heartRateConnection` for the resume-reconnect effect below, which needs to read both without depending on `state` itself (that would tear the watch's connection down and rebuild it on every unrelated re-render). */
  const statusRef = useRef<RunStatus>("idle");
  const heartRateConnectionRef = useRef<HeartRateConnectionState>("disconnected");

  const connectHeartRate = useCallback((deviceId: string) => {
    void connectHeartRateMonitor(
      deviceId,
      (bpm) => setState((s) => ({ ...s, heartRateBpm: bpm })),
      (connection) => {
        heartRateConnectionRef.current = connection;
        setState((s) => ({ ...s, heartRateConnection: connection }));
      },
    );
  }, []);

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

        // Time-based voice announcements fire off the wall clock here rather
        // than off GPS fixes (handleFix's distance-based branch above) —
        // otherwise a stretch with sparse fixes would delay an announcement
        // that's only supposed to depend on time elapsed.
        if (
          announceModeRef.current === "time" &&
          lastAnnounceTimeRef.current !== null &&
          Date.now() - lastAnnounceTimeRef.current >= announceIntervalSecondsRef.current * 1000
        ) {
          const splitDistance = distanceRef.current - lastAnnounceDistanceRef.current;
          const splitSeconds = (Date.now() - lastAnnounceTimeRef.current) / 1000;
          const splitPaceSecPerKm = splitSeconds > 0 && splitDistance > 0 ? (splitSeconds / splitDistance) * 1000 : null;
          if (splitPaceSecPerKm) {
            const m = Math.floor(splitPaceSecPerKm / 60);
            const sec = Math.round(splitPaceSecPerKm % 60);
            announceSplit(distanceRef.current, m, sec);
          }
          lastAnnounceDistanceRef.current = distanceRef.current;
          lastAnnounceTimeRef.current = Date.now();
        }
        const remainingMeters = s.goal?.distanceMeters
          ? Math.max(0, s.goal.distanceMeters - distanceRef.current)
          : null;
        const forecastSecondsRemaining =
          remainingMeters !== null && s.currentPaceSecPerKm
            ? (remainingMeters / 1000) * s.currentPaceSecPerKm
            : null;

        // Carb-gel reminder — see StartOptions.carbReminderEnabled's own
        // comment for why this is elapsed-time-based and fires regardless of
        // whether a goal exists. Suppressed only when a goal IS known and the
        // run is close to done; with no goal (the common case) it never
        // suppresses at all.
        let carbReminderFiredAt = s.carbReminderFiredAt;
        if (
          carbReminderEnabledRef.current &&
          elapsedSeconds - lastCarbReminderElapsedRef.current >= carbReminderIntervalSecondsRef.current &&
          !(forecastSecondsRemaining !== null && forecastSecondsRemaining < CARB_REMINDER_SUPPRESS_NEAR_FINISH_SECONDS)
        ) {
          announceCarbGelReminder(voiceGenderRef.current);
          lastCarbReminderElapsedRef.current = elapsedSeconds;
          carbReminderFiredAt = Date.now();
        }

        // Throttled to every 5s — the lock-screen notification doesn't need
        // second-by-second precision, and each update is a native bridge
        // call. Foreground-only in practice (see `handleFix`'s call to the
        // same throttled refresh for why this one alone isn't enough while
        // backgrounded) — kept here too so the notification still updates
        // smoothly on real time whenever fixes are sparse but the app is
        // actually in the foreground (e.g. a brief GPS gap indoors).
        const now = Date.now();
        if (now - lastNotificationUpdateAtRef.current >= 5000) {
          lastNotificationUpdateAtRef.current = now;
          const route = projectRoute(pointsRef.current);
          const distanceLabel = `${formatDistanceKm(distanceRef.current)} km`;
          const paceLabel = s.currentPaceSecPerKm !== null ? `${formatPace(s.currentPaceSecPerKm)}/km` : "--:--/km";
          const timeLabel = formatElapsed(elapsedSeconds);
          updateLiveNotification({ distanceLabel, paceLabel, timeLabel, routePolylines: route?.polylines });
          updateLiveActivityContent({ distanceLabel, paceLabel, timeLabel, routePoints: route?.projected });
          sendWatchUpdate({ status: "tracking", distanceLabel, paceLabel, timeLabel });
        }
        return { ...s, elapsedSeconds, forecastSecondsRemaining, carbReminderFiredAt };
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
      const stepCount = fix.stepCount;

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
        paceWindowRef.current = [];
        consecutiveGateRejectionsRef.current = 0;
        lastRawRef.current = { lat, lon };
        lastFilteredRef.current = { lat, lon };
        lastFixTimestampRef.current = timestamp;
        lastFixWallClockRef.current = Date.now();
        lastStepCountRef.current = stepCount;
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
        // Marks the boundary the current km is measured from — the exact
        // last-whole-km multiple at or below whatever distance is already
        // on the books (0 for a fresh run, mid-km after a recovery), never
        // the raw recovered distance itself, so "pace do km atual" always
        // means the same thing: since the real X.0km mark.
        kmMarkDistanceRef.current = Math.floor(distanceRef.current / 1000) * 1000;
        kmMarkTimeRef.current = timestamp;
        pendingDriftMetersRef.current = 0;
        startTicking();
        return { ...s, status: "tracking" };
      });

      if (
        lastRawRef.current === null ||
        lastFilteredRef.current === null ||
        lastFixTimestampRef.current === null ||
        kalmanRef.current === null ||
        originRef.current === null
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
        lastStepCountRef.current = stepCount;
        pendingDriftMetersRef.current = 0;
        // A pause is real dead time — carrying pre-pause samples into the
        // live-pace window would average the stopped stretch into the
        // ritmo readout right after resuming, same wrong-number effect
        // this window replaced the Doppler EWMA to fix in the first place.
        paceWindowRef.current = [];
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

      if (dt >= GPS_GAP_THRESHOLD_SECONDS) {
        const pedometerDistance = pedometerGapDistanceMeters(lastStepCountRef.current, stepCount, dt);
        if (pedometerDistance !== null) {
          // Real gap (screen locked/app backgrounded long enough that
          // nothing was tracked in between) — correct it with the Android
          // step count instead of letting the Kalman filter's own
          // straight-line cord between the fix before and after the gap
          // stand (see pedometerGapDistanceMeters' own comment for why that
          // cuts corners on a curved path). Credits the distance directly
          // and reseeds the filter fresh at the new position, same as a
          // long gap already does via the gate-rejection path below — just
          // without first crediting the wrong straight-line distance.
          distanceRef.current += pedometerDistance;
          pendingDriftMetersRef.current = 0;
          pointsRef.current = [...pointsRef.current, { lat, lon, timestamp }];
          originRef.current = { lat, lon };
          kalmanRef.current = new Kalman2D({ e: 0, n: 0, ve: 0, vn: 0 });
          consecutiveGateRejectionsRef.current = 0;
          lastRawRef.current = { lat, lon };
          lastFilteredRef.current = { lat, lon };
          lastFixTimestampRef.current = timestamp;
          lastFixWallClockRef.current = Date.now();
          lastStepCountRef.current = stepCount;
          paceWindowRef.current = [];
          return;
        }
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
        lastStepCountRef.current = stepCount;
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
        lastStepCountRef.current = stepCount;
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

      // The live pace readout used to be `1000 / EWMA(kalmanSpeed)` —
      // `kalmanSpeed` folds in the GPS chip's own raw Doppler `speed` as a
      // trusted velocity measurement (see `kalman.updateVelocity` above),
      // and on devices/conditions where that raw reading runs persistently
      // biased (not just briefly noisy), the fused estimate inherits the
      // same bias on every fix. That showed up exactly as reported: a live
      // "ritmo" stuck noticeably off pace for the *entire* run, while the
      // voice announcements, the "pace do km atual" card, and the
      // finish-time summary all agreed with each other and with Strava —
      // because none of those three ever touch `speed`/`kalmanSpeed` at
      // all, they're plain distance-travelled ÷ time-elapsed, same as here.
      // Rather than trust the Doppler-informed velocity for this one
      // readout, it now uses that same distance/time approach, just over a
      // short trailing window instead of a whole split — smooths normal
      // per-fix position noise without ever being able to inherit a
      // sensor-level speed bias.
      //
      // Feeds this window `distanceRef.current` PLUS whatever's still
      // sitting in `pendingDriftMetersRef` — not the credited total alone.
      // Real movement that hasn't yet cleared the drift floor (see that
      // ref's own comment) sits uncredited for a fix or two before landing
      // in `distanceRef.current` in one lump sum; that lag barely matters
      // for the run's real distance, but over this window's short 20s span
      // it's proportionally large enough to read as a live pace
      // *persistently slower* than what's actually happening — reported
      // directly as "a tela ao vivo mostra [pace] maior que o
      // falado/realizado". Any temporary overcount (pending distance that
      // later turns out to be jitter, not movement) self-corrects within a
      // fix or two, the same speed the credited total itself discards it —
      // this only removes the display lag, it doesn't touch the
      // stationary-detection logic that decides what's real movement.
      paceWindowRef.current.push({ t: timestamp, d: distanceRef.current + pendingDriftMetersRef.current });
      const paceWindowCutoff = timestamp - FILTER_CONFIG.livePaceWindowMs;
      while (paceWindowRef.current.length > 1 && paceWindowRef.current[0].t < paceWindowCutoff) {
        paceWindowRef.current.shift();
      }
      const paceWindowStart = paceWindowRef.current[0];
      const paceWindowSeconds = (timestamp - paceWindowStart.t) / 1000;
      const paceWindowDistance = distanceRef.current - paceWindowStart.d;
      const paceWindowSpeedMps = paceWindowSeconds > 0 ? paceWindowDistance / paceWindowSeconds : 0;
      const currentPaceSecPerKm =
        paceWindowSeconds >= FILTER_CONFIG.livePaceMinWindowSeconds &&
        paceWindowSpeedMps > FILTER_CONFIG.stoppedSpeedMps
          ? (paceWindowSeconds / paceWindowDistance) * 1000
          : null;

      // Live pace of the km currently in progress — recomputed on every fix
      // (unlike the voice announcement below, which only fires once per
      // interval crossed), since this is a number on screen that should
      // never sit stale between crossings.
      let currentKmPaceSecPerKm: number | null = null;
      if (kmMarkTimeRef.current !== null) {
        const kmSplitDistance = distanceRef.current - kmMarkDistanceRef.current;
        const kmSplitSeconds = (timestamp - kmMarkTimeRef.current) / 1000;
        currentKmPaceSecPerKm =
          kmSplitDistance > 0 && kmSplitSeconds > 0 ? (kmSplitSeconds / kmSplitDistance) * 1000 : null;
        if (kmSplitDistance >= 1000) {
          kmMarkDistanceRef.current += 1000;
          kmMarkTimeRef.current = timestamp;
        }
      }

      lastRawRef.current = { lat, lon };
      lastFilteredRef.current = filteredPoint;
      lastFixTimestampRef.current = timestamp;
      lastFixWallClockRef.current = Date.now();
      lastStepCountRef.current = stepCount;

      // Same 5s-throttled refresh the ticking `setInterval` above does, but
      // triggered from a real GPS fix instead of a JS timer — see
      // `lastNotificationUpdateAtRef`'s own comment for why this is the copy
      // that actually keeps the lock-screen notification live once the app
      // is backgrounded.
      const fixNow = Date.now();
      if (fixNow - lastNotificationUpdateAtRef.current >= 5000) {
        lastNotificationUpdateAtRef.current = fixNow;
        const route = projectRoute(pointsRef.current);
        const distanceLabel = `${formatDistanceKm(distanceRef.current)} km`;
        const paceLabel = currentPaceSecPerKm !== null ? `${formatPace(currentPaceSecPerKm)}/km` : "--:--/km";
        const timeLabel = formatElapsed(computeElapsedSeconds());
        updateLiveNotification({ distanceLabel, paceLabel, timeLabel, routePolylines: route?.polylines });
        updateLiveActivityContent({ distanceLabel, paceLabel, timeLabel, routePoints: route?.projected });
        sendWatchUpdate({ status: "tracking", distanceLabel, paceLabel, timeLabel });
      }

      let announced = false;
      if (
        announceModeRef.current === "distance" &&
        lastAnnounceTimeRef.current !== null &&
        distanceRef.current - lastAnnounceDistanceRef.current >= announceIntervalRef.current
      ) {
        const splitDistance = distanceRef.current - lastAnnounceDistanceRef.current;
        const splitSeconds = (timestamp - lastAnnounceTimeRef.current) / 1000;
        const splitPaceSecPerKm = splitSeconds > 0 ? (splitSeconds / splitDistance) * 1000 : null;
        if (splitPaceSecPerKm) {
          const m = Math.floor(splitPaceSecPerKm / 60);
          const s = Math.round(splitPaceSecPerKm % 60);
          announceSplit(distanceRef.current, m, s);
        }
        lastAnnounceDistanceRef.current = distanceRef.current;
        lastAnnounceTimeRef.current = timestamp;
        announced = true;
      } else if (
        // Same wall-clock check the ticking `setInterval` also runs (see
        // `lastNotificationUpdateAtRef`'s comment) — duplicated here so
        // "tempo" mode keeps announcing once the app is backgrounded and
        // that timer stops firing. Both paths share `lastAnnounceTimeRef`,
        // so whichever runs first for a given threshold wins and the other
        // just sees it already advanced — no double announcement.
        announceModeRef.current === "time" &&
        lastAnnounceTimeRef.current !== null &&
        timestamp - lastAnnounceTimeRef.current >= announceIntervalSecondsRef.current * 1000
      ) {
        const splitDistance = distanceRef.current - lastAnnounceDistanceRef.current;
        const splitSeconds = (timestamp - lastAnnounceTimeRef.current) / 1000;
        const splitPaceSecPerKm = splitSeconds > 0 && splitDistance > 0 ? (splitSeconds / splitDistance) * 1000 : null;
        if (splitPaceSecPerKm) {
          const m = Math.floor(splitPaceSecPerKm / 60);
          const sec = Math.round(splitPaceSecPerKm % 60);
          announceSplit(distanceRef.current, m, sec);
        }
        lastAnnounceDistanceRef.current = distanceRef.current;
        lastAnnounceTimeRef.current = timestamp;
        announced = true;
      }

      persistIfDue(announced);

      if (vibrateOnPaceDelayRef.current && targetPaceSecPerKmRef.current) {
        const expectedSeconds = (distanceRef.current / 1000) * targetPaceSecPerKmRef.current;
        const delaySeconds = computeElapsedSeconds() - expectedSeconds;
        if (!paceDelayAlertedRef.current && delaySeconds >= PACE_DELAY_VIBRATION_THRESHOLD_SECONDS) {
          paceDelayAlertedRef.current = true;
          firePaceDelayVibration();
        } else if (paceDelayAlertedRef.current && delaySeconds <= PACE_DELAY_CLEAR_THRESHOLD_SECONDS) {
          paceDelayAlertedRef.current = false;
        }
      }

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
        const paceDeltaSecPerKm =
          s.goal?.targetPaceSecPerKm && currentPaceSecPerKm
            ? currentPaceSecPerKm - s.goal.targetPaceSecPerKm
            : null;

        // Same check the ticking `setInterval` also runs (see
        // `lastNotificationUpdateAtRef`'s comment) — duplicated here so the
        // reminder keeps firing once the app is backgrounded and that timer
        // stops. Shared `lastCarbReminderElapsedRef` means whichever path
        // fires first for a given interval wins.
        let carbReminderFiredAt = s.carbReminderFiredAt;
        const elapsedSecondsNow = computeElapsedSeconds();
        if (
          carbReminderEnabledRef.current &&
          elapsedSecondsNow - lastCarbReminderElapsedRef.current >= carbReminderIntervalSecondsRef.current &&
          !(forecastSecondsRemaining !== null && forecastSecondsRemaining < CARB_REMINDER_SUPPRESS_NEAR_FINISH_SECONDS)
        ) {
          announceCarbGelReminder(voiceGenderRef.current);
          lastCarbReminderElapsedRef.current = elapsedSecondsNow;
          carbReminderFiredAt = Date.now();
        }

        return {
          ...s,
          distanceMeters: distanceRef.current,
          currentPaceSecPerKm,
          currentKmPaceSecPerKm,
          forecastSecondsRemaining,
          paceNeededSecPerKm,
          ghostDeltaSeconds: ghostDelta,
          paceDeltaSecPerKm,
          points: pointsRef.current,
          carbReminderFiredAt,
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

  const beginWatch = useCallback(
    (notification?: { title: string; message: string }) => {
      beginGeoWatch(handleFix, handleError, notification, {
        iosSkipRoadSnapping: iosSkipRoadSnappingRef.current,
      });
    },
    [handleError, handleFix],
  );

  /**
   * True between `prewarm()` and either `cancelPrewarm()` or `start()`
   * taking the already-running watch over for a real run — lets `start()`
   * know not to call `beginGeoWatch()` a second time (see that function's
   * own "callers only ever call this once at a time" note; two live
   * watches would corrupt the next run's warmup/points) and, symmetrically,
   * lets `cancelPrewarm()` know it's safe to tear the watch down instead of
   * yanking one a real run has since taken ownership of.
   */
  const prewarmingRef = useRef(false);

  /**
   * Starts the same GPS watch a real run uses, before there's a run to
   * attach it to — while `status` stays `"idle"`, `handleFix`'s own gate
   * (`if (s.status !== "warming") return s`) keeps every fix from touching
   * the Kalman filter/distance accumulation, but the `gpsQuality` update at
   * the top of `handleFix` runs unconditionally, so this is enough on its
   * own to give the idle screen a real "GPS pronto"/"buscando" reading
   * instead of no reading at all. A no-op if already prewarming, or once a
   * real run has taken over the watch.
   */
  const prewarm = useCallback(() => {
    if (prewarmingRef.current) return;
    if (typeof navigator === "undefined" || (!isNativePlatform() && !("geolocation" in navigator))) return;
    prewarmingRef.current = true;
    // Distinct from the real-run notification below: no run has started yet,
    // just the same GPS lock a run will use once the athlete taps Iniciar.
    beginWatch({ title: "Buscando sinal de GPS", message: "Toque para voltar ao Xanthus." });
  }, [beginWatch]);

  /** Stops a prewarm watch that never turned into a real run — e.g. the athlete backed out of Preparar Corrida. Harmless no-op once `start()` has taken ownership (see `prewarmingRef`). */
  const cancelPrewarm = useCallback(() => {
    if (!prewarmingRef.current) return;
    prewarmingRef.current = false;
    clearWatch();
    setState((s) => (s.status === "idle" && s.gpsQuality !== "searching" ? { ...s, gpsQuality: "searching" } : s));
  }, [clearWatch]);

  const start = useCallback(
    (options?: StartOptions) => {
      // Wrapped in try/catch (added after a report of "the button plays its
      // tap animation and then nothing happens, no error either") — every
      // setState in this function only ever ran at the very end, so
      // anything thrown before it landed silently: `status` never left
      // "idle", nothing on screen changed, and there was nothing to tell a
      // report apart from "the button just didn't work." This at least
      // turns that into a visible message plus a real stack trace to work
      // from — same reasoning `handleError` already applies to GPS errors
      // reported through the watch itself.
      try {
        if (typeof navigator === "undefined" || (!isNativePlatform() && !("geolocation" in navigator))) {
          setState((s) => ({ ...s, error: "Geolocalização não é suportada neste navegador." }));
          return;
        }

        unlockSpeech(); // must run synchronously inside this user-gesture handler for iOS
        unlockVoiceBank();

        // A prewarm watch already flowing fixes hands straight over to the
        // real run instead of being torn down and restarted — the whole
        // point of prewarming is not losing the GPS/permission lock it
        // already has. `warmupCountRef` still resets below either way: a
        // fresh run always needs its own `FILTER_CONFIG.warmupFixesRequired`
        // consecutive good fixes before `handleFix` seeds the Kalman filter,
        // same as ever — prewarming just means those fixes were often
        // already arriving, so that gate clears in a couple of seconds
        // instead of however long a cold GPS lock takes.
        const hadPrewarm = prewarmingRef.current;
        prewarmingRef.current = false;

        runIdRef.current = newRunId();
        warmupCountRef.current = 0;
        lastRawRef.current = null;
        lastFilteredRef.current = null;
        lastFixTimestampRef.current = null;
        lastFixWallClockRef.current = null;
        lastStepCountRef.current = null;
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
        announceIntervalSecondsRef.current = options?.announceIntervalSeconds ?? 300;
        announceModeRef.current = options?.announceMode ?? "distance";
        voiceGenderRef.current = options?.voiceGender ?? "female";
        announceStyleRef.current = options?.announceStyle ?? "voz";
        targetPaceSecPerKmRef.current = options?.goal?.targetPaceSecPerKm;
        vibrateOnPaceDelayRef.current = options?.vibrateOnPaceDelay ?? false;
        goalRef.current = options?.goal ?? null;
        paceDelayAlertedRef.current = false;
        carbReminderEnabledRef.current = options?.carbReminderEnabled ?? false;
        carbReminderIntervalSecondsRef.current = options?.carbReminderIntervalSeconds ?? 45 * 60;
        lastCarbReminderElapsedRef.current = 0;
        iosSkipRoadSnappingRef.current = options?.iosSkipRoadSnapping ?? false;
        heartRateDeviceIdRef.current = options?.heartRateMonitorDeviceId ?? null;
        // kmMarkDistanceRef/kmMarkTimeRef aren't reset here — the
        // warmup-completion block always recomputes both fresh from
        // `distanceRef.current` (0 for a new run, the recovered distance for
        // `recover()`), so there's no separate value to set per entry point.
        ghostSeriesRef.current = options?.ghostRun ? buildDistanceTimeSeries(options.ghostRun) : null;

        void wakeLockRef.current.acquire();
        if (hadPrewarm) {
          // The watch is already running under the prewarm's "buscando
          // sinal" text (see `prewarm()`) — flip it to the real-run copy
          // now that the athlete has actually committed to a run, instead
          // of restarting the watch just to change its title.
          updateLiveNotification({
            title: "Corrida em andamento",
            message: "Rastreando por GPS. Toque para voltar ao Xanthus.",
          });
        } else {
          beginWatch();
        }
        // Unconditional (not gated on `!hadPrewarm`) — the Live Activity is a
        // very visible, user-facing lock-screen widget, so it should appear
        // exactly when the athlete taps "Iniciar corrida", not silently during
        // a `prewarm()` GPS lock before they've committed to a run. No
        // matching call in `resume()`: unlike the GPS watch itself, the Live
        // Activity's request/update/end lifecycle is independent of
        // `beginGeoWatch`/`endGeoWatch` — a pause just stops it from being
        // updated (same tick-loop gate as `updateLiveNotification`), it stays
        // on screen showing the last real numbers instead of disappearing and
        // reappearing across every pause/resume.
        beginLiveActivity({ distanceLabel: "0,00 km", paceLabel: "--:--/km", timeLabel: "00:00" });
        // Same "unconditional, athlete just committed to a run" reasoning as
        // beginLiveActivity above — the watch should flip out of its "Iniciar"
        // screen right away, not wait up to 5s for the next throttled refresh.
        sendWatchUpdate({ status: "warming", distanceLabel: "0,00 km", paceLabel: "--:--/km", timeLabel: "00:00" });

        // Opportunistic — a failed/timed-out connection surfaces as
        // `heartRateConnection: "unavailable"` and never blocks the run
        // itself, same as every other native capability this hook touches.
        if (heartRateDeviceIdRef.current) connectHeartRate(heartRateDeviceIdRef.current);

        setState((s) => ({
          status: "warming",
          runId: runIdRef.current,
          // Keeps whatever reading the prewarm watch already had instead of
          // flashing back to "searching" the instant Iniciar is tapped —
          // the watch itself never stopped, so the reading is still current.
          gpsQuality: hadPrewarm ? s.gpsQuality : "searching",
          distanceMeters: 0,
          elapsedSeconds: 0,
          currentPaceSecPerKm: null,
          currentKmPaceSecPerKm: null,
          goal: options?.goal ?? null,
          forecastSecondsRemaining: null,
          paceNeededSecPerKm: null,
          error: null,
          finishedRun: null,
          ghostDeltaSeconds: null,
          paceDeltaSecPerKm: null,
          finishedGhostDeltaSeconds: null,
          carbReminderFiredAt: null,
          points: [],
          pauseEvents: [],
          heartRateBpm: null,
          heartRateConnection: heartRateDeviceIdRef.current ? "connecting" : "disconnected",
        }));
      } catch (err) {
        console.error("[run] start() threw", err);
        setState((s) => ({
          ...s,
          error: err instanceof Error ? `Erro ao iniciar: ${err.message}` : "Erro ao iniciar a corrida.",
        }));
      }
    },
    [beginWatch, connectHeartRate],
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
    (snapshot: ActiveRunSnapshot, heartRateMonitorDeviceId?: string) => {
      if (typeof navigator === "undefined" || (!isNativePlatform() && !("geolocation" in navigator))) {
        setState((s) => ({ ...s, error: "Geolocalização não é suportada neste navegador." }));
        return;
      }

      unlockSpeech();
      unlockVoiceBank();

      runIdRef.current = snapshot.id;
      warmupCountRef.current = 0;
      lastRawRef.current = null;
      lastFilteredRef.current = null;
      lastFixTimestampRef.current = null;
      lastFixWallClockRef.current = null;
      lastStepCountRef.current = null;
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
      announceIntervalSecondsRef.current = 300;
      announceModeRef.current = "distance";
      voiceGenderRef.current = "female";
      carbReminderEnabledRef.current = false;
      carbReminderIntervalSecondsRef.current = 45 * 60;
      lastCarbReminderElapsedRef.current = 0;
      ghostSeriesRef.current = null;
      recoveringRef.current = true;
      heartRateDeviceIdRef.current = heartRateMonitorDeviceId ?? null;

      void wakeLockRef.current.acquire();
      beginWatch();
      if (heartRateDeviceIdRef.current) connectHeartRate(heartRateDeviceIdRef.current);

      setState({
        status: "warming",
        runId: runIdRef.current,
        gpsQuality: "searching",
        distanceMeters: snapshot.distanceMeters,
        elapsedSeconds: 0,
        currentPaceSecPerKm: null,
        currentKmPaceSecPerKm: null,
        goal: null,
        forecastSecondsRemaining: null,
        paceNeededSecPerKm: null,
        error: null,
        finishedRun: null,
        ghostDeltaSeconds: null,
        paceDeltaSecPerKm: null,
        finishedGhostDeltaSeconds: null,
        carbReminderFiredAt: null,
        points: snapshot.points,
        pauseEvents: [],
        heartRateBpm: null,
        heartRateConnection: heartRateDeviceIdRef.current ? "connecting" : "disconnected",
      });
    },
    [beginWatch, connectHeartRate],
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
    setState((s) => {
      if (s.status !== "tracking") return s;
      // Immediate, not waiting for the next 5s-throttled refresh — the
      // watch's Pausar/Retomar button should flip right away.
      sendWatchUpdate({
        status: "paused",
        distanceLabel: `${formatDistanceKm(distanceRef.current)} km`,
        paceLabel: s.currentPaceSecPerKm !== null ? `${formatPace(s.currentPaceSecPerKm)}/km` : "--:--/km",
        timeLabel: formatElapsed(s.elapsedSeconds),
      });
      return { ...s, status: "paused", pauseEvents: pauseEventsRef.current };
    });
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
    setState((s) => {
      sendWatchUpdate({
        status: "tracking",
        distanceLabel: `${formatDistanceKm(distanceRef.current)} km`,
        paceLabel: s.currentPaceSecPerKm !== null ? `${formatPace(s.currentPaceSecPerKm)}/km` : "--:--/km",
        timeLabel: formatElapsed(s.elapsedSeconds),
      });
      return { ...s, status: "tracking", pauseEvents: pauseEventsRef.current };
    });
  }, [beginWatch, startTicking]);

  const finish = useCallback(
    (extra?: { tracks?: RunTrack[]; shoeName?: string }) => {
      clearWatch();
      stopTicking();
      void wakeLockRef.current.release();
      heartRateDeviceIdRef.current = null;
      void disconnectHeartRateMonitor();

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

      // Route-shape-only post-processing (see `smoothRoutePoints`'s own
      // comment) — `distanceMeters` right below stays exactly what was
      // credited live, the same number the voice already announced during
      // the run. Only the drawn path (and anything derived from it: splits,
      // PR detection, elevation sampling, matched-route comparison) gets the
      // benefit of the backward pass.
      const smoothedPoints = smoothRoutePoints(pointsRef.current);

      const run: CompletedRun = {
        id: runIdRef.current,
        startedAt: startedAtRef.current ?? finishedAt,
        finishedAt,
        distanceMeters: distanceRef.current,
        points: smoothedPoints,
        movingSeconds,
        ...(extra?.tracks?.length ? { tracks: extra.tracks } : {}),
        ...(extra?.shoeName?.trim() ? { shoeName: extra.shoeName.trim() } : {}),
        ...(pauseEvents.length ? { pauseEvents } : {}),
        ...(gpsGaps.length ? { gpsGaps } : {}),
        ...(goalRef.current ? { goal: goalRef.current } : {}),
      };
      void saveCompletedRun(run);
      void clearActiveRun();

      const avgPaceSecPerKm = distanceRef.current > 0 ? movingSeconds / (distanceRef.current / 1000) : null;
      endLiveActivity({
        distanceLabel: `${formatDistanceKm(distanceRef.current)} km`,
        paceLabel: `${formatPace(avgPaceSecPerKm)}/km`,
        timeLabel: formatElapsed(movingSeconds),
      });
      sendWatchUpdate({
        status: "finished",
        distanceLabel: `${formatDistanceKm(distanceRef.current)} km`,
        paceLabel: `${formatPace(avgPaceSecPerKm)}/km`,
        timeLabel: formatElapsed(movingSeconds),
      });

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
    // Same teardown `finish()` does, and for the same reason: without it, a
    // "Cancelar" tap during "warming" (or "descartar corrida" during
    // "tracking"/"paused") left the GPS watch running with nowhere for its
    // fixes to go — `beginGeoWatch()` documents its own assumption that a
    // caller never starts a second watch without clearing the first, an
    // assumption this violated the moment the athlete tapped "Começar"
    // again: two live watches end up feeding the same refs at once,
    // corrupting the next run's warmup/points. Idempotent either way — all
    // three no-op harmlessly when there's nothing left to tear down (a
    // reset that follows a normal finish(), which already cleared them).
    prewarmingRef.current = false;
    clearWatch();
    stopTicking();
    void wakeLockRef.current.release();
    heartRateDeviceIdRef.current = null;
    void disconnectHeartRateMonitor();
    // Ends any Live Activity still showing — `finish()` already did this on
    // its own path, this only matters for "descartar corrida"/"Cancelar",
    // which skip finish() entirely and would otherwise leave the lock-screen
    // widget stuck open forever. Harmless no-op (see endLiveActivity) when
    // there's nothing running, e.g. after a normal finish() already ended it.
    endLiveActivity({
      distanceLabel: `${formatDistanceKm(distanceRef.current)} km`,
      paceLabel: "--:--/km",
      timeLabel: formatElapsed(computeElapsedSeconds()),
    });
    sendWatchUpdate({
      status: "idle",
      distanceLabel: "0,00 km",
      paceLabel: "--:--/km",
      timeLabel: "00:00",
    });

    setState({
      status: "idle",
      runId: null,
      gpsQuality: "searching",
      distanceMeters: 0,
      elapsedSeconds: 0,
      currentPaceSecPerKm: null,
      currentKmPaceSecPerKm: null,
      goal: null,
      forecastSecondsRemaining: null,
      paceNeededSecPerKm: null,
      error: null,
      finishedRun: null,
      ghostDeltaSeconds: null,
      paceDeltaSecPerKm: null,
      finishedGhostDeltaSeconds: null,
      carbReminderFiredAt: null,
      points: [],
      pauseEvents: [],
      heartRateBpm: null,
      heartRateConnection: "disconnected",
    });
  }, [clearWatch, stopTicking, computeElapsedSeconds]);

  useEffect(() => {
    statusRef.current = state.status;
  }, [state.status]);

  /**
   * A dropped BLE connection (sensor out of range while backgrounded, OS
   * reclaiming the radio) only ever calls back through `onDisconnect` while
   * the app is in the foreground to see it — same class of problem
   * `friend-presence-ping.tsx` solves for location, just for a GATT link
   * instead. One reconnect attempt per foreground, not a retry loop: a
   * monitor that's genuinely out of range (taken off, out of the room)
   * shouldn't have this hammering `connect()` every resume.
   */
  useEffect(() => {
    if (!isNativePlatform()) return;
    const subscription = App.addListener("resume", () => {
      const deviceId = heartRateDeviceIdRef.current;
      if (!deviceId) return;
      if (statusRef.current !== "tracking" && statusRef.current !== "paused") return;
      if (heartRateConnectionRef.current === "connected" || heartRateConnectionRef.current === "connecting") return;
      connectHeartRate(deviceId);
    });
    return () => {
      void subscription.then((handle) => handle.remove());
    };
  }, [connectHeartRate]);

  useEffect(() => {
    const wakeLock = wakeLockRef.current;
    return () => {
      clearWatch();
      stopTicking();
      void wakeLock.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, start, pause, resume, finish, reset, setPauseReason, recover, prewarm, cancelPrewarm };
}
