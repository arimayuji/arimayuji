"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Profile } from "@/lib/auth";
import { getProfileByHandle } from "@/lib/friendships";
import { Avatar } from "../(app)/avatar";

/**
 * The invite-link landing page — a query-string route (`?h=`), not a
 * `[handle]` dynamic segment: handles are created at runtime and never
 * exist at build time, so there's no `generateStaticParams` list to give a
 * static export for a real dynamic segment (same reasoning already
 * documented on historico/detalhe's `?id=`).
 *
 * Lives outside the (app) route group, same as /download — no AppShell
 * chrome, reachable while signed out, since whoever opens this link
 * doesn't have an account (or the app) yet. Shared from account-card.tsx's
 * "Convidar amigos" as `{publicOrigin()}/convite?h={handle}`.
 */
export default function ConvitePage() {
  return (
    <Suspense fallback={null}>
      <ConviteContent />
    </Suspense>
  );
}

function ConviteContent() {
  const params = useSearchParams();
  const handle = params.get("h");
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!handle) return;

    // Whoever opens this link may already have the app installed — try the
    // custom scheme once before anything else matters. A browser with no
    // handler registered for it just no-ops (nothing to branch on here);
    // the rest of this page is the fallback either way.
    window.location.href = `xanthus://convite?h=${encodeURIComponent(handle)}`;

    let cancelled = false;
    void getProfileByHandle(handle).then((result) => {
      if (!cancelled) setProfile(result);
    });
    return () => {
      cancelled = true;
    };
  }, [handle]);

  const inviterName = profile?.publicDisplayName ?? profile?.displayName ?? null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-8">
      <Link href="/" className="font-mono text-sm font-semibold tracking-tight text-foreground">
        Xanthus
      </Link>

      <div className="mt-10 flex flex-col items-center text-center">
        {profile && <Avatar name={profile.displayName} avatarUrl={profile.avatarUrl} />}

        <h1 className="mt-4 font-mono text-2xl font-semibold text-balance">
          {inviterName ? `${inviterName} te convidou pro Xanthus` : "Você foi convidado pro Xanthus"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted text-pretty">
          App de corrida com GPS que não perde precisão com a tela travada — histórico,
          conquistas e rota, tudo local no seu aparelho.
        </p>

        <Link
          href="/download"
          className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-accent px-5 py-3.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          Baixar o Xanthus
        </Link>

        {handle && (
          <p className="mt-4 text-xs leading-relaxed text-muted/80">
            Já tem o app? Depois de abrir, adiciona{" "}
            <span className="font-mono font-semibold text-foreground">@{handle}</span> em Amigos.
          </p>
        )}
      </div>
    </main>
  );
}
