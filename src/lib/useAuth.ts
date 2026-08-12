"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentAccount, getProfile, type Account, type Profile } from "./auth";

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
}

async function loadAuthState(): Promise<AuthState> {
  const account = await getCurrentAccount();
  if (!account) return { status: "signed-out", account: null, profile: null };
  const profile = await getProfile(account.id);
  return { status: profile ? "signed-in" : "needs-handle", account, profile };
}

export function useAuth(): AuthState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<AuthState>({ status: "loading", account: null, profile: null });

  const refresh = useCallback(() => loadAuthState().then(setState), []);

  useEffect(() => {
    let cancelled = false;
    loadAuthState().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { ...state, refresh };
}
