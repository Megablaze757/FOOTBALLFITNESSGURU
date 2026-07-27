import { test } from "node:test";
import assert from "node:assert/strict";
import {
  basalRate, planTargets, buildWeek, shoppingList, shoppingListText,
  mealMacros, MEALS, ACTIVITY_LEVELS, DEFAULT_PREFS,
  dislikedFoodIds, favouriteFoodIds, type BodyStats,
} from "./meal-plan";
import { EMPTY_SCHEDULE } from "./meal-schedule";
import { FOOD_BY_ID } from "./food-db";

const ATHLETE: BodyStats = {
  sex: "male", age: 22, heightCm: 180, weightKg: 78,
  activity: "high", goal: "maintain",
};

test("Mifflin-St Jeor matches the published formula", () => {
  // 10*78 + 6.25*180 - 5*22 + 5 = 780 + 1125 - 110 + 5
  assert.equal(basalRate(ATHLETE), 1800);
  assert.equal(basalRate({ ...ATHLETE, sex: "female" }), 1800 - 5 - 161);
});

test("height and age actually move the targets", () => {
  const short = planTargets({ ...ATHLETE, heightCm: 165 });
  const tall = planTargets({ ...ATHLETE, heightCm: 195 });
  assert.ok(tall.calories > short.calories, "taller athlete should need more");
  const young = planTargets({ ...ATHLETE, age: 18 });
  const older = planTargets({ ...ATHLETE, age: 45 });
  assert.ok(young.calories > older.calories);
});

test("activity level scales calories in the right direction", () => {
  let last = 0;
  for (const a of ACTIVITY_LEVELS) {
    const t = planTargets({ ...ATHLETE, activity: a.id });
    assert.ok(t.calories > last, `${a.id} should exceed the level below`);
    last = t.calories;
  }
});

test("cutting eats less than building, but gets more protein per kg", () => {
  const cut = planTargets({ ...ATHLETE, goal: "cut" });
  const build = planTargets({ ...ATHLETE, goal: "build" });
  assert.ok(cut.calories < build.calories);
  assert.ok(cut.protein > build.protein, "protein is protective in a deficit");
});

test("macros roughly reconcile with the calorie target", () => {
  const t = planTargets(ATHLETE);
  const fromMacros = t.protein * 4 + t.carbs * 4 + t.fats * 9;
  assert.ok(Math.abs(fromMacros - t.calories) <= 25, `macros ${fromMacros} vs ${t.calories}`);
});

test("a week lands close to the calorie target and varies the menu", () => {
  const t = planTargets(ATHLETE);
  const week = buildWeek(t);
  assert.equal(week.length, 7);
  for (const day of week) {
    const off = Math.abs(day.macros.kcal - t.calories) / t.calories;
    assert.ok(off < 0.25, `${day.day} was ${Math.round(off * 100)}% off target`);
  }
  const breakfasts = new Set(week.map((d) => d.meals[0].meal.id));
  assert.ok(breakfasts.size > 1, "the same breakfast every day is not a plan");
});

test("every meal references real foods", () => {
  for (const m of MEALS) {
    assert.ok(m.items.length > 0, m.id);
    for (const it of m.items) {
      assert.ok(FOOD_BY_ID[it.foodId], `${m.id} references missing food "${it.foodId}"`);
    }
    assert.ok(mealMacros(m).kcal > 100, `${m.id} has implausible macros`);
  }
});

test("shopping list buys whole packs and totals them", () => {
  const week = buildWeek(planTargets(ATHLETE));
  const list = shoppingList(week);
  assert.ok(list.lines.length > 5);
  for (const l of list.lines) {
    assert.ok(Number.isInteger(l.packs) && l.packs >= 1, `${l.food.id} packs ${l.packs}`);
    // You can't buy 1.4 bags of rice — packs must cover what the plan needs.
    assert.ok(l.packs * l.food.packSize >= l.needed, `${l.food.id} under-buys`);
    assert.ok(Math.abs(l.cost - l.packs * l.food.packPrice) < 0.011);
  }
  const summed = list.byAisle.reduce((s, g) => s + g.cost, 0);
  assert.ok(Math.abs(summed - list.total) < 0.05, "aisle costs should sum to the total");
  assert.ok(list.total > 10 && list.total < 300, `implausible weekly total £${list.total}`);
});

test("exported text is honest that prices are estimates", () => {
  const txt = shoppingListText(shoppingList(buildWeek(planTargets(ATHLETE))));
  assert.match(txt, /not live pricing/i);
  assert.match(txt, /Estimated total/);
});

// --- Favourite foods ---------------------------------------------------------

test("naming a favourite food actually does something", () => {
  // "my favourite food is egg" used to be a no-op — the notes box only ever
  // understood exclusions, so a stated preference was silently ignored.
  assert.deepEqual(favouriteFoodIds("my favourite food is egg"), ["eggs"]);
  assert.deepEqual(favouriteFoodIds("I love chicken"), ["chicken_breast"]);
  assert.deepEqual(favouriteFoodIds("please include rice"), ["rice"]);
});

test("a favourite is not read as a dislike, and vice versa", () => {
  assert.deepEqual(dislikedFoodIds("my favourite food is egg"), []);
  assert.deepEqual(favouriteFoodIds("I hate eggs"), []);
});

test("an exclusion beats a preference when they conflict", () => {
  // Being served something you said to avoid is worse than missing a treat,
  // and it might be an allergy.
  assert.deepEqual(favouriteFoodIds("I love eggs but no eggs this week"), []);
});

test("plain text with no opinion in it changes nothing", () => {
  assert.deepEqual(favouriteFoodIds("training four times a week"), []);
  assert.deepEqual(favouriteFoodIds(""), []);
});

test("a favourite food shows up more often in the week", () => {
  const t = planTargets({ sex: "male", goal: "maintain", activity: "moderate", age: 22, heightCm: 180, weightKg: 78 });
  const eggMeals = (favourites: string[]) =>
    buildWeek(t, 1, { ...DEFAULT_PREFS, favourites }, EMPTY_SCHEDULE)
      .flatMap((d) => d.meals)
      .filter((m) => m.meal.items.some((i) => i.foodId === "eggs")).length;
  assert.ok(eggMeals(["eggs"]) > eggMeals([]), "asking for eggs should get you more eggs");
});

test("a favourite is a nudge, not a takeover", () => {
  // "I like eggs" must not mean eggs at every single meal.
  const t = planTargets({ sex: "male", goal: "maintain", activity: "moderate", age: 22, heightCm: 180, weightKg: 78 });
  const week = buildWeek(t, 1, { ...DEFAULT_PREFS, favourites: ["eggs"] }, EMPTY_SCHEDULE);
  const meals = week.flatMap((d) => d.meals);
  const withEgg = meals.filter((m) => m.meal.items.some((i) => i.foodId === "eggs")).length;
  assert.ok(withEgg < meals.length, "not every meal should contain the favourite");
});
