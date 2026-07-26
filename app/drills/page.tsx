import type { Metadata } from "next";
import Link from "next/link";
import { skillsForSport } from "@/lib/skills";
import { guideSports, sportLabel, SITE } from "@/lib/seo";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";

export const metadata: Metadata = {
  title: "Skill drills by sport",
  description:
    "Technical drills for football, rugby, basketball and running — setup, coaching points and " +
    "progressions, including which ones you can do on your own.",
  alternates: { canonical: `${SITE}/drills/` },
};

export default function DrillsIndex() {
  return (
    <MarketingShell>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Skill drills by sport</h1>
      <p className="mt-3 text-slate-400">
        The ball work, not the gym work. Every drill states what you need, how to run it, the one
        coaching point that matters, and how to progress it — because &ldquo;practise crossing&rdquo;
        is not coaching.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {guideSports().map((sport) => {
          const drills = skillsForSport(sport);
          const solo = drills.filter((d) => d.needs === "solo").length;
          return (
            <Link
              key={sport}
              href={`/drills/${sport}`}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-pitch-400/40 hover:bg-pitch-400/[0.05]"
            >
              <h2 className="text-lg font-extrabold text-slate-100">{sportLabel(sport)}</h2>
              <p className="mt-1 text-sm text-slate-400">
                {drills.length} drills · {solo} you can do alone
              </p>
            </Link>
          );
        })}
      </div>

      <GuideCta what="a training block" />
    </MarketingShell>
  );
}
