import test from "node:test";
import assert from "node:assert/strict";
import { cookRating, isEasyCook, COOK_LEVELS, type CookLevel } from "./recipe-difficulty";
import { MEALS, recipeSteps, buildWeek, planTargets, DEFAULT_PREFS, mergePrefs, type Meal } from "./meal-plan";
import { passesFilters, NO_FILTERS, FILTER_CHIPS, QUICK_MINUTES } from "./meal-filters";

const byName = (name: string): Meal => {
  const meal = MEALS.find((m) => m.name === name);
  assert.ok(meal, `no recipe called "${name}" — the book has been edited, pick another`);
  return meal!;
};

/**
 * "The recipes are good but I have no idea which ones I can actually manage."
 *
 * The book carried a time and nothing else, and time is a poor proxy for
 * difficulty in both directions.
 */

test("time is not difficulty, in either direction", () => {
  // THE WHOLE POINT. Both of these pass or fail the clock in the opposite
  // direction to how hard they are to cook.
  const shakshuka = cookRating(byName("Shakshuka"));
  assert.equal(shakshuka.level, "involved", "20 minutes, eight ingredients, six steps — not a weeknight");
  assert.ok(shakshuka.minutes <= 20, "premise changed: this recipe is no longer quick");

  const toast = cookRating(byName("Salmon & avocado toast"));
  assert.equal(toast.level, "easy");
});

test("no recipe is left unrated", () => {
  const counts: Record<CookLevel, number> = { easy: 0, medium: 0, involved: 0 };
  for (const meal of MEALS) {
    const rating = cookRating(meal);
    assert.ok(COOK_LEVELS.some((l) => l.id === rating.level), `${meal.name}: ${rating.level}`);
    assert.ok(rating.label.length > 0 && rating.blurb.length > 0, meal.name);
    counts[rating.level]++;
  }
  // Every level has to be worth having. A scale where 90% of the book lands in
  // one bucket is a label, not a filter.
  for (const level of ["easy", "medium", "involved"] as const) {
    const share = counts[level] / MEALS.length;
    assert.ok(share > 0.15, `only ${Math.round(share * 100)}% of recipes are ${level}`);
    assert.ok(share < 0.6, `${Math.round(share * 100)}% of recipes are ${level} — the scale says nothing`);
  }
});

test("the rating is built from the recipe, so editing one moves it", () => {
  // Derived rather than hand-labelled: 256 hand-ratings go stale the first time
  // somebody edits a recipe, and nothing tells you they have.
  const base = byName("Shakshuka");
  const simplified: Meal = {
    ...base,
    minutes: 8,
    items: base.items.slice(0, 3),
    steps: ["Warm the pan.", "Add everything.", "Eat."],
    method: "Warm the pan. Add everything. Eat.",
  };
  assert.equal(cookRating(simplified).level, "easy");
  assert.ok(cookRating(simplified).score < cookRating(base).score);
});

test("a recipe with no stated time is not assumed easy", () => {
  // Unknown is not fast — the same rule the "under 15 min" filter already uses.
  const nameless = { method: "Cook it.", items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], steps: ["Cook it."] };
  assert.ok(cookRating(nameless).minutes >= 30);
  assert.notEqual(cookRating(nameless).level, "easy");
});

test("two pans and a clock count against a recipe", () => {
  // "Meanwhile" is the strongest signal in a method: it means two things
  // running at once, which is the thing that goes wrong when you are tired.
  const plain = { minutes: 12, items: [1, 2, 3, 4, 5, 6, 7], method: "Fry the eggs. Toast the bread.", steps: ["Fry the eggs.", "Toast the bread."] };
  const juggling = { ...plain, method: "Fry the eggs. Meanwhile toast the bread." };
  assert.equal(cookRating(juggling).score, cookRating(plain).score + 1);
  // Ordinary cooking verbs are NOT difficulty. Counting "fry" or "blend" would
  // rate a protein shake as hard work.
  const fried = { ...plain, method: "Fry the eggs and blend the shake." };
  assert.equal(cookRating(fried).score, cookRating(plain).score);
});

// --- the filter --------------------------------------------------------------

test("easy to cook is a different question from under fifteen minutes", () => {
  // If the two chips selected the same recipes, one of them is decoration.
  const quick = MEALS.filter((m) => (m.minutes ?? 99) <= QUICK_MINUTES);
  const easy = MEALS.filter(isEasyCook);
  const quickButNotEasy = quick.filter((m) => !isEasyCook(m));
  const easyButNotQuick = easy.filter((m) => (m.minutes ?? 99) > QUICK_MINUTES);
  assert.ok(quickButNotEasy.length > 5, `only ${quickButNotEasy.length} quick recipes are hard work`);
  assert.ok(easyButNotQuick.length > 5, `only ${easyButNotQuick.length} slow recipes are easy work`);
});

test("the chip filters to exactly what it says", () => {
  assert.ok(FILTER_CHIPS.some((c) => c.id === "easy"), "no easy-to-cook chip");
  const on = { ...NO_FILTERS, easy: true };
  for (const meal of MEALS) {
    assert.equal(passesFilters(meal, on), isEasyCook(meal), meal.name);
  }
  // And an untouched filter row still shows everything.
  assert.equal(MEALS.every((m) => passesFilters(m, NO_FILTERS)), true);
});

// --- the plan ----------------------------------------------------------------

test("keeping it simple changes the week without starving it", () => {
  // A PREFERENCE, NOT A FILTER. Cutting the book to the 38% rated easy leaves
  // some slots with a handful of candidates, and the variety rule, the diet
  // rules and the macro targets all need room to move. A plan that is simple to
  // cook and hits none of its protein targets is not the trade anyone asked for.
  const targets = planTargets({ weightKg: 78, heightCm: 180, age: 28, sex: "male", activity: "moderate", goal: "maintain" });
  const plain = buildWeek(targets, 4, mergePrefs(DEFAULT_PREFS, { cookLevel: "any" }));
  const simple = buildWeek(targets, 4, mergePrefs(DEFAULT_PREFS, { cookLevel: "easy" }));

  const easyShare = (week: typeof plain) => {
    const meals = week.flatMap((d) => d.meals.map((m) => m.meal));
    return meals.filter(isEasyCook).length / meals.length;
  };
  assert.ok(easyShare(simple) > easyShare(plain), "asking for simple food changed nothing");
  assert.ok(easyShare(simple) >= 0.55, `only ${Math.round(easyShare(simple) * 100)}% of the simple week is easy`);
  // And it stays a preference: some meals are still worth the faff.
  assert.ok(easyShare(simple) < 1, "the preference became a filter");

  // Still fed. The point of preferring rather than filtering.
  for (const day of simple) {
    const kcal = day.macros.kcal;
    assert.ok(kcal > day.targetKcal * 0.7, `${day.day} came out at ${Math.round(kcal)} of ${Math.round(day.targetKcal)} kcal`);
    assert.ok(day.meals.length >= 3, `${day.day} has only ${day.meals.length} meals`);
  }
});

test("absent preferences do not overwrite the defaults", () => {
  // A plain spread is wrong here, and quietly: the saved profile is read with
  // `?? undefined` on every field, so `{ ...DEFAULT_PREFS, ...saved }` is not
  // the defaults — it is undefined several times over, and `prefs.avoid.length`
  // then throws. Absent is not a value.
  const merged = mergePrefs(DEFAULT_PREFS, {
    pattern: undefined, avoid: undefined, mealsPerDay: undefined, budget: undefined,
  } as never);
  assert.equal(merged.pattern, DEFAULT_PREFS.pattern);
  assert.deepEqual(merged.avoid, DEFAULT_PREFS.avoid);
  assert.equal(merged.mealsPerDay, DEFAULT_PREFS.mealsPerDay);
  assert.equal(merged.budget, false);
  // A real value still wins.
  assert.equal(mergePrefs(DEFAULT_PREFS, { budget: true }).budget, true);
  assert.equal(mergePrefs(DEFAULT_PREFS, null).mealsPerDay, DEFAULT_PREFS.mealsPerDay);
});

test("the steps a rating counts are the steps the recipe shows", () => {
  // Two step-counting implementations would drift, and the difference would be
  // invisible: a card saying "4 steps" beside a rating built on 6.
  for (const meal of MEALS.slice(0, 40)) {
    assert.equal(cookRating(meal).steps, recipeSteps(meal).length, meal.name);
  }
});
