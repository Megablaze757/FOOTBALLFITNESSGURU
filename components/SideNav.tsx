"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, NavIcon } from "@/components/nav-items";

// Desktop-only left sidebar (hidden below lg — mobile uses the bottom TabBar).
export function SideNav() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-white/[0.02] px-4 py-6 backdrop-blur-xl lg:flex">
      <Link href="/home" className="mb-8 flex items-center gap-2 px-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-pitch-400 to-pitch-600 text-lg font-black text-ink-900 shadow-glow">A</span>
        <span className="text-lg font-extrabold tracking-tight">PocketAthlete</span>
      </Link>

      <nav className="flex-1">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? "bg-pitch-400/10 text-pitch-400 shadow-[inset_0_0_0_1px_rgba(227,181,63,0.25)]"
                      : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-100"
                  }`}
                >
                  <NavIcon name={item.icon} active={active} size={20} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Link
        href="/pricing"
        className="mt-4 rounded-2xl border border-pitch-400/25 bg-pitch-400/[0.06] p-4 transition hover:bg-pitch-400/10"
      >
        <div className="text-xs font-semibold uppercase tracking-wider text-pitch-400">PocketAthlete Gold</div>
        <p className="mt-1 text-xs text-slate-400">Unlock AI programs, video biomechanics &amp; coaching.</p>
        <span className="mt-2 inline-block text-xs font-bold text-pitch-400">Upgrade →</span>
      </Link>
    </aside>
  );
}
