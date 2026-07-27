import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tierMeets, planFor, PLANS, ALL_PLANS, CAPABILITY_TIER, can, tierNeededFor,
  PAID_TIER, maxActivePrograms, TRIAL_DAYS, type Capability,
} from "./subscription";

test("tierMeets respects the ranking", () => {
  assert.ok(tierMeets("gold", "silver"));
  assert.ok(tierMeets("silver", "silver"));
  assert.ok(tierMeets("silver", "bronze"));
  assert.ok(!tierMeets("bronze", "silver"));
});

test("exactly one paid plan is sold", () => {
  // Two paid tiers £5 apart forced a difference that wasn't there, so it got
  // manufactured with usage meters. One decision converts better than two.
  const paid = PLANS.filter((p) => p.paid);
  assert.equal(paid.length, 1, `${paid.length} paid plans on the pricing page`);
  assert.equal(paid[0].id, PAID_TIER);
});

test("the free plan is still a real product", () => {
  // Free has to be worth opening daily — that's what earns the right to sell.
  for (const c of ["check_in", "library", "leaderboards"] as Capability[]) {
    assert.ok(can("bronze", c), `free can't ${c}`);
  }
  assert.ok(PLANS[0].features.length >= 4);
});

test("free cannot build a program", () => {
  assert.ok(!can("bronze", "program"));
  assert.equal(maxActivePrograms("bronze"), 0);
});

test("Pro unlocks everything that isn't free", () => {
  for (const c of Object.keys(CAPABILITY_TIER) as Capability[]) {
    assert.ok(can(PAID_TIER, c), `Pro can't ${c} — there is no higher plan to sell it on`);
  }
});

test("every paid tier grants everything, sold or not", () => {
  // Whichever tier is currently sold, anyone on ANY paid tier must keep full
  // access. A historic subscriber becoming second-class after a pricing change
  // is the bug that hit video analysis.
  for (const tier of ["silver", "gold"] as const) {
    for (const c of Object.keys(CAPABILITY_TIER) as Capability[]) {
      assert.ok(can(tier, c), `a ${tier} account lost ${c}`);
    }
    assert.equal(planFor(tier).id, tier, "planFor must not fall back to free");
    assert.ok(planFor(tier).paid, `${tier} should resolve to a paid plan`);
  }
});

test("tiers that aren't sold still resolve, but aren't advertised", () => {
  const unsold = ALL_PLANS.filter((p) => p.paid && p.id !== PAID_TIER);
  for (const p of unsold) {
    assert.ok(!PLANS.some((x) => x.id === p.id), `${p.id} should not be on the pricing page`);
    assert.equal(planFor(p.id).id, p.id, `${p.id} must still resolve for historic rows`);
  }
});

test("the sold tier is the one on the pricing page", () => {
  const sold = PLANS.filter((p) => p.paid);
  assert.equal(sold.length, 1);
  assert.equal(sold[0].id, PAID_TIER);
});

test("no capability requires a tier nobody can buy", () => {
  for (const c of Object.keys(CAPABILITY_TIER) as Capability[]) {
    const need = tierNeededFor(c);
    assert.notEqual(need, "gold", `${c} needs gold, which isn't sold — it would be unreachable`);
  }
});

test("planFor falls back to free for anything unknown", () => {
  assert.equal(planFor("bronze").paid, false);
});

test("the paid plan says why to pay, and prices itself", () => {
  const pro = planFor(PAID_TIER);
  assert.ok(pro.headline && pro.headline.length > 20, "no headline reason to upgrade");
  assert.ok(pro.priceMonthly > 0);
  assert.ok(pro.priceLabel.includes("£"));
  assert.ok(pro.features.length >= 6, "one paid plan has to carry the whole story");
});

test("the concurrent-program cap is a guard rail, not a lever", () => {
  // If this ever differs between paid tiers it's become a pricing device again.
  assert.equal(maxActivePrograms("silver"), maxActivePrograms("gold"));
  assert.ok(maxActivePrograms("silver") >= 3, "too tight to be a mere guard rail");
});

test("the trial length is a sane number", () => {
  assert.ok(TRIAL_DAYS >= 0 && TRIAL_DAYS <= 30);
});
