import Link from "next/link";
import { Logo } from "@/components/Logo";

/**
 * Chrome for the public, indexable pages.
 *
 * A server component on purpose — these pages are the SEO surface, so their
 * content has to be in the HTML that arrives, not painted in afterwards by
 * JavaScript. Nothing here needs interactivity.
 */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-20">
      <header className="flex items-center justify-between py-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={32} />
          <span className="text-lg font-extrabold tracking-tight">PocketAthlete</span>
        </Link>
        <Link href="/waitlist" className="rounded-2xl bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.1]">
          Join the waitlist
        </Link>
      </header>
      {children}
      <footer className="mt-16 border-t border-white/10 pt-6 text-xs text-slate-500">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <Link href="/plans" className="hover:text-slate-300">Pricing</Link>
          <Link href="/guides" className="hover:text-slate-300">Position guides</Link>
          <Link href="/drills" className="hover:text-slate-300">Drills</Link>
          {/* WITHOUT THESE THE NEW PAGES ARE ORPHANS. Six hundred pages
              reachable only from sitemap.xml is a set of pages a crawler is
              told about and never given a reason to value — internal links are
              most of how it decides what a site is about. */}
          <Link href="/recipes" className="hover:text-slate-300">Recipes</Link>
          <Link href="/exercises" className="hover:text-slate-300">Exercises</Link>
          <Link href="/collections" className="hover:text-slate-300">Collections</Link>
          <Link href="/cheapest-protein" className="hover:text-slate-300">Cheapest protein</Link>
          <Link href="/privacy" className="hover:text-slate-300">Privacy</Link>
          <Link href="/terms" className="hover:text-slate-300">Terms</Link>
        </div>
        <p className="mt-4">
          General training information, not medical advice. If something hurts, see a
          physiotherapist or doctor.
        </p>
      </footer>
    </main>
  );
}

/** The call to action at the end of every guide. */
export function GuideCta({ what }: { what: string }) {
  return (
    <section className="mt-10 rounded-3xl border border-pitch-400/20 bg-pitch-400/[0.04] p-6">
      <h2 className="text-lg font-extrabold tracking-tight">Get {what} built around you</h2>
      <p className="mt-2 text-sm text-slate-400">
        PocketAthlete builds your program from your sport, your position and how recovered you
        actually are that morning — then adapts it as you log sessions.
      </p>
      <Link href="/waitlist" className="mt-4 inline-block rounded-2xl bg-pitch-500 px-5 py-2.5 text-sm font-semibold text-ink-900">
        Join the waitlist →
      </Link>
    </section>
  );
}
