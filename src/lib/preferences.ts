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

/** "system" follows the OS/browser scheme live; "light"/"dark" pin it regardless of what the OS is set to. */
export type ThemeMode = "light" | "dark" | "system";

/**
 * Which "home" the app opens into for someone who is both an athlete and a
 * coach of other people — a real minority (most accounts only ever run),
 * so this only ever surfaces as a switch on /perfil when the account
 * actually has at least one accepted student. "atleta" is always the
 * default even for a coach: nobody expects the app they use to log their
 * own runs to suddenly open into someone else's dashboard the first time
 * they accept a student.
 */
export type AppMode = "atleta" | "treinador";

/** Whether the voice-announcement trigger is "every N meters" (the original behavior) or "every N seconds" — a run on a treadmill or a very winding trail can make a fixed distance interval feel unpredictable, so a time-based alternative is offered instead of replacing the distance one. */
export type AnnounceMode = "distance" | "time";

/** Which recorded voice bank speaks the announcements — see scripts/generate-voice-bank.ts's VOICES map and voiceBank.ts's CLIP_BASE for the matching clip directories. */
export type VoiceGender = "female" | "male";

/**
 * How the periodic split (every `announceIntervalMeters`/`announceIntervalSeconds`)
 * gets delivered — "voz" speaks the pace out loud (the original, still the
 * default); "vibracao" replaces the voice clip with a single haptic tap
 * meaning "glance at the screen, your split is ready" for someone who
 * doesn't want audio at all (headphones off, a quiet street, etc.). Not the
 * same signal as `vibrateOnPaceDelay` — that one is a distinct pattern that
 * only fires when a "ritmo" goal falls behind schedule; this one fires on
 * every regular split regardless of goal type, replacing speech rather than
 * adding a warning on top of it.
 */
export type AnnounceStyle = "voz" | "vibracao";

export interface Preferences {
  announceIntervalMeters: number;
  /** Only read when `announceMode` is "time". Independent of `announceIntervalMeters` so switching modes back and forth doesn't lose either choice. */
  announceIntervalSeconds: number;
  announceMode: AnnounceMode;
  announceStyle: AnnounceStyle;
  voiceGender: VoiceGender;
  distanceUnit: DistanceUnit;
  /** Extra live stat tiles on /run — the run-so-far average pace and the pace of the km currently in progress. Both on by default; each is one more tile competing for space on a screen a sweaty thumb glances at mid-stride, so /perfil lets either be turned off. */
  showAveragePaceLive: boolean;
  showCurrentKmPaceLive: boolean;
  theme: ThemeMode;
  /**
   * Native haptic tap when a "meta de ritmo" run falls too far behind
   * schedule — see `PACE_DELAY_VIBRATION_THRESHOLD_SECONDS` in
   * useRunTracker.ts. Off by default like every other opt-in here; only
   * has an effect at all when the run's goal type is "ritmo" (a target
   * pace was actually set).
   */
  vibrateOnPaceDelay: boolean;
  /**
   * Explicit, separate consent for `src/lib/health.ts` to read from
   * HealthKit/Health Connect — the product-level consent screen that
   * feature's own doc comment says must exist before `HEALTH_DATA_ENABLED`
   * is ever flipped back on (LGPD Art. 11: heart rate/calories/steps are
   * sensitive data, and the OS's own permission dialog only consents to
   * the sensor, not to what this app does with the reading). Off by
   * default like every other opt-in here; `fetchRunHealthData` checks this
   * itself, so turning it on here is what actually starts any reading —
   * not `HEALTH_DATA_ENABLED`, which is a separate ship-readiness switch
   * for the feature as a whole.
   */
  healthDataConsent: boolean;
  /** See `AppMode`. Doesn't gate anything server-side — a plain athlete who somehow gets this set to "treinador" just sees an empty /treinador as their home, same empty state a coach with no accepted students sees. */
  appMode: AppMode;
  /**
   * Voice reminder to take a carbohydrate gel, on a fixed elapsed-time
   * cadence during a run — see `useRunTracker.ts`'s own comment on why
   * this is elapsed time, not pace or distance (ACSM/ISSN guidance scales
   * carb need with duration of effort, not speed). Off by default like
   * every other new opt-in behavior here.
   */
  carbReminderEnabled: boolean;
  /** Minutes between reminders, and also when the first one fires — see `CARB_REMINDER_MIN/MAX/STEP_MINUTES`. */
  carbReminderIntervalMinutes: number;
  /**
   * "Coach ao vivo" — separate from `healthDataConsent` above on purpose:
   * that one is "the app may read my watch at all," this one is "my coach
   * specifically sees this live, this run." Remembered as a default (same
   * as `vibrateOnPaceDelay`/`carbReminderEnabled`) and surfaced as a toggle
   * at the same step where the athlete already picks who to share a live
   * run with — never a separate settings screen, and never on unless a
   * coach is actually being shared with in the first place.
   */
  shareHeartRateWithCoach: boolean;
}

/** Slider bounds for the voice-announcement interval — was a fixed 3-option choice, now free within this range. */
export const ANNOUNCE_MIN_METERS = 250;
export const ANNOUNCE_MAX_METERS = 5000;
export const ANNOUNCE_STEP_METERS = 250;

/** Slider bounds for the time-based voice-announcement interval, in seconds. */
export const ANNOUNCE_MIN_SECONDS = 60;
export const ANNOUNCE_MAX_SECONDS = 600;
export const ANNOUNCE_STEP_SECONDS = 30;

/** Slider bounds for the carb-reminder interval, in minutes — the range itself is the ACSM/ISSN 30-60g/hour guidance window, reused directly as the slider's range (see PROJECT-CONTEXT.md for the citation). */
export const CARB_REMINDER_MIN_MINUTES = 30;
export const CARB_REMINDER_MAX_MINUTES = 60;
export const CARB_REMINDER_STEP_MINUTES = 5;

export const DEFAULT_PREFERENCES: Preferences = {
  announceIntervalMeters: 1000,
  announceIntervalSeconds: 300,
  announceMode: "distance",
  announceStyle: "voz",
  voiceGender: "female",
  distanceUnit: "km",
  showAveragePaceLive: true,
  showCurrentKmPaceLive: true,
  theme: "system",
  vibrateOnPaceDelay: false,
  healthDataConsent: false,
  appMode: "atleta",
  carbReminderEnabled: false,
  carbReminderIntervalMinutes: 45,
  shareHeartRateWithCoach: false,
};

const STORAGE_KEY = "xanthus:preferences";

/** Snaps to the nearest step and clamps to the slider's range — never rejects a value outright, just corrects it. */
function clampAnnounceInterval(meters: number): number {
  const snapped = Math.round(meters / ANNOUNCE_STEP_METERS) * ANNOUNCE_STEP_METERS;
  return Math.min(ANNOUNCE_MAX_METERS, Math.max(ANNOUNCE_MIN_METERS, snapped));
}

function clampAnnounceSeconds(seconds: number): number {
  const snapped = Math.round(seconds / ANNOUNCE_STEP_SECONDS) * ANNOUNCE_STEP_SECONDS;
  return Math.min(ANNOUNCE_MAX_SECONDS, Math.max(ANNOUNCE_MIN_SECONDS, snapped));
}

function clampCarbReminderMinutes(minutes: number): number {
  const snapped = Math.round(minutes / CARB_REMINDER_STEP_MINUTES) * CARB_REMINDER_STEP_MINUTES;
  return Math.min(CARB_REMINDER_MAX_MINUTES, Math.max(CARB_REMINDER_MIN_MINUTES, snapped));
}

function sanitize(raw: unknown): Preferences {
  if (typeof raw !== "object" || raw === null) return DEFAULT_PREFERENCES;
  const value = raw as Partial<Record<keyof Preferences, unknown>>;

  const rawAnnounce = Number(value.announceIntervalMeters);
  const announceIntervalMeters = Number.isFinite(rawAnnounce)
    ? clampAnnounceInterval(rawAnnounce)
    : DEFAULT_PREFERENCES.announceIntervalMeters;

  const rawAnnounceSeconds = Number(value.announceIntervalSeconds);
  const announceIntervalSeconds = Number.isFinite(rawAnnounceSeconds)
    ? clampAnnounceSeconds(rawAnnounceSeconds)
    : DEFAULT_PREFERENCES.announceIntervalSeconds;

  const announceMode: AnnounceMode =
    value.announceMode === "distance" || value.announceMode === "time"
      ? value.announceMode
      : DEFAULT_PREFERENCES.announceMode;

  const announceStyle: AnnounceStyle =
    value.announceStyle === "voz" || value.announceStyle === "vibracao"
      ? value.announceStyle
      : DEFAULT_PREFERENCES.announceStyle;

  const voiceGender: VoiceGender =
    value.voiceGender === "female" || value.voiceGender === "male"
      ? value.voiceGender
      : DEFAULT_PREFERENCES.voiceGender;

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

  const theme: ThemeMode =
    value.theme === "light" || value.theme === "dark" || value.theme === "system"
      ? value.theme
      : DEFAULT_PREFERENCES.theme;

  const vibrateOnPaceDelay =
    typeof value.vibrateOnPaceDelay === "boolean"
      ? value.vibrateOnPaceDelay
      : DEFAULT_PREFERENCES.vibrateOnPaceDelay;

  const healthDataConsent =
    typeof value.healthDataConsent === "boolean"
      ? value.healthDataConsent
      : DEFAULT_PREFERENCES.healthDataConsent;

  const appMode: AppMode =
    value.appMode === "atleta" || value.appMode === "treinador" ? value.appMode : DEFAULT_PREFERENCES.appMode;

  const carbReminderEnabled =
    typeof value.carbReminderEnabled === "boolean"
      ? value.carbReminderEnabled
      : DEFAULT_PREFERENCES.carbReminderEnabled;

  const rawCarbReminderMinutes = Number(value.carbReminderIntervalMinutes);
  const carbReminderIntervalMinutes = Number.isFinite(rawCarbReminderMinutes)
    ? clampCarbReminderMinutes(rawCarbReminderMinutes)
    : DEFAULT_PREFERENCES.carbReminderIntervalMinutes;

  const shareHeartRateWithCoach =
    typeof value.shareHeartRateWithCoach === "boolean"
      ? value.shareHeartRateWithCoach
      : DEFAULT_PREFERENCES.shareHeartRateWithCoach;

  return {
    announceIntervalMeters,
    announceIntervalSeconds,
    announceMode,
    announceStyle,
    voiceGender,
    distanceUnit,
    showAveragePaceLive,
    showCurrentKmPaceLive,
    theme,
    vibrateOnPaceDelay,
    healthDataConsent,
    appMode,
    carbReminderEnabled,
    carbReminderIntervalMinutes,
    shareHeartRateWithCoach,
  };
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

export function announceSecondsLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")} min`;
}
