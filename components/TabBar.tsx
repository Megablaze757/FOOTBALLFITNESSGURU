"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_NAV, MOBILE_MORE, NavIcon } from "@/components/nav-items";

export function TabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MOBILE_MORE.some((m) => pathname.startsWith(m.href));

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setMoreOpen(false)}>
          <div
            className="animate-fade-up absolute inset-x-3 bottom-24 card overflow-hidden p-2"
            onClick={(e) => e.stopPropagation()}
          >
            {MOBILE_MORE.map((m) => {
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
        <ul className="card flex items-center justify-between px-2 py-2">
          {MOBILE_NAV.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex flex-col items-center gap-1 rounded-2xl py-2 text-[10px] font-medium transition ${
                    active ? "bg-pitch-400/10 text-pitch-400" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <NavIcon name={tab.icon} active={active} />
                  {tab.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className={`flex w-full flex-col items-center gap-1 rounded-2xl py-2 text-[10px] font-medium transition ${
                moreOpen || moreActive ? "bg-pitch-400/10 text-pitch-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <NavIcon name="more" active={moreOpen || moreActive} />
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
