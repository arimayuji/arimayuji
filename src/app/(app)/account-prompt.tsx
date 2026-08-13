"use client";

import { signInWithGoogle, signInWithMicrosoft } from "@/lib/auth";
import { ModalPortal } from "./modal-portal";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const UNLOCKS = [
  { title: "Avaliar lugares", body: "sua nota fica com seu nome, pra outros corredores confiarem" },
  { title: "Adicionar amigos", body: "pra ver as corridas que eles decidirem compartilhar" },
  { title: "Professor/aluno", body: "seu treinador acompanha seus treinos de verdade" },
];

/**
 * Shown the moment something genuinely needs an account (rating a place,
 * adding a friend/coach) — never on load, never for recording a run or
 * viewing history, which stay account-free. `returnTo` is the path the
 * OAuth provider sends the browser back to; it must already be registered
 * as an Appwrite "platform" hostname. Phone/SMS sign-in was dropped —
 * every remaining provider is OAuth, which always completes with a full
 * page reload at `returnTo`, so there's no in-page "just signed in" moment
 * for a caller to hook into.
 */
export function AccountPrompt({ onClose, returnTo }: { onClose: () => void; returnTo: string }) {
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
        <div className="w-full max-w-sm rounded-t-3xl bg-background text-foreground sm:rounded-3xl">
          <div className="flex justify-end px-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-muted"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" {...STROKE}>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="px-7 pb-8 text-center">
            <span className="mx-auto mb-4 flex h-13 w-13 items-center justify-center rounded-2xl bg-accent/15 text-accent">
              <svg viewBox="0 0 24 24" className="h-6.5 w-6.5" aria-hidden="true" {...STROKE}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>

            <h2 className="text-lg font-semibold text-balance">Isso aqui precisa de uma conta</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Só pra essa parte — gravar corrida, ver seu histórico e suas conquistas continuam
              funcionando sem login, do mesmo jeito de sempre.
            </p>

            <ul className="mt-6 flex flex-col gap-3 text-left">
              {UNLOCKS.map((item) => (
                <li key={item.title} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-good/15 text-good">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3 w-3"
                      aria-hidden="true"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  </span>
                  <span className="text-xs leading-relaxed">
                    <strong className="font-semibold">{item.title}</strong> — {item.body}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => signInWithGoogle(returnTo)}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-surface py-3.5 text-sm font-semibold"
              >
                <GoogleIcon />
                Continuar com Google
              </button>

              <button
                type="button"
                onClick={() => signInWithMicrosoft(returnTo)}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-surface py-3.5 text-sm font-semibold"
              >
                <MicrosoftIcon />
                Continuar com Microsoft
              </button>
            </div>

            <p className="mt-5 border-t border-border pt-4 text-[11px] leading-relaxed text-muted">
              <strong className="font-semibold text-foreground">O resto do app continua 100% offline.</strong>{" "}
              Não pedimos conta pra correr, só pra essas três coisas específicas.
            </p>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.38z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.62l4 3.1C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
      <rect x="2" y="2" width="9.2" height="9.2" fill="#F25022" />
      <rect x="12.8" y="2" width="9.2" height="9.2" fill="#7FBA00" />
      <rect x="2" y="12.8" width="9.2" height="9.2" fill="#00A4EF" />
      <rect x="12.8" y="12.8" width="9.2" height="9.2" fill="#FFB900" />
    </svg>
  );
}
