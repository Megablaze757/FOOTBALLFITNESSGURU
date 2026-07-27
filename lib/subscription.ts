// Subscription tier catalog — the single source of truth for pricing and
// feature copy. Stripe price IDs live in env (server-side), not here.
//
// Every line of feature copy below describes something the app ACTUALLY gates.
// It didn't before: Gold advertised "custom periodised programs" and "full
// exercise library across every sport" when both were free to everyone, so the
// only real differences were video analysis and an AI budget nobody can see.
// Selling a difference that doesn't exist is how you end up refunding people.
// CAPABILITY_TIER below is what both the app and the Worker now enforce.

import type { Tier } from "./types";

export interface TierPlan {
  id: Tier;
  name: string;
  priceLabel: string;
  priceMonthly: number; // GBP/month, for MRR math
  tagline: string;
  features: string[];
  /** The one line answering "why pay more than the tier below?" */
  headline?: string;
  paid: boolean;
}

/**
 * Free-trial length shown in the UI. Must match TRIAL_DAYS on the Worker, which
 * is what actually sets it on the Stripe session — this copy only describes it.
 * Set to 0 here and there to turn trials off.
 */
export const TRIAL_DAYS = 7;

export const TIER_RANK: Record<Tier, number> = { bronze: 0, silver: 1, gold: 2 };

// --- Capabilities ------------------------------------------------------------

/**
 * What each tier can do. This is the contract: the client prompts on these and
 * the Worker refuses the matching endpoints, so the two can't drift into
 * promising different things.
 */
export type Capability =
  | "check_in"        // daily check-in, pain map, readiness
  | "program_local"   // programs built on-device
  | "library"         // exercise library + skill drills
  | "leaderboards"
  | "ai_program"      // programs written by the AI coach
  | "ai_chat"         // ask the coach
  | "nutrition"       // meal plans, macros, food estimation
  | "video_analysis"  // in-browser form analysis
  | "injury_plan"     // AI rehab planning from a written description
  | "ai_challenges"   // personalised weekly objectives
  | "priority_ai";    // straight to the strongest model, no free-tier queue

export const CAPABILITY_TIER: Record<Capability, Tier> = {
  check_in: "bronze",
  library: "bronze",
  leaderboards: "bronze",

  // Programs are the product. Free gets the habit loop — check in, see your
  // readiness, read the drills — and paying is what turns that into a plan.
  program_local: "silver",
  ai_program: "silver",
  ai_chat: "silver",
  nutrition: "silver",

  video_analysis: "gold",
  injury_plan: "gold",
  ai_challenges: "gold",
  priority_ai: "gold",
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

// --- Plans -------------------------------------------------------------------

export const PLANS: TierPlan[] = [
  {
    id: "bronze",
    name: "Bronze",
    priceLabel: "Free",
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
  },
  {
    id: "silver",
    name: "Silver",
    priceLabel: "£15/mo",
    priceMonthly: 15,
    tagline: "The AI coach, writing for you.",
    headline: "Where you stop tracking training and start having a program.",
    paid: true,
    features: [
      "Everything in Bronze",
      "Four-week training blocks — Base, Build, Peak, Deload",
      "AI-written programs that obey your notes — “I don’t train legs” means no legs",
      "Ask the coach: questions about your training, answered in context",
      "Meal plans that fit your week, with a pack-aware shopping list",
      "Describe what you ate and it works out the calories",
    ],
  },
  {
    id: "gold",
    name: "Gold",
    priceLabel: "£20/mo",
    priceMonthly: 20,
    tagline: "The whole performance team.",
    headline: "Silver coaches your training. Gold also checks your technique and manages your injuries.",
    paid: true,
    features: [
      "Everything in Silver",
      "Video form analysis — filmed on your phone, scored on your phone",
      "Injury planner: describe what hurts, get a plan built around it",
      "Weekly objectives set from the habit you’re actually neglecting",
      "Priority AI — straight to the strongest model, no free-tier queue",
      "The largest monthly AI allowance of any plan",
    ],
  },
];

// Team plan — sold separately (not an individual tier). Maps to a coach account
// with Gold features for the whole roster + the squad dashboard.
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
    "Everything in Gold for up to 25 athletes",
    "Coach dashboard with live squad readiness",
    "Build a program once and assign it across the roster",
    "Roster management and athlete invites",
    "Team performance reports (PDF)",
    "Priority support",
  ],
};

export function planFor(tier: Tier): TierPlan {
  return PLANS.find((p) => p.id === tier) ?? PLANS[0];
}
