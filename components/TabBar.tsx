"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Icon({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? "#a3e635" : "#94a3b8";
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "home":
      return <svg {...common}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
    case "journal":
      return <svg {...common}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>;
    case "stats":
      return <svg {...common}><path d="M4 19V5" /><path d="M4 15l4-4 4 3 6-7" /></svg>;
    case "coach":
      return <svg {...common}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" /><path d="M12 1v3M12 20v3M1 12h3M20 12h3" /></svg>;
    case "train":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m12 3 2.5 5-2.5 2-2.5-2L12 3zM3.5 10l4 1 1 3-3 2.5M20.5 10l-4 1-1 3 3 2.5" /></svg>;
    case "profile":
      return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>;
    default:
      return null;
  }
}

const TABS = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/coach", label: "Coach", icon: "coach" },
  { href: "/journal", label: "Journal", icon: "journal" },
  { href: "/dashboard", label: "Stats", icon: "stats" },
  { href: "/train", label: "Train", icon: "train" },
  { href: "/profile", label: "Profile", icon: "profile" },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-[26rem] -translate-x-1/2">
      <ul className="card flex items-center justify-between px-2 py-2">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={`flex flex-col items-center gap-1 rounded-2xl py-2 text-[10px] font-medium transition ${
                  active ? "bg-pitch-400/10 text-pitch-400" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon name={tab.icon} active={active} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
