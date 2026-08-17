/**
 * User preferences that are genuinely persisted (localStorage), as opposed to
 * the mocked-up profile fields on /perfil.
 *
 * Only settings that already have a real consumer live here:
 *   - `announceIntervalMeters` is read by /run as the initial value of the
 *     voice-announcement selector, which is then handed to `useRunTracker`'s
 *     `start()`. The hook stays the single owner of the announcement logic;
 *     this module only remembers what the athlete picked last time.
 *   - `distanceUnit` is applied by /historico, the one screen showing real
 *     recorded distances.
 *
 * Anything not in this shape is ignored on read, so a stale or hand-edited
 * entry degrades to the defaults instead of breaking a screen.
 */

export type DistanceUnit = "km" | "mi";

export interface Preferences {
  announceIntervalMeters: number;
  distanceUnit: DistanceUnit;
  /** Extra live stat tiles on /run — the run-so-far average pace and the pace of the km currently in progress. Both on by default; each is one more tile competing for space on a screen a sweaty thumb glances at mid-stride, so /perfil lets either be turned off. */
  showAveragePaceLive: boolean;
  showCurrentKmPaceLive: boolean;
}

/** Slider bounds for the voice-announcement interval — was a fixed 3-option choice, now free within this range. */
export const ANNOUNCE_MIN_METERS = 250;
export const ANNOUNCE_MAX_METERS = 5000;
export const ANNOUNCE_STEP_METERS = 250;

export const DEFAULT_PREFERENCES: Preferences = {
  announceIntervalMeters: 1000,
  distanceUnit: "km",
  showAveragePaceLive: true,
  showCurrentKmPaceLive: true,
};

const STORAGE_KEY = "xanthus:preferences";

/** Snaps to the nearest step and clamps to the slider's range — never rejects a value outright, just corrects it. */
function clampAnnounceInterval(meters: number): number {
  const snapped = Math.round(meters / ANNOUNCE_STEP_METERS) * ANNOUNCE_STEP_METERS;
  return Math.min(ANNOUNCE_MAX_METERS, Math.max(ANNOUNCE_MIN_METERS, snapped));
}

function sanitize(raw: unknown): Preferences {
  if (typeof raw !== "object" || raw === null) return DEFAULT_PREFERENCES;
  const value = raw as Partial<Record<keyof Preferences, unknown>>;

  const rawAnnounce = Number(value.announceIntervalMeters);
  const announceIntervalMeters = Number.isFinite(rawAnnounce)
    ? clampAnnounceInterval(rawAnnounce)
    : DEFAULT_PREFERENCES.announceIntervalMeters;

  const distanceUnit: DistanceUnit =
    value.distanceUnit === "mi" || value.distanceUnit === "km"
      ? value.distanceUnit
      : DEFAULT_PREFERENCES.distanceUnit;

  const showAveragePaceLive =
    typeof value.showAveragePaceLive === "boolean"
      ? value.showAveragePaceLive
      : DEFAULT_PREFERENCES.showAveragePaceLive;

  const showCurrentKmPaceLive =
    typeof value.showCurrentKmPaceLive === "boolean"
      ? value.showCurrentKmPaceLive
      : DEFAULT_PREFERENCES.showCurrentKmPaceLive;

  return { announceIntervalMeters, distanceUnit, showAveragePaceLive, showCurrentKmPaceLive };
}

/** Safe on the server and in private-mode browsers: always returns something usable. */
export function loadPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_PREFERENCES;
    return sanitize(JSON.parse(stored));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/** Merges over what is already stored and returns the resulting preferences. */
export function savePreferences(patch: Partial<Preferences>): Preferences {
  const next = sanitize({ ...loadPreferences(), ...patch });
  if (typeof window === "undefined") return next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage disabled (private mode, quota): the choice simply doesn't stick.
  }
  return next;
}

export function announceLabel(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toString().replace(".", ",")} km`;
}
