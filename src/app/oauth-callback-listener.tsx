"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { OAUTH_CALLBACK_SCHEME, OAUTH_RETURN_TO_PARAM, getAppwrite } from "@/lib/appwrite";
import { isNativePlatform } from "@/lib/platform";

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
      } catch {
        // The token was valid but the session exchange itself failed
        // (expired, already used, network blip mid-flight) — nothing
        // useful to recover here beyond leaving the athlete where they
        // were; they see the sign-in button still sitting there and can
        // just try again.
      }
    });

    return () => {
      void subscription.then((handle) => handle.remove());
    };
  }, []);

  return null;
}
