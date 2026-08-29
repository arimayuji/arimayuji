"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * The QR-pairing landing page — a query-string route (`?codigo=`), same
 * reasoning `/convite`'s own `?h=` documents (a session code only exists at
 * runtime, no static params to pre-render).
 *
 * Lives outside the (app) route group, same as `/convite` and `/download`
 * — no AppShell chrome, reachable while signed out, since whoever scans
 * this QR may not have the app yet. Encoded into the QR itself by
 * `buildPairingUrl` (groupRuns.ts) — a plain https URL rather than a bare
 * code, so any phone's stock camera app can already scan it.
 */
export default function PairearPage() {
  return (
    <Suspense fallback={null}>
      <PairearContent />
    </Suspense>
  );
}

function PairearContent() {
  const params = useSearchParams();
  const codigo = params.get("codigo");
  const appHref = codigo ? `xanthus://parear?codigo=${encodeURIComponent(codigo)}` : null;

  useEffect(() => {
    if (!appHref) return;
    // Whoever opens this link may already have the app installed — try the
    // custom scheme once before anything else matters, same convention
    // `/convite` already uses. A browser with no handler registered for it
    // just no-ops; the rest of this page is the fallback either way.
    //
    // Confirmed not enough on its own (real device report, 2026-08-29):
    // mobile Chrome routinely swallows an automatic `location.href` to a
    // custom scheme fired with no user gesture behind it — same protection
    // that blocks auto-popups — so this silently does nothing and the
    // person is stuck looking at this page with no obvious way forward.
    // The visible "Abrir no Xanthus" button below is the real fix: a
    // genuine tap reliably triggers the OS intent where the automatic
    // attempt doesn't.
    window.location.href = appHref;
  }, [appHref]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-8">
      <Link href="/" className="font-mono text-sm font-semibold tracking-tight text-foreground">
        Xanthus
      </Link>

      <div className="mt-10 flex flex-col items-center text-center">
        <h1 className="font-mono text-2xl font-semibold text-balance">Alguém te chamou pra correr</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted text-pretty">
          {appHref
            ? "Se já tem o Xanthus instalado, toque no botão pra abrir o app direto e parear."
            : "Abra o Xanthus pra parear e ver a corrida dela ao vivo enquanto corre — se ainda não tem o app, baixa primeiro."}
        </p>

        {appHref && (
          <a
            href={appHref}
            className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-accent px-5 py-3.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
          >
            Abrir no Xanthus
          </a>
        )}

        <Link
          href="/download"
          className={
            appHref
              ? "mt-3 inline-flex w-full items-center justify-center rounded-full border border-border px-5 py-3.5 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent"
              : "mt-6 inline-flex w-full items-center justify-center rounded-full bg-accent px-5 py-3.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
          }
        >
          {appHref ? "Ainda não tenho o app" : "Baixar o Xanthus"}
        </Link>

        {codigo && (
          <p className="mt-4 text-xs leading-relaxed text-muted/80">
            Se o botão não abrir o app, cole esse código em{" "}
            <span className="font-mono font-semibold text-foreground">Correr com alguém</span> na tela
            de preparar corrida: <span className="font-mono font-semibold text-foreground">{codigo}</span>
          </p>
        )}
      </div>
    </main>
  );
}
