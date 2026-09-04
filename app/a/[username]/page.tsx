import type { Metadata } from "next";
import Link from "next/link";
import { publicAthletes } from "@/lib/public-athletes";
import { membershipLength, profileTitle, profileDescription, MISS_PARAM } from "@/lib/public-profile";
import { levelFor } from "@/lib/gamification";
import { SITE, sportLabel } from "@/lib/seo";
import { ogImage } from "@/lib/og";
import { MarketingShell, GuideCta } from "@/components/MarketingShell";
import { CaptureAthleteRef } from "@/components/CaptureAthleteRef";
import { jsonLd, graph, breadcrumbs } from "@/lib/schema";
import type { SportId } from "@/lib/exercises";

export async function generateStaticParams() {
  // MISS_PARAM first and always — see the note on it. An empty list here is not
  // an empty section of the site, it is a failed export.
  return [{ username: MISS_PARAM }, ...(await publicAthletes()).map((a) => ({ username: a.username }))];
}

async function find(username: string) {
  return (await publicAthletes()).find((a) => a.username === username) ?? null;
}

export async function generateMetadata({ params }: { params: { username: string } }): Promise<Metadata> {
  const athlete = await find(params.username);
  if (!athlete) {
    return {
      title: "No public page at that address",
      description: "This athlete has not published a page, or has taken it down.",
      // noindex, and follow. There is nothing here worth a search result, but
      // the links out of it go to pages there very much are.
      robots: { index: false, follow: true },
    };
  }
  const rank = levelFor(athlete.xp).rank;
  const title = profileTitle(athlete);
  const description = profileDescription(athlete, rank);
  const url = `${SITE}/a/${athlete.username}/`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "profile", images: ogImage("default", title) },
  };
}

export default async function AthletePage({ params }: { params: { username: string } }) {
  const athlete = await find(params.username);

  /**
   * NOT notFound(). This route is exported to static HTML and served by GitHub
   * Pages, which answers 200 for any file that exists — so a 404 here would be
   * a 404 page served with a 200 status, which is the worst of both. An honest
   * page that says what happened, and sends them somewhere, is the better
   * version of the same thing.
   */
  if (!athlete) return <MissingAthlete />;

  const level = levelFor(athlete.xp);
  const url = `${SITE}/a/${athlete.username}/`;
  const since = membershipLength(athlete.created_at);

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: jsonLd(graph([
            {
              "@type": "ProfilePage",
              mainEntity: { "@type": "Person", name: `@${athlete.username}`, url },
            },
            breadcrumbs([
              { name: "PocketAthlete", url: `${SITE}/` },
              { name: `@${athlete.username}`, url },
            ]),
          ])),
        }}
      />

      {/* One name, once. The kicker above this used to print @username and the
          h1 printed a `handle` the view derived from the same username — the
          same string, twice, looking like two different facts. */}
      {/* This page is the athlete's referral link — no query string, because
          a link people read off a screenshot has to stay short. See
          lib/referral.ts: an explicit ?ref= still wins over it. */}
      <CaptureAthleteRef username={athlete.username} />

      <h1 className="pt-2 text-4xl font-extrabold tracking-tight">@{athlete.username}</h1>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span
          className="rounded-full px-4 py-2 text-lg font-extrabold"
          style={{ color: level.color, border: `1px solid ${level.color}55` }}
        >
          {level.emoji} {level.rank}
        </span>
        {[athlete.position, athlete.sport ? sportLabel(athlete.sport as SportId) : null, since]
          .filter(Boolean)
          .map((tag) => (
            <span key={String(tag)} className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-slate-400">
              {tag}
            </span>
          ))}
      </div>

      {/* Rank, and nothing else about their body.
          What a profile shows is a decision that cannot be taken back — see
          migration 0108. This is a rank and an identity, not a record. */}
      <p className="mt-6 max-w-2xl text-slate-400">
        Earned by turning up. Rank comes from sessions trained, daily logs kept
        and food tracked — not from paying for it.
      </p>

      <section className="mt-10 rounded-2xl border border-white/10 p-5">
        <h2 className="text-lg font-extrabold tracking-tight">Train the same way</h2>
        <p className="mt-2 text-sm text-slate-400">
          Every session, every meal costed to the ingredient, and a rank that means the same thing
          for everybody. Free, and no account needed to look.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/exercises/" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200">
            The exercise library
          </Link>
          <Link href="/recipes/" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200">
            Costed recipes
          </Link>
          <Link href="/standards/" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200">
            Strength standards
          </Link>
        </div>
      </section>

      <GuideCta what="a training block" />
    </MarketingShell>
  );
}


/**
 * A link to a page that is not there any more.
 *
 * Public profiles can be switched off, and the links people posted do not go
 * away when they are. Whoever follows one deserves a sentence rather than a
 * dead end.
 */
function MissingAthlete() {
  return (
    <MarketingShell>
      <h1 className="pt-2 text-3xl font-extrabold tracking-tight">No public page at that address</h1>
      <p className="mt-4 max-w-2xl text-slate-400">
        Athlete pages are opt-in, so this one either never existed or has been taken
        down. Nothing is wrong with the link you followed.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/a/" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200">
          Athletes with a page
        </Link>
        <Link href="/exercises/" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200">
          The exercise library
        </Link>
        <Link href="/recipes/" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200">
          Costed recipes
        </Link>
        <Link href="/standards/" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200">
          Strength standards
        </Link>
      </div>
      <GuideCta what="a training block" />
    </MarketingShell>
  );
}
