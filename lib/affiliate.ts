// =============================================================================
// Affiliate commission.
//
// Someone shares a link, a person subscribes, the sharer earns a cut. If the
// sharer was themselves recruited by another affiliate, that person earns a
// smaller cut of the same payment.
//
// TWO RULES SHAPE ALL OF THIS, and they're the difference between a normal
// affiliate programme and something a regulator takes an interest in:
//
//   1. Commission is only ever a percentage of money a real customer actually
//      paid. Nobody is paid for signing up an affiliate, for a free trial, or
//      for recruitment activity of any kind. Under the Consumer Protection from
//      Unfair Trading Regulations 2008 a scheme whose rewards derive mainly
//      from recruitment rather than sales is a pyramid scheme and criminal —
//      paying strictly on collected revenue is what keeps this the other thing.
//   2. Depth is capped at two levels. Deeper chains add little for the people
//      involved and a lot of obligation: the UK Trading Schemes Act 1996 is
//      what governs multi-level arrangements, and the further this goes the
//      more of it applies.
//
// Money is handled in PENNIES as integers throughout. Floating-point pounds
// lose a penny somewhere and then the ledger doesn't reconcile, which is the
// kind of bug you find out about from the person you underpaid.
// =============================================================================

/** How deep the chain pays. Level 1 is the direct referrer. */
export const MAX_LEVEL = 2;

/** Rates when an affiliate has none of their own, in percent. */
export const DEFAULT_RATES: Record<number, number> = {
  1: 20, // the person who actually brought the customer in
  2: 5,  // whoever recruited that person
};

/**
 * The most that can ever leave the business on a single payment, in percent.
 *
 * A hard ceiling rather than a warning. The schema constrains rates to 0–100
 * and the UI warns above 35, but a bad UPDATE run by hand would otherwise pay
 * out more than the customer paid — inventing money and, worse, doing it
 * quietly. Clamped here so no configuration mistake can create a negative
 * margin.
 */
export const MAX_TOTAL_PCT = 60;

// --- Stripe fees -------------------------------------------------------------
//
// Commission is a share of what ACTUALLY LANDED, not of the headline price.
// On a £20 subscription Stripe keeps roughly 50p; paying 20% of £20 rather
// than 20% of £19.50 gives away 10p per customer per month of money that was
// never received. Small, until it isn't.
//
// The real fee comes from the balance transaction on the charge and is used
// whenever the webhook can fetch it. These constants are the fallback for when
// it can't — a fee still gets deducted rather than silently assuming zero.
export const STRIPE_PCT = 1.5;   // UK cards, standard Stripe pricing
export const STRIPE_FIXED_PENNIES = 20;

/** Estimated Stripe fee on a payment. Used only when the real figure is unavailable. */
export function estimateStripeFee(grossPennies: number): number {
  if (grossPennies <= 0) return 0;
  return Math.min(grossPennies, Math.round((grossPennies * STRIPE_PCT) / 100) + STRIPE_FIXED_PENNIES);
}

/**
 * What's left after Stripe, and therefore what commission is calculated on.
 *
 * Never negative: a tiny payment where the fixed fee exceeds the amount earns
 * nobody anything rather than producing a negative commission line.
 */
export function netAfterFee(grossPennies: number, feePennies?: number | null): number {
  if (grossPennies <= 0) return 0;
  const fee = typeof feePennies === "number" && feePennies >= 0
    ? feePennies
    : estimateStripeFee(grossPennies);
  return Math.max(0, grossPennies - fee);
}

export interface AffiliateNode {
  id: string;
  code: string;
  /** Who recruited this affiliate. Null for someone who joined directly. */
  parentId: string | null;
  /** Their own level-1 rate, in percent. Null falls back to DEFAULT_RATES. */
  ratePct: number | null;
  active: boolean;
  /** Set when the affiliate is also an app user — used to block self-referral. */
  userId?: string | null;
}

export interface CommissionLine {
  affiliateId: string;
  /** 1 = direct referrer, 2 = their recruiter. */
  level: number;
  ratePct: number;
  /** Pennies. Always rounded down, never up. */
  amountPennies: number;
  /** What the rate was applied to — gross minus Stripe's fee. Stored on the
   *  ledger row so a payout can be explained months later. */
  netPennies: number;
}

/**
 * Round a percentage of an amount, in pennies.
 *
 * Floor, not round. Across thousands of lines the difference is small, but it
 * is always in the house's favour, and paying out a fraction of a penny more
 * than was earned is the error that compounds into a ledger that won't balance.
 */
export function pctOf(amountPennies: number, pct: number): number {
  if (!Number.isFinite(amountPennies) || !Number.isFinite(pct)) return 0;
  if (amountPennies <= 0 || pct <= 0) return 0;
  return Math.floor((amountPennies * pct) / 100);
}

/**
 * Walk up the referral chain from a starting affiliate.
 *
 * Stops at MAX_LEVEL, at a missing parent, at an inactive affiliate, and — the
 * one that matters — at a cycle. A chain that loops would otherwise pay
 * commission forever, and hierarchies acquire loops the first time someone
 * edits one by hand.
 */
export function chainFor(
  startCode: string,
  byCode: Map<string, AffiliateNode>,
  byId: Map<string, AffiliateNode>,
): AffiliateNode[] {
  const start = byCode.get(startCode);
  if (!start || !start.active) return [];

  const chain: AffiliateNode[] = [start];
  const seen = new Set<string>([start.id]);

  let current = start;
  while (chain.length < MAX_LEVEL) {
    const parentId = current.parentId;
    if (!parentId || seen.has(parentId)) break; // missing, or a loop
    const parent = byId.get(parentId);
    if (!parent || !parent.active) break;
    chain.push(parent);
    seen.add(parent.id);
    current = parent;
  }
  return chain;
}

export interface SplitInput {
  /** The referral code on the paying customer's profile. */
  referralCode: string | null | undefined;
  /** What the customer was charged, in pennies, net of tax and discounts. */
  paidPennies: number;
  /**
   * Stripe's actual fee on this payment, in pennies, from the balance
   * transaction. Omit and it's estimated — but the real figure is worth
   * fetching, because a card from outside the UK costs materially more and an
   * estimate would overpay on exactly those.
   */
  stripeFeePennies?: number | null;
  byCode: Map<string, AffiliateNode>;
  byId: Map<string, AffiliateNode>;
  /** The paying customer's own user id, to stop anyone paying themselves. */
  payerUserId?: string | null;
}

/**
 * Split one payment into commission lines.
 *
 * Returns an empty list — not an error — for anything that shouldn't earn:
 * no referral code, an unknown or paused affiliate, a zero or refunded amount,
 * or someone using their own link. A payment that earns nothing is the normal
 * case, not a failure.
 */
export function splitCommission({
  referralCode, paidPennies, stripeFeePennies, byCode, byId, payerUserId,
}: SplitInput): CommissionLine[] {
  if (!referralCode || paidPennies <= 0) return [];

  // Everything below is a share of the NET — what actually reached the account.
  const net = netAfterFee(paidPennies, stripeFeePennies);
  if (net <= 0) return [];

  const chain = chainFor(referralCode, byCode, byId);
  if (!chain.length) return [];

  // Self-referral. Someone subscribing through their own link is just a
  // discount they've awarded themselves, and it's the first thing anyone tries.
  if (payerUserId && chain.some((a) => a.userId && a.userId === payerUserId)) return [];

  const lines: CommissionLine[] = [];
  let spentPct = 0;

  chain.forEach((affiliate, i) => {
    const level = i + 1;
    // Only the direct referrer gets a custom rate; upline levels use the
    // scheme's rate, so one person's negotiated deal can't quietly inflate
    // what everyone above them earns.
    const requested = level === 1 ? affiliate.ratePct ?? DEFAULT_RATES[1] : DEFAULT_RATES[level];
    if (!requested || requested <= 0) return;

    // Clamp against the ceiling, so a misconfigured rate is capped rather than
    // paying out more than came in. The direct referrer is first in the chain,
    // so if anything gets trimmed it's the upline — which is the right way
    // round: the person who did the work keeps their share.
    const ratePct = Math.min(requested, MAX_TOTAL_PCT - spentPct);
    if (ratePct <= 0) return;
    spentPct += ratePct;

    const amountPennies = pctOf(net, ratePct);
    if (amountPennies <= 0) return;
    lines.push({ affiliateId: affiliate.id, level, ratePct, amountPennies, netPennies: net });
  });

  return lines;
}

/**
 * Total commission on a payment, as a percentage of it.
 *
 * Worth checking against the margin before changing any rate: with a £20
 * subscription, Stripe's fee, and the AI budget, paying out more than about a
 * third means the customer costs more than they bring in.
 */
export function totalPayoutPct(lines: CommissionLine[], paidPennies: number): number {
  if (paidPennies <= 0) return 0;
  const total = lines.reduce((n, l) => n + l.amountPennies, 0);
  return Math.round((total / paidPennies) * 1000) / 10;
}

/** Would this parent assignment create a loop? */
export function wouldCycle(
  childId: string,
  newParentId: string,
  byId: Map<string, AffiliateNode>,
): boolean {
  if (childId === newParentId) return true;
  let cursor: string | null = newParentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === childId) return true;
    if (seen.has(cursor)) return true; // already looping
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return false;
}

export function poundsFromPennies(p: number): string {
  return `£${(p / 100).toFixed(2)}`;
}
