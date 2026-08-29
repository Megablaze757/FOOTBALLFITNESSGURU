import type { Metadata } from "next";
import Link from "next/link";
import { EXERCISES, isRunEntry, EXERCISE_CATEGORIES } from "@/lib/exercises";
import { contentPages, SITE } from "@/lib/seo";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";
import { jsonLd, graph, breadcrumbs } from "@/lib/schema";

/** Runs live on Guides — a run is a session, not a movement you look up. */
const MOVEMENTS = EXERCISES.filter((e) => !isRunEntry(e));

export const metadata: Metadata = {
  title: "Exercise library — how to do every movement",
  description:
    `${MOVEMENTS.length} exercises with the muscles they work, the coaching cues that matter and `
    + "a form video for the ones worth watching before you load them.",
  alternates: { canonical: `${SITE}/exercises/` },
};

export default function ExercisesIndex() {
  const pages = contentPages(MOVEMENTS);

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: jsonLd(graph([breadcrumbs([
            { name: "PocketAthlete", url: `${SITE}/` },
            { name: "Exercises", url: `${SITE}/exercises/` },
          ])])),
        }}
      />

      <h1 className="text-4xl font-extrabold tracking-tight">Exercise library</h1>
      <p className="mt-3 max-w-2xl text-slate-400">
        {MOVEMENTS.length} movements, with what each one actually works and the two or three cues
        that decide whether it does.
      </p>

      {EXERCISE_CATEGORIES.map((category) => {
        const inCategory = MOVEMENTS.filter((e) => e.category === category);
        if (inCategory.length === 0) return null;
        return (
          <section key={category} className="mt-10">
            <h2 className="text-xl font-extrabold tracking-tight">{category}</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {inCategory.map((ex) => {
                const slug = pages.find((p) => p.id === ex.id)!.slug;
                return (
                  <li key={ex.id}>
                    <Link
                      href={`/exercises/${slug}/`}
                      className="block rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 transition hover:border-white/20"
                    >
                      <span className="block text-sm font-semibold text-slate-100">{ex.name}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {ex.muscles.slice(0, 3).join(" · ") || ex.equipment}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <GuideCta what="a training block" />
    </MarketingShell>
  );
}
