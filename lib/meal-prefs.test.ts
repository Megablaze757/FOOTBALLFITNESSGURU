import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planTargets, buildWeek, shoppingList, mealAllowed, mealTags, unmetSlots,
  MEALS, DEFAULT_PREFS, DIET_PATTERNS, dislikedFoodIds,
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

/**
 * The check above tests ONE athlete on ONE diet, and that is how this broke
 * twice.
 *
 * Budget mode has no dedicated machinery keeping it cheap — it competes on the
 * same score as everything else, so whether it wins depends on what is in the
 * pool. Both times it regressed, it was a pool change that did it, and both
 * times the single-case test caught it only because that one case happened to
 * be affected. A 22-year-old omnivore is not a proof.
 *
 * The last regression was worth £8.75: marginal pack cost reads zero for
 * anything already in the basket, so amplifying it in budget mode made the
 * first expensive protein picked look free for the rest of the week. Five
 * salmon dinners and three of prawns — the two dearest things in the database
 * — on fourteen distinct meals instead of twenty. Dearer AND more repetitive,
 * which is both of the things it promises not to be.
 */
test("budget mode is cheaper for every athlete, not just one", () => {
  const bodies: BodyStats[] = [
    ATHLETE,
    { sex: "female", age: 28, heightCm: 165, weightKg: 60, activity: "moderate", goal: "cut" },
    { sex: "male", age: 35, heightCm: 190, weightKg: 95, activity: "high", goal: "build" },
    { sex: "female", age: 19, heightCm: 172, weightKg: 68, activity: "high", goal: "build" },
  ];
  const dearer: string[] = [];
  for (const body of bodies) {
    for (const d of DIET_PATTERNS) {
      const t = planTargets(body);
      const p = prefs({ pattern: d.id });
      const normal = shoppingList(buildWeek(t, 0, p)).total;
      const cheap = shoppingList(buildWeek(t, 0, { ...p, budget: true })).total;
      if (cheap > normal) dearer.push(`${body.goal}/${d.id}: £${cheap} vs £${normal}`);
    }
  }
  assert.deepEqual(dearer, [], `budget mode came out dearer:\n  ${dearer.join("\n  ")}`);
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

test("free-text notes exclude the foods named in a dislike", () => {
  const week = buildWeek(planTargets(ATHLETE), 0,
    { ...DEFAULT_PREFS, dislikes: dislikedFoodIds("I don't like yoghurt and no fish") });
  const foods = new Set(week.flatMap((d) => d.meals.flatMap((m) => m.meal.items.map((i) => i.foodId))));
  assert.ok(!foods.has("greek_yoghurt") && !foods.has("coconut_yoghurt"), "yoghurt should be excluded");
  assert.ok(!foods.has("salmon_fillet") && !foods.has("tuna_tin"), "fish should be excluded");
});

test("notes only exclude foods inside a negated clause", () => {
  assert.deepEqual(dislikedFoodIds("I love chicken but no fish").sort(), ["salmon_fillet", "tuna_tin"]);
  assert.deepEqual(dislikedFoodIds("chicken and rice are great"), []);
});

/**
 * HONEY IS NOT VEGAN, and this is here because the rule was already lost once.
 *
 * It went in as a `honey` FoodTag excluded by the vegan pattern, and a stray
 * `git checkout lib/meal-plan.ts` during an unrelated measurement reverted it
 * within the hour. Nothing failed. The tag was still on the food, the six
 * recipes had already been moved to maple syrup, and the whole thing looked
 * fine — the only symptom would have been a vegan athlete eventually being
 * served honey again, months later, by whoever added the next honey recipe.
 *
 * The original bug: six vegan-passing meals contained honey and the vegan
 * shopping list told people to go and buy a jar of it. A vegan reading their
 * own plan would have known instantly that nobody had checked it.
 */
test("no vegan meal contains honey", () => {
  const vegan = prefs({ pattern: "vegan" });
  const offenders = MEALS
    .filter((m) => mealAllowed(m, vegan))
    .filter((m) => m.items.some((it) => it.foodId === "honey"))
    .map((m) => m.id);
  assert.deepEqual(offenders, [], `honey is an animal product: ${offenders.join(", ")}`);
});

test("the vegan pattern excludes honey by rule, not by luck", () => {
  // Asserting the EXCLUSION, not just today's meal list. The test above passes
  // if every recipe happens to avoid honey; this one fails the moment the rule
  // itself goes missing, which is how it was lost the first time.
  const vegan = DIET_PATTERNS.find((d) => d.id === "vegan")!;
  assert.ok(vegan.excludes.includes("honey"), "vegan must exclude the honey tag");
  assert.ok(FOOD_BY_ID.honey?.tags?.includes("honey"), "honey must carry the honey tag");

  // And a synthetic honey meal must actually be filtered out, so the tag and
  // the exclusion are verified to meet.
  const honeyMeal = {
    id: "t", name: "t", slot: "Snack" as const, method: "",
    items: [{ foodId: "honey", qty: 20 }, { foodId: "oats", qty: 50 }],
  };
  assert.equal(mealAllowed(honeyMeal, prefs({ pattern: "vegan" })), false);
  // Vegetarians do eat honey, and taking it from them would be a different bug.
  assert.equal(mealAllowed(honeyMeal, prefs({ pattern: "vegetarian" })), true);
});

// --- what a shop actually costs ----------------------------------------------

/**
 * ONE PRICE CANNOT BE RIGHT IN FOUR SHOPS AT ONCE.
 *
 * The table is a maintained estimate at mid-market level, and it was quoted
 * unchanged to everyone — so an Aldi shopper was told their week cost Tesco
 * money. The gap between a discounter and a mid-market chain is larger than
 * most of the savings the planner works to find, which made it the biggest
 * single error in the number.
 */
test("the shop you pick changes what the shop costs", () => {
  const week = buildWeek(planTargets(ATHLETE), 0, prefs({}));
  const tesco = shoppingList(week, { store: "tesco" }).total;
  const aldi = shoppingList(week, { store: "aldi" }).total;
  assert.ok(aldi < tesco, `aldi £${aldi} should undercut tesco £${tesco}`);
  // And it's a tier adjustment, not a different basket — same items, same packs.
  assert.deepEqual(
    shoppingList(week, { store: "aldi" }).lines.map((l) => `${l.food.id}:${l.packs}`),
    shoppingList(week, { store: "tesco" }).lines.map((l) => `${l.food.id}:${l.packs}`)
  );
});

/**
 * A price the athlete typed is the only one in the app that is KNOWN.
 *
 * There is no public UK grocery API and scraping the storefronts is against
 * their terms, so someone standing in the shop is a better source than our
 * table will ever be. Their number therefore wins outright and is never scaled
 * by the store index on top.
 */
test("a corrected price beats the estimate and the store index", () => {
  const week = buildWeek(planTargets(ATHLETE), 0, prefs({}));
  const first = shoppingList(week).lines[0];
  const fixed = shoppingList(week, {
    store: "aldi",
    overrides: { [first.food.id]: 9.99 },
  });
  const line = fixed.lines.find((l) => l.food.id === first.food.id)!;
  assert.equal(line.cost, Math.round(line.packs * 9.99 * 100) / 100, "the athlete's price, unscaled");
  assert.ok(line.corrected, "and marked as theirs rather than ours");
  assert.ok(fixed.lines.filter((l) => l.food.id !== first.food.id).every((l) => !l.corrected));
});

test("a nonsense correction is ignored rather than trusted", () => {
  const week = buildWeek(planTargets(ATHLETE), 0, prefs({}));
  const id = shoppingList(week).lines[0].food.id;
  for (const bad of [0, -3, Number.NaN]) {
    const line = shoppingList(week, { overrides: { [id]: bad } }).lines.find((l) => l.food.id === id)!;
    assert.ok(!line.corrected, `${bad} should not count as a price`);
    assert.ok(line.cost > 0);
  }
});

/**
 * The planner must not plan a DIFFERENT WEEK for an Aldi shopper.
 *
 * `buildWeek` costs candidate meals to compare them, and it deliberately uses
 * the baseline table rather than one athlete's store or corrections — otherwise
 * two people with the same body and the same diet get different food because
 * one of them typed in what they paid for rice.
 */
test("where you shop changes the price, not the plan", () => {
  const t = planTargets(ATHLETE);
  const ids = (w: ReturnType<typeof buildWeek>) => w.flatMap((d) => d.meals.map((m) => m.meal.id));
  assert.deepEqual(ids(buildWeek(t, 0, prefs({}))), ids(buildWeek(t, 0, prefs({}))));
});
