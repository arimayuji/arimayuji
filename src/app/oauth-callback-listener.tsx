"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { OAUTH_CALLBACK_SCHEME, OAUTH_RETURN_TO_PARAM, getAppwrite } from "@/lib/appwrite";
import { isNativePlatform } from "@/lib/platform";

/** Shared with account-prompt.tsx, which reads and clears this on mount. */
export const LAST_OAUTH_ERROR_KEY = "xanthus:last-oauth-error";

/**
 * The other half of `startOAuthSignIn` (src/lib/auth.ts): that function
 * hands the login off to the system browser and returns immediately —
 * there is no promise to await, no component guaranteed to still be
 * mounted, by the time Google/Apple actually finish and the OS calls back
 * into this app. So this listens for the whole rest of the app's
 * lifetime, mounted once here rather than inside `AccountPrompt` (which
 * the athlete may well have already dismissed by the time this fires).
 *
 * `App.addListener("appUrlOpen", ...)` fires for *any* deep link into this
 * app, not just this one — a future feature adding its own custom scheme
 * or universal link needs its own scheme check here too, the same guard
 * this already does against `OAUTH_CALLBACK_SCHEME`.
 */
export function OAuthCallbackListener() {
  useEffect(() => {
    if (!isNativePlatform() || !OAUTH_CALLBACK_SCHEME) return;

    const subscription = App.addListener("appUrlOpen", async ({ url }) => {
      // Invite links (see src/app/convite/page.tsx and account-card.tsx's
      // "Convidar amigos") — a completely separate feature from OAuth, but
      // sharing this one long-lived appUrlOpen listener rather than a
      // second `App.addListener` call, per this file's own guidance above.
      if (url.startsWith("xanthus://convite")) {
        const handle = new URL(url).searchParams.get("h");
        // Full navigation, not router.push() — this can fire on a cold
        // launch (the OS opening the app fresh off the deep link), the
        // same reasoning the OAuth branch below already documents for its
        // own window.location.assign.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        if (handle) window.location.assign(`/amigos?h=${encodeURIComponent(handle)}`);
        return;
      }

      // "Corrida em dupla" QR pairing (see src/app/parear/page.tsx and
      // groupRuns.ts's buildPairingUrl/pairRunSession) — same full-navigation
      // reasoning as the "convite" branch above.
      if (url.startsWith("xanthus://parear")) {
        const codigo = new URL(url).searchParams.get("codigo");
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        if (codigo) window.location.assign(`/run?parear=${encodeURIComponent(codigo)}`);
        return;
      }

      if (!url.startsWith(`${OAUTH_CALLBACK_SCHEME}://`)) return;

      const parsed = new URL(url);
      const returnTo = parsed.searchParams.get(OAUTH_RETURN_TO_PARAM) ?? "/perfil";

      if (parsed.host !== "oauth-success") return;
      const userId = parsed.searchParams.get("userId");
      const secret = parsed.searchParams.get("secret");
      if (!userId || !secret) return;

      const appwrite = getAppwrite();
      if (!appwrite) return;
      try {
        await appwrite.account.createSession({ userId, secret });
        // Full navigation, not a client-side route change — every screen
        // that cares whether an account exists (AccountPrompt's callers,
        // handle-picker.tsx) only checks that on mount, the same
        // assumption the web OAuth redirect and phone login both already
        // rely on (see PhoneSignIn in account-prompt.tsx).
        window.location.assign(returnTo);
      } catch (error) {
        // The token was valid but the session exchange itself failed
        // (expired, already used, network blip mid-flight) — this used to
        // be a silent catch, which is exactly why "faço login com Google e
        // volto pro app e nada acontece" (reported 2026-09-03) was
        // impossible to diagnose: by the time this fires, AccountPrompt's
        // own "Abrindo…" spinner already cleared right after Browser.open()
        // resolved, long before Google's consent screen even finished, so
        // there's no component left on screen to show an error in. Logging
        // it is the same fix already applied to friendships.ts/liveRuns.ts
        // for the same silent-catch shape — and stashing it in
        // localStorage lets the next AccountPrompt mount actually show it,
        // instead of the athlete just seeing the button sitting there
        // again with no explanation.
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[oauth-callback-listener] account.createSession falhou depois do OAuth nativo: ${message}`);
        try {
          localStorage.setItem(LAST_OAUTH_ERROR_KEY, JSON.stringify({ message, at: Date.now() }));
        } catch {
          // Storage unavailable (private mode, quota) — the console.error above already covers diagnosis.
        }
      }
    });

    return () => {
      void subscription.then((handle) => handle.remove());
    };
  }, []);

  return null;
}
