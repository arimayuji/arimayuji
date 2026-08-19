"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "@/lib/auth";
import { useAuth } from "@/lib/useAuth";
import { Card, CardTitle, NoticeBadge } from "./ui";
import { AccountPrompt } from "./account-prompt";
import { DeleteAccountConfirm } from "./delete-account-confirm";
import { HandlePicker } from "./handle-picker";

const RETURN_TO = "/perfil";

/**
 * Where the account state actually lives on screen — everything else
 * (AccountPrompt, HandlePicker) is a modal triggered from here. Signed-out
 * and signed-in are both first-class, quiet states; `needs-handle` opens
 * the picker automatically since it's a one-time thing right after the
 * very first login, not something to leave half-finished.
 */
export function AccountCard() {
  const { status, account, profile, refresh } = useAuth();
  const [showPrompt, setShowPrompt] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  /** True while `signOut` (a real Appwrite call) is in flight — this button has no text label to swap to a busy verb like the rest of the app does, so the icon itself spins instead. */
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    await refresh();
    setSigningOut(false);
  };

  return (
    <Card className="pr-enter">
      <CardTitle aside={<NoticeBadge>{status === "signed-in" ? "conectado" : "opcional"}</NoticeBadge>}>
        Conta
      </CardTitle>

      {status === "loading" && <p className="text-sm text-muted">Verificando…</p>}

      {status === "signed-out" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Sem conta — corrida, histórico e conquistas continuam locais normalmente.
          </p>
          <button
            type="button"
            onClick={() => setShowPrompt(true)}
            className="shrink-0 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground"
          >
            Entrar
          </button>
        </div>
      )}

      {status === "needs-handle" && account && (
        <p className="text-sm text-muted">Finalizando sua conta…</p>
      )}

      {status === "signed-in" && profile && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent/40 text-sm font-bold text-accent-foreground">
              {profile.displayName.charAt(0).toUpperCase()}
            </span>
            <div>
              <p className="text-sm font-semibold">{profile.displayName}</p>
              <p className="font-mono text-xs text-muted">@{profile.handle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            aria-label={signingOut ? "Saindo…" : "Sair"}
            title={signingOut ? "Saindo…" : "Sair"}
            className="shrink-0 rounded-full p-2 text-bad hover:bg-bad/10 disabled:opacity-60"
          >
            {signingOut ? (
              <svg viewBox="0 0 20 20" className="h-4.5 w-4.5 animate-spin" aria-hidden="true">
                <circle
                  cx="10"
                  cy="10"
                  r="7"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  fill="none"
                  strokeDasharray="24 44"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="h-4.5 w-4.5"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            )}
          </button>
        </div>
      )}

      <Link
        href="/perfil/dados"
        className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm"
      >
        <span className="text-muted">Dados pessoais — peso, dores</span>
        <span className="shrink-0 rounded-full bg-background px-3 py-1.5 text-xs font-semibold">Abrir</span>
      </Link>

      <Link
        href="/privacidade"
        className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm"
      >
        <span className="text-muted">Privacidade</span>
        <span className="shrink-0 rounded-full bg-background px-3 py-1.5 text-xs font-semibold">Abrir</span>
      </Link>

      {status === "signed-in" && profile && (
        <Link
          href="/amigos"
          className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm"
        >
          <span className="text-muted">Amigos e convites</span>
          <span className="shrink-0 rounded-full bg-background px-3 py-1.5 text-xs font-semibold">Abrir</span>
        </Link>
      )}

      {status === "signed-in" && profile && (
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="mt-3 flex w-full items-center justify-between gap-3 border-t border-border pt-4 text-left text-sm"
        >
          <span className="text-bad">Excluir conta</span>
          <span className="shrink-0 rounded-full bg-background px-3 py-1.5 text-xs font-semibold text-bad">
            Abrir
          </span>
        </button>
      )}

      {showPrompt && status === "signed-out" && (
        <AccountPrompt onClose={() => setShowPrompt(false)} returnTo={RETURN_TO} />
      )}

      {showDeleteConfirm && (
        <DeleteAccountConfirm
          onClose={() => setShowDeleteConfirm(false)}
          onDeleted={() => {
            setShowDeleteConfirm(false);
            void refresh();
          }}
        />
      )}

      {status === "needs-handle" && account && (
        <HandlePicker account={account} onDone={() => void refresh()} />
      )}
    </Card>
  );
}
