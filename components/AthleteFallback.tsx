"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { athleteFromPath } from "@/lib/athlete-path";
import { levelFor } from "@/lib/gamification";
import { membershipLength } from "@/lib/public-profile";
import { sportLabel } from "@/lib/seo";
import type { SportId } from "@/lib/exercises";

interface Athlete {
  username: string;
  sport: string | null;
  position: string | null;
  xp: number | null;
  created_at: string | null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PROFILE LINK THAT WORKS BEFORE THE NEXT BUILD.
 *
 * "The social profiles we made dont work." They did not: /a/<username>/ is a
 * FILE, written at build time from whoever was public when the build ran. Turn
 * your page on this afternoon and there is no file at your address — the card
 * shows the URL, "View it" opens it, and GitHub Pages answers 404 until
 * somebody pushes a commit.
 *
 * Pages serves 404.html for any path it does not have, and Next exports
 * app/not-found.tsx as that file — a full app shell. So the 404 reads the
 * address it was reached by and, if it is an athlete address, fetches that
 * athlete and renders the page. The URL never changes, so a shared link still
 * points where the person meant.
 *
 * It renders the SAME facts the built page does and nothing more: username,
 * sport, position, rank, how long they have been at it. The view it reads
 * excludes every health, food and body column by construction, so there is no
 * way for this path to publish something the built one would not.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function AthleteFallback({ onResolved }: { onResolved?: (found: boolean) => void }) {
  const [state, setState] = useState<"idle" | "looking" | "found" | "missing">("idle");
  const [athlete, setAthlete] = useState<Athlete | null>(null);

  useEffect(() => {
    const username = athleteFromPath(typeof window === "undefined" ? "" : window.location.pathname);
    if (!username) return;
    setState("looking");

    let cancelled = false;
    void (async () => {
      try {
        const { data } = await createClient()
          .from("public_athletes")
          .select("username, sport, position, xp, created_at")
          .eq("username", username)
          .maybeSingle();
        if (cancelled) return;
        const row = (data ?? null) as Athlete | null;
        setAthlete(row);
        setState(row ? "found" : "missing");
        onResolved?.(!!row);
      } catch {
        // A failed lookup is a miss, not a crash. The 404 page underneath is
        // a perfectly good answer and is already on screen.
        if (!cancelled) { setState("missing"); onResolved?.(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [onResolved]);

  if (state === "idle" || state === "missing") return null;

  if (state === "looking") {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-pitch-400" />
        <p className="mt-4 text-sm text-slate-500">Looking for that athlete…</p>
      </div>
    );
  }

  const rank = levelFor(athlete?.xp ?? 0).rank;
  const sport = sportLabel((athlete?.sport ?? "football") as SportId);

  return (
    <div className="animate-fade-up mx-auto max-w-lg py-12 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">PocketAthlete</p>
      <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-100">@{athlete?.username}</h1>
      <p className="mt-3 text-lg font-bold text-accent-400">{rank}</p>
      <p className="mt-1 text-sm text-slate-400">
        {sport}
        {athlete?.position ? ` · ${athlete.position}` : ""}
        {athlete?.created_at ? ` · ${membershipLength(athlete.created_at)}` : ""}
      </p>

      {/* SAID PLAINLY, because the alternative is somebody thinking their page
          is broken when it is merely new. This copy is the difference between
          "it doesn't work" and "it is on its way". */}
      <p className="mx-auto mt-8 max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-500">
        This page is brand new, so it is being served live rather than from the site&apos;s own
        files. It gets its own permanent page at the next site update — the address does not
        change, and the link works either way.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/" className="btn-primary">Start training free</Link>
        <Link href="/a/" className="tap-target rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300">
          Other athletes
        </Link>
      </div>
    </div>
  );
}
