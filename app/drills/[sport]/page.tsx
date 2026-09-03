import type { Metadata } from "next";
import { ogImage } from "@/lib/og";
import Link from "next/link";
import { notFound } from "next/navigation";
import { skillsForSport, skillCategories, NEEDS_LABEL } from "@/lib/skills";
import type { SportId } from "@/lib/exercises";
import { guideSports, guidePages, sportLabel, SITE } from "@/lib/seo";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";
import { jsonLd, graph, drillHowTo, guideArticle } from "@/lib/schema";

export function generateStaticParams() {
  return guideSports().map((sport) => ({ sport }));
}

type Params = { params: { sport: string } };

export function generateMetadata({ params }: Params): Metadata {
  const sport = params.sport as SportId;
  if (!guideSports().includes(sport)) return { title: "Not found" };
  const label = sportLabel(sport);
  const title = `${label} skill drills`;
  const description =
    `Technical ${label.toLowerCase()} drills with setup, coaching points and how to progress them — ` +
    `including the ones you can do on your own.`;
  const url = `${SITE}/drills/${sport}/`;
  return { title, description, alternates: { canonical: url }, openGraph: { images: ogImage("drills", "Skill drills"), title, description, url, type: "article" } };
}

export default function SportDrillsPage({ params }: Params) {
  const sport = params.sport as SportId;
  if (!guideSports().includes(sport)) notFound();

  const label = sportLabel(sport);
  const all = skillsForSport(sport);
  const categories = skillCategories(sport);
  const soloCount = all.filter((d) => d.needs === "solo").length;
  const positions = guidePages().filter((p) => p.sport === sport);

  const url = `${SITE}/drills/${sport}/`;

  return (
    <MarketingShell>
      {/* Every drill marked up as a HowTo. This is what turns "a page about
          heading drills" into the source an assistant quotes when someone asks
          how to practise heading — the steps are bound to a structure rather
          than implied by the layout. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(graph([
            guideArticle({
              url,
              headline: `${label} skill drills`,
              description: `${all.length} technical ${label.toLowerCase()} drills with setup, coaching points and progressions.`,
              keywords: [`${label.toLowerCase()} drills`, `${label.toLowerCase()} training`, "skill drills", "solo drills"],
            }),
            ...all.map((d) => drillHowTo(d, label, url)),
          ])),
        }}
      />
      <article>
        <p className="text-xs font-semibold uppercase tracking-wider text-accent-400">{label}</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{label} skill drills</h1>
        {/* The answer, first. An assistant lifting one passage should get
            something complete and true from the opening sentence — burying it
            under preamble is how a page gets crawled and never cited. */}
        <p className="mt-3 text-slate-300">
          {all.length} technical drills — the ball work, not the gym work. Each one says what you
          need, how to run it, the single coaching point that separates doing it from doing it
          well, and how to make it harder. {soloCount} of them need nobody but you.
        </p>

        {categories.map((cat) => {
          const inCat = all.filter((d) => d.skill === cat);
          if (!inCat.length) return null;
          return (
            <section key={cat} className="mt-10">
              <h2 className="text-xl font-extrabold tracking-tight">{cat}</h2>
              <div className="mt-4 space-y-5">
                {inCat.map((d) => (
                  <div key={d.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-slate-100">{d.name}</h3>
                      <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-slate-400">
                        {NEEDS_LABEL[d.needs]}
                      </span>
                    </div>
                    {d.positions.length > 0 && (
                      <p className="mt-1 text-xs text-slate-500">Matters most for: {d.positions.join(", ")}</p>
                    )}
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
          );
        })}

        <GuideCta what="a training block" />

        {positions.length > 0 && (
          <nav className="mt-10">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">By position</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {positions.map(({ position, slug }) => (
                <Link key={slug} href={`/guides/${sport}/${slug}`} className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-slate-300 transition hover:border-pitch-400/40 hover:text-accent-400">
                  {position}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </article>
    </MarketingShell>
  );
}
