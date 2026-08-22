"use client";

import { useState } from "react";
import { signOut } from "@/lib/auth";
import { clearLocalData } from "@/lib/localData";
import { ModalPortal } from "./modal-portal";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/**
 * Logout, with the local-data question asked out loud instead of decided for
 * the athlete.
 *
 * The two buttons exist because this app genuinely has two kinds of user
 * behind one action. Runs are recorded to the device and work with no
 * account, so for most people logging out is "switch which Google account
 * the social features use" and wiping their history would be catastrophic.
 * But the device may also be shared — the case the privacy audit raised —
 * and there the run history, weight and pain notes staying behind is the
 * problem. Neither default is right for both, so the moment of logout is
 * where the choice gets offered.
 *
 * The destructive option is the second one and is styled as the dangerous
 * path, so the safe outcome is the one a half-read tap lands on.
 */
export function SignOutConfirm({ onClose, onSignedOut }: { onClose: () => void; onSignedOut: () => void }) {
  const [busy, setBusy] = useState(false);

  const handleSignOut = async (wipe: boolean) => {
    setBusy(true);
    await signOut();
    // Ordered deliberately: the session goes first, so a failure while
    // clearing local storage still leaves the account signed out rather than
    // leaving someone logged in on a device they just asked to be wiped.
    if (wipe) await clearLocalData();
    onSignedOut();
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
        <div className="w-full max-w-sm rounded-t-3xl bg-background text-foreground sm:rounded-3xl">
          <div className="flex justify-end px-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Fechar"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-muted disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" {...STROKE}>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="px-7 pb-8 text-center">
            <span className="mx-auto mb-4 flex h-13 w-13 items-center justify-center rounded-2xl bg-accent/12 text-accent">
              <svg viewBox="0 0 24 24" className="h-6.5 w-6.5" aria-hidden="true" {...STROKE}>
                <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </span>

            <h2 className="text-lg font-semibold text-balance">Sair da conta</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted text-pretty">
              Suas corridas, tênis, peso e registros de dor ficam gravados neste aparelho, não na
              conta. Quer mantê-los aqui?
            </p>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => void handleSignOut(false)}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-accent py-3.5 text-sm font-semibold text-accent-foreground disabled:opacity-60"
              >
                {busy ? "Saindo…" : "Sair e manter neste aparelho"}
              </button>

              <button
                type="button"
                onClick={() => void handleSignOut(true)}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-bad/40 bg-bad/10 py-3.5 text-sm font-semibold text-bad disabled:opacity-60"
              >
                Sair e apagar tudo daqui
              </button>

              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-surface py-3.5 text-sm font-semibold disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-muted text-pretty">
              &quot;Apagar tudo daqui&quot; não mexe na sua conta nem no que você já compartilhou —
              pra isso, use Excluir conta.
            </p>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
