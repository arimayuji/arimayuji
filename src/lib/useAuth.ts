"use client";

import { useCallback, useEffect, useState } from "react";
import { checkAccount, getProfile, type Account, type Profile } from "./auth";

/**
 * `needs-handle` is its own state, not folded into `signed-in`: an OAuth
 * login always succeeds at creating an Appwrite account, but the profile
 * row (handle, display name) only exists once the person has picked one —
 * see HandlePicker. Every screen that gates on being signed in should
 * treat `needs-handle` as "not done yet", not as an error.
 */
export type AuthStatus = "loading" | "signed-out" | "needs-handle" | "signed-in";

export interface AuthState {
  status: AuthStatus;
  account: Account | null;
  profile: Profile | null;
  /**
   * True when `status` is `"signed-out"` only because the backend couldn't
   * be reached (paused project, network failure, timeout — see
   * `checkAccount()` in auth.ts), not because anyone is genuinely signed
   * out. `status` itself deliberately still resolves to `"signed-out"` so
   * every existing `status === "signed-out"` check across the app keeps
   * behaving exactly as before; only the one surface a person actually
   * reads before deciding to hit "Entrar" (`AccountCard`) needs to tell the
   * two apart.
   */
  backendUnavailable: boolean;
}

async function loadAuthState(): Promise<AuthState> {
  const { account, backendUnavailable } = await checkAccount();
  if (!account) return { status: "signed-out", account: null, profile: null, backendUnavailable };
  const profile = await getProfile(account.id);
  return { status: profile ? "signed-in" : "needs-handle", account, profile, backendUnavailable: false };
}

/**
 * Module-level cache, shared by every mounted `useAuth()` — not per-component
 * state. Before this, each screen's own call started at `"loading"` and
 * re-ran `getCurrentAccount()`/`getProfile()` on its own mount, so switching
 * tabs (Feed, Perfil, the account modal...) re-verified the same account
 * over and over, visibly flashing back to "loading" every time even though
 * nothing had changed. Now the first `useAuth()` anywhere in the app does
 * the real check; every later mount (including a second one racing the
 * first — `inFlight` dedupes that) reads the cached result straight away.
 * `notify()` is also what `refresh()` calls, so signing out in one screen
 * (account-card.tsx) or finishing onboarding (HandlePicker) updates every
 * other mounted `useAuth()` immediately, not just the caller's own state.
 */
let cachedState: AuthState | null = null;
let inFlight: Promise<AuthState> | null = null;
const listeners = new Set<(state: AuthState) => void>();

function notify(state: AuthState) {
  cachedState = state;
  listeners.forEach((listener) => listener(state));
}

function ensureLoaded(): void {
  if (cachedState || inFlight) return;
  inFlight = loadAuthState().then((state) => {
    inFlight = null;
    notify(state);
    return state;
  });
}

export function useAuth(): AuthState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<AuthState>(
    () => cachedState ?? { status: "loading", account: null, profile: null, backendUnavailable: false },
  );

  const refresh = useCallback(() => loadAuthState().then(notify), []);

  useEffect(() => {
    listeners.add(setState);
    ensureLoaded();
    return () => {
      listeners.delete(setState);
    };
  }, []);

  return { ...state, refresh };
}
