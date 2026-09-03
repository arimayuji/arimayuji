"use client";

import { useState, type FormEvent } from "react";
import {
  PHONE_AUTH_ENABLED,
  sendPhoneOtp,
  signInWithApple,
  signInWithGoogle,
  verifyPhoneOtp,
} from "@/lib/auth";
import { LAST_OAUTH_ERROR_KEY } from "@/app/oauth-callback-listener";
import { ModalPortal } from "./modal-portal";

/**
 * A failed native OAuth round trip (oauth-callback-listener.tsx's
 * `appUrlOpen` handler) finishes long after this modal's own "Abrindo…"
 * state already cleared — Browser.open() resolves the instant the system
 * browser opens, not when the athlete finishes with it — so there's never
 * a component left mounted to show that failure in directly. Reading it
 * back from localStorage here, on the next time this modal opens, is what
 * turns "nada acontece" into an actual message instead of just silence.
 * Ignored if older than this — a stale error from an unrelated past
 * attempt shouldn't resurface on a login that has nothing to do with it.
 */
const STALE_OAUTH_ERROR_MS = 15 * 60 * 1000;

/**
 * Lazy `useState` initializer, not an effect — this only ever needs to run
 * once, on this component's very first render, so there's no "external
 * system" here for an effect to subscribe to (and setState-from-an-effect
 * with nothing to subscribe to is exactly the cascading-render smell React
 * warns about). Reads and clears in the same pass, so a stored error is
 * shown at most once.
 */
function readLastOAuthError(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_OAUTH_ERROR_KEY);
    if (!raw) return null;
    localStorage.removeItem(LAST_OAUTH_ERROR_KEY);
    const { message, at } = JSON.parse(raw) as { message: string; at: number };
    return Date.now() - at <= STALE_OAUTH_ERROR_MS ? message : null;
  } catch {
    return null;
  }
}

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
 * as an Appwrite "platform" hostname.
 *
 * Phone/SMS sign-in (behind `PHONE_AUTH_ENABLED`, off until an SMS
 * provider is configured — see auth.ts) doesn't fit that same "click and
 * the browser leaves" shape Google/Apple get for free from OAuth: there's
 * no consent screen to redirect through, so completing it is just a
 * fetch call that resolves in place. `PhoneSignIn` below forces the same
 * end state anyway — a full navigation to `returnTo` once the code
 * verifies — so every caller here still only has to handle "the modal
 * closed, go check for a session," never a second "logged in in-place"
 * case.
 */
export function AccountPrompt({ onClose, returnTo }: { onClose: () => void; returnTo: string }) {
  const [phoneStep, setPhoneStep] = useState<"none" | "phone" | "code">("none");
  /**
   * `signInWithApple`/`signInWithGoogle` used to be fired with `void` and no
   * `.catch()` — any failure (misconfigured env, a thrown error opening the
   * system browser) was a silent no-op from the athlete's point of view,
   * indistinguishable from five different real causes with no way to tell
   * which without a debugger attached to the device. Surfacing whatever
   * `startOAuthSignIn` returns here is the whole fix for that leg.
   *
   * Initialized from `readLastOAuthError()`, not just `null` — the native
   * flow's *other* leg (oauth-callback-listener.tsx's `appUrlOpen` handler)
   * fails well after this modal's `handleOAuth` has already returned, so
   * there's nothing here to catch it live; this only ever surfaces it on
   * the athlete's next attempt.
   */
  const [oauthError, setOauthError] = useState<string | null>(readLastOAuthError);
  /**
   * Which provider button is mid-flight — `startOAuthSignIn` genuinely
   * awaits something before the browser leaves (a native `Browser.open`
   * round trip, or just the `createOAuth2Session` call on web) and used to
   * leave both buttons sitting there with no sign anything happened, which
   * reads exactly like the tap did nothing on a slower connection.
   */
  const [oauthProvider, setOauthProvider] = useState<"apple" | "google" | null>(null);

  async function handleOAuth(provider: "apple" | "google", signIn: (returnTo: string) => Promise<string | null>) {
    setOauthError(null);
    setOauthProvider(provider);
    const error = await signIn(returnTo);
    setOauthProvider(null);
    if (error) setOauthError(error);
  }

  if (phoneStep !== "none") {
    return (
      <PhoneSignIn
        step={phoneStep}
        returnTo={returnTo}
        onClose={onClose}
        onBack={() => setPhoneStep(phoneStep === "code" ? "phone" : "none")}
        onCodeSent={() => setPhoneStep("code")}
      />
    );
  }

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

            <ul className="mt-6 flex flex-col gap-3.5 text-left">
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

            <div className="mt-6 flex flex-col gap-3">
              {/* Listed first — not just alphabetical: App Store guideline
                  4.8 expects Sign in with Apple at least as prominent as
                  any other third-party login offered alongside it. */}
              <button
                type="button"
                onClick={() => void handleOAuth("apple", signInWithApple)}
                disabled={oauthProvider !== null}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-surface py-3.5 text-sm font-semibold disabled:opacity-60"
              >
                <AppleIcon />
                {oauthProvider === "apple" ? "Abrindo…" : "Continuar com Apple"}
              </button>

              <button
                type="button"
                onClick={() => void handleOAuth("google", signInWithGoogle)}
                disabled={oauthProvider !== null}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-surface py-3.5 text-sm font-semibold disabled:opacity-60"
              >
                <GoogleIcon />
                {oauthProvider === "google" ? "Abrindo…" : "Continuar com Google"}
              </button>

              {oauthError && (
                <p role="alert" className="rounded-lg bg-bad/10 px-3 py-2 text-left text-xs text-bad">
                  {oauthError}
                </p>
              )}

              {PHONE_AUTH_ENABLED && (
                <button
                  type="button"
                  onClick={() => setPhoneStep("phone")}
                  className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-surface py-3.5 text-sm font-semibold"
                >
                  <PhoneIcon />
                  Continuar com telefone
                </button>
              )}
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

const BRAZIL_DIAL_CODE = "+55";

/** Strips everything but digits, prefixing +55 unless the athlete already typed their own country code (a leading "+") — Appwrite's phone login needs strict E.164. */
function toE164(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("+")) return `+${trimmed.slice(1).replace(/\D/g, "")}`;
  return `${BRAZIL_DIAL_CODE}${trimmed.replace(/\D/g, "")}`;
}

/**
 * The two-step phone flow `AccountPrompt` swaps in for `PHONE_AUTH_ENABLED`.
 * Its own modal rather than a state machine layered into `AccountPrompt`'s
 * markup — the two steps (number, then code) share almost no layout with
 * the provider list they replace, and keeping them as one big conditional
 * render would mean threading `phone`/`code`/`userId` state through a
 * component that doesn't otherwise need any state at all.
 */
function PhoneSignIn({
  step,
  returnTo,
  onClose,
  onBack,
  onCodeSent,
}: {
  step: "phone" | "code";
  returnTo: string;
  onClose: () => void;
  onBack: () => void;
  onCodeSent: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  /** Set once `sendPhoneOtp` resolves — Appwrite may hand back a *different* ID than the one this device requested, when the phone number already belongs to an existing account (see auth.ts). `verifyPhoneOtp` has to use this one, not a freshly-generated one. */
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setUserId(await sendPhoneOtp(toE164(phone)));
      onCodeSent();
    } catch {
      setError("Não deu pra enviar o código — confere o número e tenta de novo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode(event: FormEvent) {
    event.preventDefault();
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      await verifyPhoneOtp(userId, code);
      // Full navigation, same end state an OAuth round trip lands on —
      // see the "in place" note on AccountPrompt above for why this
      // doesn't just close the modal and call it done.
      window.location.assign(returnTo);
    } catch {
      setError("Código incorreto ou expirado — confere e tenta de novo.");
      setBusy(false);
    }
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
        <div className="w-full max-w-sm rounded-t-3xl bg-background text-foreground sm:rounded-3xl">
          <div className="flex items-center justify-between px-4 pt-4">
            <button
              type="button"
              onClick={onBack}
              aria-label="Voltar"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-muted"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" {...STROKE}>
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
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

          <div className="px-7 pb-8">
            {step === "phone" ? (
              <form onSubmit={handleSendCode}>
                <h2 className="text-center text-lg font-semibold text-balance">Qual seu telefone?</h2>
                <p className="mt-2 text-center text-sm leading-relaxed text-muted">
                  Manda um código por SMS pra confirmar que é você.
                </p>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="(11) 99999-9999"
                  className="mt-6 w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-center text-base outline-none focus:border-accent"
                />
                <p className="mt-2 text-center text-xs text-muted">
                  Sem código do país? Assumimos Brasil ({BRAZIL_DIAL_CODE}).
                </p>
                {error && <p className="mt-3 text-center text-xs text-bad">{error}</p>}
                <button
                  type="submit"
                  disabled={busy || !phone.trim()}
                  className="mt-6 w-full rounded-xl bg-accent py-3.5 text-sm font-semibold text-accent-foreground disabled:opacity-60"
                >
                  {busy ? "Enviando…" : "Enviar código"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode}>
                <h2 className="text-center text-lg font-semibold text-balance">Digite o código</h2>
                <p className="mt-2 text-center text-sm leading-relaxed text-muted">
                  Mandamos um SMS com um código de 6 dígitos.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="mt-6 w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-center font-mono text-2xl tracking-[0.3em] outline-none focus:border-accent"
                />
                {error && <p className="mt-3 text-center text-xs text-bad">{error}</p>}
                <button
                  type="submit"
                  disabled={busy || code.length !== 6}
                  className="mt-6 w-full rounded-xl bg-accent py-3.5 text-sm font-semibold text-accent-foreground disabled:opacity-60"
                >
                  {busy ? "Confirmando…" : "Confirmar"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true" {...STROKE}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18h3" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true" fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.417 2.196-1.244 3.06-.9.94-2.276 1.657-3.436 1.564-.144-1.096.437-2.24 1.216-3.024.87-.887 2.34-1.545 3.464-1.6zM20.5 17.313c-.505 1.157-.747 1.674-1.396 2.703-.907 1.44-2.187 3.234-3.774 3.246-1.412.012-1.775-.917-3.69-.906-1.916.012-2.317.923-3.73.911-1.586-.012-2.798-1.633-3.706-3.073-2.54-4.01-2.808-8.716-1.24-11.222 1.113-1.78 2.874-2.821 4.531-2.821 1.686 0 2.747.938 4.142.938 1.353 0 2.178-.94 4.132-.94 1.478 0 3.042.804 4.157 2.194-3.653 2.002-3.06 7.216.574 8.97z" />
    </svg>
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
