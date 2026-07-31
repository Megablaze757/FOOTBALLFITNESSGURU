"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_NAV, MOBILE_MORE, COACH_NAV, NavIcon } from "@/components/nav-items";
import { useIsCoach } from "@/lib/coach-role";

export function TabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const isCoach = useIsCoach();

  /**
   * Stop the page scrolling underneath the More sheet.
   *
   * THE SHEET IS A FULL-SCREEN MODAL AND THE PAGE MOVED BEHIND IT. Open More
   * on a phone, drag anywhere, and the content scrolled while the sheet and the
   * bar stayed nailed in place — which reads exactly like the floating nav
   * having come loose from the page, because from the reader's point of view
   * something that should have moved together didn't.
   *
   * Locking `overflow` on the body rather than intercepting touchmove: it's one
   * line, it can't get the passive-listener semantics wrong, and it restores
   * cleanly. The scroll POSITION is untouched, so closing the sheet leaves you
   * exactly where you were.
   */
  useEffect(() => {
    if (!moreOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [moreOpen]);
  // Squad goes in the More sheet for coaches — the four primary tabs stay the
  // daily loop, which a coach uses as an athlete too.
  const more = isCoach ? [...COACH_NAV, ...MOBILE_MORE] : MOBILE_MORE;
  const moreActive = more.some((m) => pathname.startsWith(m.href));

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setMoreOpen(false)}>
          <div
            className="animate-fade-up absolute inset-x-3 bottom-24 card max-h-[70vh] overflow-y-auto overscroll-contain p-2"
            onClick={(e) => e.stopPropagation()}
          >
            {more.map((m) => {
              const active = pathname.startsWith(m.href);
              return (
                <Link
                  key={m.href}
                  href={m.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    active ? "bg-pitch-400/10 text-pitch-400" : "text-slate-200 hover:bg-white/[0.05]"
                  }`}
                >
                  <NavIcon name={m.icon} active={active} size={20} />
                  {m.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* CENTRED WITHOUT A TRANSFORM.
          Was `left-1/2 -translate-x-1/2`, which works but puts a transform on a
          position:fixed element whose inner surface is also backdrop-blurred —
          and transform plus backdrop-filter on a fixed element during scroll is
          the exact combination mobile Safari has long got wrong, showing a
          stale or smeared snapshot of the page behind, or dropping the bar
          entirely until the scroll settles. `inset-x-4 mx-auto` with the same
          max-width centres identically with no transform at all.

          bottom uses max(1rem, safe-area) rather than a bare 1rem. Today that
          is exactly 1rem — without viewport-fit=cover the inset resolves to
          zero, so this changes nothing now — but it means the bar cannot end up
          under the home indicator if cover is ever turned on. */}
      <nav
        className="fixed inset-x-4 z-[60] mx-auto max-w-[26rem] lg:hidden"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {/* gap-0.5 buys each label a gutter, and min-w-0 lets a flex item shrink
            below its own text width — without it the label sets the floor and
            neighbouring tabs are pushed until they touch. `truncate` is the
            backstop for a long label at 320px, not the plan: the plan is the
            `short` wording in nav-items. */}
        {/* Not `card`. Same look, but bg-ink-800/95 instead of /70.
            `.card` leans on backdrop-blur for legibility, and a blurred surface
            is the first thing a mobile browser abandons under scroll load — at
            70% opacity that leaves the labels sitting on whatever is passing
            behind them, which is when the bar stops looking like a bar. At 95%
            the blur is decoration: if it drops, nothing important changes. */}
        <ul className="flex items-center justify-between gap-0.5 rounded-2xl border border-white/[0.08] bg-ink-800/95 px-1.5 py-2 shadow-card backdrop-blur-sm">
          {MOBILE_NAV.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <li key={tab.href} className="min-w-0 flex-1">
                <Link
                  href={tab.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex flex-col items-center gap-1 rounded-2xl py-2 text-[10px] font-medium transition ${
                    active ? "bg-pitch-400/10 text-pitch-400" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <NavIcon name={tab.icon} active={active} />
                  <span className="w-full truncate text-center">{tab.short}</span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0 flex-1">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className={`flex w-full flex-col items-center gap-1 rounded-2xl py-2 text-[10px] font-medium transition ${
                moreOpen || moreActive ? "bg-pitch-400/10 text-pitch-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <NavIcon name="more" active={moreOpen || moreActive} />
              <span className="w-full truncate text-center">More</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
