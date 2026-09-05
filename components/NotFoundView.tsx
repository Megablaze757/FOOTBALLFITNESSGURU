"use client";

import { useCallback, useEffect, useState } from "react";
import { AthleteFallback } from "@/components/AthleteFallback";
import { athleteFromPath } from "@/lib/athlete-path";
import Link from "next/link";

/**
 * The 404 body.
 *
 * Split out of `app/not-found.tsx` so that file can be a server component and
 * export `metadata`. A client component cannot, and the page was inheriting the
 * root title — so a browser tab, a history entry and anything crawling the site
 * all read "PocketAthlete — AI Athlete Coach" for a page that is the opposite of
 * that. Setting `document.title` in an effect would fix the tab and nothing
 * else, because the static export's HTML is what gets read first.
 */

// Places worth offering someone who took a wrong turn.
//
// Matches the bottom nav, which is what these people were trying to reach.
// It had drifted: "Train" and "Guides" were offered while Injury — promoted to
// a primary tab after being reported unfindable twice — was not, and nutrition
// was labelled differently here than everywhere else.
const LINKS: { href: string; label: string; icon: string }[] = [
  { href: "/home", label: "Home", icon: "🏠" },
  { href: "/coach", label: "Training", icon: "🧠" },
  { href: "/journal", label: "Today's log", icon: "📝" },
  { href: "/nutrition", label: "Food", icon: "🍽️" },
  { href: "/injury", label: "Recovery", icon: "🩹" },
  { href: "/library", label: "Exercises", icon: "📚" },
];

// The site used to be served from https://<user>.github.io/FOOTBALLFITNESSGURU/.
// Bookmarks, old emails and shared links still carry that prefix, and on the
// custom domain every one of them 404s. Rather than dead-end those people, strip
// the prefix and send them where they were actually going.
const LEGACY_PREFIXES = ["/FOOTBALLFITNESSGURU", "/footballfitnessguru"];

export function NotFoundView() {
  /**
   * An athlete whose page is newer than the last build reaches this file —
   * see components/AthleteFallback.tsx. While it is looking, and if it finds
   * them, the "page not found" body underneath must not be on screen: two
   * answers to one address, one of them wrong.
   */
  const [athleteFound, setAthleteFound] = useState<boolean | null>(null);
  const onResolved = useCallback((found: boolean) => setAthleteFound(found), []);

  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const { pathname, search, hash } = window.location;
    const legacy = LEGACY_PREFIXES.find((p) => pathname.startsWith(p));
    if (!legacy) return;

    const fixed = pathname.slice(legacy.length) || "/home";
    setRedirecting(true);
    // Replace rather than push, so Back doesn't bounce them into the 404 again.
    window.location.replace(`${fixed}${search}${hash}`);
  }, []);

  if (redirecting) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5">
        <div className="card w-full max-w-sm p-8 text-center">
          <span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-pitch-500 border-t-transparent" />
          <p className="mt-4 text-sm text-slate-300">Taking you to the right page…</p>
          <p className="mt-1 text-xs text-slate-500">That link used our old address.</p>
        </div>
      </main>
    );
  }

  /**
   * The athlete answer REPLACES this one rather than sitting above it.
   * `athleteFound === null` means the lookup has not answered yet, and showing
   * "page not found" during it would be the wrong answer arriving first.
   */
  if (athleteFound !== false && isAthleteAddress()) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 py-10">
        <AthleteFallback onResolved={onResolved} />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-md text-center">
        {/* aria-hidden: a screen reader gets the h1 below, which says the same
            thing in words. "404" announced on its own is noise. */}
        <div className="text-6xl font-extrabold leading-none" aria-hidden>
          <span className="text-accent-400">404</span>
        </div>

        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">This page doesn&apos;t exist</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-slate-400">
          The link may be out of date, or we may have moved things around. Nothing you&apos;ve logged is affected.
        </p>

        <nav aria-label="Go somewhere useful" className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="card card-hover flex flex-col items-center gap-1.5 px-3 py-4 text-sm font-medium text-slate-200"
            >
              <span className="text-xl" aria-hidden>{l.icon}</span>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="mt-7 flex flex-col items-center gap-3">
          <Link href="/home" className="btn-primary max-w-[14rem]">Back to home</Link>
          <button
            onClick={() => window.history.back()}
            className="tap-target text-sm text-slate-400 transition hover:text-accent-400"
          >
            ← Go back
          </button>
        </div>

        <p className="mt-8 text-xs text-slate-500">
          Still stuck? Email{" "}
          <a href="mailto:info@pocketathlete.com" className="text-accent-400 hover:underline">
            info@pocketathlete.com
          </a>
        </p>
      </div>
    </main>
  );
}

/**
 * Read at render time rather than held in state.
 *
 * The address cannot change without this component unmounting — a static host
 * serves 404.html for one path at a time — and a second copy in state is a
 * second thing that can be stale.
 */
function isAthleteAddress(): boolean {
  if (typeof window === "undefined") return false;
  return athleteFromPath(window.location.pathname) !== null;
}
