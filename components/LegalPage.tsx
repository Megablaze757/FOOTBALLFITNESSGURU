import Link from "next/link";
import { LEGAL_UPDATED, LEGAL_CONTACT, type LegalSection } from "@/lib/legal";

/** Shared shell for the privacy and terms pages, so they can't drift apart. */
export function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: LegalSection[] }) {
  return (
    <main className="mx-auto max-w-2xl px-6 pb-24 pt-10">
      <header className="mb-8">
        <Link href="/" className="text-sm text-slate-500 hover:text-accent-400">← PocketAthlete</Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-slate-400">{intro}</p>
        <p className="mt-1 text-xs text-slate-600">Last updated {LEGAL_UPDATED}</p>
      </header>

      <div className="space-y-8">
        {sections.map((s) => (
          <section key={s.heading}>
            <h2 className="text-lg font-bold text-slate-100">{s.heading}</h2>
            {s.body.map((p) => (
              <p key={p} className="mt-2 text-sm leading-relaxed text-slate-300">{p}</p>
            ))}
            {s.bullets && (
              <ul className="mt-3 space-y-1.5">
                {s.bullets.map((b) => (
                  <li key={b} className="flex gap-2 text-sm leading-relaxed text-slate-300">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-pitch-400" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <footer className="mt-12 border-t border-white/10 pt-6 text-sm text-slate-400">
        <p>
          Questions? Email <a href={`mailto:${LEGAL_CONTACT}`} className="text-accent-400 hover:underline">{LEGAL_CONTACT}</a>.
        </p>
        <p className="mt-2 flex gap-4 text-xs">
          <Link href="/privacy" className="hover:text-accent-400">Privacy policy</Link>
          <Link href="/terms" className="hover:text-accent-400">Terms</Link>
        </p>
      </footer>
    </main>
  );
}
