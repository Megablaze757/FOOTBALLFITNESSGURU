import { test } from "node:test";
import assert from "node:assert/strict";
import {
  measureLevers, budgetAdvice, proteinFloorCost, LEVER_SPECS,
} from "./budget-advice";
import { DEFAULT_PREFS, mergePrefs } from "./meal-plan";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ADVICE THIS REPLACES WAS NEVER MEASURED.
 *
 * "Cooking fewer, larger meals or eating out less are the two biggest levers
 * left" was one sentence, written once, shown to every athlete who missed a
 * budget — including the ones already on three meals a day, for whom the first
 * half is worth exactly nothing and the app knew it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a lever that saves nothing for this athlete is not offered", () => {
  const levers = measureLevers(DEFAULT_PREFS, 60, () => 60);
  assert.deepEqual(levers, [], "offered a change worth nothing");
});

test("a lever worth pennies is not offered either", () => {
  const levers = measureLevers(DEFAULT_PREFS, 60, () => 59.4);
  assert.deepEqual(levers, [], "offered somebody a diet change to save 60p");
});

test("levers come back measured and biggest first", () => {
  const savings: Record<string, number> = { "fewer-meals": 2, "meat-free": 9, "cheap-mode": 5 };
  const levers = measureLevers(DEFAULT_PREFS, 60, (change) => {
    const id = LEVER_SPECS.find((s) =>
      JSON.stringify(s.change) === JSON.stringify(change))!.id;
    return 60 - savings[id];
  });
  assert.deepEqual(levers.map((l) => l.id), ["meat-free", "cheap-mode", "fewer-meals"]);
  assert.equal(levers[0].saving, 9);
});

/** Offering somebody a change they have already made reads as not listening. */
test("a change they have already made is skipped", () => {
  const veggie = mergePrefs(DEFAULT_PREFS, { pattern: "vegetarian", mealsPerDay: 3, budget: true });
  assert.deepEqual(measureLevers(veggie, 60, () => 40), [],
    "offered a vegetarian on three meals in cheap mode all three levers");
});

// --- the honest headline ---------------------------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SAVINGS ARE NOT ADDED UP.
 *
 * Two levers that both work by moving the plan onto lentils do not save twice,
 * and presenting them as though they did is the arithmetic that gets somebody
 * to the till twelve pounds short. Each is measured alone, so the honest
 * combined claim is the largest of them.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the best case is the biggest single lever, not the sum of them", () => {
  const levers = measureLevers(DEFAULT_PREFS, 70, (change) =>
    JSON.stringify(change) === JSON.stringify({ pattern: "vegetarian" }) ? 58 : 66);
  const advice = budgetAdvice(50, 70, levers, 209, 34.7);
  assert.equal(advice.bestPossible, 58, "summed the levers");
  assert.ok(advice.bestPossible > 50);
});

test("when the levers close the gap it says which one does it", () => {
  const levers = measureLevers(DEFAULT_PREFS, 60, () => 48);
  const advice = budgetAdvice(50, 60, levers, 120, 34.7);
  assert.equal(advice.reachable, true);
  assert.match(advice.headline, /doable/i);
  assert.match(advice.headline, /£48\.00|£48/);
});

test("when nothing closes it, it says so without blaming them", () => {
  const advice = budgetAdvice(50, 89.06, [], 209, 34.7);
  assert.equal(advice.reachable, false);
  assert.match(advice.headline, /not reachable/i);
  assert.match(advice.headline, /nothing left to trade/i);
  assert.ok(!/you should|try harder|reduce your protein/i.test(advice.headline));
});

// --- where the money actually goes -----------------------------------------------

test("the protein arithmetic is the arithmetic", () => {
  // 209g a day, 1463g a week, at 34.7g per pound.
  assert.equal(proteinFloorCost(209, 34.7), 42.16);
  assert.equal(proteinFloorCost(0, 34.7), 0);
  assert.equal(proteinFloorCost(209, 0), 0, "a divide by zero is not a price");
});

/**
 * Only when protein is genuinely most of the bill. On a 62kg maintenance plan
 * it is a third of it, and leading with it would point at the wrong thing.
 */
test("the protein note appears when protein is the driver, and not otherwise", () => {
  const big = budgetAdvice(50, 66, [], 209, 34.7);
  assert.ok(big.proteinNote, "a 95kg cutter is not told where the money went");
  assert.match(big.proteinNote!, /1463g|1,463g/);

  const small = budgetAdvice(50, 66, [], 90, 34.7);
  assert.equal(small.proteinNote, null, "pointed a maintenance plan at its protein bill");
});

test("the whole answer is numbers, not encouragement", () => {
  const advice = budgetAdvice(50, 89.06, [], 209, 34.7);
  for (const banned of [/don't worry/i, /great job/i, /keep it up/i, /!$/]) {
    assert.ok(!banned.test(advice.headline), `headline reads as a pep talk: ${advice.headline}`);
  }
});

import { readFileSync } from "node:fs";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MEASURED AGAINST THE SAME BUILD, or the number is not the change's.
 *
 * Comparing a lever against the floor overstates it whenever the floor is the
 * unpressured reference week — the difference then includes "a budget plan
 * existed at all" as well as the change. Measured on a 95kg cutter that turned
 * a real £7.94 into a claimed £36.49, which is the app promising a saving that
 * was mostly something else.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("levers are measured against an unchanged build, not against the floor", () => {
  const plan = readFileSync(new URL("./meal-plan.ts", import.meta.url), "utf8");
  assert.match(plan, /measureLevers\(prefs, costOfPlan\(\{\}\), costOfPlan\)/,
    "a lever's saving is being measured against something other than the same plan without it");
});

test("the priced levers reach the athlete, and are not presented as a total", () => {
  const ui = readFileSync(new URL("../components/MealPlanner.tsx", import.meta.url), "utf8");
  assert.match(ui, /advice\.levers\.map/, "the levers are computed and never shown");
  assert.match(ui, /do not add up/i,
    "nothing tells them the savings are not cumulative, which is how somebody arrives at the till short");
});

/** The advice replaced a sentence nobody measured. It must not come back. */
test("the unmeasured advice is gone", () => {
  /**
   * COMMENTS STRIPPED FIRST. The comment explaining why the old sentence was
   * removed quotes the old sentence, so scanning the raw file failed on the
   * note that records the fix — the same shape as the position rule in
   * apple-guide.test.ts flagging its own rationale.
   */
  const plan = readFileSync(new URL("./meal-plan.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
  assert.ok(!/two biggest levers left/.test(plan),
    "the hardcoded advice is back, offered to athletes it is worth nothing to");
});
