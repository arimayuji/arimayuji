/**
 * Two watch backends behind one interface, chosen by platform:
 *
 * - Web (`isNativePlatform()` false): `@capacitor/geolocation`, which
 *   itself falls back to `navigator.geolocation` — no native shell, so
 *   there's no such thing as "the screen locked and JS kept running"
 *   here anyway.
 * - Native (Android/iOS): `@capgo/background-geolocation` instead.
 *   `@capacitor/geolocation`'s `watchPosition` only ever delivers fixes
 *   while the WebView is actually visible — screen lock or backgrounding
 *   the app pauses it, same as any other JS timer, which is the whole
 *   reason the app went native in the first place (see the plan/README).
 *   This plugin runs a real Android foreground service (`backgroundMessage`
 *   below is what makes that persistent notification required by Android
 *   to keep it alive) and requests iOS "Always" authorization, so fixes
 *   keep arriving with the screen off. It does ship its own web fallback,
 *   but we still route web through `@capacitor/geolocation` above — no
 *   reason to depend on a plugin's incidental web shim when the
 *   already-validated DOM path already covers that case.
 *
 * Both backends normalize into the same `GeoFix`/`GeoError` shape below,
 * so `useRunTracker.ts`'s fix-processing pipeline (Kalman filter, gates,
 * distance accumulation) never needs to know which one is live.
 */
import { Geolocation, type CallbackID } from "@capacitor/geolocation";
import { BackgroundGeolocation, type CallbackError, type Location } from "@capgo/background-geolocation";
import { isAndroidPlatform, isNativePlatform } from "../platform";

export interface GeoFix {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    speed: number | null;
    heading: number | null;
  };
  timestamp: number;
}

export type GeoErrorKind = "permission-denied" | "timeout" | "unavailable";

export interface GeoError {
  kind: GeoErrorKind;
  message: string;
}

/**
 * Codes observed from the native side of `@capacitor/geolocation`, shared
 * verbatim between its Android and iOS implementations (see
 * `GeolocationErrors.kt` / `GeolocationError.swift` in the plugin package).
 */
const NATIVE_PERMISSION_DENIED_CODE = "OS-PLUG-GLOC-0003";
const NATIVE_TIMEOUT_CODE = "OS-PLUG-GLOC-0010";

function mapForegroundError(err: unknown): GeoError {
  const raw = err as { code?: unknown; message?: unknown } | null | undefined;
  const code = raw?.code;
  const message = typeof raw?.message === "string" ? raw.message : "Erro de localização desconhecido.";

  // Native (Capacitor) errors: string codes.
  if (code === NATIVE_PERMISSION_DENIED_CODE) return { kind: "permission-denied", message };
  if (code === NATIVE_TIMEOUT_CODE) return { kind: "timeout", message };

  // Web fallback: a raw DOM GeolocationPositionError, numeric codes
  // (PERMISSION_DENIED = 1, POSITION_UNAVAILABLE = 2, TIMEOUT = 3).
  if (code === 1) return { kind: "permission-denied", message };
  if (code === 3) return { kind: "timeout", message };

  return { kind: "unavailable", message };
}

/** `@capgo/background-geolocation` only ever reports `"NOT_AUTHORIZED"` by name — everything else maps to `unavailable`, there's no separate timeout concept in this plugin. */
function mapBackgroundError(err: CallbackError): GeoError {
  return {
    kind: err.code === "NOT_AUTHORIZED" ? "permission-denied" : "unavailable",
    message: err.message || "Erro de localização desconhecido.",
  };
}

function fixFromBackgroundLocation(location: Location): GeoFix {
  return {
    coords: {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      speed: location.speed,
      // Plugin calls it "bearing"; GeoFix keeps the DOM's "heading" name so
      // callers don't need to know which backend produced a given fix.
      heading: location.bearing,
    },
    timestamp: location.time ?? Date.now(),
  };
}

/**
 * Holds a promise for whichever backend's `start()`/`watchPosition()` call
 * is currently pending, plus which backend it belongs to — `endGeoWatch`
 * needs both to tear down the right one. The promise itself (not just its
 * resolution) exists so a fast pause-right-after-start can't leak an
 * orphaned watch: starting only resolves asynchronously (a native bridge
 * round-trip), while `pause()`/`finish()` can call `endGeoWatch()`
 * synchronously right after `start()`/`resume()` calls `beginGeoWatch()`.
 * The background backend's `start()` resolves `void` (it has no watch id —
 * `stop()` always tears down whatever's running), so this only needs to
 * carry a real id on the foreground branch.
 */
let watchStartPromise: Promise<CallbackID | void> | null = null;
let activeBackend: "background" | "foreground" | null = null;

/** Starts a watch. Any previous watch is left alone — callers already only ever call this once at a time. */
export function beginGeoWatch(onFix: (fix: GeoFix) => void, onError: (err: GeoError) => void): void {
  if (isNativePlatform()) {
    activeBackend = "background";
    watchStartPromise = BackgroundGeolocation.start(
      {
        backgroundTitle: "Xanthus",
        backgroundMessage: "Gravando sua corrida em segundo plano.",
        requestPermissions: true,
        stale: false,
        distanceFilter: 0,
      },
      (location, error) => {
        if (error) {
          onError(mapBackgroundError(error));
          return;
        }
        if (!location) return;
        onFix(fixFromBackgroundLocation(location));
      },
    );
    watchStartPromise.catch(() => {
      // Failing to even start the watch surfaces to the caller through the
      // start() callback path; nothing else to do here.
    });
    return;
  }

  activeBackend = "foreground";
  watchStartPromise = Geolocation.watchPosition(
    {
      enableHighAccuracy: true,
      timeout: 30_000,
      // Android-only; no effect on iOS/web. Without an explicit `interval`,
      // the plugin defaults it to `timeout` (30s) for backwards
      // compatibility with its own 7.1.x behavior — meaning Android would
      // only request a new fix once every 30 seconds, not continuously.
      // That's both why warmup (needs 3 good fixes in a row) took minutes
      // on a real device instead of seconds, and why live tracking would
      // have stayed this coarse for the whole run. 1s matches the
      // once-a-second UI tick this hook already runs on.
      interval: 1_000,
      minimumUpdateInterval: 1_000,
    },
    (position, err) => {
    if (err) {
      onError(mapForegroundError(err));
      return;
    }
    if (!position) return;
    onFix(position);
  });
  watchStartPromise.catch(() => {
    // Failing to even start the watch is surfaced to the caller via onError
    // through the watchPosition callback path on native; nothing else to do here.
  });
}

/**
 * Refreshes the persistent tracking notification while a run is live —
 * either the plain title/message form, or (passing `distanceLabel`/
 * `paceLabel`/`timeLabel`) the rich 3-column layout with a route thumbnail.
 * Android-only: the fork's `updateNotification` native method only exists on
 * the Java side (see `native-plugins/capacitor-background-geolocation`);
 * iOS keeps its original, unpatched Swift implementation. No-ops on iOS/web,
 * or if the background backend isn't the one currently running (e.g. GPS
 * permission was only ever granted foreground-only, so `beginGeoWatch` fell
 * back to `@capacitor/geolocation`).
 */
export function updateLiveNotification(options: {
  title?: string;
  message?: string;
  distanceLabel?: string;
  paceLabel?: string;
  timeLabel?: string;
  routePolylines?: string[];
}): void {
  if (!isAndroidPlatform() || activeBackend !== "background") return;
  void BackgroundGeolocation.updateNotification(options).catch(() => {
    // Best-effort — the run keeps tracking fine even if the notification text is stale.
  });
}

export type NotificationAction = "pause" | "finish";

/**
 * Subscribes to taps on the rich notification's Pausar/Finalizar buttons
 * (see `updateLiveNotification` above). Android only — on iOS/web this is a
 * no-op that never calls `callback`, since neither platform has this
 * notification style to tap. Returns an unsubscribe function.
 */
export function onNotificationAction(callback: (action: NotificationAction) => void): () => void {
  if (!isAndroidPlatform()) return () => {};
  const handlePromise = BackgroundGeolocation.addListener("notificationAction", (event) => callback(event.action));
  return () => {
    void handlePromise.then((handle) => handle.remove()).catch(() => {});
  };
}

export function endGeoWatch(): void {
  if (watchStartPromise === null) return;
  const pending = watchStartPromise;
  const backend = activeBackend;
  watchStartPromise = null;
  activeBackend = null;
  if (backend === "background") {
    void pending.then(() => BackgroundGeolocation.stop()).catch(() => {});
  } else {
    void pending.then((id) => Geolocation.clearWatch({ id: id as CallbackID })).catch(() => {});
  }
}
