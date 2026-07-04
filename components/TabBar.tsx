"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_NAV, NavIcon } from "@/components/nav-items";

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-[26rem] -translate-x-1/2 lg:hidden">
      <ul className="card flex items-center justify-between px-2 py-2">
        {MOBILE_NAV.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
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
      </ul>
    </nav>
  );
}
