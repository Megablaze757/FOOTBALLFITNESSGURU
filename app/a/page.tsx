import type { Metadata } from "next";
import Link from "next/link";
import { publicAthletes } from "@/lib/public-athletes";
import { levelFor } from "@/lib/gamification";
import { SITE, sportLabel } from "@/lib/seo";
import { ogImage } from "@/lib/og";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";
import { jsonLd, graph, breadcrumbs } from "@/lib/schema";
import type { SportId } from "@/lib/exercises";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WITHOUT THIS, EVERY ATHLETE PAGE IS AN ORPHAN.
 *
 * The profiles are in the sitemap, which gets them crawled — and crawled is not
 * the same as valued. Internal links are most of how a crawler decides what a
 * site is about and which of its pages matter, and a page reachable only from
 * sitemap.xml is a page nothing on the site has vouched for. The footer note in
 * MarketingShell makes exactly this point about the six hundred recipe and
 * exercise pages.
 *
 * It is also the page the miss state sends people to, and the honest answer to
 * "who else uses this".
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const metadata: Metadata = {
  // The layout appends " | PocketAthlete"; saying it here too reads as a bug.
  title: "Athlete profiles",
  description:
    "Athletes who train on PocketAthlete and chose to make their rank public — earned "
    + "from sessions trained, daily logs kept and food tracked, not from paying for it.",
  alternates: { canonical: `${SITE}/a/` },
  openGraph: {
    title: "Athletes on PocketAthlete",
    url: `${SITE}/a/`,
    images: ogImage("default", "Athletes on PocketAthlete"),
  },
};

export default async function AthleteIndex() {
  const athletes = await publicAthletes();

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: jsonLd(graph([breadcrumbs([
            { name: "PocketAthlete", url: `${SITE}/` },
            { name: "Athletes", url: `${SITE}/a/` },
          ])])),
        }}
      />
      <h1 className="text-4xl font-extrabold tracking-tight">Athletes</h1>
      <p className="mt-3 max-w-2xl text-slate-400">
        Ranks here are earned by turning up — sessions trained, daily logs kept, food
        tracked. Nobody can buy one. These athletes chose to make theirs public; it is
        off by default for everybody else.
      </p>

      {athletes.length > 0 ? (
        // Ordered by XP, which is how the view returns them: the page is a
        // leaderboard whether or not it is called one, and pretending otherwise
        // by shuffling would only make it harder to read.
        <ul className="mt-8 grid gap-2 sm:grid-cols-2">
          {athletes.map((a) => {
            const level = levelFor(a.xp);
            return (
              <li key={a.username}>
                <Link
                  href={`/a/${a.username}/`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 px-4 py-3 transition hover:border-white/20"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-100">@{a.username}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {[a.position, a.sport ? sportLabel(a.sport as SportId) : null].filter(Boolean).join(" · ") || "Athlete"}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-extrabold" style={{ color: level.color }}>
                    {level.emoji} {level.rank}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        /* An empty list is the normal state of this page for a while, and it is
           the state a local build always renders — so it has to read as a page,
           not as a failure. */
        <p className="mt-8 rounded-2xl border border-white/10 px-5 py-6 text-slate-400">
          Nobody has published a page yet. Athletes can turn one on from their profile —
          it shows a rank, a sport and a position, and nothing else.
        </p>
      )}

      <GuideCta what="a training block" />
    </MarketingShell>
  );
}
