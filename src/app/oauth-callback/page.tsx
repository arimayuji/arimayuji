"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { OAUTH_RETURN_TO_PARAM, getAppwrite } from "@/lib/appwrite";

/**
 * Landing page for the *web* OAuth flow's token exchange — the browser
 * equivalent of oauth-callback-listener.tsx's `appUrlOpen` handler, which
 * only fires on native.
 *
 * `startOAuthSignIn` (src/lib/auth.ts) used to send the browser through
 * Appwrite's cookie-based `createOAuth2Session` for web, on the assumption
 * that a same-origin reverse proxy (worker/index.js) would be enough to
 * keep the resulting session cookie first-party. It wasn't: the OAuth
 * provider's callback lands on Appwrite's own real endpoint
 * (nyc.cloud.appwrite.io) directly — that hop never goes through the proxy
 * at all, since it's Google redirecting the browser, not this app's own
 * code — so the session cookie `createOAuth2Session` leaves behind is still
 * set on Appwrite's site, not xanthus.app.br, and every following
 * `account.get()` reads back "guests" exactly as before the proxy existed.
 *
 * `startOAuthSignIn` now uses the same *token* flow the native branch
 * already relies on instead: Appwrite's `/account/tokens/oauth2/*` hands
 * back `userId`/`secret` as query params on this page's own URL rather than
 * a cookie, and the actual session gets created by this page's own
 * `account.createSession()` call — a same-origin request (proxied through
 * worker/index.js), so its Set-Cookie response lands correctly on
 * xanthus.app.br this time. See PROJECT-CONTEXT.md's "Web (Sala de
 * Treino...)" entry for the full story.
 *
 * Lives outside the (app) route group, same as /parear and /convite — this
 * URL only ever exists mid-redirect, never as a page anyone navigates to
 * directly with an active session already loaded.
 */
export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <OAuthCallbackContent />
    </Suspense>
  );
}

function OAuthCallbackContent() {
  const params = useSearchParams();
  const returnTo = params.get(OAUTH_RETURN_TO_PARAM) || "/perfil";
  const userId = params.get("userId");
  const secret = params.get("secret");
  const appwrite = getAppwrite();
  const [sessionFailed, setSessionFailed] = useState(false);

  useEffect(() => {
    if (!userId || !secret || !appwrite) return;
    appwrite.account
      .createSession({ userId, secret })
      .then(() => {
        // Full navigation, not a client-side route change — every screen
        // that cares whether an account exists only checks that on mount,
        // the same assumption oauth-callback-listener.tsx and PhoneSignIn
        // both already rely on.
        window.location.assign(returnTo);
      })
      .catch(() => setSessionFailed(true));
  }, [userId, secret, appwrite, returnTo]);

  const error = !userId || !secret || !appwrite || sessionFailed;
  if (!error) return null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-8 text-center">
      <h1 className="font-mono text-xl font-semibold text-balance">Não deu pra completar o login</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted text-pretty">
        Alguma coisa deu errado no meio do caminho — tenta entrar de novo.
      </p>
      <Link
        href="/perfil"
        className="mt-6 inline-flex items-center justify-center rounded-full bg-accent px-5 py-3.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
      >
        Voltar
      </Link>
    </main>
  );
}
