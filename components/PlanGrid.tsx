"use client";

import Link from "next/link";
import { PLANS, TIER_RANK, TEAM_PLAN, TRIAL_DAYS } from "@/lib/subscription";
import { UpgradeButton } from "@/components/UpgradeButton";
import { track } from "@/lib/funnel";
import type { Tier } from "@/lib/types";

/**
 * The plan cards, shared by the public page and the in-app upgrade page.
 *
 * One component because the two used to be one page behind a login wall — which
 * meant nobody could see the price before creating an account, and "how much is
 * it?" is the first question anyone asks. Keeping them separate but identical
 * is how the public price and the in-app price quietly drift apart.
 *
 * `mode` is the only difference: signed out, the CTA starts a signup carrying
 * the chosen plan; signed in, it starts Checkout.
 */
export function PlanGrid({ mode, currentTier = "bronze" }: {
  mode: "public" | "app";
  currentTier?: Tier;
}) {
  return (
    <>
      {/* Columns follow the plan count, so adding one back later doesn't leave
          a gap where the third card used to be. */}
      <div className={`mx-auto grid items-start gap-4 ${PLANS.length > 2 ? "md:grid-cols-3" : "max-w-3xl md:grid-cols-2"}`}>
        {PLANS.map((plan, i) => {
          const isCurrent = mode === "app" && plan.id === currentTier;
          const isDowngrade = mode === "app" && TIER_RANK[plan.id] < TIER_RANK[currentTier];
          // Highlight the plan being SOLD, not a hard-coded id — pinning this
          // to "gold" broke the moment the tiers changed.
          const featured = plan.paid;
          const accent = featured ? "text-pitch-400" : "text-slate-200";

          return (
            <div
              key={plan.id}
              className={`${featured ? "card-premium" : "card"} animate-fade-up flex h-full flex-col p-6 ${
                isCurrent ? "ring-2 ring-pitch-400/60 shadow-glow" : ""
              }`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center justify-between">
                <h2 className={`text-lg font-extrabold ${accent}`}>{plan.name}</h2>
                {featured && !isCurrent && TRIAL_DAYS > 0 && <span className="chip text-pitch-400">{TRIAL_DAYS} days free</span>}
              </div>
              <div className="mt-2 text-3xl font-extrabold">{plan.priceLabel}</div>
              <p className="mt-1 text-sm text-slate-400">{plan.tagline}</p>
              {/* The reason to step up, in one line. A feature list alone makes
                  someone do the comparison themselves, and most won't. */}
              {plan.headline && !isCurrent && (
                <p className="mt-2 text-sm font-medium text-slate-200">{plan.headline}</p>
              )}
              {plan.paid && TRIAL_DAYS > 0 && !isCurrent && !isDowngrade && (
                <p className="mt-2 text-xs font-semibold text-pitch-400">
                  {TRIAL_DAYS} days free — cancel any time before it ends
                </p>
              )}

              <ul className="my-5 flex-1 space-y-2 text-sm text-slate-300">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className={featured ? "text-pitch-400" : "text-slate-400"} aria-hidden="true">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <div className="rounded-2xl bg-white/[0.06] px-4 py-2.5 text-center text-sm font-medium text-slate-400">Current plan</div>
              ) : isDowngrade ? (
                <div className="rounded-2xl border border-white/10 px-4 py-2.5 text-center text-sm text-slate-400">Included in your plan</div>
              ) : mode === "app" && plan.paid ? (
                <UpgradeButton tier={plan.id} label={TRIAL_DAYS > 0 ? `Start ${TRIAL_DAYS} days free` : `Upgrade to ${plan.name}`} />
              ) : mode === "public" ? (
                <Link
                  href={plan.paid ? `/login?plan=${plan.id}` : "/login"}
                  onClick={() => track("plan_cta", { plan: plan.id, from: "public" })}
                  className={plan.paid ? "btn-primary" : "btn-ghost"}
                >
                  {plan.paid && TRIAL_DAYS > 0 ? `Start ${TRIAL_DAYS} days free` : "Create a free account"}
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Team plan */}
      <div className="card-premium mt-5 flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold text-pitch-400">🏆 {TEAM_PLAN.name}</h2>
            <span className="chip text-slate-300">for clubs</span>
          </div>
          <p className="mt-1 text-sm text-slate-400">{TEAM_PLAN.tagline}</p>
          <ul className="mt-3 grid gap-x-4 gap-y-1.5 text-sm text-slate-300 sm:grid-cols-2">
            {TEAM_PLAN.features.map((f) => (
              <li key={f} className="flex gap-2"><span className="text-pitch-400" aria-hidden="true">✓</span>{f}</li>
            ))}
          </ul>
        </div>
        <div className="shrink-0 text-center">
          <div className="text-3xl font-extrabold">{TEAM_PLAN.priceLabel}</div>
          <a
            href="mailto:sales@pocketathlete.com?subject=PocketAthlete%20Team%20plan"
            onClick={() => track("team_enquiry", { from: mode })}
            className="btn-primary mt-3 w-auto px-6"
          >
            Contact us
          </a>
        </div>
      </div>

      <p className="mt-5 text-center text-xs text-slate-400">
        Secure payments by Stripe. Cancel any time from your profile — no email, no phone call.
      </p>
    </>
  );
}
