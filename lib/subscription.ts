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
    priceLabel: "$9/mo",
    priceMonthly: 9,
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
    priceLabel: "$19/mo",
    priceMonthly: 19,
    tagline: "The full performance suite.",
    paid: true,
    features: [
      "Everything in Silver",
      "Full benchmark history",
      "Video biomechanics & heatmaps (Phase 3)",
      "Personalised drill programs",
    ],
  },
];

export function planFor(tier: Tier): TierPlan {
  return PLANS.find((p) => p.id === tier) ?? PLANS[0];
}

/** True if `have` tier includes everything in `need` tier. */
export function tierMeets(have: Tier, need: Tier): boolean {
  return TIER_RANK[have] >= TIER_RANK[need];
}
