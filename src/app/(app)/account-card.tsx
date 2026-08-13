"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "@/lib/auth";
import { useAuth } from "@/lib/useAuth";
import { Card, CardTitle, NoticeBadge } from "./ui";
import { AccountPrompt } from "./account-prompt";
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
            onClick={() => void signOut().then(refresh)}
            className="shrink-0 text-xs text-muted underline hover:text-bad"
          >
            Sair
          </button>
        </div>
      )}

      {status === "signed-in" && profile && (
        <Link
          href="/amigos"
          className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm"
        >
          <span className="text-muted">Amigos e convites</span>
          <span className="shrink-0 rounded-full bg-background px-3 py-1.5 text-xs font-semibold">Abrir</span>
        </Link>
      )}

      {showPrompt && status === "signed-out" && (
        <AccountPrompt onClose={() => setShowPrompt(false)} returnTo={RETURN_TO} />
      )}

      {status === "needs-handle" && account && (
        <HandlePicker account={account} onDone={() => void refresh()} />
      )}
    </Card>
  );
}
