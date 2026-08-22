"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HEADER_NAV, NavIcon } from "@/components/nav-items";
import { useLaunched } from "@/lib/launch";

/**
 * The mobile top bar. Phone only — the desktop sidebar already holds both of
 * these, permanently.
 *
 * HOME AND PROFILE FIT NO DOMAIN. Home is a view of all four tabs and Profile
 * is none of them, so when the bottom bar came down to Training / Food /
 * Recovery / Performance both would have had to live in a "More" sheet — which
 * is how the page people open first ends up two taps away, behind a button
 * whose label says nothing.
 *
 * One row of height buys them one tap from every screen, and the sheet can go
 * entirely. The wordmark doubles as the way home because that is where a
 * wordmark goes in every other app, so nobody has to be told.
 */
export function AppHeader() {
  const pathname = usePathname();
  const launched = useLaunched();
  const [home, profile] = HEADER_NAV;
  const onProfile = pathname.startsWith(profile.href);

  return (
    /* Sticky, not fixed: it scrolls with the page's own scroll container and
       needs no compensating padding on <main>. `top-0` plus the safe-area
       inset keeps it clear of a notch in landscape. */
    <header
      className="sticky top-0 z-50 border-b border-white/[0.06] bg-ink-900/95 lg:hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-2">
        <Link
          href={home.href}
          aria-label="Home"
          aria-current={pathname.startsWith(home.href) ? "page" : undefined}
          className="flex min-h-[44px] items-center gap-2 rounded-2xl pr-2"
        >
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-pitch-400 to-pitch-600 text-base font-black text-ink-900 shadow-glow">
            A
          </span>
          <span className="text-base font-extrabold tracking-tight text-slate-100">PocketAthlete</span>
          {!launched && (
            <span className="rounded-md bg-pitch-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-pitch-400">
              Beta
            </span>
          )}
        </Link>

        <Link
          href={profile.href}
          aria-label={profile.label}
          aria-current={onProfile ? "page" : undefined}
          className={`grid h-11 w-11 place-items-center rounded-2xl transition ${
            onProfile ? "bg-pitch-400/10" : "hover:bg-white/[0.05]"
          }`}
        >
          <NavIcon name={profile.icon} active={onProfile} size={20} />
        </Link>
      </div>
    </header>
  );
}
