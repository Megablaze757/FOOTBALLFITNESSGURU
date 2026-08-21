import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MEALS, DIET_PATTERNS, AVOIDANCES, FOOD_KEYWORDS, DEFAULT_PREFS,
  mealAllowed, mealMacros, mealTags, planTargets, buildWeek,
  type BodyStats, type MealPrefs, type Slot,
} from "./meal-plan";
import { FOODS, FOOD_BY_ID } from "./food-db";

/**
 * "A lot of people didn't like the recipes, can we add some more."
 *
 * The tests here are about the BOOK — how much of it any given athlete can
 * actually reach — rather than about the planner that reads it. Counting the
 * pool is what found the three separate complaints hiding inside that one
 * sentence: an omnivore handed a near-vegetarian list, nobody able to make
 * lunch in ten minutes, and a plant-based athlete one tick away from a rotation
 * short enough to notice by Thursday.
 *
 * Floors are set below what is measured today and above what was there before,
 * so they catch a regression without failing every time a recipe is added.
 */

const SLOTS: Slot[] = ["Breakfast", "Lunch", "Dinner", "Snack"];
const poolFor = (prefs: MealPrefs, slot: Slot) =>
  MEALS.filter((m) => m.slot === slot && mealAllowed(m, prefs));

test("every diet has real choice in every slot, not just something", () => {
  // `each diet pattern has something to eat in every main slot` already asserts
  // non-empty. Non-empty is not a plan: with a repeat cap of three, a pool of
  // four is the same week forever. Measured today: the thinnest is a vegan at
  // 25 snacks; before this round it was 23.
  for (const pattern of DIET_PATTERNS) {
    const prefs: MealPrefs = { ...DEFAULT_PREFS, pattern: pattern.id };
    for (const slot of SLOTS) {
      const n = poolFor(prefs, slot).length;
      assert.ok(n >= 20, `${pattern.id} has only ${n} ${slot.toLowerCase()}s`);
    }
  }
});

test("a plant-based athlete who ticks one more box still has a week", () => {
  // The two combinations that were unusable, and the reason the plant pantry
  // exists: a vegan avoiding soy had 9/9/10/12 before this round and a vegan
  // avoiding gluten 16/16/19/16. With MAX_REPEATS at 3 a pool under 10 cannot
  // fill seven days without forcing repeats.
  for (const avoid of ["soy", "gluten", "nuts", "dairy"] as const) {
    const prefs: MealPrefs = { ...DEFAULT_PREFS, pattern: "vegan", avoid: [avoid] };
    for (const slot of SLOTS) {
      const n = poolFor(prefs, slot).length;
      assert.ok(n >= 12, `a vegan avoiding ${avoid} has only ${n} ${slot.toLowerCase()}s`);
    }
  }
});

test("somebody who eats meat is offered meat at every meal of the day", () => {
  // Breakfast held ONE meat dish and one fish dish out of 44, and snacks held
  // no meat at all — so an omnivore's morning and their afternoon were
  // vegetarian by default whatever the planner did with lunch and dinner.
  for (const slot of SLOTS) {
    const pool = MEALS.filter((m) => m.slot === slot);
    const animal = pool.filter((m) => {
      const tags = mealTags(m) as string[];
      return tags.includes("meat") || tags.includes("fish");
    });
    assert.ok(animal.length >= 5, `only ${animal.length} ${slot.toLowerCase()}s carry meat or fish`);
  }
});

test("there is something to eat when there are ten minutes to make it", () => {
  // Two lunches in the whole book came in under ten minutes, and no dinner came
  // in under twenty. Somebody with a work laptop and no lunch break was being
  // told to make a traybake.
  const quickLunches = MEALS.filter((m) => m.slot === "Lunch" && (m.minutes ?? 99) <= 10);
  assert.ok(quickLunches.length >= 6, `only ${quickLunches.length} lunches under 10 minutes`);
  const quickDinners = MEALS.filter((m) => m.slot === "Dinner" && (m.minutes ?? 99) <= 20);
  assert.ok(quickDinners.length >= 4, `only ${quickDinners.length} dinners under 20 minutes`);
});

test("a carb that is not wheat exists in every main slot", () => {
  // Every long carb in the book was wheat — pasta, couscous, egg noodles,
  // pittas, wraps, bread — so a gluten-free athlete had rice, potatoes and
  // quinoa and 26 lunches against an omnivore's 51.
  const prefs: MealPrefs = { ...DEFAULT_PREFS, avoid: ["gluten"] };
  for (const slot of SLOTS) {
    const n = poolFor(prefs, slot).length;
    assert.ok(n >= 25, `a gluten-free athlete has only ${n} ${slot.toLowerCase()}s`);
  }
});

test("ticking no pork actually excludes something", () => {
  // It excluded nothing, because there was no pork in the database. An
  // avoidance in the UI that removes zero meals is a promise the app was not
  // keeping, and the athlete has no way to tell that from it working.
  for (const avoidance of AVOIDANCES) {
    const prefs: MealPrefs = { ...DEFAULT_PREFS, avoid: [avoidance.id] };
    const removed = MEALS.length - MEALS.filter((m) => mealAllowed(m, prefs)).length;
    assert.ok(removed > 0, `"no ${avoidance.id}" removes no meals at all`);
  }
});

test("a cutting vegan who avoids soy can actually be fed", () => {
  // THE WORST CASE IN THE APP, and it was total: 28 of 28 days under 90% of
  // their protein target, worst day at 52%. Not a rotation problem — the pool
  // held ONE breakfast, ZERO lunches, ZERO dinners and two snacks that clear
  // the 0.079 g/kcal they need, so every option available was the wrong one.
  const stats: BodyStats = {
    sex: "female", age: 30, heightCm: 165, weightKg: 60, activity: "moderate", goal: "cut",
  };
  const targets = planTargets(stats);
  const prefs: MealPrefs = { ...DEFAULT_PREFS, pattern: "vegan", avoid: ["soy"] };

  let short = 0;
  let days = 0;
  let worst = 1;
  let recent: string[] = [];
  for (let week = 0; week < 4; week++) {
    const plan = buildWeek(targets, week, prefs, undefined, {}, recent);
    for (const day of plan) {
      days++;
      const ratio = day.macros.protein / targets.protein;
      worst = Math.min(worst, ratio);
      if (ratio < 0.9) short++;
    }
    recent = plan.flatMap((d) => d.meals.map((m) => m.meal.id));
  }
  // Four weeks, because one week says nothing: the repeat cap only bites from
  // about day five, which is exactly when this athlete used to fall off.
  assert.ok(short <= days * 0.25, `${short}/${days} days short of protein`);
  assert.ok(worst >= 0.65, `worst day landed at ${Math.round(worst * 100)}% of target`);
});

test("green vegetables are why the soy-free dishes work", () => {
  // Not a style note — it is the arithmetic the whole section rests on. Every
  // soy-free plant protein is below a cutting athlete's bar (lentils 0.071,
  // kidney beans 0.069, chickpeas 0.061) and the vegetables are above it. If
  // that ever stops being true the recipes built on it stop working.
  const density = (id: string) => {
    const f = FOOD_BY_ID[id];
    return f.protein / f.kcal;
  };
  for (const green of ["mushrooms", "spinach", "kale", "broccoli"]) {
    assert.ok(density(green) > density("red_lentils"), `${green} is no longer denser than lentils`);
  }
  assert.ok(density("mushrooms") > 0.12, "mushrooms carry the soy-free savoury dishes");
});

test("every food can be named in the notes box", () => {
  // A food the athlete cannot name is a food they cannot refuse. "I don't eat
  // pork" has to reach the bacon, or the sentence silently does nothing — and
  // silently doing nothing is how the notes box behaved before it understood
  // preferences at all.
  const unnameable = FOODS.filter((f) => !FOOD_KEYWORDS[f.id]).map((f) => f.id);
  assert.deepEqual(unnameable, [], `no keywords for: ${unnameable.join(", ")}`);
});

test("every keyword points at a food that exists", () => {
  // The other direction, which a rename would break silently.
  const orphans = Object.keys(FOOD_KEYWORDS).filter((id) => !FOOD_BY_ID[id]);
  assert.deepEqual(orphans, [], `keywords for missing foods: ${orphans.join(", ")}`);
});

test("no two recipes share a name", () => {
  // Ids are already checked. Names are what the athlete sees, and two "Chicken
  // fajitas" in the library reads as a bug whatever the ids say.
  const seen = new Map<string, string>();
  for (const meal of MEALS) {
    const key = meal.name.toLowerCase();
    assert.ok(!seen.has(key), `"${meal.name}" is used by both ${seen.get(key)} and ${meal.id}`);
    seen.set(key, meal.id);
  }
});

test("a snack is a snack, not a batch", () => {
  // "Date & almond bites" went in at 883 kcal because it was written as the
  // eight balls it makes rather than the four you eat. The planner serves one
  // Meal as one sitting, so a batch quietly becomes a 900-calorie snack.
  //
  // SNACKS ONLY. `no meal has implausible calories` already caps every slot at
  // 2,200, and mains genuinely run large — a 95kg athlete building has a 1,500
  // kcal dinner target, so the deliberately big dishes written for them are not
  // batches. The snack slot is where the mistake is undetectable by size alone.
  for (const meal of MEALS.filter((m) => m.slot === "Snack")) {
    const { kcal } = mealMacros(meal);
    assert.ok(kcal <= 600, `${meal.name} is ${Math.round(kcal)} kcal for one snack`);
  }
});
