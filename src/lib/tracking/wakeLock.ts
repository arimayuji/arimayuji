/**
 * Screen Wake Lock, kept alive across app-switch/lock by reacquiring on
 * `visibilitychange` (the OS revokes the lock whenever the page is hidden,
 * even briefly). Best-effort: unsupported or denied (e.g. low battery)
 * degrades silently — the recording continues without it.
 */

export class WakeLockController {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;
  private onVisibilityChange = () => {
    if (this.wanted && document.visibilityState === "visible") {
      void this.acquire();
    }
  };

  async acquire(): Promise<void> {
    this.wanted = true;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    try {
      this.sentinel = await navigator.wakeLock.request("screen");
    } catch {
      this.sentinel = null; // e.g. battery saver mode: not fatal, just no lock
    }
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  async release(): Promise<void> {
    this.wanted = false;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    try {
      await this.sentinel?.release();
    } catch {
      // already released
    }
    this.sentinel = null;
  }
}
