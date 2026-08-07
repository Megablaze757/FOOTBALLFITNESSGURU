import { test } from "node:test";
import assert from "node:assert/strict";
import {
  basalRate, planTargets, buildWeek, shoppingList, shoppingListText,
  mealMacros, MEALS, ACTIVITY_LEVELS, DEFAULT_PREFS,
  dislikedFoodIds, favouriteFoodIds, recipeSteps, recipeNote, swapKey, slotTargetKcal,
  mealAllowed, type BodyStats, type Slot,
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

// --- protein is a target, not an accident -----------------------------------
// Selection scored on marginalCost alone, so the planner was a cheapest-basket
// optimiser wearing a nutrition label: everyone got broadly the same week, and
// protein landed wherever it landed. These pin the fix.

const CUTTER = { sex: "female" as const, age: 22, heightCm: 165, weightKg: 60, activity: "high" as const, goal: "cut" as const };
const BULKER = { sex: "male" as const, age: 28, heightCm: 188, weightKg: 95, activity: "high" as const, goal: "build" as const };

const weekFor = (s: BodyStats) => buildWeek(planTargets(s), 7, DEFAULT_PREFS);
const avgProtein = (wk: ReturnType<typeof buildWeek>) =>
  wk.reduce((a, d) => a + d.macros.protein, 0) / wk.length;
const mealIds = (wk: ReturnType<typeof buildWeek>) =>
  new Set(wk.flatMap((d) => d.meals.map((m) => m.meal.id)));

test("a plan actually reaches the protein target it set", () => {
  for (const s of [CUTTER, BULKER]) {
    const t = planTargets(s);
    const hit = avgProtein(weekFor(s)) / t.protein;
    assert.ok(hit >= 0.9, `only ${Math.round(hit * 100)}% of the ${t.protein}g protein target`);
    // Overshoot is money spent on protein nobody asked for.
    assert.ok(hit <= 1.35, `${Math.round(hit * 100)}% of target — overshooting protein costs money`);
  }
});

test("two very different athletes do not get the same week", () => {
  // The complaint that started this: "the same meals repasted no matter your
  // needs". A cutter and a bulker have different protein densities to hit, so
  // their weeks should visibly differ.
  const a = mealIds(weekFor(CUTTER));
  const b = mealIds(weekFor(BULKER));
  const shared = [...a].filter((x) => b.has(x)).length;
  assert.ok(
    shared <= a.size * 0.8,
    `${shared} of ${a.size} meals identical between a cutting 60kg runner and a bulking 95kg lifter`
  );
});

test("the library is big enough to fill a week without forced repeats", () => {
  // 7 breakfasts a week from a pool of 6 is repetition by arithmetic, not by
  // scoring — no ranking change can fix a pool smaller than the slot count.
  for (const slot of ["Breakfast", "Lunch", "Dinner", "Snack"] as const) {
    const n = MEALS.filter((m) => m.slot === slot).length;
    assert.ok(n >= 7, `only ${n} ${slot} meals — a week needs 7, so some must repeat`);
  }
});

test("calories are still hit while chasing protein", () => {
  // Protein must not be bought at the cost of the thing portions are scaled for.
  for (const s of [CUTTER, BULKER]) {
    const t = planTargets(s);
    const wk = weekFor(s);
    const kcal = wk.reduce((a, d) => a + d.macros.kcal, 0) / wk.length;
    const hit = kcal / t.calories;
    assert.ok(hit >= 0.85 && hit <= 1.15, `calories at ${Math.round(hit * 100)}% of target`);
  }
});

// --- body size actually changes what you're served ---------------------------
//
// These three cover an audit sweep of body type x goal x diet pattern that
// found the planner failing two groups outright. Both failures were invisible
// on screen, which is what made them worth pinning down in tests.

test("a big athlete is served bigger meals, not the same ones scaled up", () => {
  // Selection scored on cost, protein and repetition — never on how many
  // calories a meal actually carries. So a 105kg forward on 3,700 kcal and a
  // 52kg athlete on 1,740 got identical dishes and were told apart only by a
  // portion multiplier, which caps at 1.6x.
  const big = { sex: "male" as const, age: 24, heightCm: 195, weightKg: 105, activity: "high" as const, goal: "maintain" as const };
  const small = { sex: "female" as const, age: 17, heightCm: 158, weightKg: 52, activity: "light" as const, goal: "maintain" as const };

  const baseKcal = (s: BodyStats) => {
    const wk = buildWeek(planTargets(s), 7, DEFAULT_PREFS, EMPTY_SCHEDULE);
    const all = wk.flatMap((d) => d.meals.map((m) => mealMacros(m.meal).kcal));
    return all.reduce((a, b) => a + b, 0) / all.length;
  };

  assert.ok(
    baseKcal(big) > baseKcal(small) * 1.15,
    `big athlete's meals should be inherently larger — got ${Math.round(baseKcal(big))} vs ${Math.round(baseKcal(small))} kcal`
  );
});

test("every meal is portioned to its own slot, not one figure for the day", () => {
  // A single day-wide multiplier dragged snacks towards a main meal's size,
  // because their "fair share" was calories/mealCount regardless of slot.
  const wk = buildWeek(planTargets(BULKER), 7, { ...DEFAULT_PREFS, mealsPerDay: 4 }, EMPTY_SCHEDULE);
  const day = wk[0];
  const snack = day.meals.find((m) => m.meal.slot === "Snack");
  const dinner = day.meals.find((m) => m.meal.slot === "Dinner");
  assert.ok(snack && dinner, "expected a snack and a dinner");
  assert.ok(
    snack!.macros.kcal < dinner!.macros.kcal,
    `a snack should be smaller than dinner — got ${Math.round(snack!.macros.kcal)} vs ${Math.round(dinner!.macros.kcal)}`
  );
});

test("plant-based plans still deliver most of the protein target", () => {
  // Vegan weeks were landing at 58-64% of the protein target. Cutting on 60%
  // of your protein is how you lose muscle rather than fat, and nothing said
  // so. The pool gained tofu, quinoa and pea-protein meals and protein was
  // weighted harder in selection.
  //
  // 70%, not 100%: hitting an athlete's protein target on a plant-based cut is
  // genuinely hard, and the day card already warns below 85%. This asserts the
  // planner tries, not that the diet is easy.
  for (const goal of ["cut", "maintain", "build"] as const) {
    for (const s of [
      { sex: "male" as const, age: 22, heightCm: 180, weightKg: 78, activity: "high" as const, goal },
      { sex: "female" as const, age: 20, heightCm: 166, weightKg: 62, activity: "moderate" as const, goal },
    ]) {
      const t = planTargets(s);
      const wk = buildWeek(t, 7, { ...DEFAULT_PREFS, pattern: "vegan" }, EMPTY_SCHEDULE);
      const hit = avgProtein(wk) / t.protein;
      assert.ok(hit >= 0.7, `vegan ${s.sex}/${goal} protein at ${Math.round(hit * 100)}% of target`);
    }
  }
});

/**
 * THE PLAN MUST ACTUALLY FEED THE ATHLETE.
 *
 * This is the regression guard for the complaint "meal plans not meeting
 * goals". A measured sweep of 90 combinations — five body sizes, three goals,
 * three diet patterns, four and five meals a day — found 31 of them missing:
 * a 115kg athlete on a build ate 75% of his target because 23 of his 28 weekly
 * meals were pinned at the portion-scaling ceiling, and every vegetarian or
 * vegan cut fell 14-23% short on protein.
 *
 * Averages hid all of it, so this asserts on the WORST case, not the mean.
 */
test("every body size, goal and diet gets fed", () => {
  const bodies: BodyStats[] = [
    { weightKg: 55, heightCm: 162, age: 22, sex: "female", activity: "moderate", goal: "maintain" },
    { weightKg: 65, heightCm: 168, age: 25, sex: "female", activity: "high", goal: "maintain" },
    { weightKg: 78, heightCm: 180, age: 24, sex: "male", activity: "high", goal: "maintain" },
    { weightKg: 95, heightCm: 188, age: 27, sex: "male", activity: "high", goal: "maintain" },
    { weightKg: 115, heightCm: 196, age: 26, sex: "male", activity: "athlete", goal: "maintain" },
  ];
  const failures: string[] = [];

  for (const body of bodies) {
    for (const goal of ["cut", "maintain", "build"] as const) {
      for (const pattern of ["omnivore", "vegetarian", "vegan"] as const) {
        for (const mealsPerDay of [4, 5] as const) {
          const targets = planTargets({ ...body, goal });
          const week = buildWeek(targets, 0, { ...DEFAULT_PREFS, pattern, mealsPerDay });
          const mean = (f: (d: (typeof week)[number]) => number) =>
            week.reduce((s, d) => s + f(d), 0) / week.length;

          const kcalPct = (mean((d) => d.macros.kcal) / targets.calories) * 100;
          const proteinPct = (mean((d) => d.macros.protein) / targets.protein) * 100;
          const where = `${body.weightKg}kg ${body.sex}/${goal}/${pattern}/${mealsPerDay}`;

          // Calories: a cut that overshoots is as broken as a bulk that
          // undershoots, so this is bounded on both sides.
          if (kcalPct < 92 || kcalPct > 108) failures.push(`${where}: ${kcalPct.toFixed(0)}% of calories`);
          // Protein: only a floor. Going over costs nothing and is not a
          // problem worth solving.
          if (proteinPct < 90) failures.push(`${where}: ${proteinPct.toFixed(0)}% of protein`);
        }
      }
    }
  }

  assert.deepEqual(failures, [], `plans missing their targets:\n  ${failures.join("\n  ")}`);
});

/**
 * Portion scaling is a last resort, not the mechanism.
 *
 * A plan can hit its calories while every meal is stretched to the ceiling,
 * which means the picker chose badly and the athlete gets a plate of the wrong
 * size. This asserts the SELECTION is doing the work.
 */
test("a big athlete is offered big meals, not small ones stretched", () => {
  const targets = planTargets({
    weightKg: 115, heightCm: 196, age: 26, sex: "male", activity: "athlete", goal: "build",
  });
  const week = buildWeek(targets, 0, { ...DEFAULT_PREFS, mealsPerDay: 4 });
  const all = week.flatMap((d) => d.meals);
  const atCeiling = all.filter((m) => m.scale >= 1.6).length;
  // 23/28 before the size term was fixed, 11/28 after. The threshold is the
  // measured reality plus headroom, NOT an aspiration — a test tuned to a
  // number the code has never hit is a test that gets deleted.
  //
  // 11/28 is acceptable rather than ideal: this athlete eats 4,790 kcal a day,
  // his plan now lands at 94%+ of that, and a 1.6x portion of a main meal is a
  // real plate for someone that size. The remaining ceiling hits cost accuracy
  // nothing — closing them further needs bigger base recipes in the pool, not
  // more scoring pressure, which only starts trading protein away.
  assert.ok(
    atCeiling / all.length < 0.5,
    `${atCeiling}/${all.length} meals pinned at the scaling ceiling — the picker is choosing meals that are too small`
  );
});

test("no two meals share an id", () => {
  const ids = MEALS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length,
    "duplicate meal id — which recipe you get would depend on array order");
});

test("every meal produces at least one well-formed step", () => {
  for (const m of MEALS) {
    const steps = recipeSteps(m);
    assert.ok(steps.length >= 1, `${m.id} has no steps`);
    for (const s of steps) {
      assert.match(s, /^[A-Z]/, `${m.id}: step doesn't start with a capital — "${s.slice(0, 40)}"`);
      assert.ok(s.length > 3, `${m.id}: step is a fragment — "${s}"`);
    }
  }
});

/**
 * Commentary must not be numbered as an instruction.
 *
 * "Around 1,000 kcal without feeling like a challenge" was rendering as step 2
 * of a two-step recipe, telling the athlete to go and do it. That is the small
 * wrongness that makes a feature feel machine-generated.
 */
test("trailing commentary becomes a note, not a step", () => {
  // A synthetic meal, deliberately. Every meal in the book now has hand-written
  // steps, so pinning this to a real one would test nothing — and the fallback
  // still has to work for any recipe added without them.
  const m = {
    id: "t", name: "t", slot: "Breakfast" as const, items: [],
    method: "Simmer the oats in the milk and stir the protein through. Around 1,000 kcal without feeling like a challenge.",
  };
  assert.equal(recipeSteps(m).length, 1);
  assert.match(recipeNote(m) ?? "", /1,000 kcal/);
});

test("a hand-written recipe is used verbatim, never re-split", () => {
  const written = MEALS.find((m) => m.steps?.length);
  assert.ok(written, "no hand-written recipes found");
  assert.deepEqual(recipeSteps(written!), written!.steps);
});

/** A method must never be reduced to nothing, however odd its prose. */
test("a method with no recognised cooking verb still yields a step", () => {
  const odd = { id: "x", name: "x", slot: "Snack" as const, items: [], method: "Nothing here looks like an instruction. Honestly it doesn't." };
  assert.ok(recipeSteps(odd).length >= 1);
});

/**
 * Unit mismatches are silent and enormous.
 *
 * `tortilla_wrap` is priced and counted PER WRAP, not per 100g. Three new
 * recipes gave it a gram-style quantity of 120, which the engine read as 120
 * wraps — those meals came out at 35,000 kcal, and the planner dutifully served
 * them, producing days at 606% of target. Nothing else in the suite noticed,
 * because every downstream number was internally consistent with a 35,000 kcal
 * breakfast.
 *
 * Two guards: nothing counted in units may have a bulk quantity, and no single
 * meal may be absurd. The second catches the general case if a new "each" food
 * is ever added without updating the first.
 */
test("per-unit foods are given counts, not gram weights", () => {
  for (const m of MEALS) {
    for (const it of m.items) {
      const f = FOOD_BY_ID[it.foodId];
      if (f?.unit !== "each") continue;
      assert.ok(
        it.qty <= 6,
        `${m.id} asks for ${it.qty} x ${it.foodId} — that food is counted per unit, so this is a gram weight in a count field`
      );
    }
  }
});

test("no meal has implausible calories", () => {
  for (const m of MEALS) {
    const kcal = mealMacros(m).kcal;
    assert.ok(kcal > 100, `${m.id} is only ${Math.round(kcal)} kcal`);
    assert.ok(kcal < 2200, `${m.id} is ${Math.round(kcal)} kcal — check the ingredient units`);
  }
});

/**
 * A WEEK HAS TO LOOK LIKE A WEEK.
 *
 * The complaint was "same old chicken and rice", and adding sixty recipes did
 * not fix it on its own — with a flat repeat penalty the planner still picked
 * its favourite three times running. An average athlete's week contained twelve
 * distinct meals across twenty-eight slots, with Monday, Tuesday and Wednesday
 * completely identical.
 *
 * This asserts the outcome a person actually notices, which no macro test can:
 * how many different things they eat.
 */
test("a week is varied, not the same three days repeated", () => {
  const week = buildWeek(planTargets(ATHLETE), 0, DEFAULT_PREFS);
  const ids = week.flatMap((d) => d.meals.map((m) => m.meal.id));
  const distinct = new Set(ids).size;
  assert.ok(distinct >= 16, `only ${distinct} distinct meals across ${ids.length} slots — that is a repetitive week`);

  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  const worst = Math.max(...counts.values());
  assert.ok(worst <= 2, `one meal appears ${worst} times in a week`);

  // And no two consecutive days identical, which is what made it obvious.
  for (let i = 1; i < week.length; i++) {
    const a = week[i - 1].meals.map((m) => m.meal.id).join("|");
    const b = week[i].meals.map((m) => m.meal.id).join("|");
    assert.notEqual(a, b, `${week[i - 1].day} and ${week[i].day} are the same day twice`);
  }
});

test("every recipe is written out properly", () => {
  for (const m of MEALS) {
    assert.ok(m.steps?.length, `${m.id} has no hand-written steps`);
    assert.ok(m.minutes != null && m.minutes > 0, `${m.id} has no cooking time`);
    assert.ok((m.steps?.length ?? 0) >= 1, `${m.id} has an empty method`);
  }
});

// --- Hand-picked meals -------------------------------------------------------
// The only control over the plan used to be "regenerate", which rerolls all 28
// meals. Someone who liked their week except Thursday had to gamble the lot.

test("a swap replaces exactly the slot asked for", () => {
  const targets = planTargets(ATHLETE);
  const before = buildWeek(targets, 3, DEFAULT_PREFS);
  const wed = before[2].meals.find((m) => m.meal.slot === "Dinner")!;
  const other = MEALS.find((m) => m.slot === "Dinner" && m.id !== wed.meal.id)!;

  const after = buildWeek(targets, 3, DEFAULT_PREFS, EMPTY_SCHEDULE, {
    [swapKey(2, "Dinner", 0)]: other.id,
  });

  assert.equal(after[2].meals.find((m) => m.meal.slot === "Dinner")!.meal.id, other.id);
  // Other days are untouched — a swap is not a regenerate.
  assert.equal(
    after[0].meals.map((m) => m.meal.id).join(),
    before[0].meals.map((m) => m.meal.id).join()
  );
});

/**
 * A swap the costing ignored would produce a shopping list that does not match
 * the plan — which is worse than not offering swaps at all, because the athlete
 * shops from it.
 */
test("a swapped meal reaches the shopping list", () => {
  const targets = planTargets(ATHLETE);
  const salmon = MEALS.find((m) => m.slot === "Dinner" && m.items.some((i) => i.foodId === "salmon_fillet"));
  assert.ok(salmon, "fixture: no salmon dinner in the pool");

  const week = buildWeek(targets, 3, DEFAULT_PREFS, EMPTY_SCHEDULE, {
    [swapKey(0, "Dinner", 0)]: salmon!.id,
    [swapKey(1, "Dinner", 0)]: salmon!.id,
  });
  const list = shoppingList(week);
  assert.ok(
    list.lines.some((l) => l.food.id === "salmon_fillet"),
    "the swapped meal's ingredients are missing from the list"
  );
});

test("the two snack slots swap independently", () => {
  const targets = planTargets(ATHLETE);
  const prefs = { ...DEFAULT_PREFS, mealsPerDay: 5 as const };
  const snacks = MEALS.filter((m) => m.slot === "Snack");
  const week = buildWeek(targets, 1, prefs, EMPTY_SCHEDULE, {
    [swapKey(0, "Snack", 1)]: snacks[snacks.length - 1].id,
  });
  const todaySnacks = week[0].meals.filter((m) => m.meal.slot === "Snack");
  assert.equal(todaySnacks.length, 2);
  assert.equal(todaySnacks[1].meal.id, snacks[snacks.length - 1].id);
  assert.notEqual(todaySnacks[0].meal.id, todaySnacks[1].meal.id, "both snacks became the same meal");
});

/**
 * Someone picks a chicken dish, then switches to vegan. The swap must not
 * override the diet — being served meat you have excluded is a trust failure,
 * and it might be an allergy.
 */
test("a swap that no longer fits the diet is ignored, not served", () => {
  const targets = planTargets(ATHLETE);
  const chicken = MEALS.find((m) => m.slot === "Dinner" && m.items.some((i) => i.foodId === "chicken_breast"))!;
  const vegan = { ...DEFAULT_PREFS, pattern: "vegan" as const };
  const week = buildWeek(targets, 1, vegan, EMPTY_SCHEDULE, { [swapKey(0, "Dinner", 0)]: chicken.id });
  const served = week[0].meals.find((m) => m.meal.slot === "Dinner")!;
  assert.notEqual(served.meal.id, chicken.id);
  assert.ok(mealAllowed(served.meal, vegan), "served a meal that breaks the diet");
});

test("an unknown meal id falls back to the planner rather than leaving a hole", () => {
  const targets = planTargets(ATHLETE);
  const week = buildWeek(targets, 1, DEFAULT_PREFS, EMPTY_SCHEDULE, {
    [swapKey(0, "Dinner", 0)]: "no_such_meal",
  });
  assert.ok(week[0].meals.some((m) => m.meal.slot === "Dinner"), "the slot was left empty");
});

test("no swaps builds the identical week", () => {
  const targets = planTargets(ATHLETE);
  const a = buildWeek(targets, 5, DEFAULT_PREFS);
  const b = buildWeek(targets, 5, DEFAULT_PREFS, EMPTY_SCHEDULE, {});
  assert.deepEqual(a.map((d) => d.meals.map((m) => m.meal.id)), b.map((d) => d.meals.map((m) => m.meal.id)));
});

test("slotTargetKcal splits the day the same way the planner does", () => {
  const targets = planTargets(ATHLETE);
  for (const mealsPerDay of [3, 4, 5] as const) {
    const prefs = { ...DEFAULT_PREFS, mealsPerDay };
    const slots: Slot[] = mealsPerDay >= 4
      ? ["Breakfast", "Lunch", "Dinner", "Snack"]
      : ["Breakfast", "Lunch", "Dinner"];
    const total = slots.reduce((s, sl) => s + slotTargetKcal(targets, prefs, sl) * (sl === "Snack" && mealsPerDay === 5 ? 2 : 1), 0);
    // The shares are normalised, so the slots must account for the whole day.
    assert.ok(Math.abs(total - targets.calories) < 2, `${mealsPerDay} meals summed to ${Math.round(total)} of ${targets.calories}`);
  }
});
