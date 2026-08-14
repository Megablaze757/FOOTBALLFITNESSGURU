import { test } from "node:test";
import assert from "node:assert/strict";
import {
  headlineFoods, ingredientFatigue, monotonyCost, monotonyReport, newServedLog, recordServing,
} from "./meal-monotony";
import {
  buildWeek, planTargets, shoppingList, shoppingListText, DEFAULT_PREFS, MEALS, mealMacros,
  type BodyStats, type DietPattern, type Meal, type PlannedDay,
} from "./meal-plan";

/**
 * THE COMPLAINT, IN THE USER'S WORDS: "the same day three times in a row, and
 * tuna every day". Both halves were real, both were measured on the live
 * scoring before anything was changed, and both are pinned here.
 *
 * A budget athlete on four meals a day was served this:
 *
 *   Monday     Peanut butter French toast | Peanut tofu noodles | Tofu satay
 *   Tuesday    Peanut butter French toast | Peanut tofu noodles | Tofu satay
 *   Wednesday  Peanut butter French toast | Peanut tofu noodles | Tofu satay
 *
 * and an omnivore's ordinary week contained tofu on seven days out of seven,
 * across sixteen of twenty-eight slots, without repeating a single recipe.
 */

const ATHLETES: Record<string, BodyStats> = {
  average: { sex: "male", age: 22, heightCm: 180, weightKg: 78, activity: "high", goal: "maintain" },
  small: { sex: "female", age: 28, heightCm: 163, weightKg: 58, activity: "moderate", goal: "cut" },
  big: { sex: "male", age: 30, heightCm: 195, weightKg: 100, activity: "athlete", goal: "build" },
};
const PATTERNS: DietPattern[] = ["omnivore", "pescatarian", "vegetarian", "vegan"];
const byName = (name: string): Meal => {
  const m = MEALS.find((x) => x.name === name);
  assert.ok(m, `the recipe book no longer contains "${name}" — pick another fixture`);
  return m;
};

// --- what a meal is made of ---------------------------------------------------

/**
 * Keyed on PROTEIN, because in a fitness app the protein is the dish. Nobody
 * describes dinner as "the rice one".
 */
test("a meal is identified by the protein it is built round", () => {
  assert.deepEqual(headlineFoods(byName("Tuna pasta bake")), ["tuna_tin"],
    "pasta and cheddar are in it, but it is the tuna one");
  assert.deepEqual(headlineFoods(byName("Lentils and rice with burnt onions")), ["red_lentils"]);
});

/**
 * MORE THAN ONE, AND THIS IS WHY. Turkish eggs is 20g of yoghurt protein
 * against 19.2g of egg — a 0.8g margin. Taking only the winner would make the
 * key a coin flip, and would let "eggs every day" hide behind whichever
 * ingredient happened to come first.
 */
test("a meal with two real proteins counts as both", () => {
  const both = headlineFoods(byName("Turkish eggs"));
  assert.deepEqual([...both].sort(), ["eggs", "greek_yoghurt"]);
});

/**
 * The share floor is what keeps staples out, rather than a hand-maintained list
 * of "real" proteins that would go stale the moment somebody adds a recipe.
 */
test("a supporting ingredient is not what the meal is", () => {
  const toast = headlineFoods(byName("Peanut butter French toast"));
  assert.deepEqual(toast, ["eggs"]);
  assert.ok(!toast.includes("wholemeal_bread"),
    "bread carries 9.5g here and is still not what that meal is");
  assert.ok(!toast.includes("peanut_butter"), "7.5g of a 36g total is not a headline");
});

test("every recipe in the book resolves, and none is mostly filler", () => {
  let unattributed = 0;
  for (const meal of MEALS) {
    const foods = headlineFoods(meal);
    for (const f of foods) assert.ok(meal.items.some((i) => i.foodId === f), `${meal.id} claims ${f}`);
    if (foods.length === 0) unattributed++;
  }
  // A genuinely mixed dish having no single star is fine and gets no ingredient
  // cost. It being COMMON would mean the threshold is wrong.
  assert.ok(unattributed <= MEALS.length * 0.05,
    `${unattributed}/${MEALS.length} recipes have no identifiable main ingredient`);
});

// --- the cost -----------------------------------------------------------------

test("a dish not yet served this week is free", () => {
  const log = newServedLog();
  assert.equal(monotonyCost(log, byName("Tuna pasta bake"), 3, 4), 0);
  assert.equal(ingredientFatigue(log, byName("Tuna pasta bake"), 3), 0);
});

/**
 * THE HALF THE OLD COUNTER COULD NOT SEE.
 *
 * `repeatCost` was a function of how many times a dish had been served, so
 * Monday-then-Tuesday and Monday-then-Sunday cost exactly the same. Because the
 * fill is greedy the repeat landed the moment the dish won again — which is
 * tomorrow. This is the assertion that stops that.
 */
test("yesterday costs more than last Monday", () => {
  const meal = byName("Tuna pasta bake");
  const log = newServedLog();
  recordServing(log, meal, 0);

  const yesterday = monotonyCost(log, meal, 1, 4);
  const twoDays = monotonyCost(log, meal, 2, 4);
  const fourDays = monotonyCost(log, meal, 4, 4);

  assert.ok(yesterday > twoDays, `${yesterday} should beat ${twoDays}`);
  assert.ok(twoDays > fourDays);
  // Far enough apart and only the serving count remains — people cook the same
  // dinner twice a week happily, and an app that forbade it would be wrong.
  assert.equal(fourDays, Math.pow(1, 1.8) * 4);
});

test("a third serving still costs more than a second", () => {
  const meal = byName("Tuna pasta bake");
  const log = newServedLog();
  recordServing(log, meal, 0);
  const second = monotonyCost(log, meal, 6, 4);
  recordServing(log, meal, 1);
  const third = monotonyCost(log, meal, 6, 4);
  assert.ok(third > second, "the escalating serving cost was lost");
});

/**
 * THE TUNA TEST. Seven different tuna recipes used to carry a repeat cost of
 * exactly zero, because the counter was keyed on the recipe. This is the whole
 * "tuna every day" complaint in one assertion.
 */
test("different recipes built on the same fish are not different food", () => {
  const log = newServedLog();
  recordServing(log, byName("Tuna niçoise-style plate"), 0);
  recordServing(log, byName("Tuna melt pitta"), 1);

  const anotherTuna = ingredientFatigue(log, byName("Tuna pasta bake"), 2);
  const notTuna = ingredientFatigue(log, byName("Lentils and rice with burnt onions"), 2);

  assert.ok(anotherTuna > 0, "a third tuna dish in three days registered as brand new");
  assert.equal(notTuna, 0, "lentils were charged for the tuna");
  // The recipe itself has never been served, so the DISH cost stays zero — the
  // two mechanisms are independent on purpose.
  assert.equal(monotonyCost(log, byName("Tuna pasta bake"), 2, 4), 0);
});

test("the ingredient a meal shares is what gets charged, not the whole basket", () => {
  const log = newServedLog();
  recordServing(log, byName("Turkish eggs"), 0); // eggs + greek_yoghurt
  assert.ok(ingredientFatigue(log, byName("Peanut butter French toast"), 1) > 0, "eggs again the next day");
});

/** Rubbish in, zero out — never NaN into a score. */
test("a meal referencing a food that no longer exists does not poison the score", () => {
  const junk = { id: "ghost", items: [{ foodId: "not_a_food", qty: 100 }] };
  assert.deepEqual(headlineFoods(junk), []);
  const log = newServedLog();
  recordServing(log, junk, 0);
  assert.ok(Number.isFinite(monotonyCost(log, junk, 1, 4)));
  assert.ok(Number.isFinite(ingredientFatigue(log, junk, 1)));
});

// --- the week the athlete actually gets ---------------------------------------

const weeksAcross = (extra: Partial<typeof DEFAULT_PREFS> = {}): { who: string; week: PlannedDay[] }[] => {
  const out: { who: string; week: PlannedDay[] }[] = [];
  for (const [name, stats] of Object.entries(ATHLETES)) {
    for (const pattern of PATTERNS) {
      for (const mealsPerDay of [3, 4, 5] as const) {
        out.push({
          who: `${name}/${pattern}/${mealsPerDay}`,
          week: buildWeek(planTargets(stats), 1, { ...DEFAULT_PREFS, pattern, mealsPerDay, ...extra }),
        });
      }
    }
  }
  return out;
};

/**
 * NOBODY EATS THE SAME DINNER TWO NIGHTS RUNNING.
 *
 * 266 back-to-back repeats across the 90-plan audit before this; none after.
 */
test("no dish appears on consecutive days, for anybody", () => {
  const bad: string[] = [];
  for (const { who, week } of weeksAcross()) {
    const r = monotonyReport(week);
    if (r.backToBack > 0) bad.push(`${who}: ${r.backToBack} back-to-back`);
    if (r.threeInARow > 0) bad.push(`${who}: ${r.threeInARow} three days running`);
  }
  assert.deepEqual(bad, []);
});

/**
 * The literal reported case. Budget mode scales the repeat penalty down — by
 * design, because someone who ticked "cheap staples" would rather eat the same
 * thing than pay more — and that is exactly where the three identical days
 * appeared. It has to hold at the setting that broke, not just the default.
 */
test("budget mode does not resurrect the identical three-day block", () => {
  const bad: string[] = [];
  for (const { who, week } of weeksAcross({ budget: true })) {
    const r = monotonyReport(week);
    if (r.backToBack > 0) bad.push(`${who}: ${r.backToBack} back-to-back on budget`);
  }
  assert.deepEqual(bad, []);
});

/**
 * ONE INGREDIENT MUST NOT OWN THE WEEK — for anyone who has the choice.
 *
 * MEASURED IN SLOTS, NOT DAYS, because days cannot tell the two cases apart. A
 * week with one tuna lunch a day and a week that is tuna for breakfast, lunch
 * and dinner both read 7/7, and only the second is a complaint. The 58kg woman
 * cutting who prompted this had tofu on 7 days across EIGHTEEN of her 21 slots.
 *
 * The bound is set per diet, because the honest answer differs by diet and a
 * single number would either be a lie for omnivores or a fantasy for vegans.
 * Worst case over every athlete, pattern and meal count:
 *
 *   small/omnivore/3    tofu 18/21 slots  ->  11/21
 *   small/omnivore/4    tofu 16/28        ->  13/28
 *   small/omnivore/5    tofu 11/35        ->   7/35, and no longer the top food
 *
 * A vegan cutting on three meals a day stays at 21/21 and SHOULD. They need
 * 0.078g of protein per calorie with no animal products; lentils are 0.071 and
 * chickpeas 0.061, so tofu is close to the only thing that clears it. Both
 * attempts that "fixed" that number did it by feeding the athlete 12% less
 * protein than they were told to eat.
 */
test("an athlete with real choice is not served one ingredient all week", () => {
  const bad: string[] = [];
  for (const { who, week } of weeksAcross()) {
    if (!who.includes("omnivore") && !who.includes("pescatarian")) continue;
    const r = monotonyReport(week);
    // Two thirds. Worst measured is 13/28 (46%); this is a ceiling with room,
    // not a target, and it was 18/21 (86%) before.
    if (r.topFoodSlots > r.slots * 0.67) {
      bad.push(`${who}: ${r.topFood} in ${r.topFoodSlots} of ${r.slots} slots`);
    }
  }
  assert.deepEqual(bad, []);
});

/**
 * And the restricted diets must not have been "fixed" by quietly feeding them
 * less. This is the counterpart to the test above: it asserts the number that
 * did NOT move is the one whose alternative was worse.
 */
test("a vegan is still fed the densest food available, monotonous or not", () => {
  const targets = planTargets(ATHLETES.small);
  const week = buildWeek(targets, 1, { ...DEFAULT_PREFS, pattern: "vegan", mealsPerDay: 3 });
  const r = monotonyReport(week);
  assert.equal(r.topFood, "tofu", "the densest plant protein stopped being the backbone of a vegan cut");
  for (const day of week) {
    const got = day.meals.reduce((s, m) => s + mealMacros(m.meal).protein * m.scale, 0);
    assert.ok(got / targets.protein >= 0.9,
      `${day.day}: ${Math.round(got)}g against ${Math.round(targets.protein)}g — variety was bought with protein`);
  }
});

test("no day is sold short of protein to make the week look varied", () => {
  const bad: string[] = [];
  for (const [name, stats] of Object.entries(ATHLETES)) {
    for (const pattern of PATTERNS) {
      const targets = planTargets(stats);
      const week = buildWeek(targets, 1, { ...DEFAULT_PREFS, pattern, mealsPerDay: 4 });
      for (const day of week) {
        const got = day.meals.reduce((s, m) => s + mealMacros(m.meal).protein * m.scale, 0);
        const pct = got / targets.protein;
        if (pct < 0.9) bad.push(`${name}/${pattern} ${day.day}: ${Math.round(pct * 100)}% of protein`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

/**
 * Variety is worth paying for and is not worth paying anything at all for. The
 * whole point of routing the ingredient rotation through a bounded second pass
 * rather than a term in the score is that it spends the SAME £3 slot budget the
 * dish rotation spends, instead of a second one on top.
 */
test("the rotation does not quietly inflate the shopping bill", () => {
  // Measured: £102.59 a week across the audit before any of this, £108.36
  // after. 10% is that plus headroom, and it is a ceiling rather than a target.
  for (const [name, stats] of Object.entries(ATHLETES)) {
    const prefs = { ...DEFAULT_PREFS, mealsPerDay: 4 as const };
    const week = buildWeek(planTargets(stats), 1, prefs);
    const cheap = buildWeek(planTargets(stats), 1, { ...prefs, budget: true });
    assert.ok(shoppingList(cheap).total < shoppingList(week).total,
      `${name}: budget mode is no longer the cheaper shop`);
  }
});

test("a narrow diet still gets fed rather than rationed", () => {
  // A vegan avoiding gluten and soy has a handful of options per slot. Every
  // rule added here is a cost or a preference and none is a ban, so this must
  // still come back full.
  const week = buildWeek(planTargets(ATHLETES.average), 1,
    { ...DEFAULT_PREFS, pattern: "vegan", avoid: ["gluten", "soy"], mealsPerDay: 4 });
  assert.equal(week.length, 7);
  for (const d of week) assert.equal(d.meals.length, 4, `${d.day} came back short`);
});

// --- what the shop actually costs --------------------------------------------

/**
 * THE 40% THAT WAS NEVER EATEN.
 *
 * Every food was costed at whole packs, every week. That is right at the till
 * and wrong the following Monday: a plan using 165ml from a 500ml bottle of
 * olive oil was charged £3.50 for it seven days running, for a bottle bought
 * once every three weeks. Repeated over the oil, the spices, the honey and the
 * peanut butter it charged an athlete £45.80 of a £113.55 week for food that
 * nobody ever eats.
 */
test("a week is not charged for a whole bottle of oil it drinks a third of", () => {
  const week = buildWeek(planTargets(ATHLETES.average), 0, { ...DEFAULT_PREFS, mealsPerDay: 4 });
  const list = shoppingList(week);

  assert.ok(list.ongoingTotal < list.total,
    "a typical week still costs the same as stocking an empty cupboard");
  // Measured: £113.55 to stock up against £85.67 a week after. This asserts the
  // correction is a real size rather than a rounding gesture.
  assert.ok(list.ongoingTotal < list.total * 0.95,
    `£${list.ongoingTotal.toFixed(2)} against £${list.total.toFixed(2)} — barely moved`);
  // And it must not overcorrect into fantasy. Most of a week's shop is food.
  assert.ok(list.ongoingTotal > list.total * 0.5,
    `£${list.ongoingTotal.toFixed(2)} of £${list.total.toFixed(2)} is too cheap to be true`);

  assert.equal(
    list.ongoingTotal,
    Math.round(list.lines.reduce((s, l) => s + l.ongoingCost, 0) * 100) / 100,
    "the total disagrees with the lines it is made of",
  );
});

/**
 * The distinction is about the LEFTOVER, not about the aisle.
 */
test("perishables are still charged by the pack, because the rest goes off", () => {
  const list = shoppingList(buildWeek(planTargets(ATHLETES.average), 0, { ...DEFAULT_PREFS, mealsPerDay: 4 }));
  for (const line of list.lines) {
    if (line.food.keeps) {
      assert.ok(line.ongoingCost <= line.cost + 1e-9, `${line.food.id} costs more per week than the pack`);
    } else {
      assert.equal(line.ongoingCost, line.cost,
        `${line.food.id} is perishable and was discounted as though the leftover kept`);
    }
    assert.ok(line.ongoingCost >= 0);
  }
});

/**
 * WHAT THE PLANNER IS COSTED ON MUST STAY WHOLE PACKS — a negative result, kept
 * because the argument for changing it is a good one and it will be made again.
 *
 * Softening `marginalCost` to per-gram for anything that keeps is the obvious
 * companion to the change above, on the reasoning that charging a dish £3.50
 * for a splash of oil against a £3 variety budget must be taxing flavour out of
 * the menu. It is not. Measured over 54 plans, amortising a keeps pack over N
 * weeks inside the planner:
 *
 *   N=1 (whole packs, today)   99% of meals seasoned   £106.31
 *   N=3                        92%                     £115.57
 *   N=6                        86%                     £133.29
 *
 * Worse on both counts, the whole way. Made nearly free, opening a jar stops
 * being a decision and the planner opens fifteen of them — while the till still
 * charges fifteen whole jars. This term is what keeps a week's seasoning
 * concentrated in a few ingredients instead of spread across the aisle.
 */
test("the planner is still costed on whole packs, and the menu is not bland", () => {
  const FLAVOUR = new Set(["garlic", "ginger", "chilli_fresh", "spice_mix", "curry_paste",
    "soy_sauce", "stock_cubes", "pesto", "lemon", "honey", "olive_oil", "seeds_mixed", "almonds"]);
  let seasoned = 0;
  let total = 0;
  for (const { week } of weeksAcross()) {
    for (const day of week) {
      for (const pm of day.meals) {
        total++;
        if (pm.meal.items.some((i) => FLAVOUR.has(i.foodId))) seasoned++;
      }
    }
  }
  // 99% today. A drop here means someone softened the pack cost and made the
  // food duller and the shop dearer at the same time.
  assert.ok(seasoned / total > 0.95,
    `only ${seasoned}/${total} meals (${Math.round(seasoned / total * 100)}%) have anything on them`);
});

/**
 * The panel an athlete reads. Source-checked rather than rendered because the
 * arithmetic is asserted above and what is left to get wrong is wiring the
 * corrected number to the wrong field — which reading the source does catch.
 */
test("the corrected weekly figure reaches the shopping panel and the copied text", () => {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const panel = readFileSync(new URL("../components/ShoppingList.tsx", import.meta.url), "utf8");
  assert.match(panel, /list\.ongoingTotal/, "the panel still only shows the stock-up total");
  assert.match(panel, /list\.ongoingTotal < list\.total - 1/,
    "the explanation shows even when there is nothing to explain");

  const list = shoppingList(buildWeek(planTargets(ATHLETES.average), 0, { ...DEFAULT_PREFS, mealsPerDay: 4 }));
  const txt = shoppingListText(list);
  assert.match(txt, new RegExp(`~£${list.ongoingTotal.toFixed(2).replace(".", "\\.")}`),
    "the copied list does not mention what the week actually costs");
});
