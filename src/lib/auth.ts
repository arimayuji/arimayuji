/**
 * Account/profile helpers on top of src/lib/appwrite.ts. Every function
 * here degrades to a no-op or `null` when Appwrite isn't configured
 * (`getAppwrite()` returns null) — same convention as the rest of the
 * backend layer, since recording a run and viewing history never depend
 * on any of this.
 */
import { ExecutionMethod, ID, type Models, OAuthProvider, Permission, Query, Role } from "appwrite";
import {
  APPWRITE_DATABASE_ID,
  DELETE_ACCOUNT_FUNCTION_ID,
  SEND_WELCOME_EMAIL_FUNCTION_ID,
  TABLES,
  getAppwrite,
} from "./appwrite";

export interface Profile extends Models.Row {
  handle: string;
  displayName: string;
  avatarUrl?: string;
}

const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

/**
 * Appwrite columns don't support a regex/check constraint the way the
 * original Postgres version of this schema did — this is enforced only
 * here, before a row is ever written.
 */
export function isValidHandle(handle: string): boolean {
  return HANDLE_PATTERN.test(handle);
}

/** A safe starting suggestion from an OAuth display name — still needs `isHandleAvailable` before it's actually usable. */
export function suggestHandle(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents (José -> Jose)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  const padded = slug.length >= 3 ? slug : `${slug}runner`.slice(0, 20);
  return padded.slice(0, 20);
}

/**
 * Redirects the browser to the provider's consent screen — there is no
 * meaningful return value, since a successful login lands back on
 * `returnTo` as a fresh page load. `returnTo` must be a path already
 * registered as an Appwrite "platform" hostname (see the Appwrite
 * console), same origin as the app itself.
 */
export function signInWithGoogle(returnTo: string): void {
  const appwrite = getAppwrite();
  if (!appwrite) return;
  const url = `${window.location.origin}${returnTo}`;
  appwrite.account.createOAuth2Session({ provider: OAuthProvider.Google, success: url, failure: url });
}

/**
 * Required alongside Google (App Store guideline 4.8: any third-party
 * login needs an equivalent Sign in with Apple option). Same OAuth2
 * redirect flow as Google — Appwrite's "Apple" provider talks to Apple's
 * own `appleid.apple.com` authorize endpoint over the web, the same
 * mechanism a browser-based Sign in with Apple integration uses, so this
 * needs no native iOS entitlement or SDK on top of what Google already
 * uses here.
 */
export function signInWithApple(returnTo: string): void {
  const appwrite = getAppwrite();
  if (!appwrite) return;
  const url = `${window.location.origin}${returnTo}`;
  appwrite.account.createOAuth2Session({ provider: OAuthProvider.Apple, success: url, failure: url });
}

/**
 * Off until an SMS provider (Twilio, MSG91, Vonage or TextMagic) is
 * actually wired up — that's an Appwrite Console setting (Auth ->
 * Settings -> SMS), not a repo/env secret, so there's no `.env.local` key
 * to add for this one. `sendPhoneOtp`/`verifyPhoneOtp` below already work
 * end to end against that setting the moment it exists; flip this to
 * `true` then, nothing else needs to change. See PROJECT-CONTEXT.md for
 * the cost estimate that's the reason it's off (~US$0.125/verification
 * for a Brazilian number via Twilio).
 */
export const PHONE_AUTH_ENABLED = false;

/**
 * Starts a passwordless phone login: Appwrite texts a 6-digit code to
 * `phone` (E.164, e.g. "+5511999998888") and returns the token's `userId`
 * — pass it straight into `verifyPhoneOtp` along with whatever code the
 * athlete types back in. A brand-new number gets a fresh account
 * automatically; a number already tied to one just gets signed into it —
 * either way the `userId` in the response (not `ID.unique()`'s own value)
 * is the one that matters, since Appwrite silently ignores the requested
 * ID once the phone number already resolves to an existing account.
 */
export async function sendPhoneOtp(phone: string): Promise<string> {
  const appwrite = getAppwrite();
  if (!appwrite) throw new Error("Appwrite não configurado");
  const token = await appwrite.account.createPhoneToken({ userId: ID.unique(), phone });
  return token.userId;
}

/**
 * Completes the login started by `sendPhoneOtp`. Unlike
 * `signInWithGoogle`/`signInWithApple`, this never navigates the browser
 * away — there's no OAuth consent screen to redirect through — so the
 * caller is the one that has to move on afterwards (e.g. `window.location
 * .assign(returnTo)`, matching what a completed OAuth round trip would
 * have landed on) once this promise resolves; nothing here does it
 * automatically. Uses the current (non-deprecated) `createSession`
 * endpoint rather than the older `updatePhoneSession`, which does the
 * same thing but is marked deprecated as of Appwrite 1.6.
 */
export async function verifyPhoneOtp(userId: string, secret: string): Promise<void> {
  const appwrite = getAppwrite();
  if (!appwrite) throw new Error("Appwrite não configurado");
  await appwrite.account.createSession({ userId, secret });
}

export async function signOut(): Promise<void> {
  const appwrite = getAppwrite();
  if (!appwrite) return;
  await appwrite.account.deleteSession({ sessionId: "current" });
}

/**
 * Deletes the account, profile and every row this user owns elsewhere
 * (friendships, coach relationships, ratings, shared runs, live runs,
 * comments) — see appwrite-functions/delete-account. The Appwrite client
 * SDK has no self-delete on Account (only deleteIdentity/deleteSession),
 * since removing a user record needs the privileged Users API; the
 * Function runs that with Appwrite's own dynamic per-execution key,
 * scoped to this one call, identifying the caller from their own active
 * session — nothing about who's deleting is passed in by the client.
 * Throws on failure so the caller can show an error instead of silently
 * leaving the account intact; on success there's no session left to sign
 * out of; the caller should just redirect away from any account-only screen.
 */
export async function deleteAccount(): Promise<void> {
  const appwrite = getAppwrite();
  if (!appwrite) return;
  const execution = await appwrite.functions.createExecution({
    functionId: DELETE_ACCOUNT_FUNCTION_ID,
    method: ExecutionMethod.POST,
  });
  // A synchronous execution "succeeds" (no thrown exception) even when the
  // function's own handler returned an error response — the invocation
  // itself still completed. Check the function's actual response status,
  // not just that Appwrite managed to run it.
  if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300) {
    throw new Error(`Falha ao excluir conta (status ${execution.responseStatusCode})`);
  }
}

export interface Account {
  id: string;
  name: string;
}

/** Null with no active session — not an error, the normal "signed out" state. */
export async function getCurrentAccount(): Promise<Account | null> {
  const appwrite = getAppwrite();
  if (!appwrite) return null;
  try {
    const user = await appwrite.account.get();
    return { id: user.$id, name: user.name };
  } catch {
    return null;
  }
}

/** Null means this account exists but hasn't picked a handle yet — the caller should show the handle picker, not treat it as an error. */
export async function getProfile(userId: string): Promise<Profile | null> {
  const appwrite = getAppwrite();
  if (!appwrite) return null;
  try {
    return await appwrite.tablesDB.getRow<Profile>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.profiles,
      rowId: userId,
    });
  } catch {
    return null;
  }
}

export async function isHandleAvailable(handle: string): Promise<boolean> {
  const appwrite = getAppwrite();
  if (!appwrite) return false;
  const result = await appwrite.tablesDB.listRows({
    databaseId: APPWRITE_DATABASE_ID,
    tableId: TABLES.profiles,
    queries: [Query.equal("handle", handle), Query.limit(1)],
  });
  return result.total === 0;
}

/**
 * The row ID is the account's own user ID (not `ID.unique()`), the same
 * convention the Postgres version of this schema used — a profile's
 * identity is always its owner's account ID, one to one, so there's
 * never a separate foreign key to keep in sync.
 */
export async function createProfile(userId: string, handle: string, displayName: string): Promise<Profile> {
  const appwrite = getAppwrite();
  if (!appwrite) throw new Error("Appwrite não configurado");
  return appwrite.tablesDB.createRow<Profile>({
    databaseId: APPWRITE_DATABASE_ID,
    tableId: TABLES.profiles,
    rowId: userId,
    data: { handle, displayName },
    // Table-level permissions already allow public read of every profile;
    // this grants the owner (and only the owner) update/delete on theirs.
    permissions: [Permission.update(Role.user(userId)), Permission.delete(Role.user(userId))],
  });
}

/**
 * Best-effort — a welcome email failing (Resend down, function not deployed
 * yet, whatever) must never block or fail account creation, so this
 * swallows its own errors instead of throwing. Call once, right after
 * `createProfile` succeeds (see handle-picker.tsx): that moment is the one
 * reliable "this is a brand-new account" signal available client-side —
 * Appwrite's own `users.create` event is documented as unreliable for
 * OAuth-created accounts (Google/Apple, the only login this app offers),
 * so this intentionally isn't triggered off that event server-side.
 */
export function sendWelcomeEmail(): void {
  const appwrite = getAppwrite();
  if (!appwrite) return;
  appwrite.functions
    .createExecution({ functionId: SEND_WELCOME_EMAIL_FUNCTION_ID, method: ExecutionMethod.POST })
    .catch(() => {
      // Nothing to recover here — the athlete's account and profile are
      // already created either way.
    });
}

// Re-exported so callers that need a fresh unique ID (e.g. for a future
// row that isn't keyed to an account ID) don't need their own import of
// the Appwrite SDK just for this.
export { ID };
