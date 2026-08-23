// "Keep it cheap" was not cheap: £100 for one person.
//
// Three faults, all pushing the same way, and each one hiding the next.
//
//   1. The headline was the FIRST shop — the till with a bare cupboard, which
//      buys a whole bottle of oil to use 165ml of it. The honest weekly figure
//      was already computed and printed in grey at the bottom of the card.
//   2. The planner priced a serving PRO-RATA, so a splash of coconut milk read
//      as 17p while the shopping list bought the whole £1.20 carton and the
//      rest of it went off. The foods that make a budget week expensive were
//      the exact foods it could not see.
//   3. Because of (2), leaning harder on price lowered the till total while
//      RAISING the weekly cost — so the budget search, which is judged on the
//      weekly cost, could never find a cheaper week and always fell through to
//      the unpressured one. The whole ladder was dead weight.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildWeek, shoppingList, planWithinBudget, planTargets, mealMacros,
  basketOf, ongoingMarginalCost,
  DEFAULT_PREFS, FOODS, MEALS, type MealPrefs, type DietPattern,
} from "./meal-plan";

const ATHLETES = [
  { name: "58kg cutting", body: { sex: "female", age: 22, heightCm: 165, weightKg: 58, activity: "moderate", goal: "cut" } },
  { name: "78kg maintaining", body: { sex: "male", age: 24, heightCm: 180, weightKg: 78, activity: "high", goal: "maintain" } },
  { name: "95kg building", body: { sex: "male", age: 27, heightCm: 190, weightKg: 95, activity: "athlete", goal: "build" } },
] as const;

const cheap = (extra: Partial<MealPrefs> = {}): MealPrefs => ({ ...DEFAULT_PREFS, budget: true, ...extra });

test("a serving is priced the way the week will actually be charged", () => {
  // The planner and the shopping list were two expressions of one idea and they
  // disagreed. Anything that keeps is pro-rata, because the rest of the bag is
  // in the cupboard on Monday; anything perishable costs the whole pack,
  // because the leftover is the bin.
  const perishable = FOODS.find((f) => !f.keeps && f.packSize > 1);
  const keeps = FOODS.find((f) => f.keeps && f.packSize > 1);
  assert.ok(perishable && keeps, "the food table no longer has both kinds");

  const oneMeal = (foodId: string, qty: number) => [{
    ...MEALS[0], id: `t-${foodId}`, items: [{ foodId, qty }],
  }];
  const priced = (foodId: string, qty: number) =>
    shoppingList([{ day: "Mon", meals: oneMeal(foodId, qty).map((meal) => ({ meal, scale: 1, macros: mealMacros(meal) })), macros: mealMacros(oneMeal(foodId, qty)[0]), skipped: [] } as never]);

  // A tenth of a perishable pack costs the whole pack. This is the line the
  // planner used to read as a tenth of the price.
  const p = priced(perishable!.id, perishable!.packSize / 10);
  assert.ok(Math.abs(p.ongoingTotal - perishable!.packPrice) < 0.02,
    `a tenth of a ${perishable!.name} pack was charged £${p.ongoingTotal} of £${perishable!.packPrice}`);

  // A tenth of something that keeps costs a tenth.
  const k = priced(keeps!.id, keeps!.packSize / 10);
  assert.ok(k.ongoingTotal < keeps!.packPrice * 0.2,
    `a tenth of a ${keeps!.name} pack was charged £${k.ongoingTotal} of £${keeps!.packPrice}`);
});

test("leaning harder on price makes the WEEK cheaper, which is what it is judged on", () => {
  /**
   * THE REGRESSION THAT STARTED THIS. Measured before the fix, for a 78kg
   * athlete asking to keep it cheap:
   *
   *     pressure   till total   ordinary week
   *            1       £89.20          £58.68
   *            2       £85.10          £62.20
   *          3.5       £83.60          £59.63
   *            6       £85.65          £72.04
   *
   * Every step of the ladder found a cheaper TILL and a dearer WEEK, because
   * the planner minimised pack cost — which rewards a pack you finish, and the
   * packs you finish are the perishables. The staples it dropped were nearly
   * free per week; the perishables it added cost their whole price every week.
   *
   * So the ladder has to buy something on the axis it is marked on.
   */
  for (const { name, body } of ATHLETES) {
    const targets = planTargets(body as never);
    const at = (pressure: number) =>
      shoppingList(buildWeek(targets, 0, cheap({ weeklyBudget: 30 }), undefined, undefined, undefined, pressure)).ongoingTotal;
    const start = at(1);
    const best = Math.min(...[2, 3.5, 6].map(at));
    assert.ok(best < start, `${name}: the whole ladder found nothing under £${start.toFixed(2)}`);
  }
});

test("the cost terms see the portion that actually gets served", () => {
  // Meals are scored as written and then scaled to land the day on its calorie
  // target, so a 400 kcal bowl in a 700 kcal slot is bought at 1.6 servings.
  // Scored at 1.0 it looked like the cheapest thing on the list — which is why
  // pressure used to pick small cheap meals and then buy half as much again of
  // each of them.
  const src = readFileSync(new URL("./meal-plan.ts", import.meta.url), "utf8");
  assert.match(src, /function servedScale\(meal: Meal, slotKcal: number\): number/);
  assert.match(src, /marginalCost\(meal, basket, servedScale\(meal, slotKcal\(slot, dayIndex\)\)\)/);
  assert.match(src, /mealCost\(meal, servedScale\(meal, slotKcal\(slot, dayIndex\)\)\)/);
  // Same clamp as the scaling step, or the price quoted is not the price paid.
  const fn = src.slice(src.indexOf("function servedScale"), src.indexOf("function bySlot"));
  assert.match(fn, /Math\.min\(1\.6, Math\.max\(0\.55,/);
});

test("ticking keep it cheap searches, it does not only sort", () => {
  // The tick set `thrifty` — a sort order and a doubled weight, one pass — and
  // the ladder that actually finds savings was reachable only by typing a
  // number into a separate box. Most people tick the box and type nothing.
  for (const { name, body } of ATHLETES) {
    const targets = planTargets(body as never);
    const ordinary = planWithinBudget(targets, 0, DEFAULT_PREFS);
    const ticked = planWithinBudget(targets, 0, cheap());
    assert.ok(ticked.weeklyCost < ordinary.weeklyCost,
      `${name}: ticking it saved nothing — £${ticked.weeklyCost.toFixed(2)} against £${ordinary.weeklyCost.toFixed(2)}`);
    assert.equal(ticked.budget, null, "a tick is not a ceiling");
    assert.equal(ticked.met, true, "there is no ceiling here to miss");
    assert.match(ticked.note ?? "", /An ordinary week comes to/);
  }
});

test("...and the search still refuses to take it out of their food", () => {
  // A 58kg athlete's cheapest weeks come back at 64% of her protein target for
  // £39. The search offers them and the floor refuses them, which is why she
  // saves less than the 78kg athlete does. That is the honest answer, not a
  // failure — nobody ticked a box asking to be underfed.
  for (const { name, body } of ATHLETES) {
    const targets = planTargets(body as never);
    const reference = planWithinBudget(targets, 0, DEFAULT_PREFS).days;
    planWithinBudget(targets, 0, cheap()).days.forEach((day, i) => {
      if (!day.meals.length) return;
      const floor = Math.min(targets.protein * 0.9, reference[i].macros.protein * 0.95);
      assert.ok(day.macros.protein >= floor,
        `${name}: ${day.day} came back with ${day.macros.protein.toFixed(0)}g against a floor of ${floor.toFixed(0)}g`);
    });
  }
});

test("keeping it cheap is cheaper for every athlete on every diet", () => {
  // The invariant that has caught this feature going backwards four times. A
  // budget mode that is dearer for anybody is worse than no budget mode.
  const patterns: DietPattern[] = ["omnivore", "pescatarian", "vegetarian", "vegan"];
  for (const { name, body } of ATHLETES) {
    const targets = planTargets(body as never);
    for (const pattern of patterns) {
      const ordinary = planWithinBudget(targets, 1, { ...DEFAULT_PREFS, pattern });
      const thrifty = planWithinBudget(targets, 1, cheap({ pattern }));
      assert.ok(thrifty.weeklyCost <= ordinary.weeklyCost + 0.005,
        `${name} on ${pattern}: cheap mode cost £${thrifty.weeklyCost.toFixed(2)} against £${ordinary.weeklyCost.toFixed(2)}`);
    }
  }
});

test("the shopping list leads with what a week costs, not what this trip costs", () => {
  // The number somebody reads to decide whether they can afford to eat like
  // this. It was the first shop, which is a third dearer and is a one-off.
  const src = readFileSync(new URL("../components/ShoppingList.tsx", import.meta.url), "utf8");
  const header = src.slice(src.indexOf("<h3 className=\"text-lg font-extrabold\">Shopping list"), src.indexOf("<div className=\"mt-3 h-1.5"));
  assert.match(header, /text-lg font-extrabold text-pitch-400">~£\{list\.ongoingTotal\.toFixed\(2\)\}/);
  assert.match(header, /a week/);
  // The till total is still there — it is the number at the checkout.
  assert.match(header, /list\.total\.toFixed\(2\)\}.{0,20}this shop/s);
});

// --- the levers the athlete has once the week exists ---------------------------

test("swapping a meal says what it does to the week's shop", () => {
  // Swapping is the main lever on cost once the plan is built, and it was the
  // one the athlete pulled blind: the sheet ranked alternatives by slot fit and
  // said nothing about money, so somebody who had just ticked "keep it cheap"
  // chose their replacement with no idea whether it was the £1 option or the £4
  // one.
  const sheet = readFileSync(new URL("../components/MealSwap.tsx", import.meta.url), "utf8");
  assert.match(sheet, /ongoingMarginalCost\(meal, basket, scale\)/);
  // Quoted as a DIFFERENCE against the meal being replaced. A bare price is a
  // number to hold in your head; a difference is the answer.
  assert.match(sheet, /const currentCost = useMemo/);
  assert.match(sheet, /cost < currentCost - 0\.05/);
  assert.match(sheet, /"same"/, "options that change nothing do not say so");
  // The weekly cost, not the till — the same number the headline now shows.
  assert.ok(!/[^g]marginalCost\(meal, basket/.test(sheet), "the swap sheet prices the till instead of the week");
});

test("the swap prices exclude the meal being replaced", () => {
  // Leave it in the basket and its own packs are already paid for, so it scores
  // zero while every alternative pays full price — and the sheet tells an
  // athlete on a budget that nothing is ever worth changing.
  const planner = readFileSync(new URL("../components/MealPlanner.tsx", import.meta.url), "utf8");
  const fn = planner.slice(planner.indexOf("const swapBasket = useMemo"), planner.indexOf("async function applySwap"));
  assert.match(fn, /return !\(pm\.meal\.slot === swapping\.slot && nth === swapping\.nth\)/);
  assert.match(fn, /basketOf\(/);
});

test("an already-bought ingredient makes a swap free, and the maths says so", () => {
  // The non-obvious, useful half: most alternatives cost nothing, because their
  // ingredients are in the trolley for another day. A costing that could not
  // show that would push a budget shopper toward monotony for no saving.
  const meal = MEALS.find((m) => m.items.length > 0)!;
  const empty = basketOf([]);
  const already = basketOf([{ meal, scale: 1 }]);
  const fresh = ongoingMarginalCost(meal, empty);
  assert.ok(fresh > 0, "a meal added to an empty trolley costs nothing");
  assert.ok(ongoingMarginalCost(meal, already) < fresh,
    "a second serving costs the same as the first, so nothing is ever shared");
});

test("the plan says which meals are easy, not only the swap sheet", () => {
  // `cookRating` existed from the day the cooking-level preference was added
  // and was rendered in exactly one place, so an athlete could FILTER for easy
  // recipes but never SEE which of the ones they had been given were easy. The
  // decision it supports — "which night am I too tired to cook?" — is made
  // while scanning the week.
  const planner = readFileSync(new URL("../components/MealPlanner.tsx", import.meta.url), "utf8");
  assert.match(planner, /import \{ cookRating \} from "@\/lib\/recipe-difficulty"/);
  assert.match(planner, /const rating = cookRating\(pm\.meal\)/);
  // Not on every row: "medium" is the default and a badge on all 28 is
  // wallpaper, which takes the "involved" ones down with it.
  assert.match(planner, /if \(rating\.level === "medium"\) return null;/);
});
