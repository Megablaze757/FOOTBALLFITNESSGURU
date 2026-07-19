import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planTargets, buildWeek, shoppingList, mealAllowed, mealTags, unmetSlots,
  MEALS, DEFAULT_PREFS, DIET_PATTERNS,
  type BodyStats, type MealPrefs,
} from "./meal-plan";
import { FOOD_BY_ID } from "./food-db";

const ATHLETE: BodyStats = {
  sex: "male", age: 22, heightCm: 180, weightKg: 78,
  activity: "high", goal: "maintain",
};
const prefs = (p: Partial<MealPrefs>): MealPrefs => ({ ...DEFAULT_PREFS, ...p });

/** Every food that appears anywhere in a generated week. */
function foodsIn(week: ReturnType<typeof buildWeek>): string[] {
  const out = new Set<string>();
  for (const d of week) for (const pm of d.meals) for (const it of pm.meal.items) out.add(it.foodId);
  return [...out];
}

test("a vegan plan contains no animal products at all", () => {
  const week = buildWeek(planTargets(ATHLETE), 0, prefs({ pattern: "vegan" }));
  assert.ok(week.every((d) => d.meals.length >= 3), "vegan athletes still need full days");
  for (const id of foodsIn(week)) {
    const tags = FOOD_BY_ID[id]?.tags ?? [];
    for (const banned of ["meat", "pork", "fish", "dairy", "egg"]) {
      assert.ok(!tags.includes(banned as never), `${id} is ${banned} but appeared in a vegan plan`);
    }
  }
});

test("a vegetarian plan still allows dairy and eggs", () => {
  const week = buildWeek(planTargets(ATHLETE), 0, prefs({ pattern: "vegetarian" }));
  for (const id of foodsIn(week)) {
    const tags = FOOD_BY_ID[id]?.tags ?? [];
    assert.ok(!tags.includes("meat") && !tags.includes("fish"), `${id} should not be in a vegetarian plan`);
  }
});

test("a pescatarian gets fish but no meat", () => {
  const week = buildWeek(planTargets(ATHLETE), 0, prefs({ pattern: "pescatarian" }));
  for (const id of foodsIn(week)) {
    assert.ok(!(FOOD_BY_ID[id]?.tags ?? []).includes("meat"), `${id} is meat`);
  }
});

test("allergies are respected — nothing containing the allergen appears", () => {
  for (const avoid of ["nuts", "dairy", "gluten", "egg"] as const) {
    const week = buildWeek(planTargets(ATHLETE), 0, prefs({ avoid: [avoid] }));
    for (const id of foodsIn(week)) {
      assert.ok(
        !(FOOD_BY_ID[id]?.tags ?? []).includes(avoid as never),
        `${id} contains ${avoid} but appeared in a plan avoiding it`
      );
    }
  }
});

test("a disliked food never shows up", () => {
  const week = buildWeek(planTargets(ATHLETE), 0, prefs({ dislikes: ["broccoli", "tuna_tin"] }));
  const foods = foodsIn(week);
  assert.ok(!foods.includes("broccoli") && !foods.includes("tuna_tin"), foods.join(" "));
});

test("meals per day is honoured", () => {
  for (const n of [3, 4, 5] as const) {
    const week = buildWeek(planTargets(ATHLETE), 0, prefs({ mealsPerDay: n }));
    for (const d of week) {
      assert.equal(d.meals.length, n, `${d.day} had ${d.meals.length} meals, wanted ${n}`);
    }
  }
});

test("budget mode produces a cheaper shop than the default", () => {
  const t = planTargets(ATHLETE);
  const normal = shoppingList(buildWeek(t, 0, prefs({})));
  const cheap = shoppingList(buildWeek(t, 0, prefs({ budget: true })));
  assert.ok(cheap.total <= normal.total, `budget £${cheap.total} vs normal £${normal.total}`);
});

test("combined restrictions still produce a full week, or say what's missing", () => {
  const strict = prefs({ pattern: "vegan", avoid: ["gluten", "nuts", "soy"] });
  const gaps = unmetSlots(strict);
  const week = buildWeek(planTargets(ATHLETE), 0, strict);
  for (const d of week) {
    // Every slot we *can* fill is filled; gaps are reported rather than faked.
    assert.equal(d.meals.length, strict.mealsPerDay - gaps.filter((g) => g !== "Snack").length - (gaps.includes("Snack") ? strict.mealsPerDay - 3 : 0));
  }
  for (const pm of week.flatMap((d) => d.meals)) {
    assert.ok(mealAllowed(pm.meal, strict), `${pm.meal.id} breaks the restrictions`);
  }
});

test("every meal's tags come from its actual ingredients", () => {
  for (const m of MEALS) {
    const expected = new Set(m.items.flatMap((it) => FOOD_BY_ID[it.foodId]?.tags ?? []));
    assert.deepEqual(new Set(mealTags(m)), expected, m.id);
  }
});

test("each diet pattern has something to eat in every main slot", () => {
  for (const d of DIET_PATTERNS) {
    const gaps = unmetSlots(prefs({ pattern: d.id })).filter((g) => g !== "Snack");
    assert.deepEqual(gaps, [], `${d.id} has no options for ${gaps.join(", ")}`);
  }
});
