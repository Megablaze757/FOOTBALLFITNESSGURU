"use client";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The browser Supabase client.
 *
 * WHY NOT @supabase/ssr. This file used to call `createBrowserClient` and pass
 * `flowType: "implicit"` with a long comment explaining why implicit was
 * essential for emailed links. The comment was right and the code did nothing:
 * createBrowserClient spreads your `auth` options and then hard-codes
 * `flowType: "pkce"` *after* them, so the setting was silently discarded. Every
 * recovery token in auth.one_time_tokens is `pkce_`-prefixed, which is the
 * proof — and the reason password resets failed for weeks.
 *
 * Under PKCE the emailed link can only be completed in the browser that asked
 * for it, because the verifier lives in that browser's storage. Mail apps open
 * links in their own in-app viewer, people request on a laptop and read on a
 * phone, and Gmail prefetches links — so the realistic case is the one that
 * cannot work.
 *
 * @supabase/ssr exists so a SERVER can read the session from cookies. This app
 * is `output: "export"` on GitHub Pages: no middleware, no server components
 * reading auth, no server at all. It was carrying a server-auth package purely
 * to be broken by it.
 *
 * Implicit flow returns the tokens in the URL fragment, which any browser can
 * pick up with no stored verifier, and `verifyOtp` on a non-PKCE token hash
 * returns a session directly. That is what an emailed link needs.
 *
 * ONE-TIME COST: sessions move from cookie storage to localStorage, so everyone
 * signed in at the moment this deploys is signed out once and has to log in
 * again. Acceptable precisely because this is the change that makes "forgot my
 * password" work.
 */

let cached: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  // A single instance per tab. Several of these are created per render pass
  // across the app, and each one otherwise spins up its own auth listener and
  // refresh timer against the same session.
  if (cached) return cached;

  cached = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Not PKCE. See above — this is the whole point of the file.
        flowType: "implicit",
        // Reads `#access_token=…` off the URL on load, which is how an implicit
        // recovery or confirmation link establishes the session.
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    }
  );
  return cached;
}
