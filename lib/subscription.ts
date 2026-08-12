// =============================================================================
// Plans.
//
// TWO plans for individuals: Free, and Pro at £20. Plus Team for clubs.
//
// It was three, with usage meters separating the top two — 4 program builds a
// month, 30 coach questions. That was a mistake, and worth writing down so it
// doesn't get reinvented:
//
//   * Metering is a B2B pattern. Nobody counts their coach questions in a £20
//     consumer fitness app, and a cap is invisible until the moment it bites —
//     which is mid-block, on a Tuesday, for someone who was enjoying it. That
//     produces refund requests, not upgrades.
//   * Two paid tiers £5 apart forced a difference that wasn't really there, so
//     it got manufactured. A buyer with a choice they can't evaluate doesn't
//     upgrade; they stall.
//   * It optimised the second conversion (Silver -> Gold) for a product with
//     none of the first (Free -> paid). Wrong order.
//
// One paid plan means one decision, one price to test, one code path. A higher
// tier can be added the day there's evidence of who wants what — that's easy.
// Taking features off people who already pay for them is not.
//
// Pro IS the gold tier. The comped beta testers were already on gold, so
// pricing at £20 needed no migration and changed nobody's access.
// =============================================================================

import type { Tier } from "./types";

export interface TierPlan {
  id: Tier;
  name: string;
  priceLabel: string;
  priceMonthly: number; // GBP/month, for MRR math
  tagline: string;
  features: string[];
  /** The one line answering "why pay?" */
  headline?: string;
  paid: boolean;
}

/**
 * Free-trial length shown in the UI. Must match TRIAL_DAYS on the Worker, which
 * is what actually sets it on the Stripe session — this copy only describes it.
 */
export const TRIAL_DAYS = 14;

export const TIER_RANK: Record<Tier, number> = { bronze: 0, silver: 1, gold: 2 };

/**
 * The tier that "paid" means, and the Stripe price it maps to.
 *
 * Sold as Pro at £20 on the gold price id. This was silver/£15 briefly; moving
 * it cost nothing because nobody was paying yet and the comped beta testers
 * were already on gold. `silver` is now the unused one — kept in the type so
 * any historic row still resolves rather than silently reading as free.
 */
export const PAID_TIER: Tier = "gold";

// --- Capabilities ------------------------------------------------------------

/**
 * What each tier can do.
 *
 * Everything paid sits at `silver`, so Pro and the legacy Gold grant exactly
 * the same thing. The client prompts on these and the Worker refuses the
 * matching endpoints, so the two can't drift into promising different things.
 */
export type Capability =
  | "check_in"        // daily check-in, pain map, readiness
  | "program"         // training programs, AI-written or on-device
  | "library"         // exercise library + skill drills
  | "leaderboards"
  | "ai_chat"         // ask the coach
  | "nutrition"       // meal plans, macros, food estimation
  | "video_analysis"  // in-browser form analysis
  | "injury_plan"     // AI rehab planning from a written description
  | "ai_challenges"   // personalised weekly objectives
  | "exercise_analytics"; // per-exercise progression, estimated 1RM, PR history

/**
 * WHAT FREE IS. The daily habit and what it shows you about yourself: check in,
 * see your readiness, watch your own numbers move, and hold your place on the
 * leaderboards. Nothing is generated for you and nothing is written for you.
 *
 * The coaching CONTENT moved out of it. The exercise library, the skill drills
 * and the position guides used to be free on the reasoning that they earned the
 * right to sell — but they are the product, not the advert for it, and giving
 * away a full coaching library while charging for the plan that arranges it is
 * the wrong way round.
 *
 * Leaderboards stay free deliberately. They cost nothing to run, they are worth
 * more the more people are on them, and a leaderboard behind a paywall is a
 * leaderboard with nobody on it.
 */
export const CAPABILITY_TIER: Record<Capability, Tier> = {
  check_in: "bronze",
  leaderboards: "bronze",

  // Everything else is Pro. No second paid step to evaluate.
  library: "silver",
  program: "silver",
  ai_chat: "silver",
  nutrition: "silver",
  video_analysis: "silver",
  injury_plan: "silver",
  ai_challenges: "silver",
  // Free still shows total volume and most-trained drills. What's paid is the
  // per-lift picture: is my squat actually going up, and when did I last PR.
  exercise_analytics: "silver",
};

/**
 * Statuses that mean "there is a subscription here to manage".
 *
 * NOT THE SAME QUESTION AS `can()`. That asks what to unlock; this asks whether
 * to show someone the controls for a plan — cancel, pause, change card. The two
 * diverge in both directions and both matter:
 *
 *   past_due  A payment failed and Stripe is retrying. Access is gone, but the
 *             subscription very much exists, and this is the athlete who most
 *             needs the portal. Hiding billing from them is how a card that
 *             expired becomes a cancellation.
 *   paused    Deliberately suspended, resumes itself. Access is off; there is
 *             obviously still a plan.
 *   canceled  Over. They are on Free.
 *   incomplete  Checkout was started and never finished. Never a plan.
 */
const LIVE_STATUSES = new Set(["active", "past_due", "paused"]);

/**
 * Is this athlete on a paid plan right now?
 *
 * The profile page used to answer this with `!!stripe_customer_id`, which is
 * not the same question at all: a Stripe customer id is permanent, so anyone
 * who has EVER subscribed keeps one. Cancel, drop to Free, and the page went on
 * offering "Cancel or pause" for a plan that no longer existed — under the
 * words "you keep access until the end of the period you've paid for".
 */
export function hasLivePlan(sub: { status?: string | null } | null | undefined): boolean {
  return !!sub?.status && LIVE_STATUSES.has(sub.status);
}

/** True if `have` tier includes everything in `need` tier. */
export function tierMeets(have: Tier, need: Tier): boolean {
  return TIER_RANK[have] >= TIER_RANK[need];
}

export function can(tier: Tier, capability: Capability): boolean {
  return tierMeets(tier, CAPABILITY_TIER[capability]);
}

/** The tier someone has to buy to unlock this. */
export function tierNeededFor(capability: Capability): Tier {
  return CAPABILITY_TIER[capability];
}

// --- Guard rails, not pricing levers -----------------------------------------

/**
 * The only remaining cap, and it isn't a pricing lever.
 *
 * Five concurrent programs is well past anything a person can actually follow;
 * it exists so a runaway loop or a bad script can't fill the table. Free is 0
 * because programs are the paid product.
 */
export const MAX_ACTIVE_PROGRAMS: Record<Tier, number> = {
  bronze: 0,
  silver: 5,
  gold: 5,
};

export function maxActivePrograms(tier: Tier): number {
  return MAX_ACTIVE_PROGRAMS[tier] ?? 0;
}

// --- Plans -------------------------------------------------------------------

const FREE: TierPlan = {
  id: "bronze",
  name: "Free",
  priceLabel: "£0",
  priceMonthly: 0,
  tagline: "The daily habit, free forever.",
  paid: false,
  features: [
    "Daily check-in with the body pain map",
    "Readiness score, worked out on your device",
    "Your progress: trends, history and personal records",
    "Leaderboards and rank progression",
  ],
};

const PRO: TierPlan = {
  id: "gold",
  name: "Pro",
  priceLabel: "£20/mo",
  priceMonthly: 20,
  tagline: "Everything, for one price.",
  headline: "Where you stop tracking training and start having a program.",
  paid: true,
  features: [
    "Everything in Free",
    "Four-week training blocks — Base, Build, Peak, Deload",
    "Programs that obey your notes — “I don’t train legs” means no legs",
    "The full exercise library, skill drills and position guides",
    "Ask the coach anything about your training",
    "Video form analysis — filmed on your phone, scored on your phone",
    "Injury planner: describe what hurts, get a plan built around it",
    "Meal plans that fit your week, with a pack-aware shopping list",
    "Weekly objectives set from the habit you’re neglecting",
  ],
};

/**
 * The row value nobody should ever be shown.
 *
 * `silver` existed as a £15 middle plan for a few hours and was never sold. It
 * survives only so a historic row saying "silver" resolves to a paid plan
 * instead of silently reading as free — it is a DATA value, not a product.
 *
 * It used to present itself as one: named "Pro (legacy)", priced at £15, and
 * carrying its own smaller video quota. So the handful of accounts holding that
 * value were told, on their profile and on the video page, that they were on an
 * inferior plan — with no way to leave it, because it is not for sale and their
 * access is already identical to Pro. Being labelled legacy is a reason to
 * churn, and it was describing something that isn't true.
 *
 * It answers to Pro's name, Pro's price and Pro's limits now. The id stays
 * `silver` because that is what is written in the database.
 */
const LEGACY_SILVER: TierPlan = {
  id: "silver",
  name: PRO.name,
  priceLabel: PRO.priceLabel,
  priceMonthly: PRO.priceMonthly,
  tagline: PRO.tagline,
  paid: true,
  features: PRO.features,
};

/** What the pricing pages show. */
export const PLANS: TierPlan[] = [FREE, PRO];

/** Every plan including the ones no longer sold — for admin and lookups. */
export const ALL_PLANS: TierPlan[] = [FREE, PRO, LEGACY_SILVER];

// Team plan — sold separately (not an individual tier).
export interface TeamPlan {
  name: string;
  priceLabel: string;
  priceMonthly: number;
  tagline: string;
  features: string[];
}

export const TEAM_PLAN: TeamPlan = {
  name: "Team",
  priceLabel: "£150/mo",
  priceMonthly: 150,
  tagline: "For clubs, coaches & S&C staff.",
  features: [
    "Everything in Pro for up to 25 athletes",
    "Coach dashboard with live squad readiness",
    "Build a program once and assign it across the roster",
    "Roster management and athlete invites",
    "Team performance reports (PDF)",
    "Priority support",
  ],
};

export function planFor(tier: Tier): TierPlan {
  return ALL_PLANS.find((p) => p.id === tier) ?? FREE;
}

/**
 * Video uploads allowed per calendar month, per tier.
 *
 * MUST MATCH `public.video_quota()` in migration 0036 — the database is the
 * enforcement and this is only here so the app can say "3 of 3 used" before
 * making someone wait out a 60MB upload that RLS is going to reject.
 *
 * Two copies of a limit is a drift risk, and it is accepted deliberately: the
 * alternative is an extra round trip to an RPC on every visit to the video
 * page, to learn a number that changes about once a year. `videoQuotaMatchesSql`
 * in the test suite reads the migration and fails if these disagree, which
 * removes the only real danger.
 */
export const VIDEO_QUOTA: Record<Tier, number> = {
  gold: 40,
  // Pro is Pro. This was 15 — a quarter of the allowance, on a plan that grants
  // identical access, shown to the athlete as "15 of this month's uploads on
  // Pro (legacy)". See LEGACY_SILVER.
  silver: 40,
  // Video analysis IS Pro, so free gets none. Three was a taste of a paid
  // feature that the paywall in front of it says you cannot have, which is the
  // worst of both: it teaches free users the feature exists, lets them build a
  // habit on it, and then takes it away on the fourth clip.
  bronze: 0,
};
