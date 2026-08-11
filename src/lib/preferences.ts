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
}

export const ANNOUNCE_OPTIONS = [500, 1000, 2000] as const;

export const DEFAULT_PREFERENCES: Preferences = {
  announceIntervalMeters: 1000,
  distanceUnit: "km",
};

const STORAGE_KEY = "pegasus-run:preferences";

function sanitize(raw: unknown): Preferences {
  if (typeof raw !== "object" || raw === null) return DEFAULT_PREFERENCES;
  const value = raw as Partial<Record<keyof Preferences, unknown>>;

  const announce = Number(value.announceIntervalMeters);
  const announceIntervalMeters = (ANNOUNCE_OPTIONS as readonly number[]).includes(announce)
    ? announce
    : DEFAULT_PREFERENCES.announceIntervalMeters;

  const distanceUnit: DistanceUnit =
    value.distanceUnit === "mi" || value.distanceUnit === "km"
      ? value.distanceUnit
      : DEFAULT_PREFERENCES.distanceUnit;

  return { announceIntervalMeters, distanceUnit };
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
  return meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
}
