"use client";

import { useEffect, useState } from "react";
import { exportShareCard, type ShareStats } from "@/lib/share-card";
import { referralLink } from "@/lib/referral";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ATHLETE'S OWN LINK, WHEN THEY HAVE ONE.
 *
 * The card carried no address at all, so every share was a dead end. It now
 * carries one — and if this athlete is an affiliate, it carries THEIRS, so a
 * share that converts is a share they get paid for.
 *
 * Looked up here rather than passed in by each caller: there are two call
 * sites today and adding a third should not mean remembering to thread a
 * referral code through it. A failed lookup is not an error — the card falls
 * back to the plain address, which is what it should show for the many
 * athletes who are not affiliates.
 */
export function ShareButton({ stats }: { stats: ShareStats }) {
  const user = useCurrentUser();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        /**
         * The affiliate code first, then the username.
         *
         * An affiliate link pays; a username link is attribution only. Both
         * are the athlete's own, and either is worth infinitely more than the
         * plain address — a share nothing comes back from is a share nobody
         * does twice. See migration 0107.
         */
        const [{ data: affiliate }, { data: profile }] = await Promise.all([
          supabase.from("affiliates").select("code").eq("user_id", user.id).maybeSingle(),
          supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
        ]);
        const code = (affiliate as { code?: string } | null)?.code
          ?? (profile as { username?: string | null } | null)?.username;
        if (!cancelled && code) setLink(referralLink(code));
      } catch {
        // No row, no table, or no permission — all mean "no code", and the
        // card has a perfectly good fallback.
      }
    })();
    return () => { cancelled = true; };
  }, [user.id]);

  async function share() {
    setBusy(true);
    try {
      await exportShareCard({ ...stats, link });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={share} disabled={busy} className="btn-ghost">
      {busy ? "Creating…" : "📸 Share my progress"}
    </button>
  );
}
