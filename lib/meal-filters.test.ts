import { test } from "node:test";
import assert from "node:assert/strict";
import {
  passesFilters, matchesQuery, activeFilterCount,
  NO_FILTERS, FILTER_CHIPS, QUICK_MINUTES, HIGH_PROTEIN_G,
} from "./meal-filters";
import { MEALS, mealMacros, mealTags, mealAllowed, DEFAULT_PREFS, type Meal } from "./meal-plan";
import { FOOD_BY_ID } from "./food-db";

/**
 * These predicates drive both the recipe library and the swap sheet. A filter
 * that quietly excludes something is invisible — the list is simply shorter,
 * and shorter is what a filter is supposed to be.
 */

const foodName = (id: string) => FOOD_BY_ID[id]?.name;
const on = (...keys: (keyof typeof NO_FILTERS)[]) =>
  ({ ...NO_FILTERS, ...Object.fromEntries(keys.map((k) => [k, true])) });

test("no filters lets everything through", () => {
  for (const m of MEALS) assert.ok(passesFilters(m, NO_FILTERS));
  assert.equal(activeFilterCount(NO_FILTERS), 0);
});

test("quick means at or under the stated minutes", () => {
  const kept = MEALS.filter((m) => passesFilters(m, on("quick")));
  assert.ok(kept.length > 0, "no quick meals at all");
  for (const m of kept) assert.ok((m.minutes ?? 999) <= QUICK_MINUTES, `${m.id} is ${m.minutes} min`);
  // And it actually excludes: the chip must not be decorative.
  assert.ok(kept.length < MEALS.length, "the quick filter excluded nothing");
});

/**
 * A recipe with no stated time must NOT count as quick. Unknown is not fast,
 * and someone filtering for "I have ten minutes" should not be handed a
 * 40-minute traybake because nobody filled the field in.
 */
test("a meal with no time is not quick", () => {
  const timeless = { id: "t", name: "Mystery", slot: "Lunch", method: "", items: [] } as unknown as Meal;
  assert.equal(passesFilters(timeless, on("quick")), false);
});

test("high protein means at or above the threshold", () => {
  const kept = MEALS.filter((m) => passesFilters(m, on("highProtein")));
  assert.ok(kept.length > 0);
  for (const m of kept) {
    assert.ok(mealMacros(m).protein >= HIGH_PROTEIN_G, `${m.id} has ${mealMacros(m).protein}g`);
  }
});

test("starred matches only the ids given", () => {
  const [a, b] = MEALS;
  assert.equal(passesFilters(a, on("starred"), [a.id]), true);
  assert.equal(passesFilters(b, on("starred"), [a.id]), false);
  assert.equal(passesFilters(a, on("starred"), []), false, "nothing starred means nothing matches");
});

/**
 * THE ONE THAT MATTERS MOST. Veggie and vegan use the same tag rules the
 * planner enforces, so a chip can never surface a meal the plan would refuse to
 * serve — the library showing a vegan something with honey in it would be worse
 * than the chip not existing.
 */
test("veggie and vegan agree with what the planner would serve", () => {
  const veggie = MEALS.filter((m) => passesFilters(m, on("veggie")));
  const vegan = MEALS.filter((m) => passesFilters(m, on("vegan")));
  assert.ok(veggie.length > 0 && vegan.length > 0);

  for (const m of veggie) {
    assert.ok(mealAllowed(m, { ...DEFAULT_PREFS, pattern: "vegetarian" }), `${m.id} isn't vegetarian`);
  }
  for (const m of vegan) {
    assert.ok(mealAllowed(m, { ...DEFAULT_PREFS, pattern: "vegan" }), `${m.id} isn't vegan`);
    assert.ok(!mealTags(m).includes("honey"), `${m.id} has honey in it`);
  }
  // Every vegan meal is also vegetarian; the reverse must not hold, or one of
  // the two chips is doing nothing.
  assert.ok(vegan.length < veggie.length, "vegan and veggie select the same set");
});

test("filters combine as AND, not OR", () => {
  const both = MEALS.filter((m) => passesFilters(m, on("quick", "highProtein")));
  for (const m of both) {
    assert.ok((m.minutes ?? 999) <= QUICK_MINUTES && mealMacros(m).protein >= HIGH_PROTEIN_G, m.id);
  }
  const quickOnly = MEALS.filter((m) => passesFilters(m, on("quick"))).length;
  assert.ok(both.length <= quickOnly, "combining filters widened the result");
});

test("search matches names and ingredients", () => {
  const meal = MEALS.find((m) => m.items.some((i) => i.foodId === "chickpeas"))!;
  assert.ok(matchesQuery(meal, "chickpea", foodName), "ingredient search should match");
  assert.ok(matchesQuery(meal, meal.name.slice(0, 6), foodName), "name search should match");
  assert.ok(matchesQuery(meal, "   ", foodName), "a blank query matches everything");
  assert.equal(matchesQuery(meal, "zzzznope", foodName), false);
});

test("every chip is wired to a real filter key", () => {
  for (const c of FILTER_CHIPS) {
    assert.ok(c.id in NO_FILTERS, `${c.id} is not a filter`);
    assert.ok(c.label.trim().length > 0);
    // The label quotes the threshold, so a changed constant must not leave the
    // chip lying about what it does.
    if (c.id === "quick") assert.ok(c.label.includes(String(QUICK_MINUTES)));
    if (c.id === "highProtein") assert.ok(c.label.includes(String(HIGH_PROTEIN_G)));
  }
  assert.equal(FILTER_CHIPS.length, Object.keys(NO_FILTERS).length, "a filter has no chip");
});

test("activeFilterCount counts what is on", () => {
  assert.equal(activeFilterCount(on("quick")), 1);
  assert.equal(activeFilterCount(on("quick", "vegan", "starred")), 3);
});

/**
 * No combination of chips should be able to empty a slot for an omnivore — if
 * one can, the chip row is offering a dead end rather than a filter.
 */
test("single filters always leave something in every slot", () => {
  for (const chip of FILTER_CHIPS) {
    if (chip.id === "starred") continue; // legitimately empty until someone stars something
    for (const slot of ["Breakfast", "Lunch", "Dinner", "Snack"] as const) {
      const n = MEALS.filter((m) => m.slot === slot && passesFilters(m, on(chip.id))).length;
      assert.ok(n > 0, `${chip.label} + ${slot} has no recipes at all`);
    }
  }
});
