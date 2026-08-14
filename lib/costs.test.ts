import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLATFORM, STRIPE_FIXED_GBP, STRIPE_PERCENT, USD_TO_GBP,
  costLines, monthlyMargin, stripeFees, totalMonthlyCost, unitEconomics,
} from "./costs";

/**
 * THE ROWS MUST ADD UP TO THE HEADLINE.
 *
 * A breakdown whose lines do not sum to the total is worse than no breakdown:
 * the reader does the arithmetic once, gets a different answer, and stops
 * trusting every number on the page. The first version of costLines listed only
 * the per-charge half of the Stripe fee and failed exactly this.
 */
test("the cost lines sum to the total", () => {
  for (const usage of [
    { aiSpendUsd: 0, paidSubs: 0, mrr: 0 },
    { aiSpendUsd: 12.5, paidSubs: 2, mrr: 40 },
    { aiSpendUsd: 300, paidSubs: 140, mrr: 2800 },
  ]) {
    const summed = costLines(usage).reduce((n, l) => n + l.monthly, 0);
    assert.ok(Math.abs(summed - totalMonthlyCost(usage)) < 0.02,
      `lines sum to ${summed} but the total says ${totalMonthlyCost(usage)}`);
  }
});

/**
 * MEASURED AND ESTIMATED MUST STAY DISTINGUISHABLE.
 *
 * Only AI spend is real — the app records cost_usd per call. Everything else is
 * published pricing, and presenting a guess with the same authority as a
 * measurement is the way a cost report starts lying. The UI reads this flag, so
 * losing it silently downgrades honesty to decoration.
 */
test("only the lines the app actually measures are marked as measured", () => {
  const lines = costLines({ aiSpendUsd: 10, paidSubs: 1, mrr: 20, commissionGbp: 3 });
  const measured = lines.filter((l) => l.basis === "measured").map((l) => l.label).sort();
  // Named rather than counted. Counting broke the moment commission was added —
  // a second genuinely measured line — and a count cannot tell a new measured
  // line from an estimate that has been mislabelled as one.
  assert.deepEqual(measured, ["AI providers", "Affiliate commission"],
    "the set of measured lines changed; an estimate may be posing as a measurement");
  assert.ok(lines.every((l) => l.basis === "measured" || l.basis === "estimated"),
    "a line has no basis, so the UI cannot label it");
});

test("AI spend is converted from dollars, not passed through as pounds", () => {
  const lines = costLines({ aiSpendUsd: 100, paidSubs: 0, mrr: 0 });
  const ai = lines.find((l) => l.label === "AI providers");
  assert.ok(ai);
  assert.equal(ai.monthly, Math.round(100 * USD_TO_GBP * 100) / 100);
  assert.notEqual(ai.monthly, 100, "dollars are being reported as pounds");
});

test("Stripe takes both a percentage and a flat fee", () => {
  // 2 subs at £20 = £40. 1.5% of 40 = 0.60, plus 2 × 20p = 0.40. Total £1.00.
  assert.equal(stripeFees(40, 2), 1);
  // The flat fee alone must not be the whole answer, or larger accounts are
  // undercounted by exactly the percentage.
  assert.ok(stripeFees(1000, 1) > STRIPE_FIXED_GBP,
    "the percentage of revenue is being dropped");
  assert.equal(stripeFees(0, 0), 0);
});

/**
 * A LOSS HAS TO BE REPORTABLE. Early on the honest number is negative, and a
 * dashboard that clamps at zero is hiding the only fact that matters.
 */
test("margin reports a loss rather than clamping at zero", () => {
  const { profit } = monthlyMargin({ aiSpendUsd: 0, paidSubs: 1, mrr: 5 });
  assert.ok(profit < 0, "a £5 month against a fixed platform bill is a loss");
});

test("break-even is expressed in subscriptions, and never Infinity", () => {
  // £20 a sub, 2 subs, so the platform bill decides how many are needed.
  const withCustomers = monthlyMargin({ aiSpendUsd: 0, paidSubs: 2, mrr: 40 });
  const fixed = PLATFORM.reduce((n, p) => n + p.gbp, 0);
  assert.ok(withCustomers.breakEvenSubs >= Math.floor(fixed / 20),
    "break-even does not cover the fixed platform cost");

  // No customers means no price to divide by. Reported as 0, not Infinity or NaN.
  const none = monthlyMargin({ aiSpendUsd: 0, paidSubs: 0, mrr: 0 });
  assert.equal(none.breakEvenSubs, 0);
  assert.ok(Number.isFinite(none.profit));
});

test("every platform line is named and priced, so the total can be explained", () => {
  assert.ok(PLATFORM.length >= 3, "the platform bill is suspiciously short");
  for (const p of PLATFORM) {
    assert.ok(p.label.length > 0, "a platform line has no label");
    assert.ok(p.note.length > 0, `${p.label} has no note saying what it buys`);
    assert.ok(Number.isFinite(p.gbp) && p.gbp >= 0, `${p.label} has no usable price`);
  }
  assert.ok(STRIPE_PERCENT > 0 && STRIPE_PERCENT < 0.1, "the Stripe rate looks wrong");
});

/**
 * COMMISSION IS A COST OF REVENUE.
 *
 * Every pound of MRR that arrived through an affiliate costs a percentage of
 * itself. Leaving it out of profit overstates the business by exactly the amount
 * being paid away, and the error grows with every affiliate sale — so it is the
 * one omission that gets worse the better things go.
 */
test("affiliate commission is deducted from profit", () => {
  const without = monthlyMargin({ aiSpendUsd: 0, paidSubs: 5, mrr: 100 });
  const with20 = monthlyMargin({ aiSpendUsd: 0, paidSubs: 5, mrr: 100, commissionGbp: 20 });
  assert.equal(round(without.profit - with20.profit), 20,
    "commission does not reduce profit pound for pound");
  assert.ok(with20.breakEvenSubs > without.breakEvenSubs,
    "break-even ignores commission, so it is reported as easier than it is");

  // And it appears as its own line rather than being buried in the total.
  const line = costLines({ aiSpendUsd: 0, paidSubs: 5, mrr: 100, commissionGbp: 20 })
    .find((l) => l.label === "Affiliate commission");
  assert.ok(line, "commission is not shown as a cost line");
  assert.equal(line.monthly, 20);
});

/**
 * THE NUMBER THAT DECIDES WHETHER TO CHASE GROWTH.
 *
 * Fixed platform cost is paid whether you have one customer or a thousand, so
 * average cost per customer says nothing about whether the NEXT one is worth
 * having. Contribution — price minus the costs that customer personally causes
 * — is what tells you that, and it is the figure to compare against whatever an
 * acquisition costs.
 */
test("contribution per subscriber excludes fixed costs", () => {
  const u = { aiSpendUsd: 20, paidSubs: 10, mrr: 200, commissionGbp: 30 };
  const e = unitEconomics(u);

  assert.equal(e.arpu, 20, "revenue per paying customer is wrong");
  // Variable only: Stripe + commission + AI. Never the Supabase bill.
  const fixed = PLATFORM.reduce((n, p) => n + p.gbp, 0);
  assert.ok(e.contributionPerSub > e.arpu - (totalMonthlyCost(u) / u.paidSubs),
    "contribution is being reduced by fixed costs, which the next customer does not add");
  assert.ok(fixed > 0 && e.contributionPerSub < e.arpu, "contribution should sit below the price");

  // Gross margin is a percentage of revenue and cannot exceed 100.
  assert.ok(e.grossMarginPct <= 100 && e.grossMarginPct > 0);
});

test("unit economics do not divide by zero", () => {
  const e = unitEconomics({ aiSpendUsd: 0, paidSubs: 0, mrr: 0, activeUsers: 0 });
  for (const [k, v] of Object.entries(e)) {
    assert.ok(Number.isFinite(v), `${k} is ${v} with no customers`);
  }
});

function round(n: number) { return Math.round(n * 100) / 100; }
