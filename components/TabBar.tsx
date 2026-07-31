"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_NAV, MOBILE_MORE, COACH_NAV, NavIcon } from "@/components/nav-items";
import { useIsCoach } from "@/lib/coach-role";

export function TabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const isCoach = useIsCoach();
  // Squad goes in the More sheet for coaches — the four primary tabs stay the
  // daily loop, which a coach uses as an athlete too.
  const more = isCoach ? [...COACH_NAV, ...MOBILE_MORE] : MOBILE_MORE;
  const moreActive = more.some((m) => pathname.startsWith(m.href));

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setMoreOpen(false)}>
          <div
            className="animate-fade-up absolute inset-x-3 bottom-24 card overflow-hidden p-2"
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

      <nav className="fixed bottom-4 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-[26rem] -translate-x-1/2 lg:hidden">
        {/* gap-0.5 buys each label a gutter, and min-w-0 lets a flex item shrink
            below its own text width — without it the label sets the floor and
            neighbouring tabs are pushed until they touch. `truncate` is the
            backstop for a long label at 320px, not the plan: the plan is the
            `short` wording in nav-items. */}
        <ul className="card flex items-center justify-between gap-0.5 px-1.5 py-2">
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
