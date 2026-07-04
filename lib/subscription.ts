// Subscription tier catalog — the single source of truth for pricing/feature copy
// shown in the UI. Stripe price IDs live in env (server-side), not here.

import type { Tier } from "./types";

export interface TierPlan {
  id: Tier;
  name: string;
  priceLabel: string;
  priceMonthly: number; // USD/month, for MRR math
  tagline: string;
  features: string[];
  paid: boolean;
}

export const TIER_RANK: Record<Tier, number> = { bronze: 0, silver: 1, gold: 2 };

export const PLANS: TierPlan[] = [
  {
    id: "bronze",
    name: "Bronze",
    priceLabel: "Free",
    priceMonthly: 0,
    tagline: "The daily habit loop.",
    paid: false,
    features: [
      "Daily check-in & body pain map",
      "Readiness gauge (local estimate)",
      "14-day trend dashboard",
      "Last 30 days of benchmarks",
    ],
  },
  {
    id: "silver",
    name: "Silver",
    priceLabel: "$15/mo",
    priceMonthly: 15,
    tagline: "AI-powered recovery insights.",
    paid: true,
    features: [
      "Everything in Bronze",
      "AI Coach daily narrative & risk score",
      "Advanced statistical trends",
      "Nutrition & macro tracking",
    ],
  },
  {
    id: "gold",
    name: "Gold",
    priceLabel: "$20/mo",
    priceMonthly: 20,
    tagline: "The full performance team, for you.",
    paid: true,
    features: [
      "Everything in Silver",
      "AI coach — custom periodised programs",
      "Video biomechanics & injury root-cause",
      "Adaptive nutrition & hydration targets",
      "Full exercise library across every sport",
      "Benchmark & body-composition history",
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
  priceLabel: "$150/mo",
  priceMonthly: 150,
  tagline: "For clubs, coaches & S&C staff.",
  features: [
    "Everything in Gold for up to 25 athletes",
    "Coach dashboard with live squad readiness",
    "Per-athlete programs & injury flags",
    "Roster management & athlete invites",
    "Team performance reports (PDF)",
    "Priority support",
  ],
};

export function planFor(tier: Tier): TierPlan {
  return PLANS.find((p) => p.id === tier) ?? PLANS[0];
}

/** True if `have` tier includes everything in `need` tier. */
export function tierMeets(have: Tier, need: Tier): boolean {
  return TIER_RANK[have] >= TIER_RANK[need];
}
