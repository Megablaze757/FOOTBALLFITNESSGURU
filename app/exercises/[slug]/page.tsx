import type { Metadata } from "next";
import { ogImage } from "@/lib/og";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EXERCISES, isRunEntry } from "@/lib/exercises";
import { contentPages, findBySlug, exerciseMetaDescription, SITE } from "@/lib/seo";
import { STUB_WHY } from "@/lib/exercise-draft";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";
import { jsonLd, graph, exerciseSchema, breadcrumbs } from "@/lib/schema";
import { formGuide } from "@/lib/form-guide";
import { relatedExercises } from "@/lib/related";
import { hubsFor, hubPath } from "@/lib/hubs";
import { slugify } from "@/lib/seo";

const MOVEMENTS = EXERCISES.filter((e) => !isRunEntry(e));

export function generateStaticParams() {
  return contentPages(MOVEMENTS).map(({ slug }) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const ex = findBySlug(MOVEMENTS, params.slug);
  if (!ex) return { title: "Not found" };
  const url = `${SITE}/exercises/${params.slug}/`;
  const title = `How to do a ${ex.name.toLowerCase()}`;
  // NOT ex.why. For 197 of these that is "Builds the legs." — forty-three
  // pages sharing one sentence — while ex.description holds a real how-to for
  // every one of them. See exerciseMetaDescription.
  const description = exerciseMetaDescription(ex, (w) => STUB_WHY.test(w));
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "article", images: ogImage("exercises", ex.name) },
  };
}

export default function ExercisePage({ params }: { params: { slug: string } }) {
  const ex = findBySlug(MOVEMENTS, params.slug);
  if (!ex) notFound();

  const url = `${SITE}/exercises/${params.slug}/`;
  const guide = formGuide(ex.name);
  // Same string the <meta> gets, for the same reason — a schema.org
  // description repeated across 197 pages is read by the same crawler.
  const described = exerciseMetaDescription(ex, (w) => STUB_WHY.test(w));
  /**
   * Somewhere to go next. Every one of these pages linked only to its own
   * index — 382 of 383 dead ends, and the thinnest of them 107 words.
   */
  const related = relatedExercises(ex, MOVEMENTS);
  // The topics this movement belongs to — the way back up to a list page.
  const hubs = hubsFor(ex, MOVEMENTS);
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
              description: described,
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
        <Link href="/exercises/" className="hover:text-accent-400">← All exercises</Link>
      </nav>

      <h1 className="mt-3 text-4xl font-extrabold tracking-tight">{ex.name}</h1>
      {ex.why && <p className="mt-3 max-w-2xl text-lg text-slate-300">{ex.why}</p>}

      <div className="mt-5 flex flex-wrap gap-2 text-xs">
        {[ex.category, ex.equipment, ex.tempo].filter(Boolean).map((tag) => (
          <span key={String(tag)} className="rounded-full border border-white/10 px-3 py-1 text-slate-400">
            {tag}
          </span>
        ))}
        {hubs.map((h) => (
          <Link
            key={`${h.kind}-${h.slug}`}
            href={hubPath(h)}
            className="rounded-full border border-pitch-400/30 px-3 py-1 text-accent-400 transition hover:border-pitch-400/60"
          >
            All {h.name.toLowerCase()} exercises
          </Link>
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
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-pitch-400/15 text-[11px] font-extrabold text-accent-400">
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
                <span className="text-accent-400">›</span>{cue}
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
            className="text-accent-400 underline underline-offset-4"
          >
            Watch a form guide for the {ex.name.toLowerCase()} ↗
          </a>
        </p>
      )}

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-extrabold tracking-tight">Train the same thing</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {related.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/exercises/${slugify(r.name)}/`}
                  className="block rounded-2xl border border-white/10 px-4 py-3 transition hover:border-pitch-400/40"
                >
                  <span className="font-semibold text-slate-100">{r.name}</span>
                  <span className="block text-xs text-slate-500">
                    {[r.equipment, r.muscles.join(", ")].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <GuideCta what="a training block" />
    </MarketingShell>
  );
}
