"use client";

import { useEffect, useState } from "react";
import { checkForUpdate, type UpdateInfo } from "@/lib/updateCheck";

const DISMISSED_KEY = "xanthus:update-dismissed-version";

function wasDismissed(versionCode: number): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === String(versionCode);
  } catch {
    return false;
  }
}

/**
 * Native-only: there's no Play Store here to auto-update the app, so this
 * is the whole update mechanism — check once per app open, and if the
 * server has a newer build than the one installed, offer a one-tap
 * download. Android still requires the user to confirm the install itself
 * (the same "instalar atualização" screen sideloading already shows); this
 * just removes the need to remember to go check.
 */
export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkForUpdate().then((info) => {
      if (!cancelled && info && !wasDismissed(info.versionCode)) setUpdate(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!update) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, String(update!.versionCode));
    } catch {
      // Storage disabled: the banner just reappears next open, harmless.
    }
    setUpdate(null);
  }

  return (
    <div className="mx-4 mb-3 flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12a8 8 0 0 1 13.66-5.66M20 12a8 8 0 0 1-13.66 5.66M17 3v4h-4M7 21v-4h4" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold">Nova versão disponível</p>
        <p className="text-[11px] text-muted">Versão {update.versionName} traz correções de GPS e outras melhorias.</p>
      </div>
      <a
        href={update.url}
        onClick={dismiss}
        className="shrink-0 rounded-full bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground"
      >
        Baixar
      </a>
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
