import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tierMeets, planFor, PLANS, CAPABILITY_TIER, can, tierNeededFor,
  limitsFor, limitLabel, type Capability,
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

test("the free tier keeps the habit loop", () => {
  // Free has to be worth opening daily — that's what everything else is sold on
  // top of. But not the programs: those are the product.
  for (const c of ["check_in", "library", "leaderboards"] as Capability[]) {
    assert.ok(can("bronze", c), `bronze can't ${c}`);
  }
});

test("free cannot build a program at all, AI or on-device", () => {
  assert.ok(!can("bronze", "program_local"), "bronze can still build programs locally");
  assert.ok(!can("bronze", "ai_program"));
  assert.ok(can("silver", "program_local"), "silver must be able to build one");
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

// --- Limits ------------------------------------------------------------------

test("gold lifts every cap silver has", () => {
  const s = limitsFor("silver"), g = limitsFor("gold");
  for (const k of ["aiProgramsPerMonth", "coachMessagesPerMonth", "historyDays"] as const) {
    const sv = s[k], gv = g[k];
    assert.ok(gv === null || (sv !== null && gv > sv), `gold's ${k} (${gv}) doesn't beat silver's (${sv})`);
  }
  assert.ok((g.activePrograms ?? 99) > (s.activePrograms ?? 0), "gold should run more programs at once");
});

test("free cannot run a program at all", () => {
  assert.equal(limitsFor("bronze").activePrograms, 0);
  assert.equal(limitsFor("bronze").aiProgramsPerMonth, 0);
});

test("gold is a real step up, not one extra toggle", () => {
  // The complaint this addresses: Silver felt like the whole app.
  const caps = Object.keys(CAPABILITY_TIER) as Capability[];
  const extraFeatures = caps.filter((c) => can("gold", c) && !can("silver", c)).length;
  const s = limitsFor("silver"), g = limitsFor("gold");
  const liftedCaps = (["activePrograms", "aiProgramsPerMonth", "coachMessagesPerMonth", "historyDays"] as const)
    .filter((k) => g[k] === null || (s[k] !== null && (g[k] as number) > (s[k] as number))).length;
  assert.ok(extraFeatures + liftedCaps >= 6,
    `gold only adds ${extraFeatures} features and lifts ${liftedCaps} caps`);
});

test("silver's caps are generous enough not to feel mean", () => {
  const s = limitsFor("silver");
  // A block is four weeks, so four builds a month is a rebuild a week —
  // more than any sane periodisation needs. A cap that bites a normal user is
  // a refund request, not an upgrade.
  assert.ok((s.aiProgramsPerMonth ?? 0) >= 4);
  assert.ok((s.coachMessagesPerMonth ?? 0) >= 20);
  assert.ok((s.historyDays ?? 0) >= 90);
});

test("limitLabel reads properly at each edge", () => {
  assert.equal(limitLabel(null, "programs"), "Unlimited");
  assert.equal(limitLabel(0, "programs"), "No programs");
  assert.equal(limitLabel(4, "programs"), "4 programs");
});
