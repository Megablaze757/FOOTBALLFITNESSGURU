import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planTargets, buildWeek, shoppingList, marginalCost, MEALS, DEFAULT_PREFS,
  type BodyStats,
} from "./meal-plan";
import { FOOD_BY_ID } from "./food-db";

const ATHLETE: BodyStats = {
  sex: "male", age: 22, heightCm: 180, weightKg: 78, activity: "high", goal: "maintain",
};
const plan = () => buildWeek(planTargets(ATHLETE), 0, DEFAULT_PREFS);

// --- the bulk-buying idea ----------------------------------------------------

test("a staple already in the basket is nearly free the second time", () => {
  // Any rice-based meal. Was hard-coded to "chicken_rice", which is exactly the
  // kind of fixture that breaks when the menu is rewritten — the behaviour under
  // test is about bulk staples, not that one dish.
  const riceMeal = MEALS.find((m) => m.items.some((i) => i.foodId === "rice"))!;
  assert.ok(riceMeal, "no rice-based meal in the pool");
  const empty = marginalCost(riceMeal, new Map());

  // A 1kg bag of rice covers far more than one 90g portion, so once it's in the
  // trolley the rice part of the next meal costs nothing extra.
  const basket = new Map<string, number>();
  for (const it of riceMeal.items) basket.set(it.foodId, it.qty);
  const second = marginalCost(riceMeal, basket);

  assert.ok(second < empty, `second serving (${second}) should cost less than the first (${empty})`);
});

test("marginal cost charges a whole pack, not a pro-rata slice", () => {
  const rice = FOOD_BY_ID["rice"];
  const meal = { id: "t", name: "t", slot: "Lunch" as const, method: "", items: [{ foodId: "rice", qty: 90 }] };
  // 90g of rice means buying the whole bag.
  assert.equal(marginalCost(meal, new Map()), rice.packPrice);
  // Still one bag when we go back for more.
  const basket = new Map([["rice", 90]]);
  assert.equal(marginalCost(meal, basket), 0);
});

test("packs are shared across the week, not bought per meal", () => {
  const list = shoppingList(plan());
  const shared = list.lines.filter((l) => l.meals > 1);
  assert.ok(shared.length >= 3, "staples should be reused across meals");
  for (const l of shared) {
    // The whole point: fewer packs than the meals they feed.
    assert.ok(l.packs <= l.meals, `${l.food.id}: ${l.packs} packs for ${l.meals} meals`);
  }
});

test("the list reports what a meal actually costs", () => {
  const list = shoppingList(plan());
  assert.ok(list.mealsPlanned > 20, `only ${list.mealsPlanned} meals planned`);
  assert.ok(list.costPerMeal > 0);
  assert.ok(
    Math.abs(list.costPerMeal - list.total / list.mealsPlanned) < 0.02,
    "cost per meal should reconcile with the total"
  );
  // A week of home-cooked athlete food shouldn't come out at restaurant prices.
  assert.ok(list.costPerMeal < 6, `£${list.costPerMeal} a meal is too expensive`);
});

test("bulk planning beats naive rotation on price", () => {
  // The old planner rotated through meals by index with no regard for what was
  // already in the trolley. Rebuild that here and check we improved on it.
  const targets = planTargets(ATHLETE);
  const bulk = shoppingList(buildWeek(targets, 0, DEFAULT_PREFS)).total;

  const naive = shoppingList(
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, i) => {
      const of = (slot: string) => MEALS.filter((m) => m.slot === slot);
      const picks = [of("Breakfast"), of("Lunch"), of("Dinner"), of("Snack")].map((l) => l[i % l.length]);
      return {
        day, skipped: [],
        meals: picks.map((meal) => ({ meal, scale: 1, macros: { kcal: 0, protein: 0, carbs: 0, fats: 0 } })),
        macros: { kcal: 0, protein: 0, carbs: 0, fats: 0 },
      };
    })
  ).total;

  assert.ok(bulk <= naive, `bulk planning £${bulk} should not cost more than rotation £${naive}`);
});

// --- but it must not become miserable ---------------------------------------

test("cheapness never collapses the menu to one meal", () => {
  const w = plan();
  for (const slot of ["Breakfast", "Lunch", "Dinner"]) {
    const ids = new Set(
      w.map((d) => d.meals.find((m) => m.meal.slot === slot)?.meal.id).filter(Boolean)
    );
    assert.ok(ids.size >= 2, `the same ${slot.toLowerCase()} all week is not a plan`);
  }
});

test("no meal appears more than three times a week", () => {
  const counts = new Map<string, number>();
  for (const d of plan()) for (const m of d.meals) counts.set(m.meal.id, (counts.get(m.meal.id) ?? 0) + 1);
  for (const [id, n] of counts) assert.ok(n <= 3, `${id} appears ${n} times`);
});

test("dietary rules still win over cost", () => {
  const vegan = buildWeek(planTargets(ATHLETE), 0, { ...DEFAULT_PREFS, pattern: "vegan" });
  const foods = vegan.flatMap((d) => d.meals.flatMap((m) => m.meal.items.map((i) => i.foodId)));
  for (const banned of ["chicken_breast", "beef_mince_5", "eggs", "milk", "greek_yoghurt", "salmon_fillet"]) {
    assert.ok(!foods.includes(banned), `${banned} in a vegan plan`);
  }
});
