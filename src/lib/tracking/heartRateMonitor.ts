/**
 * Live heart rate over Bluetooth Low Energy — a real sensor (chest strap or
 * watch broadcasting the standard Heart Rate Service) read directly during a
 * run, as opposed to `src/lib/health.ts`'s HealthKit/Health Connect path,
 * which only ever reads a *finished* workout after the fact. Apple Watch
 * never shows up here (it doesn't broadcast BLE in this mode) — this covers
 * chest straps and any watch that does (Garmin, most Wear OS watches in
 * broadcast mode).
 *
 * `@capacitor-community/bluetooth-le` is a plain npm Capacitor plugin (no
 * vendored patch, unlike `native-plugins/capacitor-background-geolocation`)
 * — `npx cap sync` already wired it into both native projects on install.
 *
 * Service/characteristic UUIDs are the Bluetooth SIG standard (GATT Heart
 * Rate Service, 0x180D / Heart Rate Measurement, 0x2A37) — not
 * Xanthus-specific, any compliant sensor uses these.
 */
import { BleClient, numberToUUID, type ScanResult } from "@capacitor-community/bluetooth-le";

const HEART_RATE_SERVICE_UUID = numberToUUID(0x180d);
const HEART_RATE_MEASUREMENT_UUID = numberToUUID(0x2a37);

export interface HeartRateDevice {
  deviceId: string;
  name?: string;
}

export type HeartRateConnectionState = "connecting" | "connected" | "disconnected" | "unavailable";

/**
 * The GATT Heart Rate Measurement value is a flags byte followed by the BPM
 * value — 8 or 16 bit depending on flag bit 0 (`0x01`). Every other field in
 * the spec (RR-intervals, energy expended) is optional and unused here.
 * Returns `null` for a payload too short to contain even the minimal
 * 8-bit form, rather than throwing on a malformed notification.
 */
function parseHeartRateMeasurement(value: DataView): number | null {
  if (value.byteLength < 2) return null;
  const is16Bit = (value.getUint8(0) & 0x01) === 1;
  if (is16Bit) {
    if (value.byteLength < 3) return null;
    return value.getUint16(1, true);
  }
  return value.getUint8(1);
}

/**
 * Starts scanning for nearby devices advertising the Heart Rate Service,
 * invoking `onDevice` once per distinct device seen (duplicates from the
 * same device are normal BLE advertisement behavior and simply call it
 * again — the pairing screen dedupes by `deviceId` on its own list).
 * Returns a `stop()` the caller must call (screen unmount, "Cancelar",
 * or a device already picked) — an open scan left running is a real
 * battery cost, not just a formality.
 */
export function startHeartRateScan(onDevice: (device: HeartRateDevice) => void): { stop: () => void } {
  let stopped = false;

  void BleClient.initialize()
    .then(() =>
      BleClient.requestLEScan({ services: [HEART_RATE_SERVICE_UUID] }, (result: ScanResult) => {
        if (stopped) return;
        onDevice({ deviceId: result.device.deviceId, name: result.device.name });
      }),
    )
    .catch(() => {
      // Bluetooth off, permission denied, unsupported — the pairing screen's
      // own empty state covers "nothing found", same failure mode.
    });

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      void BleClient.stopLEScan().catch(() => {});
    },
  };
}

/** Only one monitor is ever connected at a time — tracked here so `disconnectHeartRateMonitor()` doesn't need the caller to remember which device it was. */
let connectedDeviceId: string | null = null;

/**
 * Connects to a specific device and starts streaming BPM readings.
 * `onStateChange` fires `"connecting"` immediately, then `"connected"` once
 * notifications are live, `"disconnected"` if the sensor drops the
 * connection on its own (out of range, powered off), or `"unavailable"` if
 * the connection attempt itself fails (never paired, Bluetooth off).
 * Never throws — same best-effort convention as `geolocation.ts`'s
 * notification helpers, since a heart rate reading is always a bonus
 * metric, never something a run's core tracking depends on.
 */
export async function connectHeartRateMonitor(
  deviceId: string,
  onReading: (bpm: number) => void,
  onStateChange: (state: HeartRateConnectionState) => void,
): Promise<void> {
  onStateChange("connecting");
  try {
    await BleClient.initialize();
    await BleClient.connect(deviceId, () => {
      connectedDeviceId = null;
      onStateChange("disconnected");
    });
    await BleClient.startNotifications(deviceId, HEART_RATE_SERVICE_UUID, HEART_RATE_MEASUREMENT_UUID, (value) => {
      const bpm = parseHeartRateMeasurement(value);
      if (bpm !== null) onReading(bpm);
    });
    connectedDeviceId = deviceId;
    onStateChange("connected");
  } catch {
    connectedDeviceId = null;
    onStateChange("unavailable");
  }
}

/** Best-effort teardown — safe to call even if nothing is connected (e.g. a run finishing when the athlete never paired a monitor). */
export async function disconnectHeartRateMonitor(): Promise<void> {
  const deviceId = connectedDeviceId;
  if (!deviceId) return;
  connectedDeviceId = null;
  try {
    await BleClient.stopNotifications(deviceId, HEART_RATE_SERVICE_UUID, HEART_RATE_MEASUREMENT_UUID);
  } catch {
    // Already gone — nothing more to clean up.
  }
  try {
    await BleClient.disconnect(deviceId);
  } catch {
    // Already disconnected.
  }
}
