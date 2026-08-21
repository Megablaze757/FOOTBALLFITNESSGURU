import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  planWithinBudget, planTargets, buildWeek, shoppingList, DEFAULT_PREFS, mergePrefs,
  type PlannedDay, type PlanTargets,
} from "./meal-plan";

/**
 * "There's no budget option — only 'keep it cheap'."
 *
 * The tick box asks whether they would rather be cheap. A number asks how much
 * they have, and only the second has an answer you can check afterwards —
 * which is most of the value. Somebody with sixty pounds needs to know before
 * Monday whether this is a sixty-pound plan.
 */

const ATHLETES: { name: string; body: Parameters<typeof planTargets>[0] }[] = [
  { name: "62kg maintaining", body: { weightKg: 62, heightCm: 168, age: 22, sex: "female", activity: "moderate", goal: "maintain" } as never },
  { name: "78kg building", body: { weightKg: 78, heightCm: 180, age: 28, sex: "male", activity: "moderate", goal: "build" } as never },
  { name: "95kg cutting", body: { weightKg: 95, heightCm: 190, age: 34, sex: "male", activity: "high", goal: "cut" } as never },
];

const proteinOf = (days: PlannedDay[]) => days.map((d) => d.macros.protein);
const worstProteinShare = (days: PlannedDay[], targets: PlanTargets) =>
  Math.min(...days.filter((d) => d.meals.length > 0).map((d) => d.macros.protein / targets.protein));

test("a stated budget makes the week cheaper, or says why it cannot", () => {
  // Never dearer, and never the same week with a number written under it.
  // Either the search found savings, or it refused to take them out of the
  // athlete's food and reports that instead.
  for (const { name, body } of ATHLETES) {
    const targets = planTargets(body);
    const open = planWithinBudget(targets, 0, DEFAULT_PREFS);
    const capped = planWithinBudget(targets, 0, mergePrefs(DEFAULT_PREFS, { weeklyBudget: 60 }));
    assert.ok(capped.weeklyCost <= open.weeklyCost, `${name}: the budget produced a DEARER week`);
    assert.ok(capped.weeklyCost < open.weeklyCost || capped.met === false,
      `${name}: nothing changed and nothing was said about it`);
  }
});

test("it says whether it managed it, and never pretends", () => {
  // THE FAILURE THIS FEATURE EXISTS TO PREVENT is finding out at the till.
  const targets = planTargets(ATHLETES[2].body);
  const impossible = planWithinBudget(targets, 0, mergePrefs(DEFAULT_PREFS, { weeklyBudget: 25 }));
  assert.equal(impossible.met, false);
  assert.ok(impossible.weeklyCost > 25, "premise changed: £25 is now achievable");
  assert.match(impossible.note ?? "", /cheapest week/);
  assert.match(impossible.note ?? "", new RegExp(impossible.weeklyCost.toFixed(2)), "the note must name what it actually costs");

  const roomy = planWithinBudget(targets, 0, mergePrefs(DEFAULT_PREFS, { weeklyBudget: 200 }));
  assert.equal(roomy.met, true);
  assert.ok(roomy.weeklyCost <= 200);
  assert.match(roomy.note ?? "", /under your budget/);
});

test("no budget is no report, and no change to the plan", () => {
  const targets = planTargets(ATHLETES[0].body);
  const plain = planWithinBudget(targets, 3, DEFAULT_PREFS);
  assert.equal(plain.budget, null);
  assert.equal(plain.note, null);
  assert.equal(plain.met, true, "a plan with no ceiling cannot fail one");
  // Byte-identical to the ordinary builder: somebody who never types a budget
  // must not get a different week because this function now exists.
  assert.deepEqual(proteinOf(plain.days), proteinOf(buildWeek(targets, 3, DEFAULT_PREFS)));
});

test("a cheap week is still a week's food", () => {
  // Quietly starving the plan to hit a number is the other failure mode, and
  // the harder one to notice — the shop is £52 and the athlete is 30g of
  // protein short every day for a month.
  //
  // The bar is per day and it is the more forgiving of two: 90% of the target,
  // or 95% of what the unpressured week delivered that day. Comparing the two
  // weeks' WORST days against the target is not the same test and reports a
  // 36% "loss" on a plan that overshoots protein by half — losing surplus is
  // not losing food.
  for (const { name, body } of ATHLETES) {
    const targets = planTargets(body);
    const reference = planWithinBudget(targets, 0, DEFAULT_PREFS).days;
    const squeezed = planWithinBudget(targets, 0, mergePrefs(DEFAULT_PREFS, { weeklyBudget: 30 }));
    squeezed.days.forEach((day, i) => {
      if (day.meals.length === 0) return;
      const floor = Math.min(targets.protein * 0.9, reference[i].macros.protein * 0.95);
      assert.ok(day.macros.protein >= floor,
        `${name}: ${day.day} came back with ${day.macros.protein.toFixed(0)}g against a floor of ${floor.toFixed(0)}g`);
      assert.ok(day.meals.length >= 3, `${name}: ${day.day} has ${day.meals.length} meals`);
    });
    assert.equal(squeezed.met, false, `${name}: £30 should not be achievable`);
  }
});

test("food wins over the budget when the two cannot both be had", () => {
  /**
   * THE CASE THAT DECIDES WHETHER THIS FEATURE IS HONEST. A 95kg athlete
   * cutting needs 209g of protein a day, and their ordinary £88 week just about
   * delivers it. Every cheaper week the planner can build for them comes back
   * at 76-82% of that — a fifth of their protein, for £13. So the search
   * refuses all of them and hands back the week they would have had, with the
   * price on it.
   *
   * The alternative — serving the £75 week because the number was £60 and £75
   * is closer — is the failure this whole feature exists to prevent, dressed up
   * as success.
   */
  const targets = planTargets(ATHLETES[2].body);
  const open = planWithinBudget(targets, 0, DEFAULT_PREFS);
  const capped = planWithinBudget(targets, 0, mergePrefs(DEFAULT_PREFS, { weeklyBudget: 60 }));
  assert.equal(capped.met, false);
  assert.equal(capped.weeklyCost, open.weeklyCost, "a cheaper week was accepted for this athlete");
  assert.deepEqual(proteinOf(capped.days), proteinOf(open.days), "the returned week is not the one they would have had");
  assert.match(capped.note ?? "", /feeds you properly/);
});

test("the budget is judged on an ordinary week, not the first shop", () => {
  // `total` re-buys the olive oil, the spices and the rice every Monday. A
  // weekly budget means a normal week, and the first shop is dearer — so the
  // result carries both rather than quietly picking one.
  const targets = planTargets(ATHLETES[1].body);
  const r = planWithinBudget(targets, 0, mergePrefs(DEFAULT_PREFS, { weeklyBudget: 90 }));
  assert.ok(r.firstShopCost > r.weeklyCost, "a first shop that costs no more than a normal week is suspicious");
  assert.equal(r.weeklyCost, r.list.ongoingTotal);
  assert.equal(r.firstShopCost, r.list.total);
  assert.ok(r.met, "judged on the wrong total");
  assert.match(r.note ?? "", /first shop/i, "the dearer first week is not mentioned");
});

test("the shop the prices come from is part of the plan", () => {
  // Store prices differ by a flat index per shop, so which shop it is decides
  // whether a week fits a budget. If that lived on the device, one athlete's
  // phone and laptop would rebuild different weeks from one seed — which is
  // exactly what "keep it cheap was never saved" already did once.
  const targets = planTargets(ATHLETES[1].body);
  const prefs = mergePrefs(DEFAULT_PREFS, { weeklyBudget: 65 });
  const tesco = planWithinBudget(targets, 0, prefs, undefined, undefined, undefined, { store: "tesco" });
  const aldi = planWithinBudget(targets, 0, prefs, undefined, undefined, undefined, { store: "aldi" });
  assert.ok(aldi.weeklyCost < tesco.weeklyCost, "the store did not change the price");

  const page = readFileSync(new URL("../app/(app)/nutrition/page.tsx", import.meta.url), "utf8");
  assert.match(page, /shop_store/, "the shop still lives only on the device");
});

test("both screens rebuild the same week", () => {
  // The Meal plan tab and the daily tick-list are two views of ONE plan, and
  // the tick-list calling the plain builder while the planner honoured a budget
  // would show a different Tuesday on each — the same bug the unsaved "keep it
  // cheap" tick box caused, in a new place.
  const checkIn = readFileSync(new URL("../components/MealCheckIn.tsx", import.meta.url), "utf8");
  const planner = readFileSync(new URL("../components/MealPlanner.tsx", import.meta.url), "utf8");
  for (const [name, src] of [["MealCheckIn", checkIn], ["MealPlanner", planner]] as const) {
    assert.match(src, /planWithinBudget\(/, `${name} builds its week without the budget`);
    assert.ok(!/\bbuildWeek\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")),
      `${name} still calls buildWeek directly`);
  }
});

test("the price corrections on this device do not change the food", () => {
  // They refine the number shown. Letting them decide which meals get picked
  // would put the plan back on the device.
  const targets = planTargets(ATHLETES[0].body);
  const prefs = mergePrefs(DEFAULT_PREFS, { weeklyBudget: 70 });
  const plain = planWithinBudget(targets, 0, prefs, undefined, undefined, undefined, { store: "tesco" });
  const corrected = planWithinBudget(targets, 0, prefs, undefined, undefined, undefined, {
    store: "tesco", overrides: { chicken_breast: 0.5, rice: 0.2 },
  });
  assert.deepEqual(
    corrected.days.flatMap((d) => d.meals.map((m) => m.meal.id)),
    plain.days.flatMap((d) => d.meals.map((m) => m.meal.id)),
    "a price the athlete typed on one phone changed which meals they were served",
  );
  // The shopping list still shows the corrected prices, which is the point of
  // having them at all.
  assert.ok(shoppingList(plain.days, { store: "tesco", overrides: { chicken_breast: 0.5 } }).total
    <= shoppingList(plain.days, { store: "tesco" }).total);
});
