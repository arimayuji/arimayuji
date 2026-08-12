/**
 * The one optional backend dependency in an otherwise fully local app.
 * Recording a run, history, and PRs never touch this — only the features
 * that need a real account (rating a place, adding a friend or a coach)
 * do. Auth is Supabase's own client-side auth, not Auth.js: this app is a
 * static export with no Next.js server runtime (see next.config.ts), so
 * there's nowhere to run the server-side OAuth callback Auth.js needs.
 * Supabase's SDK does the whole round trip from the browser instead.
 *
 * `NEXT_PUBLIC_` is required for a static export — these are baked into
 * the client bundle at build time, not read at request time. Neither
 * value is a secret: the anon key is meant to be public and is only ever
 * as powerful as the RLS policies in supabase/migrations allow.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

/**
 * Null when the project isn't configured (no env vars set) — every
 * caller must treat that as "the community features aren't available
 * right now," the same way `saveActiveRun` treats a missing `indexedDB`,
 * rather than throwing during a build that hasn't wired up Supabase yet.
 */
export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
