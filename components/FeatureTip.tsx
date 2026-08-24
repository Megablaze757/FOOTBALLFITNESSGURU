"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useTier } from "@/lib/use-tier";
import { nextTip, actedMark, dismissedMark, type TipContext, type Tip } from "@/lib/tips";

/**
 * Points at one control the athlete has not found yet, and then never again.
 *
 * WHY IT EXISTS. This app has shipped invisible features more than once: the
 * strength calculator behind a 24px icon next to an already-logged exercise,
 * the "add your own exercise" form rendered only on a coaches-only page while
 * the library merged custom entries into search and offered no route to making
 * one. Built, tested, shipped and unfindable.
 *
 * WHAT KEEPS IT FROM BEING A PRODUCT TOUR is in lib/tips.ts — tips are earned
 * by usage rather than scheduled, locked features are never advertised, and
 * three dismissals with nothing acted on mutes them for good. This file only
 * does the pointing.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IF THE ANCHOR IS NOT THERE, NOTHING RENDERS.
 *
 * The tip and the control it points at live in different files, so the pairing
 * survives only as long as nobody moves the control — and somebody always
 * moves the control. A tooltip floating in the corner pointing at nothing is
 * strictly worse than no tooltip: it is visibly broken, on a screen the athlete
 * was using perfectly well. So the anchor is looked up in the DOM and a miss is
 * silent. lib/tips.test.ts fails the build if a tip names an anchor no file
 * renders, which catches it before anybody sees it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function FeatureTip() {
  const user = useCurrentUser();
  const { tier, loading: tierLoading } = useTier();
  const pathname = usePathname();

  const [tip, setTip] = useState<Tip | null>(null);
  const [box, setBox] = useState<{ top: number; left: number; width: number; below: boolean } | null>(null);
  const [seen, setSeen] = useState<string[] | null>(null);

  /**
   * WAIT UNTIL THE PAGE HAS SETTLED before deciding there is nothing to point
   * at. Every one of these screens loads its data asynchronously, so the anchor
   * does not exist on first paint — measuring immediately would find nothing
   * and silently give up on a tip that was about to be perfectly showable.
   */
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    setTip(null);
    setBox(null);
    const t = setTimeout(() => setReady(true), 1200);
    return () => clearTimeout(t);
  }, [pathname]);

  // What they have done, and what they have already been shown.
  useEffect(() => {
    if (!user?.id || tierLoading) return;
    let live = true;
    void (async () => {
      const supabase = createClient();
      const [{ data: profile }, checkIns, programs, weighIns, customs, wearables] = await Promise.all([
        supabase.from("profiles").select("seen_tips").eq("id", user.id).maybeSingle(),
        supabase.from("daily_check_ins").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("programs").select("completed_sessions").eq("user_id", user.id).eq("status", "active").maybeSingle(),
        supabase.from("body_logs").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("custom_exercises").select("id", { count: "exact", head: true }).eq("coach_id", user.id),
        supabase.from("wearable_status").select("connected"),
      ]);
      if (!live) return;

      /**
       * A DATABASE WITHOUT 0102 MUST NOT SHOW EVERY TIP ON EVERY VISIT.
       *
       * `seen_tips` missing comes back as undefined, and treating that as "an
       * empty history" means nothing can ever be recorded as seen — so the same
       * tip returns on every single page load, forever. Undefined is "we cannot
       * tell", and we do not point at anything when we cannot tell. Absent is
       * not empty, which is a mistake this codebase has made before.
       */
      const marks = (profile as { seen_tips?: string[] } | null)?.seen_tips;
      if (!Array.isArray(marks)) { setSeen(null); return; }
      setSeen(marks);

      const done = ((programs as { completed_sessions?: string[] } | null)?.completed_sessions ?? []).length;
      const ctx: TipContext = {
        tier,
        checkIns: checkIns.count ?? 0,
        sessionsDone: done,
        hasProgram: !!programs,
        weightEntries: weighIns.count ?? 0,
        customExercises: customs.count ?? 0,
        hasWearable: ((wearables.data ?? []) as { connected: boolean }[]).some((w) => w.connected),
      };
      setTip(nextTip(pathname ?? "", ctx, marks));
    })();
    return () => { live = false; };
  }, [user?.id, tier, tierLoading, pathname]);

  /** Measure the anchor, and keep measuring while the page moves under it. */
  const measure = useCallback(() => {
    if (!tip) return;
    const el = document.querySelector(`[data-tip="${tip.anchor}"]`);
    if (!el) { setBox(null); return; }
    const r = el.getBoundingClientRect();
    // Off-screen or collapsed is the same as absent — pointing at something
    // nobody can see is the failure this whole component guards against.
    if (r.width === 0 || r.height === 0) { setBox(null); return; }

    const width = Math.min(320, window.innerWidth - 24);
    // Below the anchor when there is room, above when there is not. A card that
    // runs off the bottom of a phone is unreadable and undismissable.
    const below = r.bottom + 170 < window.innerHeight;
    setBox({
      top: below ? r.bottom + 10 : Math.max(12, r.top - 10),
      left: Math.max(12, Math.min(window.innerWidth - width - 12, r.left + r.width / 2 - width / 2)),
      width,
      below,
    });
  }, [tip]);

  useEffect(() => {
    if (!tip || !ready) return;
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [tip, ready, measure]);

  async function close(acted: boolean) {
    const current = tip;
    setTip(null);
    setBox(null);
    if (!current || !user?.id || seen === null) return;
    const next = [...seen, acted ? actedMark(current.id) : dismissedMark(current.id)];
    setSeen(next);
    // Best effort. A tip that fails to record is shown again next time, which
    // is mildly annoying; blocking the athlete on it would be worse.
    await createClient().from("profiles").update({ seen_tips: next }).eq("id", user.id);
  }

  if (!tip || !ready || !box) return null;

  return (
    <div
      role="dialog"
      aria-label={tip.title}
      style={{
        position: "fixed",
        top: box.below ? box.top : undefined,
        bottom: box.below ? undefined : window.innerHeight - box.top,
        left: box.left,
        width: box.width,
        // Above the tab bar (z-60) and the sheets (z-100) it may sit beside.
        zIndex: 110,
      }}
      className="animate-fade-up rounded-2xl border border-pitch-400/30 bg-ink-900/95 p-3 shadow-card backdrop-blur"
    >
      <p className="text-sm font-bold text-pitch-400">{tip.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-300">{tip.body}</p>
      <div className="mt-2.5 flex items-center justify-end gap-2">
        <button onClick={() => void close(false)} className="tap-target chip text-slate-400">
          Not now
        </button>
        <button
          onClick={() => {
            // Take them to it as well as marking it read. A tip that only says
            // "there is a button" leaves the work of finding it undone.
            document.querySelector(`[data-tip="${tip.anchor}"]`)
              ?.scrollIntoView({ block: "center", behavior: "smooth" });
            void close(true);
          }}
          className="tap-target chip text-pitch-400"
        >
          Show me
        </button>
      </div>
    </div>
  );
}
