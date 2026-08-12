/**
 * Spotify auth: Authorization Code + PKCE, entirely client-side.
 *
 * Requires a Client ID from a Spotify app the product owner registers at
 * developer.spotify.com/dashboard — set as NEXT_PUBLIC_SPOTIFY_CLIENT_ID.
 * The Redirect URI configured there must match `${origin}/spotify/callback`
 * for every origin this runs on (localhost during dev, the deployed URL in
 * production) — Spotify allows registering more than one.
 *
 * Scopes: `user-read-currently-playing` (read what's playing — this never
 * controls playback, that needs Premium and is out of scope) plus
 * `playlist-modify-private` (create a private playlist from a run's tracks).
 * Deliberately private-only — never `playlist-modify-public` — since the
 * athlete hasn't opted into making anything public.
 *
 * Changing the requested scopes means accounts connected under the old,
 * narrower scope won't have the new permission until they reconnect — that's
 * expected, no special migration; `createPlaylistFromRun` just fails
 * gracefully for them until then.
 */

import { generateCodeChallenge, generateRandomToken } from "./pkce";

const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const SCOPES = "user-read-currently-playing playlist-modify-private";

const TOKENS_KEY = "xanthus:spotify-tokens";
const PKCE_SESSION_KEY = "xanthus:spotify-pkce";

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export function isConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID);
}

function getClientId(): string {
  const id = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  if (!id) throw new Error("NEXT_PUBLIC_SPOTIFY_CLIENT_ID não está configurado.");
  return id;
}

function getRedirectUri(): string {
  return `${window.location.origin}/spotify/callback`;
}

function loadTokens(): StoredTokens | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TOKENS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.accessToken === "string" &&
      typeof parsed?.refreshToken === "string" &&
      typeof parsed?.expiresAt === "number"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveTokens(tokens: StoredTokens): void {
  try {
    window.localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    // Storage disabled: the connection just won't persist across reloads.
  }
}

export function isConnected(): boolean {
  return loadTokens() !== null;
}

export function disconnect(): void {
  try {
    window.localStorage.removeItem(TOKENS_KEY);
  } catch {
    // nothing to do
  }
}

/** Kicks off the redirect to Spotify's consent screen. Never resolves — navigates away. */
export async function startAuthorization(): Promise<void> {
  const verifier = generateRandomToken(48);
  const state = generateRandomToken(16);
  const challenge = await generateCodeChallenge(verifier);

  window.sessionStorage.setItem(PKCE_SESSION_KEY, JSON.stringify({ verifier, state }));

  const params = new URLSearchParams({
    response_type: "code",
    client_id: getClientId(),
    scope: SCOPES,
    redirect_uri: getRedirectUri(),
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  // External redirect (Spotify's own domain) — not a Next.js route, so
  // location.assign is correct here, not a router navigation.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`${AUTHORIZE_URL}?${params.toString()}`);
}

export type CallbackResult = { ok: true } | { ok: false; reason: string };

/** Called from /spotify/callback with the URL's search params. */
export async function completeAuthorization(
  searchParams: URLSearchParams,
): Promise<CallbackResult> {
  const error = searchParams.get("error");
  if (error) return { ok: false, reason: error };

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) return { ok: false, reason: "missing_code" };

  const raw = window.sessionStorage.getItem(PKCE_SESSION_KEY);
  window.sessionStorage.removeItem(PKCE_SESSION_KEY);
  if (!raw) return { ok: false, reason: "missing_session" };

  const { verifier, state: expectedState } = JSON.parse(raw) as {
    verifier: string;
    state: string;
  };
  if (state !== expectedState) return { ok: false, reason: "state_mismatch" };

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
    client_id: getClientId(),
    code_verifier: verifier,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return { ok: false, reason: `token_exchange_${res.status}` };

  const json = await res.json();
  saveTokens({
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  });
  return { ok: true };
}

async function refreshAccessToken(tokens: StoredTokens): Promise<StoredTokens | null> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
    client_id: getClientId(),
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;

  const json = await res.json();
  const next: StoredTokens = {
    accessToken: json.access_token,
    // Spotify doesn't always send a new refresh_token back — keep the old one when absent.
    refreshToken: json.refresh_token ?? tokens.refreshToken,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  saveTokens(next);
  return next;
}

/** Returns a usable access token, refreshing first if it's expired or about to be. Null if not connected or refresh failed. */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = loadTokens();
  if (!tokens) return null;

  const EXPIRY_MARGIN_MS = 60_000;
  if (Date.now() < tokens.expiresAt - EXPIRY_MARGIN_MS) return tokens.accessToken;

  const refreshed = await refreshAccessToken(tokens);
  if (!refreshed) {
    disconnect(); // refresh token is dead: nothing left to do but ask the athlete to reconnect
    return null;
  }
  return refreshed.accessToken;
}
