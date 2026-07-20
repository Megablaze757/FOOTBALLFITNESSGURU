"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Use the implicit flow, not PKCE (the @supabase/ssr default).
        //
        // PKCE puts a `?code=` on the reset link and stores a matching verifier
        // in the localStorage of whichever browser *requested* the reset. Email
        // apps open links in their own in-app browser, which has no verifier, so
        // the exchange fails and the user gets "open it in the same browser".
        //
        // Implicit flow instead returns the session tokens in the URL hash
        // (`#access_token=…`), which `detectSessionInUrl` reads on load. Nothing
        // is stored ahead of time, so a reset or confirm link works in ANY
        // browser, on any device — which is what a link emailed to a phone needs.
        flowType: "implicit",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    }
  );
}
