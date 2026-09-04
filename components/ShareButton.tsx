"use client";

import { useEffect, useState } from "react";
import { exportShareCard, shareCardPng, saveBlob, SHARE_FILENAME, type ShareStats } from "@/lib/share-card";
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
  const [note, setNote] = useState<string | null>(null);
  const [offerPage, setOfferPage] = useState(false);

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
          supabase.from("profiles").select("username, public_profile").eq("id", user.id).maybeSingle(),
        ]);
        const row = profile as { username?: string | null; public_profile?: boolean | null } | null;
        const code = (affiliate as { code?: string } | null)?.code ?? row?.username;
        if (!cancelled && code) setLink(referralLink(code));
        /**
         * ═══════════════════════════════════════════════════════════════════
         * THE OFFER GOES WHERE THE VALUE IS OBVIOUS.
         *
         * The public-page switch lives in Profile among a dozen other
         * switches, and reported as "it is not clear how to create a public
         * page" — which is fair: nothing anywhere else mentions that pages
         * exist.
         *
         * This is the moment it matters. They are about to send somebody a
         * card, and the address on it is either their own page or a query
         * string. Asked here, "would you like the link to go somewhere worth
         * opening" answers itself; asked on a settings screen it is one more
         * checkbox.
         * ═══════════════════════════════════════════════════════════════════
         */
        if (!cancelled) setOfferPage(!!row?.username && !row.public_profile);
      } catch {
        // No row, no table, or no permission — all mean "no code", and the
        // card has a perfectly good fallback.
      }
    })();
    return () => { cancelled = true; };
  }, [user.id]);

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * A FAILURE HAS TO BE VISIBLE. THIS ONE WAS NOT.
   *
   * try/finally with no catch: exportShareCard rejects, the promise goes
   * unhandled, the label stops saying "Creating…" and NOTHING else happens.
   * Reported as sharing working "for some of the stuff" — which is exactly
   * what a silent failure looks like from outside, and there was no way for
   * anybody to find out more.
   * ═══════════════════════════════════════════════════════════════════════
   */
  async function share() {
    setBusy(true);
    setNote(null);
    try {
      const outcome = await exportShareCard({ ...stats, link });
      if (outcome === "saved") setNote("Saved to your downloads.");
      if (outcome === "shared") setNote("Shared.");
    } catch (e) {
      setNote(`Could not make the card: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  /**
   * SAVE, SEPARATELY FROM SHARE.
   *
   * The share sheet is the right first offer on a phone and is not offered at
   * all on most desktops — and even where it is, "put it in my photos so I can
   * post it later" is a different intention from "send it now". One button had
   * to guess which; two do not.
   */
  async function save() {
    setBusy(true);
    setNote(null);
    try {
      saveBlob(await shareCardPng({ ...stats, link }), SHARE_FILENAME);
      setNote("Saved to your downloads.");
    } catch (e) {
      setNote(`Could not make the card: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={share} disabled={busy} className="btn-ghost">
          {busy ? "Creating…" : "📸 Share my progress"}
        </button>
        <button onClick={save} disabled={busy} className="tap-target rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300">
          Save image
        </button>
      </div>
      {note && <p className="mt-2 text-xs text-slate-400">{note}</p>}
      {offerPage && (
        <p className="mt-2 text-xs text-slate-500">
          Your card links back to a sign-up page.{" "}
          <a href="/profile" className="font-semibold text-accent-400 underline">
            Turn on your own page
          </a>{" "}
          and it links to your rank instead — opt-in, and it shows nothing but your sport,
          position and rank.
        </p>
      )}
    </div>
  );
}
