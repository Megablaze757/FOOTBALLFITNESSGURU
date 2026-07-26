import type { Metadata } from "next";
import Link from "next/link";
import { guideSports, guidePages, sportLabel, SITE } from "@/lib/seo";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";

export const metadata: Metadata = {
  title: "Position training guides",
  description:
    "What each position actually needs to train — the physical qualities, the technical work " +
    "and drills you can do alone. Football, rugby, basketball and running.",
  alternates: { canonical: `${SITE}/guides/` },
};

export default function GuidesIndex() {
  const pages = guidePages();

  return (
    <MarketingShell>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Position training guides</h1>
      <p className="mt-3 text-slate-400">
        A centre back and a winger play the same game and need different bodies. These are the
        physical priorities, the technical work and the drills that matter for each position —
        the same guides the app builds programs from.
      </p>

      {guideSports().map((sport) => {
        const forSport = pages.filter((p) => p.sport === sport);
        if (!forSport.length) return null;
        return (
          <section key={sport} className="mt-8">
            <h2 className="text-xl font-extrabold tracking-tight">{sportLabel(sport)}</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {forSport.map(({ position, slug }) => (
                <Link
                  key={slug}
                  href={`/guides/${sport}/${slug}`}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-200 transition hover:border-pitch-400/40 hover:bg-pitch-400/[0.05]"
                >
                  {position} →
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      <GuideCta what="a program" />
    </MarketingShell>
  );
}
