import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tierMeets, planFor, PLANS, CAPABILITY_TIER, can, tierNeededFor, type Capability,
} from "./subscription";

test("tierMeets respects the ranking", () => {
  assert.ok(tierMeets("gold", "silver"));
  assert.ok(tierMeets("silver", "silver"));
  assert.ok(tierMeets("silver", "bronze"));
  assert.ok(!tierMeets("bronze", "silver"));
  assert.ok(!tierMeets("silver", "gold"));
});

test("planFor returns the matching plan, bronze as fallback", () => {
  assert.equal(planFor("gold").name, "Gold");
  assert.equal(planFor("bronze").paid, false);
});

test("only paid plans are marked paid", () => {
  const paid = PLANS.filter((p) => p.paid).map((p) => p.id);
  assert.deepEqual(paid, ["silver", "gold"]);
});

// --- What each tier actually buys -------------------------------------------

const CAPS = () => Object.keys(CAPABILITY_TIER) as Capability[];

test("each tier unlocks strictly more than the one below", () => {
  const bronze = CAPS().filter((c) => can("bronze", c));
  const silver = CAPS().filter((c) => can("silver", c));
  const gold = CAPS().filter((c) => can("gold", c));
  for (const c of bronze) assert.ok(silver.includes(c), `silver lost ${c}`);
  for (const c of silver) assert.ok(gold.includes(c), `gold lost ${c}`);
  assert.ok(silver.length > bronze.length, "silver adds nothing over bronze");
  assert.ok(gold.length > silver.length, "gold adds nothing over silver");
});

test("gold is meaningfully more than silver, not one extra toggle", () => {
  const extra = CAPS().filter((c) => can("gold", c) && !can("silver", c));
  // The complaint this fixes: gold differed by video analysis alone while
  // advertising five things.
  assert.ok(extra.length >= 3, `gold only adds ${extra.length}: ${extra.join(", ")}`);
});

test("the free tier still does the thing the app is for", () => {
  // A free plan that can't check in has no habit loop, and everything else is
  // sold on top of that loop.
  for (const c of ["check_in", "program_local", "library"] as Capability[]) {
    assert.ok(can("bronze", c), `bronze can't ${c}`);
  }
});

test("both paid tiers gate something real", () => {
  for (const need of ["silver", "gold"] as const) {
    const gated = CAPS().filter((c) => CAPABILITY_TIER[c] === need);
    assert.ok(gated.length > 0, `${need} gates nothing at all`);
  }
});

test("paid plans say why to step up", () => {
  for (const p of PLANS.filter((x) => x.paid)) {
    assert.ok(p.headline && p.headline.length > 20, `${p.id} has no headline reason to upgrade`);
  }
});

test("silver copy doesn't advertise gold-only features", () => {
  // Gold used to advertise "custom periodised programs" and the full library
  // when both were free to everyone. Keep the copy honest in the other
  // direction too.
  const silverText = planFor("silver").features.join(" ").toLowerCase();
  for (const word of ["video", "injury", "priority"]) {
    assert.ok(!silverText.includes(word), `Silver copy mentions "${word}", which is Gold-only`);
  }
});

test("tierNeededFor points at a tier that can actually do it", () => {
  for (const c of CAPS()) {
    const t = tierNeededFor(c);
    assert.ok(["bronze", "silver", "gold"].includes(t), `${c} needs unknown tier ${t}`);
    assert.ok(can(t, c), `${c} isn't available on the tier it says it needs`);
  }
});

test("every plan has enough copy to sell it", () => {
  for (const p of PLANS) {
    assert.ok(p.features.length >= 4, `${p.id} has only ${p.features.length} features`);
    if (p.paid) assert.ok(p.priceMonthly > 0, `${p.id} is paid but priced at zero`);
  }
});
