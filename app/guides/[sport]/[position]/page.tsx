import type { Metadata } from "next";
import { ogImage } from "@/lib/og";
import Link from "next/link";
import { notFound } from "next/navigation";
import { positionGuide } from "@/lib/essentials";
import { skillsForSport, NEEDS_LABEL } from "@/lib/skills";
import { getExercise, type SportId } from "@/lib/exercises";
import { guidePages, positionFromSlug, sportLabel, SITE } from "@/lib/seo";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";
import { jsonLd, graph, drillHowTo, guideArticle, faqPage } from "@/lib/schema";

// One page per sport × position. Static export, so every one is a real HTML
// file with its content already in it — which is the only version a crawler
// ever sees.
export function generateStaticParams() {
  return guidePages().map(({ sport, slug }) => ({ sport, position: slug }));
}

type Params = { params: { sport: string; position: string } };

function resolve(params: Params["params"]) {
  const sport = params.sport as SportId;
  const position = positionFromSlug(sport, params.position);
  return position ? { sport, position } : null;
}

export function generateMetadata({ params }: Params): Metadata {
  const found = resolve(params);
  if (!found) return { title: "Not found" };
  const { sport, position } = found;
  const title = `${position} training guide — ${sportLabel(sport)}`;
  // NAMING THE SPORT. Rugby and basketball both have a "Centre", so without it
  // those two pages shipped the same meta description — the only duplicate
  // pair left on the site.
  const description =
    `What a ${sportLabel(sport).toLowerCase()} ${position.toLowerCase()} actually needs to train: ` +
    `the physical qualities, the technical work, and drills you can do on your own.`;
  const url = `${SITE}/guides/${sport}/${params.position}/`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "article", images: ogImage("guides", title) },
  };
}

export default function PositionGuidePage({ params }: Params) {
  const found = resolve(params);
  if (!found) notFound();
  const { sport, position } = found;

  const guide = positionGuide(sport, position);
  // Drills that name this position, so the page is about them rather than
  // being the same list of everything on every page.
  const drills = skillsForSport(sport, position).filter((d) => d.positions.includes(position));
  const solo = drills.filter((d) => d.needs === "solo");

  const url = `${SITE}/guides/${sport}/${params.position}/`;
  const label = sportLabel(sport);
  const lower = position.toLowerCase();

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(graph([
            guideArticle({
              url,
              headline: `How a ${lower} should train`,
              description: guide.summary,
              keywords: [`${lower} training`, `${lower} ${label.toLowerCase()}`, `${lower} drills`, `${lower} gym program`],
            }),
            // The question this page exists to answer, stated as a Q&A pair.
            // An assistant asked "how should a centre back train?" can lift
            // this whole thing and be right.
            faqPage([
              {
                q: `How should a ${lower} train?`,
                a: `${guide.summary} Physically, prioritise ${guide.physical.join(", ").toLowerCase()}. Technically, work on ${guide.skills.join(", ").toLowerCase()}.`,
              },
              ...(drills.length ? [{
                q: `What drills should a ${lower} do?`,
                a: `${drills.map((d) => d.name).join(", ")}. ${solo.length} of these need nobody but you.`,
              }] : []),
            ]),
            ...drills.map((d) => drillHowTo(d, label, url)),
          ])),
        }}
      />
      <article className="prose-invert">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent-400">
          {label} · Position guide
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
          How a {lower} should train
        </h1>
        <p className="mt-3 text-slate-300">{guide.summary}</p>

        {/* The short answer, up front and self-contained. Someone skimming gets
            it in five seconds; an answer engine lifting one passage gets
            something complete rather than a fragment that needs the rest of
            the page to make sense. */}
        <div className="mt-5 rounded-2xl border border-pitch-400/20 bg-pitch-400/[0.04] p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-accent-400">The short answer</h2>
          <p className="mt-2 text-sm text-slate-200">
            A {lower} should build {guide.physical.slice(0, 2).join(" and ").toLowerCase()},
            and practise {guide.skills.slice(0, 2).join(" and ").toLowerCase()}.
            {drills.length > 0 && ` The drills that matter most are ${drills.slice(0, 3).map((d) => d.name.toLowerCase()).join(", ")}.`}
            {solo.length > 0 && ` ${solo.length} of them need nobody but you.`}
          </p>
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-200">⚡ Prioritise physically</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-slate-400">
              {guide.physical.map((p) => <li key={p}>• {p}</li>)}
            </ul>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-200">🎯 Sharpen technically</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-slate-400">
              {guide.skills.map((s) => <li key={s}>• {s}</li>)}
            </ul>
          </div>
        </section>

        {guide.keyDrills.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-extrabold tracking-tight">Key exercises</h2>
            <div className="mt-3 space-y-3">
              {guide.keyDrills.map((id) => {
                const ex = getExercise(id);
                if (!ex) return null;
                return (
                  <div key={id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <h3 className="text-sm font-bold text-slate-100">{ex.name}</h3>
                    {ex.why && <p className="mt-1 text-sm text-slate-400">{ex.why}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {drills.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xl font-extrabold tracking-tight">
              Technical drills for a {position.toLowerCase()}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {solo.length > 0
                ? `${solo.length} of these need nobody but you.`
                : "Most of these need a partner or a session."}
            </p>
            <div className="mt-4 space-y-5">
              {drills.map((d) => (
                <div key={d.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-slate-100">{d.name}</h3>
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-slate-400">{d.skill}</span>
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-slate-400">
                      {NEEDS_LABEL[d.needs]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-400"><b className="text-slate-300">Setup:</b> {d.setup}</p>
                  <ol className="mt-2 space-y-1 text-sm text-slate-400">
                    {d.how.map((step, i) => <li key={i}>{i + 1}. {step}</li>)}
                  </ol>
                  <p className="mt-2 text-sm text-slate-400"><b className="text-slate-300">Volume:</b> {d.reps}</p>
                  <p className="mt-2 rounded-xl bg-pitch-400/[0.06] p-3 text-sm text-slate-300">
                    <b>Coaching point:</b> {d.coaching}
                  </p>
                  <p className="mt-2 text-sm text-slate-500"><b>Make it harder:</b> {d.progression}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <GuideCta what="a program" />

        <nav className="mt-10 text-sm">
          <Link href={`/drills/${sport}`} className="text-accent-400 hover:underline">
            All {sportLabel(sport).toLowerCase()} drills →
          </Link>
          <span className="mx-2 text-slate-600">·</span>
          <Link href="/guides" className="text-accent-400 hover:underline">Every position guide →</Link>
        </nav>
      </article>
    </MarketingShell>
  );
}
