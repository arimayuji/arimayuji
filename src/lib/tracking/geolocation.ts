/**
 * Wraps `@capacitor/geolocation` instead of calling `navigator.geolocation`
 * directly — the plugin already falls back to `navigator.geolocation` itself
 * when not running inside a native shell (`Capacitor.isNativePlatform()` is
 * false), so this same code path serves both the web PWA and the native
 * Android/iOS builds with no manual native/web branching here.
 *
 * Exists mainly to hide two shape differences from `useRunTracker.ts`:
 * - the watch id is a `string` (`CallbackID`) here vs. a DOM `number`.
 * - the error shape differs between the web fallback (a raw DOM
 *   `GeolocationPositionError`, numeric `.code`) and native (Capacitor's own
 *   `{ code: "OS-PLUG-GLOC-000N", message }` convention) — normalized below
 *   into one `GeoErrorKind` union so callers never branch on either shape.
 */
import { Geolocation, type CallbackID } from "@capacitor/geolocation";

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

function mapError(err: unknown): GeoError {
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

/**
 * `watchPosition` itself resolves to the watch id asynchronously (a native
 * bridge round-trip), while `pause()`/`finish()` can call `endGeoWatch()`
 * synchronously right after `start()`/`resume()` calls `beginGeoWatch()` —
 * holding the in-flight promise (instead of only the resolved id) lets
 * `endGeoWatch` wait for that id before clearing it, so a fast pause can't
 * leak an orphaned native watch running in the background.
 */
let watchIdPromise: Promise<CallbackID> | null = null;

/** Starts a watch. Any previous watch is left alone — callers already only ever call this once at a time. */
export function beginGeoWatch(onFix: (fix: GeoFix) => void, onError: (err: GeoError) => void): void {
  watchIdPromise = Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 30_000 }, (position, err) => {
    if (err) {
      onError(mapError(err));
      return;
    }
    if (!position) return;
    onFix(position);
  });
  watchIdPromise.catch(() => {
    // Failing to even start the watch is surfaced to the caller via onError
    // through the watchPosition callback path on native; nothing else to do here.
  });
}

export function endGeoWatch(): void {
  if (watchIdPromise === null) return;
  const pending = watchIdPromise;
  watchIdPromise = null;
  void pending.then((id) => Geolocation.clearWatch({ id })).catch(() => {});
}
