import { test } from "node:test";
import assert from "node:assert/strict";
import { planTargets, buildWeek, shoppingList, DEFAULT_PREFS, type BodyStats } from "./meal-plan";
import { parseSchedule } from "./meal-schedule";

/**
 * The guarantee the meal planner's persistence rests on.
 *
 * The plan itself is never stored — only its seed, alongside the diet settings
 * that were already saved. That works because buildWeek is pure: the same
 * inputs must always give back the same week. If that ever stops being true,
 * someone reopens the app and finds a different plan from the shopping list
 * they'd half-bought against.
 */
const STATS: BodyStats = {
  sex: "male", goal: "maintain", activity: "moderate",
  age: 22, heightCm: 180, weightKg: 78,
};

const plan = (seed: number, notes = "", over: Partial<typeof DEFAULT_PREFS> = {}) =>
  buildWeek(planTargets(STATS), seed, { ...DEFAULT_PREFS, ...over }, parseSchedule(notes));

const shape = (w: ReturnType<typeof buildWeek>) =>
  JSON.stringify(w.map((d) => ({ day: d.day, meals: d.meals.map((m) => m.meal.id) })));

test("the same seed rebuilds the identical week", () => {
  // This is the whole persistence contract.
  for (const seed of [0, 1, 2, 7]) {
    assert.equal(shape(plan(seed)), shape(plan(seed)), `seed ${seed} is not reproducible`);
  }
});

test("rebuilding is stable across many repeats, not just twice", () => {
  const first = shape(plan(1));
  for (let i = 0; i < 20; i++) assert.equal(shape(plan(1)), first);
});

test("the shopping list is stable for a stored plan", () => {
  // The list is what someone actually shops from; it drifting would be worse
  // than the plan drifting.
  assert.deepEqual(shoppingList(plan(2)), shoppingList(plan(2)));
});

test("preferences still change the plan", () => {
  // Persistence must not have frozen the planner into ignoring its inputs.
  const omni = shape(plan(1));
  const vegan = shape(plan(1, "", { pattern: "vegan" }));
  assert.notEqual(omni, vegan, "diet pattern should change the week");
});

test("notes still change the plan", () => {
  const normal = shape(plan(1));
  const eatsOut = shape(plan(1, "I eat out on Tuesdays"));
  assert.notEqual(normal, eatsOut, "a schedule note should change the week");
});

test("a restored plan is a real week, not an empty shell", () => {
  const w = plan(1);
  assert.equal(w.length, 7, "a week is seven days");
  for (const d of w) {
    assert.ok(d.meals.length > 0, `${d.day} came back with no meals`);
    for (const m of d.meals) {
      assert.ok(m.meal?.id && m.meal?.name, "a meal with no identity can't be rebuilt");
    }
  }
});

test("every seed the UI can produce is safe to store and restore", () => {
  // The UI picks Math.floor(Math.random() * 3), so 0..2 are the values that
  // actually reach the database.
  for (const seed of [0, 1, 2]) {
    const w = plan(seed);
    assert.equal(w.length, 7);
    assert.equal(shape(plan(seed)), shape(w));
  }
});
