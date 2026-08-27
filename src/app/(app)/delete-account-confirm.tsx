"use client";

import { useState } from "react";
import { deleteAccount } from "@/lib/auth";
import { ModalPortal } from "./modal-portal";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/**
 * `onDeleted` runs instead of `refresh()` after success — the account no
 * longer exists, so there's no session left to reload; the caller should
 * just navigate away from any account-only screen.
 */
export function DeleteAccountConfirm({ onClose, onDeleted }: { onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await deleteAccount();
      onDeleted();
    } catch {
      setFailed(true);
      setBusy(false);
    }
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
            <span className="mx-auto mb-4 flex h-13 w-13 items-center justify-center rounded-2xl bg-bad/15 text-bad">
              <svg viewBox="0 0 24 24" className="h-6.5 w-6.5" aria-hidden="true" {...STROKE}>
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </span>

            <h2 className="text-lg font-semibold text-balance">Excluir sua conta?</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Apaga sua conta, seu perfil, amizades, vínculos de treinador(a), avaliações de
              lugares e corridas compartilhadas — tudo isso, imediatamente e sem volta. Corridas
              gravadas só neste aparelho não são afetadas.
            </p>

            {failed && (
              <p className="mt-4 rounded-xl bg-bad/10 px-3 py-2 text-xs font-medium text-bad">
                Não deu pra excluir agora. Verifique sua conexão e tente de novo.
              </p>
            )}

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-bad py-3.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? "Excluindo…" : "Sim, excluir minha conta"}
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
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
