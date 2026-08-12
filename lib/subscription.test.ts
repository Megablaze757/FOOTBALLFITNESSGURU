import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tierMeets, planFor, PLANS, ALL_PLANS, CAPABILITY_TIER, can, tierNeededFor,
  PAID_TIER, maxActivePrograms, TRIAL_DAYS, VIDEO_QUOTA, type Capability,
} from "./subscription";
import { readFileSync, readdirSync } from "node:fs";

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

/**
 * FREE IS THE DAILY HABIT, AND IT HAS TO STAY OPENABLE.
 *
 * Whatever else moves between the plans, a free account must be able to do the
 * thing the whole app is built around — check in every morning — and see where
 * it is getting them. Take that away and there is no product to sell from.
 *
 * The exercise library used to be here and deliberately is not any more: it is
 * the coaching content, and giving it away while charging for the plan that
 * arranges it is the wrong way round. Leaderboards stay, because a leaderboard
 * behind a paywall is a leaderboard with nobody on it.
 */
test("the free plan is still a real product", () => {
  for (const c of ["check_in", "leaderboards"] as Capability[]) {
    assert.ok(can("bronze", c), `free can't ${c}`);
  }
  assert.ok(PLANS[0].features.length >= 4);
});

/**
 * NOTHING IS GENERATED, WRITTEN OR ANALYSED FOR A FREE ACCOUNT.
 *
 * Every one of these costs a model call on someone else's bill, and each is the
 * reason to pay. Free gets what the device can work out from what the athlete
 * typed in — readiness, trends, rank — and nothing that runs on a server.
 */
test("free gets nothing that costs an inference", () => {
  for (const c of ["program", "ai_chat", "nutrition", "video_analysis", "injury_plan", "ai_challenges"] as Capability[]) {
    assert.ok(!can("bronze", c), `free should not get ${c}`);
  }
  // The quota is the second half of that gate: a capability check the athlete
  // can be shown, and a hard limit the database enforces. Three free uploads
  // taught people the feature existed and then took it away on the fourth.
  assert.equal(VIDEO_QUOTA.bronze, 0, "free must not be able to upload a clip at all");
});

/**
 * `silver` IS A DATA VALUE, NOT A PRODUCT, and must never introduce itself as
 * one. It was named "Pro (legacy)" at £15 with a 15-upload allowance, so the
 * accounts holding it were told on their profile and on the video page that
 * they were on an inferior plan — one they could not leave, and whose access is
 * in fact identical to Pro.
 */
test("nobody is shown a legacy plan", () => {
  const silver = planFor("silver");
  const pro = planFor(PAID_TIER);
  assert.equal(silver.name, pro.name);
  assert.equal(silver.priceLabel, pro.priceLabel);
  assert.equal(VIDEO_QUOTA.silver, VIDEO_QUOTA[PAID_TIER]);
  for (const p of ALL_PLANS) {
    assert.ok(!/legacy/i.test(p.name), `${p.id} calls itself "${p.name}"`);
  }
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

/**
 * The video quota is written down twice — in `public.video_quota()` (which
 * enforces it, inside the insert policy on public.videos) and in `VIDEO_QUOTA`
 * (which only explains it). Two copies of a number drift, so this reads the
 * migrations and compares.
 *
 * If this fails, the DATABASE is right: it is what actually rejects the insert.
 *
 * READS THE LAST DEFINITION, NOT 0036. It used to name that file directly,
 * which was fine right up until the quota changed: `create or replace` means
 * the newest migration wins, so a later file could set free to zero while this
 * test went on cheerfully comparing against the superseded 3 — and it would
 * have failed the change rather than the drift. Scanning the directory in order
 * gives the definition the database actually ends up with.
 */
test("VIDEO_QUOTA matches public.video_quota() in the migration", () => {
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const defining = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => readFileSync(new URL(f, dir), "utf8").includes("function public.video_quota()"));
  assert.ok(defining.length, "no migration defines public.video_quota()");

  const sql = readFileSync(new URL(defining[defining.length - 1], dir), "utf8");
  const body = sql.slice(sql.indexOf("create or replace function public.video_quota()"));
  const fromSql: Record<string, number> = {};
  for (const m of body.matchAll(/when '(gold|silver)' then (\d+)/g)) {
    fromSql[m[1]] = Number(m[2]);
  }
  const bronze = body.match(/else (\d+)\s*(?:--|$)/m);
  if (bronze) fromSql.bronze = Number(bronze[1]);

  // Guard against the regexes silently matching nothing and "passing".
  assert.deepEqual(Object.keys(fromSql).sort(), ["bronze", "gold", "silver"],
    "could not parse the tiers out of the migration — fix this test, not the constant");

  assert.equal(VIDEO_QUOTA.gold, fromSql.gold);
  assert.equal(VIDEO_QUOTA.silver, fromSql.silver);
  assert.equal(VIDEO_QUOTA.bronze, fromSql.bronze);
});
