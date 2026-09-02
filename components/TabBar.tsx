"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_NAV, NavIcon } from "@/components/nav-items";
import { nextNavState, INITIAL_NAV_STATE, type NavScrollState } from "@/lib/nav-scroll";

export function TabBar() {
  const pathname = usePathname();

  /**
   * GET OUT OF THE WAY WHEN THEY'RE READING.
   *
   * Reported as "it just stays in the same place". It is `position: fixed`, so
   * it did — roughly 80px of every screen, parked across whatever you were
   * reading, on every page. Scroll down and it goes now; scroll up and it comes
   * back, because scrolling up is what you do when you want to go somewhere
   * else. The rule and its hysteresis live in lib/nav-scroll.ts.
   *
   * A ref, not state, for the decision itself — only `hidden` needs to cause a
   * render, and the scroll handler runs on every frame of a flick.
   */
  const [hidden, setHidden] = useState(false);
  const scrollState = useRef<NavScrollState>(INITIAL_NAV_STATE);
  useEffect(() => {
    let queued = false;
    const onScroll = () => {
      // Read layout once per frame, not once per event: a flick fires scroll
      // far more often than the screen refreshes, and each read of scrollY
      // inside the handler is a forced style recalculation.
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const next = nextNavState(scrollState.current, {
          y: window.scrollY,
          viewportH: window.innerHeight,
          docH: document.documentElement.scrollHeight,
        });
        scrollState.current = next;
        setHidden((was) => (was === next.hidden ? was : next.hidden));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    /* CENTRED WITHOUT A TRANSFORM.
       Was `left-1/2 -translate-x-1/2`, which works but puts a transform on a
       position:fixed element whose inner surface is also backdrop-blurred —
       and transform plus backdrop-filter on a fixed element during scroll is
       the exact combination mobile Safari has long got wrong, showing a
       stale or smeared snapshot of the page behind, or dropping the bar
       entirely until the scroll settles. `inset-x-4 mx-auto` with the same
       max-width centres identically with no transform at all.

       `bottom` lives in the .tab-bar rule in globals.css, not here, because
       it needs a fallback and an inline style can only hold one value per
       property. See the note there — a dropped `bottom` on a fixed element
       is not a slightly-wrong bar, it's the bar back in normal flow. */
    <nav
      className={`tab-bar fixed inset-x-4 z-[60] mx-auto max-w-[26rem] transition-transform duration-200 lg:hidden ${
        hidden ? "translate-y-[150%]" : "translate-y-0"
      }`}
      // A hidden bar a keyboard user has tabbed into is a focus ring on
      // nothing. Anything focused inside it brings the whole thing back.
      onFocusCapture={() => setHidden(false)}
      // It is off-screen, not gone: `aria-hidden` here would remove the four
      // primary destinations from the accessibility tree of every page for
      // anyone who happened to be scrolling down at the time.
      aria-label="Sections"
    >
      {/* Not `card`. Same look, but bg-surface-raised/95 instead of /70.
          `.card` leans on backdrop-blur for legibility, and a blurred surface
          is the first thing a mobile browser abandons under scroll load — at
          70% opacity that leaves the labels sitting on whatever is passing
          behind them, which is when the bar stops looking like a bar.

          AND THE BLUR ITSELF IS NOW GONE. The note directly above about
          centring says why: transform plus backdrop-filter on a fixed element
          during scroll is the combination mobile Safari has long got wrong,
          and hiding the bar means animating a transform on exactly that
          element, during exactly that scroll. */}
      <ul className="flex items-center justify-between gap-0.5 rounded-2xl border border-white/[0.08] bg-surface-raised px-1.5 py-2 shadow-card">
        {MOBILE_NAV.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[44px] flex-col items-center gap-1 rounded-2xl py-2 text-[10px] font-medium transition ${
                  active ? "bg-pitch-400/10 text-accent-400" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <NavIcon name={tab.icon} active={active} />
                <span className="w-full truncate text-center">{tab.short}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
