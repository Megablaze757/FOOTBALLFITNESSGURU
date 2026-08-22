// =============================================================================
// What it costs to run this, per month.
//
// WHAT IS REAL AND WHAT IS NOT. Exactly one line here is measured: AI spend,
// which the app already records per user per month in `ai_spend.cost_usd`.
// Everything else is a subscription or a per-transaction fee taken from
// published pricing, because nothing in this system can see a supplier's
// invoice. That distinction is carried through to the UI — every line says
// which kind it is — because a made-up number presented like a measured one is
// worse than no number at all.
//
// If a plan changes, edit PLATFORM below. It is the one place to change it, and
// the report will follow.
//
// Stripe fees are the exception among the estimates: they are per-transaction
// and derived from actual revenue, so while the RATE is published rather than
// observed, the amount tracks reality closely.
// =============================================================================

/** Rough, and deliberately fixed rather than fetched. A live FX call in a cost
 *  report is a network dependency that can only make the number less reliable. */
export const USD_TO_GBP = 0.79;

export interface CostLine {
  label: string;
  /** Estimated monthly cost, in GBP. */
  monthly: number;
  note: string;
  /** measured = derived from data this app records. estimated = published pricing. */
  basis: "measured" | "estimated";
}

/**
 * The fixed platform bill.
 *
 * Defaults are the paid tiers this project's setup implies — Supabase Pro
 * (auth, Postgres, storage, Edge Functions), Cloudflare Workers paid (the API
 * at apex-api), Resend (transactional and the launch send), and the domain.
 * Free tiers are entered as 0 rather than omitted, so the line still appears
 * and it is obvious what would start costing money if usage grew.
 */
export const PLATFORM: { label: string; gbp: number; note: string }[] = [
  { label: "Supabase", gbp: 20, note: "Pro plan — database, auth, storage, Edge Functions" },
  { label: "Cloudflare Workers", gbp: 4, note: "Paid plan for the API worker" },
  { label: "Resend", gbp: 0, note: "Free tier up to 3,000 emails a month" },
  { label: "Domain", gbp: 1, note: "pocketathlete.com, annual cost spread over 12" },
];

/**
 * Stripe UK standard pricing: 1.5% + 20p per successful domestic card charge.
 * Cards issued outside the UK cost more; this is the floor, not the ceiling,
 * and it is labelled as an estimate for that reason.
 */
/**
 * THE APP-WIDE MONTHLY AI CEILING, in USD. Mirrored in the Worker, which
 * enforces it (APP_BUDGET_USD in cloudflare/src/index.ts).
 *
 * $94 is £74 here, and £74 is what is left of a £100-a-month all-in bill once
 * PLATFORM is paid. So this is not a guess at what AI will cost — it is the
 * most it is allowed to cost, and the Worker stops paying for models before it
 * is exceeded.
 *
 * TWO COPIES OF ONE NUMBER, and that is a deliberate cost. The Worker is a
 * separate module deployed by pasting a file into a dashboard; it cannot import
 * from lib/. lib/ai-ceiling.test.ts asserts the two agree, so drift fails the
 * build rather than showing an admin a limit that is not the limit.
 */
export const AI_CEILING_USD = 94;

export const STRIPE_PERCENT = 0.015;
export const STRIPE_FIXED_GBP = 0.20;

export interface Usage {
  /** Sum of ai_spend.cost_usd for the current period. Measured. */
  aiSpendUsd: number;
  /** Stripe-backed active subscriptions — one charge each per month. */
  paidSubs: number;
  /** Monthly recurring revenue in GBP, for the margin. */
  mrr: number;
  /**
   * Affiliate commission earned this month, in GBP. Measured — 0052 records it
   * per invoice in pennies, reversals excluded.
   *
   * This is a COST OF REVENUE and not optional: every pound that arrived
   * through an affiliate costs a percentage of itself. A profit figure that
   * leaves it out overstates the business by exactly the amount being paid
   * away, and the error grows with every affiliate sale.
   */
  commissionGbp?: number;
  /** Distinct people who checked in within 30 days. For cost per active user. */
  activeUsers?: number;
}

export function costLines({ aiSpendUsd, paidSubs, mrr, commissionGbp = 0 }: Usage): CostLine[] {
  const lines: CostLine[] = PLATFORM.map((p) => ({
    label: p.label,
    monthly: p.gbp,
    note: p.note,
    basis: "estimated" as const,
  }));

  // The one line that is not a guess — and the one line with a ceiling on it,
  // which is worth saying here because this is where somebody comes when they
  // are worried about the bill. A cap nobody can see is a cap nobody trusts.
  const ceilingGbp = round2(AI_CEILING_USD * USD_TO_GBP);
  lines.push({
    label: "AI providers",
    monthly: round2(aiSpendUsd * USD_TO_GBP),
    note: `Recorded per call in ai_spend — $${round2(aiSpendUsd).toFixed(2)} of a $${AI_CEILING_USD} (£${ceilingGbp.toFixed(0)}) monthly ceiling`,
    basis: "measured",
  });

  // THE WHOLE FEE, both halves. Listing only the per-charge part left the lines
  // failing to add up to the total, which is the one property a cost breakdown
  // has to have — a reader who sums the rows and gets a different answer stops
  // trusting every number on the page.
  lines.push({
    label: "Stripe fees",
    monthly: stripeFees(mrr, paidSubs),
    note: `${(STRIPE_PERCENT * 100).toFixed(1)}% of revenue plus ${(STRIPE_FIXED_GBP * 100).toFixed(0)}p × ${paidSubs} charge${paidSubs === 1 ? "" : "s"}`,
    basis: "estimated",
  });

  // AFFILIATE COMMISSION IS NOT HERE ANY MORE, and that is the point.
  //
  // It used to sit in this list beside the hosting bill and the AI spend, which
  // made the arithmetic right and the story wrong. Commission is not something
  // the business BUYS — it is revenue that never arrives. Billing £500 and
  // paying £50 away is not £500 of income with a £50 expense; it is £450 of
  // income. Accountants call it contra-revenue for that reason.
  //
  // Practically it is the difference between "what did I charge" and "what
  // landed", and that gap is the thing an owner most needs to see, because it
  // scales with affiliate sales rather than with usage. It is now a deduction
  // from revenue — see `netRevenue` — so the page reads gross, then what you
  // actually take, then profit.
  //
  // The profit number is unchanged: MRR - commission - costs is the same
  // arithmetic as MRR - (costs + commission). Only where it is subtracted moved.

  return lines;
}

/**
 * What actually landed, after affiliates take their cut.
 *
 * Reversed commission is already excluded upstream, in 0080 — a refunded or
 * charged-back sale costs nothing in commission, and counting it would
 * understate this.
 */
export function netRevenue(usage: Usage): number {
  return round2(usage.mrr - (usage.commissionGbp ?? 0));
}

/**
 * Stripe takes a cut of revenue as well as a flat fee, so it cannot be computed
 * from usage alone. Kept separate from costLines' per-charge portion rather
 * than folded in, because the two halves answer different questions: the flat
 * fee scales with customer count, the percentage scales with price.
 */
export function stripeFees(mrr: number, paidSubs: number): number {
  return round2(mrr * STRIPE_PERCENT + paidSubs * STRIPE_FIXED_GBP);
}

/**
 * What it costs to run the thing, in GBP.
 *
 * Commission is deliberately NOT in here — it is netted off revenue instead,
 * see `netRevenue`. Leaving it in would double-count it against profit now that
 * profit is computed from net revenue.
 */
export function totalMonthlyCost(usage: Usage): number {
  const platform = PLATFORM.reduce((n, p) => n + p.gbp, 0);
  const ai = usage.aiSpendUsd * USD_TO_GBP;
  return round2(platform + ai + stripeFees(usage.mrr, usage.paidSubs));
}

/**
 * The three numbers, in the order an owner actually asks for them: what did I
 * charge, what landed, what is left.
 *
 * Negative profit is the normal state early on and is reported as such rather
 * than clamped — a dashboard that cannot show a loss is not telling you
 * anything you need to hear.
 */
export function monthlyMargin(usage: Usage): {
  gross: number;
  commission: number;
  net: number;
  profit: number;
  breakEvenSubs: number;
} {
  const cost = totalMonthlyCost(usage);
  const commission = round2(usage.commissionGbp ?? 0);
  const net = netRevenue(usage);
  const profit = round2(net - cost);

  /**
   * How many subscriptions would cover the running costs, at what a
   * subscription is currently WORTH — net of the commission being paid away on
   * an average one, not its sticker price. Using gross ARPU here would say you
   * break even at a customer count that does not, in fact, break even.
   *
   * Undefined with no customers, because there is no price to divide by, and
   * reported as 0 rather than Infinity.
   */
  const perSub = usage.paidSubs > 0 ? net / usage.paidSubs : 0;
  const breakEvenSubs = perSub > 0 ? Math.ceil(cost / perSub) : 0;

  return { gross: round2(usage.mrr), commission, net, profit, breakEvenSubs };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * THE NUMBERS THAT DECIDE THINGS.
 *
 * Total cost divided by customers is the wrong figure for almost every decision,
 * because the platform bill is paid whether there is one customer or a thousand.
 * What matters when weighing growth is CONTRIBUTION: the price minus the costs
 * that customer personally causes — Stripe's cut, their affiliate's commission,
 * their share of AI spend. That is the amount each additional subscriber leaves
 * behind, and the figure to hold against whatever it costs to win one.
 *
 * Gross margin is the same idea as a percentage, and the one to watch over time:
 * if it falls as you grow, something variable is scaling faster than revenue.
 */
export interface UnitEconomics {
  /** Average revenue per paying customer. */
  arpu: number;
  /** Costs a single subscriber causes: Stripe, commission, their AI usage. */
  variableCostPerSub: number;
  /** What each additional subscriber leaves after their own costs. */
  contributionPerSub: number;
  /** Contribution as a percentage of revenue. */
  grossMarginPct: number;
  /** Total monthly cost spread over people actually using it. */
  costPerActiveUser: number;
}

export function unitEconomics(usage: Usage): UnitEconomics {
  const { mrr, paidSubs, aiSpendUsd, activeUsers = 0 } = usage;

  /**
   * ARPU IS NET OF COMMISSION, for the same reason profit is: what a subscriber
   * is worth is what they leave behind, not what their invoice said. Commission
   * used to be counted here as a variable COST per subscriber, which produced
   * the identical contribution figure by a route that reads as "every customer
   * costs you commission" — and most of them do not, because most do not come
   * through an affiliate. Netting it off revenue says the true thing: on
   * average, this is what a subscription is actually worth to you.
   */
  const net = netRevenue(usage);
  const variable = stripeFees(mrr, paidSubs) + aiSpendUsd * USD_TO_GBP;

  // Every division guarded. A dashboard that renders NaN or Infinity on its
  // first day is one nobody opens again, and "no customers yet" is a normal
  // state rather than an error.
  const arpu = paidSubs > 0 ? net / paidSubs : 0;
  const variableCostPerSub = paidSubs > 0 ? variable / paidSubs : 0;
  const contributionPerSub = round2(arpu - variableCostPerSub);
  // Against NET revenue, so it cannot read above 100% of what you actually take.
  const grossMarginPct = net > 0 ? round1(((net - variable) / net) * 100) : 0;
  const costPerActiveUser = activeUsers > 0 ? round2(totalMonthlyCost(usage) / activeUsers) : 0;

  return {
    arpu: round2(arpu),
    variableCostPerSub: round2(variableCostPerSub),
    contributionPerSub,
    grossMarginPct,
    costPerActiveUser,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
