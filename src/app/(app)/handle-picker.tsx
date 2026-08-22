"use client";

import { useEffect, useState } from "react";
import {
  createProfile,
  isHandleAvailable,
  isValidHandle,
  sendWelcomeEmail,
  suggestHandle,
  type Account,
  type Profile,
} from "@/lib/auth";
import { ModalPortal } from "./modal-portal";

/**
 * Shown once, right after the very first successful OAuth login (the
 * `needs-handle` state in useAuth) — an account exists but has no profile
 * row yet. The handle is what makes someone findable to add as a friend
 * or student, so it's the one thing we ask for before anything else works.
 */
export function HandlePicker({ account, onDone }: { account: Account; onDone: (profile: Profile) => void }) {
  const [handle, setHandle] = useState(() => suggestHandle(account.name));
  const [displayName, setDisplayName] = useState(account.name);
  // The last completed availability lookup, tagged with which handle it
  // answered for — so a stale "available" from the previous handle can
  // never flash while a new one is mid-debounce (see `check` below).
  const [availability, setAvailability] = useState<{ handle: string; available: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatValid = isValidHandle(handle);
  const check: "invalid" | "checking" | "available" | "taken" = !formatValid
    ? "invalid"
    : availability?.handle !== handle
      ? "checking"
      : availability.available
        ? "available"
        : "taken";

  useEffect(() => {
    if (!formatValid) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      isHandleAvailable(handle).then((available) => {
        if (!cancelled) setAvailability({ handle, available });
      });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handle, formatValid]);

  const canSubmit = check === "available" && displayName.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const profile = await createProfile(handle, displayName.trim());
      sendWelcomeEmail();
      onDone(profile);
    } catch {
      setError("Não deu pra criar o perfil agora — tenta de novo em instantes.");
      setSubmitting(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
        <div className="w-full max-w-sm rounded-t-3xl bg-background px-7 pt-8 pb-8 text-foreground sm:rounded-3xl">
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent/40 text-xl font-bold text-accent-foreground">
            {displayName.trim().charAt(0).toUpperCase() || "?"}
          </span>

          <h2 className="text-center text-lg font-semibold">Escolhe seu @</h2>
          <p className="mx-auto mt-1.5 mb-6 max-w-[30ch] text-center text-xs leading-relaxed text-muted">
            É como outros corredores te acham pra virar amigo ou pra você seguir um professor.
          </p>

          <label className="mb-5 block">
            <span className="mb-1.5 block text-[11px] font-semibold tracking-wide text-muted uppercase">
              Seu identificador
            </span>
            <div
              className={`flex items-center gap-1 rounded-xl border bg-surface px-3.5 py-3 ${
                check === "available"
                  ? "border-good"
                  : check === "taken" || check === "invalid"
                    ? "border-bad"
                    : "border-border"
              }`}
            >
              <span className="font-semibold text-muted">@</span>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase())}
                maxLength={20}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="flex-1 bg-transparent text-sm font-semibold outline-none"
              />
              {check === "available" && (
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 text-good"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12l5 5L20 7" />
                </svg>
              )}
            </div>
            <p className={`mt-1.5 text-[11px] ${check === "taken" || check === "invalid" ? "text-bad" : "text-good"}`}>
              {check === "checking" && "Verificando…"}
              {check === "available" && "Disponível"}
              {check === "taken" && "Esse @ já existe"}
              {check === "invalid" && "3–20 letras minúsculas, números ou _"}
            </p>
          </label>

          <label className="mb-6 block">
            <span className="mb-1.5 block text-[11px] font-semibold tracking-wide text-muted uppercase">
              Nome de exibição
            </span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              className="w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-sm outline-none focus:border-accent"
            />
          </label>

          {error && <p className="mb-4 text-sm text-bad">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full rounded-xl bg-accent py-3.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {submitting ? "Criando…" : "Criar conta"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
