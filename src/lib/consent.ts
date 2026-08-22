/**
 * Explicit acceptance of the privacy policy, recorded on this device.
 *
 * Until this existed the app relied entirely on the operating system's own
 * permission pop-ups ("Xanthus quer usar sua localização") as its only
 * consent moment — which covers the OS's interest in the sensor, not ours in
 * the data. LGPD Art. 8 wants the acceptance to be a distinct, affirmative
 * act about *our* processing, so this is a real screen with a real button,
 * not a line of fine print under a login form.
 *
 * Versioned on purpose: a materially different policy is a different thing
 * to have agreed to, so bumping `PRIVACY_POLICY_VERSION` re-asks everyone
 * instead of silently inheriting an acceptance of the old text. Bump it only
 * for changes that alter what we collect or who receives it — a typo fix or
 * a reworded paragraph is not a new agreement, and re-prompting for those
 * trains people to dismiss the screen without reading it.
 *
 * Local-only by design. Storing "accepted" server-side would mean an account,
 * and the whole point is that this comes *before* any account exists — the
 * app tracks runs with no login at all, so the consent has to live where the
 * data does.
 */

export const PRIVACY_POLICY_VERSION = "2026-08-22";

const STORAGE_KEY = "xanthus:privacy-consent";

interface StoredConsent {
  version: string;
  acceptedAt: number;
}

/**
 * Storage being unavailable resolves to `true` (don't gate). A private
 * window or a browser with site data blocked would otherwise show an
 * un-dismissable wall on every launch — the acceptance can never be
 * recorded, so the screen would never stop coming back. Same call
 * `hasSeenRunTips()` makes for the same reason: an unstorable preference
 * must not brick the app.
 */
export function hasAcceptedPrivacy(): boolean {
  if (typeof window === "undefined") return true; // SSR: never render the gate server-side
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    return parsed.version === PRIVACY_POLICY_VERSION;
  } catch {
    return true;
  }
}

export function acceptPrivacy(): void {
  try {
    const record: StoredConsent = {
      version: PRIVACY_POLICY_VERSION,
      acceptedAt: Date.now(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Not persisted: the gate reappears next launch, which is the safe
    // direction to fail in — better to ask twice than to record an
    // acceptance that never happened.
  }
}

/** Drops the recorded acceptance — used by the logout data wipe (see `clearLocalData`), so a shared device doesn't carry one person's agreement into the next person's session. */
export function clearPrivacyConsent(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage disabled — nothing was stored to begin with.
  }
}
