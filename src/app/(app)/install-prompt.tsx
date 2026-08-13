"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const DISMISSED_KEY = "xanthus:install-prompt-dismissed";

/** Chrome's own `BeforeInstallPromptEvent` — not in the standard DOM lib yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's own flag — it never sets display-mode via matchMedia.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function eligibleForBanner(): boolean {
  if (isStandalone()) return false;
  try {
    return localStorage.getItem(DISMISSED_KEY) !== "1";
  } catch {
    return true; // storage disabled: show it, just won't remember a dismissal
  }
}

const noopSubscribe = () => () => {};

/**
 * Whether the banner is even allowed to appear at all, decided once from
 * browser-only state (already installed, or dismissed before) — same
 * `useSyncExternalStore` shape as `usePrefersReducedMotion` elsewhere, so
 * the client-only read never causes a hydration mismatch or a synchronous
 * `setState` inside an effect.
 */
function useEligible(): boolean {
  return useSyncExternalStore(noopSubscribe, eligibleForBanner, () => false);
}

function useIsIos(): boolean {
  return useSyncExternalStore(noopSubscribe, isIos, () => false);
}

/**
 * Chrome doesn't reliably surface its own install nudge (the mini-infobar
 * behind `beforeinstallprompt`) — it's gated on an opaque, multi-visit
 * engagement heuristic, so a real athlete can use the app for weeks and
 * never see it. This takes control instead: capture the event ourselves,
 * suppress the default UI, and show our own banner whenever the browser
 * says installing is actually possible. iOS Safari never fires that event
 * at all (there's no programmatic install there), so it gets a static
 * instruction banner instead of a button.
 */
export function InstallPrompt() {
  const eligible = useEligible();
  const showIosHint = useIsIos();
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!eligible) return;
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredEvent(event as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, [eligible]);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Storage disabled: the banner just reappears next visit, harmless.
    }
  }

  /**
   * The browser's own signal that installing actually completed — fires
   * whether the athlete used our "Instalar" button, the browser's native
   * menu, or the iOS manual steps. `eligible` alone isn't enough here: it's
   * a snapshot frozen at first mount (`useSyncExternalStore` with a
   * `noopSubscribe`), so if the install happens *during* this same session
   * — this tab never reloads into standalone mode right away — the banner
   * would otherwise keep showing until the next full page load.
   */
  useEffect(() => {
    function onAppInstalled() {
      dismiss();
    }
    window.addEventListener("appinstalled", onAppInstalled);
    return () => window.removeEventListener("appinstalled", onAppInstalled);
  }, []);

  async function handleInstall() {
    if (!deferredEvent) return;
    await deferredEvent.prompt();
    const { outcome } = await deferredEvent.userChoice;
    if (outcome === "accepted") dismiss();
    setDeferredEvent(null);
  }

  if (!eligible || dismissed || (!deferredEvent && !showIosHint)) return null;

  return (
    <div className="mx-4 mb-3 flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12m0 0-4-4m4 4 4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        {showIosHint ? (
          <p className="text-xs leading-relaxed">
            <strong className="font-semibold">Instale o Xanthus</strong> — toque em{" "}
            <strong className="font-semibold">Compartilhar</strong> e depois em{" "}
            <strong className="font-semibold">Adicionar à Tela de Início</strong>.
          </p>
        ) : (
          <>
            <p className="text-xs font-semibold">Instalar o Xanthus</p>
            <p className="text-[11px] text-muted">Abre direto da tela inicial, sem barra do navegador.</p>
          </>
        )}
      </div>
      {!showIosHint && (
        <button
          type="button"
          onClick={handleInstall}
          className="shrink-0 rounded-full bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground"
        >
          Instalar
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dispensar"
        className="shrink-0 text-muted hover:text-foreground"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
