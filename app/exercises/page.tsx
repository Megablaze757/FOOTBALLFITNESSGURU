import type { Metadata } from "next";
import Link from "next/link";
import { EXERCISES, isRunEntry, EXERCISE_CATEGORIES } from "@/lib/exercises";
import { contentPages, SITE } from "@/lib/seo";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";
import { publishableHubs, hubPath } from "@/lib/hubs";
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

      {/* The hubs first. An index of 382 is a list; these are the pages a
          list-shaped search is actually looking for. */}
      <section className="mt-8">
        <h2 className="text-xl font-extrabold tracking-tight">Browse by muscle or kit</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {publishableHubs(MOVEMENTS).map(({ hub, members }) => (
            <Link
              key={`${hub.kind}-${hub.slug}`}
              href={hubPath(hub)}
              className="rounded-full border border-white/10 px-3.5 py-2 text-sm text-slate-300 transition hover:border-pitch-400/40"
            >
              {hub.name} <span className="text-slate-600">{members.length}</span>
            </Link>
          ))}
        </div>
      </section>

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
