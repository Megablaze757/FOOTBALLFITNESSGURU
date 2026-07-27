import type { Metadata } from "next";
import Link from "next/link";
import { TRIAL_DAYS } from "@/lib/subscription";
import { SITE } from "@/lib/seo";
import { PlanGrid } from "@/components/PlanGrid";
import { MarketingShell } from "@/components/MarketingShell";

// Public and indexable. Pricing used to live inside the authenticated app,
// which meant "how much is it?" — the first question anyone asks — could only
// be answered by creating an account first.
export const metadata: Metadata = {
  title: "Pricing",
  description:
    `PocketAthlete plans: a free tier for the daily habit, £15/mo for AI-written training ` +
    `programs and nutrition, £20/mo for video form analysis and injury planning. ` +
    `${TRIAL_DAYS} days free on any paid plan.`,
  alternates: { canonical: `${SITE}/plans/` },
  openGraph: {
    title: "PocketAthlete pricing",
    description: `Free to start. ${TRIAL_DAYS} days free on any paid plan. Cancel any time.`,
    url: `${SITE}/plans/`,
  },
};

const FAQ = [
  {
    q: `What happens after the ${TRIAL_DAYS} free days?`,
    a: `The plan you chose starts billing. Cancel any time before then from your profile and you're not charged — it's Stripe's own billing portal, so no email and no phone call.`,
  },
  {
    q: "What do I get without paying?",
    a: "The daily check-in and readiness score, the full exercise library, every skill drill, the position guides and the leaderboards. Free is the daily habit; paid is the training plan built around you.",
  },
  {
    q: "Can I switch plans or cancel?",
    a: "Any time, from your profile. Cancelling leaves you access until the end of the period you've already paid for.",
  },
  {
    q: "Do I need a gym?",
    a: "No. Tell it what equipment you have and it programs around it. A lot of the technical drills need nothing but a ball and a wall.",
  },
];

export default function PlansPage() {
  return (
    <MarketingShell>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Simple pricing</h1>
      <p className="mt-3 text-slate-400">
        Free to start, and free forever for the daily habit. A private performance coach is
        £100+ an hour — this is the whole staff, every day, from £15 a month.
      </p>

      <div className="mt-8">
        <PlanGrid mode="public" />
      </div>

      <section className="mt-12">
        <h2 className="text-xl font-extrabold tracking-tight">Questions</h2>
        <div className="mt-4 space-y-3">
          {FAQ.map((f) => (
            <div key={f.q} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h3 className="text-sm font-bold text-slate-100">{f.q}</h3>
              <p className="mt-1.5 text-sm text-slate-400">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-3xl border border-pitch-400/20 bg-pitch-400/[0.04] p-6 text-center">
        <h2 className="text-lg font-extrabold tracking-tight">Not sure yet?</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
          Read the position guides and skill drills first — they&apos;re free, no account needed,
          and they&apos;re the same coaching the app builds programs from.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link href="/guides" className="rounded-2xl border border-white/10 px-5 py-2.5 text-sm font-semibold text-slate-200">
            Position guides
          </Link>
          <Link href="/drills" className="rounded-2xl border border-white/10 px-5 py-2.5 text-sm font-semibold text-slate-200">
            Skill drills
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
