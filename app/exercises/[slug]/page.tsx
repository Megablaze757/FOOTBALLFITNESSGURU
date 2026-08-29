import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EXERCISES, isRunEntry } from "@/lib/exercises";
import { contentPages, findBySlug, SITE } from "@/lib/seo";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";
import { jsonLd, graph, exerciseSchema, breadcrumbs } from "@/lib/schema";
import { formGuide } from "@/lib/form-guide";

const MOVEMENTS = EXERCISES.filter((e) => !isRunEntry(e));

export function generateStaticParams() {
  return contentPages(MOVEMENTS).map(({ slug }) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const ex = findBySlug(MOVEMENTS, params.slug);
  if (!ex) return { title: "Not found" };
  const url = `${SITE}/exercises/${params.slug}/`;
  const title = `How to do a ${ex.name.toLowerCase()}`;
  const description = ex.why || `${ex.name}: what it works, how to do it, and the cues that matter.`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "article" },
  };
}

export default function ExercisePage({ params }: { params: { slug: string } }) {
  const ex = findBySlug(MOVEMENTS, params.slug);
  if (!ex) notFound();

  const url = `${SITE}/exercises/${params.slug}/`;
  const guide = formGuide(ex.name);
  /**
   * Only a description that actually TEACHES the movement becomes steps.
   *
   * `hasHowTo` is false for the bulk gym entries, whose description is a
   * one-line note on what the lift is for — useful, and not a method. Putting
   * it under "How to do it" promises a step-by-step and delivers a sentence,
   * which is worse than saying nothing. Same rule the in-app card follows.
   */
  const steps = ex.hasHowTo && ex.description
    ? ex.description.split(/(?<=\.)\s+/).filter((s) => s.trim().length > 12)
    : [];

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: jsonLd(graph([
            exerciseSchema({
              name: ex.name,
              url,
              description: ex.why || ex.name,
              muscles: ex.muscles,
              equipment: ex.equipment,
              steps,
            }),
            breadcrumbs([
              { name: "PocketAthlete", url: `${SITE}/` },
              { name: "Exercises", url: `${SITE}/exercises/` },
              { name: ex.name, url },
            ]),
          ])),
        }}
      />

      <nav className="pt-2 text-sm text-slate-500">
        <Link href="/exercises/" className="hover:text-pitch-400">← All exercises</Link>
      </nav>

      <h1 className="mt-3 text-4xl font-extrabold tracking-tight">{ex.name}</h1>
      {ex.why && <p className="mt-3 max-w-2xl text-lg text-slate-300">{ex.why}</p>}

      <div className="mt-5 flex flex-wrap gap-2 text-xs">
        {[ex.category, ex.equipment, ex.tempo].filter(Boolean).map((tag) => (
          <span key={String(tag)} className="rounded-full border border-white/10 px-3 py-1 text-slate-400">
            {tag}
          </span>
        ))}
      </div>

      {ex.muscles.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-extrabold tracking-tight">What it works</h2>
          <p className="mt-2 text-slate-300">{ex.muscles.join(", ")}</p>
        </section>
      )}

      {steps.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-extrabold tracking-tight">How to do it</h2>
          <ol className="mt-3 space-y-3">
            {steps.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-pitch-400/15 text-[11px] font-extrabold text-pitch-400">
                  {i + 1}
                </span>
                <span className="text-slate-300">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {!ex.hasHowTo && ex.description && (
        <section className="mt-8">
          <h2 className="text-xl font-extrabold tracking-tight">What it&apos;s for</h2>
          <p className="mt-2 text-slate-300">{ex.description}</p>
        </section>
      )}

      {ex.cues.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-extrabold tracking-tight">Cues that matter</h2>
          <ul className="mt-3 space-y-2">
            {ex.cues.map((cue) => (
              <li key={cue} className="flex gap-2 text-slate-300">
                <span className="text-pitch-400">›</span>{cue}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* A LINK, NOT AN EMBED. An iframe on every one of these pages would load
          YouTube's player for a crawler and for anybody who never presses play
          — see FormGuideEmbed for why the app itself does not either. */}
      {guide?.videoId && (
        <p className="mt-8">
          <a
            href={guide.url}
            target="_blank"
            rel="noreferrer"
            className="text-pitch-400 underline underline-offset-4"
          >
            Watch a form guide for the {ex.name.toLowerCase()} ↗
          </a>
        </p>
      )}

      <GuideCta what="a training block" />
    </MarketingShell>
  );
}
