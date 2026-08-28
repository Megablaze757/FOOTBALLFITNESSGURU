"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Renew the session when the app comes back to the foreground.
 *
 * WHY THE BUILT-IN REFRESH IS NOT ENOUGH. supabase-js renews an access token on
 * a timer. A phone freezes a backgrounded tab, and a frozen tab runs no timers —
 * so the app that has been in somebody's pocket between sets wakes with a token
 * that expired twenty minutes ago and no attempt made to renew it. The first
 * thing they do is press save, and the first thing that happens is a failure.
 * That is the "weights aren't saving after a while" report.
 *
 * This is the preventative half; lib/session-guard.ts is the recovery half at
 * the point of the write. Both are needed: this cannot help a token that dies
 * while the app is open and in use, and the recovery cannot make a save feel
 * instant if it has to renew first.
 *
 * CHEAP AND QUIET. getSession() reads localStorage — no network — and only a
 * token that is already close to expiry costs a request. A failure means they
 * genuinely have to sign in again, and this is not the place to interrupt them
 * about it: the next write says so, with their work kept.
 */
const RENEW_WITHIN_SECONDS = 120;

export function SessionKeepalive() {
  useEffect(() => {
    const supabase = createClient();

    async function renewIfStale() {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session;
        if (!session) return;             // signed out, or nothing stored yet
        const expiresAt = session.expires_at;
        if (!expiresAt) return;
        const secondsLeft = expiresAt - Math.floor(Date.now() / 1000);
        // Already expired counts: the refresh token usually still works, and
        // renewing now is what stops the next save from being the discovery.
        if (secondsLeft > RENEW_WITHIN_SECONDS) return;
        await supabase.auth.refreshSession();
      } catch {
        // Offline, or the refresh token is genuinely dead. Neither is worth
        // interrupting somebody for here.
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") void renewIfStale();
    }

    // On mount too: a cold start from the home screen is the same situation as
    // a resume, and it is the one that happens every morning.
    void renewIfStale();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return null;
}
