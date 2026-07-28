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
export const TRIAL_DAYS = 7;

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

export const CAPABILITY_TIER: Record<Capability, Tier> = {
  // Free is a real product: the daily habit, the whole coaching library, and
  // your place on the leaderboards. That's what earns the right to sell.
  check_in: "bronze",
  library: "bronze",
  leaderboards: "bronze",

  // Everything else is Pro. No second paid step to evaluate.
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
    "Full exercise library and every skill drill",
    "Position guides for your sport",
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
    "Ask the coach anything about your training",
    "Video form analysis — filmed on your phone, scored on your phone",
    "Injury planner: describe what hurts, get a plan built around it",
    "Meal plans that fit your week, with a pack-aware shopping list",
    "Weekly objectives set from the habit you’re neglecting",
  ],
};

/**
 * The unused tier. Nobody is on it — it existed as the £15 middle plan for a
 * few hours and was never sold to anyone. Kept in the list only so that if a
 * row somewhere still says "silver", it resolves to a paid plan with full
 * access rather than silently reading as free.
 */
const LEGACY_SILVER: TierPlan = {
  id: "silver",
  name: "Pro (legacy)",
  priceLabel: "£15/mo",
  priceMonthly: 15,
  tagline: "Everything in Pro.",
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
