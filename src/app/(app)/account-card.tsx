"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { uploadAvatar } from "@/lib/avatar";
import { publicOrigin } from "@/lib/platform";
import { useShareSupport } from "@/lib/share";
import { useAuth } from "@/lib/useAuth";
import { Avatar } from "./avatar";
import { Card, CardTitle, NoticeBadge } from "./ui";
import { AccountPrompt } from "./account-prompt";
import { DeleteAccountConfirm } from "./delete-account-confirm";
import { HandlePicker } from "./handle-picker";
import { SignOutConfirm } from "./sign-out-confirm";

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
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const shareSupport = useShareSupport();
  const [inviteCopied, setInviteCopied] = useState(false);

  async function handleInvite(handle: string) {
    const url = `${publicOrigin()}/convite?h=${encodeURIComponent(handle)}`;
    const text = "Corre comigo no Xanthus?";
    if (shareSupport === "share") {
      try {
        await navigator.share({ title: "Xanthus", text, url });
        return;
      } catch {
        // Cancelled or failed — clipboard below is the fallback either way.
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      // Nothing else to fall back to — the link is still visible nowhere else, but this is the same dead end share.ts's clipboard path already accepts elsewhere.
    }
  }

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadingAvatar(true);
    await uploadAvatar(file);
    await refresh();
    setUploadingAvatar(false);
  }

  return (
    // `lg:` here is a deliberately different, denser register — a settings
    // list row (label left, control right, tight border, square-ish
    // corners) instead of the touch-sized rounded mobile card. Same
    // handlers/state either way; only the shape changes. See PROJECT-
    // CONTEXT.md's "web ser algo diferente do nativo" — this is the one
    // place besides Tema (perfil/page.tsx) that renders on the coach's
    // desktop surface at all, so it's the one place this pattern exists
    // today; not meant to imply every `Card` in the app should look this
    // way, most never render at `lg:` in the first place.
    <Card className="pr-enter lg:rounded-lg lg:p-4">
      <CardTitle aside={<NoticeBadge className="lg:rounded-md">{status === "signed-in" ? "conectado" : "opcional"}</NoticeBadge>}>
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
            className="shrink-0 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground lg:rounded-md lg:px-3 lg:py-1.5"
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
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              aria-label="Trocar foto de perfil"
              className="relative rounded-full disabled:opacity-60"
            >
              <Avatar name={profile.displayName} avatarUrl={profile.avatarUrl} />
              <span className="absolute -right-0.5 -bottom-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border-2 border-background bg-accent text-accent-foreground">
                <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7h3.5l1.5-2h8l1.5 2H21v13H3z" />
                  <circle cx="12" cy="13.5" r="3.5" />
                </svg>
              </span>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <div>
              <p className="text-sm font-semibold">{profile.displayName}</p>
              <p className="font-mono text-xs text-muted">@{profile.handle}</p>
            </div>
          </div>
          {/* Opens the confirm sheet rather than signing out on the spot: the sheet is where the "keep or wipe the runs on this device" choice gets asked, and that question is too consequential to skip past on a single tap. */}
          <button
            type="button"
            onClick={() => setShowSignOutConfirm(true)}
            aria-label="Sair"
            title="Sair"
            className="shrink-0 rounded-full p-2 text-bad hover:bg-bad/10 lg:rounded-md"
          >
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
          </button>
        </div>
      )}

      <Link
        href="/perfil/dados"
        className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm lg:mt-2.5 lg:pt-2.5"
      >
        <span className="text-muted">Dados pessoais — peso, dores</span>
        <span className="shrink-0 rounded-full bg-background px-3 py-1.5 text-xs font-semibold lg:rounded-md lg:px-2.5 lg:py-1">Abrir</span>
      </Link>

      <Link
        href="/privacidade"
        className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm lg:mt-2.5 lg:pt-2.5"
      >
        <span className="text-muted">Privacidade</span>
        <span className="shrink-0 rounded-full bg-background px-3 py-1.5 text-xs font-semibold lg:rounded-md lg:px-2.5 lg:py-1">Abrir</span>
      </Link>

      {status === "signed-in" && profile && (
        <Link
          href="/amigos"
          className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm lg:mt-2.5 lg:pt-2.5"
        >
          <span className="text-muted">Amigos e convites</span>
          <span className="shrink-0 rounded-full bg-background px-3 py-1.5 text-xs font-semibold lg:rounded-md lg:px-2.5 lg:py-1">Abrir</span>
        </Link>
      )}

      {status === "signed-in" && profile && (
        <button
          type="button"
          onClick={() => void handleInvite(profile.handle)}
          className="mt-3 flex w-full items-center justify-between gap-3 border-t border-border pt-4 text-left text-sm lg:mt-2.5 lg:pt-2.5"
        >
          <span className="text-muted">Convidar amigos</span>
          <span className="shrink-0 rounded-full bg-background px-3 py-1.5 text-xs font-semibold lg:rounded-md lg:px-2.5 lg:py-1">
            {inviteCopied ? "Link copiado" : shareSupport === "share" ? "Compartilhar" : "Copiar link"}
          </span>
        </button>
      )}

      {status === "signed-in" && profile && (
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="mt-3 flex w-full items-center justify-between gap-3 border-t border-border pt-4 text-left text-sm lg:mt-2.5 lg:pt-2.5"
        >
          <span className="text-bad">Excluir conta</span>
          <span className="shrink-0 rounded-full bg-background px-3 py-1.5 text-xs font-semibold text-bad lg:rounded-md lg:px-2.5 lg:py-1">
            Abrir
          </span>
        </button>
      )}

      {showPrompt && status === "signed-out" && (
        <AccountPrompt onClose={() => setShowPrompt(false)} returnTo={RETURN_TO} />
      )}

      {showSignOutConfirm && (
        <SignOutConfirm
          onClose={() => setShowSignOutConfirm(false)}
          onSignedOut={() => {
            setShowSignOutConfirm(false);
            void refresh();
          }}
        />
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
