// =============================================================================
// Monotony. What the planner was blind to, in two specific ways.
//
// The complaint was "the same day three times in a row, and tuna every day",
// and both halves were real. Measured on the live scoring, a budget athlete on
// four meals a day got THIS:
//
//   Monday     Peanut butter French toast | Peanut tofu noodles | Tofu satay
//   Tuesday    Peanut butter French toast | Peanut tofu noodles | Tofu satay
//   Wednesday  Peanut butter French toast | Peanut tofu noodles | Tofu satay
//
// and an omnivore's default week contained tofu on 7 days out of 7, across 16
// of 28 slots, without ever repeating a single recipe.
//
// TWO CAUSES, AND NEITHER IS FIXED BY THE OTHER'S CURE.
//
// 1. The repeat counter knew HOW OFTEN, never WHEN. `repeatCost` is a function
//    of how many times a dish has been served so far in the greedy fill, so
//    Monday-then-Tuesday and Monday-then-Sunday cost exactly the same. Nothing
//    in the score preferred spreading them out, and because the fill is greedy
//    a repeat lands the moment the dish wins again — which is tomorrow. The
//    three-in-a-row above is that, exactly: the cap allows three servings and
//    nothing said they could not be consecutive.
//
// 2. The repeat counter was keyed on the RECIPE. There are 37 tofu meals and 7
//    tuna ones in the book, so a week of nothing but tofu carried a repeat cost
//    of precisely zero — every dish was different. The counter was measuring
//    the thing the athlete does not experience. Nobody eating tuna niçoise,
//    then a tuna melt, then tuna pasta says they had three different dinners.
//
// So this module counts what a person counts: the dish AND the ingredient it is
// built round, and how long ago rather than only how many.
//
// COSTS, NEVER BANS. Same principle the rest of the planner runs on. A vegan
// pool is mostly tofu; if every option carries the same ingredient cost the
// term cancels and the best-fitting meal still wins. That is the property that
// keeps a narrow diet fed, and it is why there is no ingredient cap here to go
// with MAX_REPEATS.
// =============================================================================

import { FOOD_BY_ID } from "./food-db";
import type { Meal } from "./meal-plan";

/**
 * The ingredients an athlete would name if you asked what they ate.
 *
 * PROTEIN DECIDES IT, because in a fitness app the protein is the dish: nobody
 * describes dinner as "rice", they describe it as "the chicken one". Ranking by
 * grams of protein contributed picks tuna out of a tuna pasta bake and lentils
 * out of lentils and rice, which is what a person would say.
 *
 * MORE THAN ONE, because plenty of meals genuinely have two. Turkish eggs is
 * 20g of yoghurt protein against 19.2g of egg — a coin flip that would make the
 * key arbitrary, and would let "eggs every day" hide behind whichever ingredient
 * happened to win by 0.8g. Anything carrying a real share of the protein counts.
 *
 * The floors keep staples out. Bread contributes 9.5g to peanut butter French
 * toast and is not what that meal is, so a share threshold does the filtering
 * rather than a hand-maintained list of "real" proteins that would go stale the
 * moment somebody adds a recipe.
 */
const HEADLINE_SHARE = 0.3; // of the meal's protein
const HEADLINE_GRAMS = 5;   // and at least this much, so trace amounts never count

const headlineCache = new Map<string, string[]>();

export function headlineFoods(meal: Pick<Meal, "id" | "items">): string[] {
  const hit = headlineCache.get(meal.id);
  if (hit) return hit;

  const grams = meal.items.map((it) => {
    const food = FOOD_BY_ID[it.foodId];
    if (!food) return { id: it.foodId, g: 0 };
    // "each" foods price their macros per unit; everything else per 100g.
    const g = food.unit === "each" ? food.protein * it.qty : (food.protein * it.qty) / 100;
    return { id: it.foodId, g: Number.isFinite(g) ? Math.max(0, g) : 0 };
  });
  const total = grams.reduce((s, r) => s + r.g, 0);

  const out = total <= 0 ? [] : grams
    .filter((r) => r.g >= HEADLINE_GRAMS && r.g / total >= HEADLINE_SHARE)
    .sort((a, b) => b.g - a.g)
    .map((r) => r.id);

  headlineCache.set(meal.id, out);
  return out;
}

// --- what has been served so far ---------------------------------------------

/**
 * Servings and last-seen day, for dishes and for ingredients.
 *
 * Deliberately a plain record rather than a class: the planner already holds
 * its state as loose maps in a closure, and this has to be constructed once per
 * `buildWeek` and thrown away with it.
 */
export interface ServedLog {
  /** meal id → how many times this week */
  mealUses: Map<string, number>;
  /** meal id → the last day index it appeared on */
  mealDay: Map<string, number>;
  /** food id → how many slots this week */
  foodUses: Map<string, number>;
  /** food id → the last day index it appeared on */
  foodDay: Map<string, number>;
}

export function newServedLog(): ServedLog {
  return { mealUses: new Map(), mealDay: new Map(), foodUses: new Map(), foodDay: new Map() };
}

/** Written for every pick, including hand-picked swaps — a swap is still eaten. */
export function recordServing(log: ServedLog, meal: Pick<Meal, "id" | "items">, dayIndex: number): void {
  log.mealUses.set(meal.id, (log.mealUses.get(meal.id) ?? 0) + 1);
  log.mealDay.set(meal.id, dayIndex);
  for (const food of headlineFoods(meal)) {
    log.foodUses.set(food, (log.foodUses.get(food) ?? 0) + 1);
    log.foodDay.set(food, dayIndex);
  }
}

// --- the cost ----------------------------------------------------------------

/**
 * How fast "I ate that recently" wears off, in days.
 *
 * Three, and the shape is squared rather than linear, because that matches how
 * the objection actually decays. Yesterday is the whole complaint; the day
 * before is a mild one; four days ago is not a complaint at all — people cook
 * the same dinner twice a week quite happily and would be annoyed by an app
 * that refused to let them.
 *
 *   gap 1 (yesterday)  1.00
 *   gap 2              0.44
 *   gap 3              0.11
 *   gap 4+             0
 */
const RECENT_SPAN = 3;

function recency(gap: number): number {
  if (!Number.isFinite(gap) || gap < 0 || gap > RECENT_SPAN) return 0;
  const remaining = (RECENT_SPAN - gap + 1) / RECENT_SPAN;
  return remaining * remaining;
}

/**
 * Yesterday's dish costs this many times a plain repeat.
 *
 * SWEPT over 90 plans — five body sizes, three goals, three diet patterns, four
 * and five meals a day. Turning the term on at all is what does the work:
 *
 *                       back-to-back    worst protein    shop
 *   without             266             97%              £102.59
 *   with                0               98%              £105.27
 *
 * Protein goes UP rather than down, which is not luck. The dish it was
 * re-picking was the best-fitting one, so being made to reach past it for a day
 * lands on the second-best — and the second-best breakfast for an athlete who
 * needs protein is another protein-dense breakfast.
 *
 * SIX, not two, and the reason is budget mode. Two clears the default weeks and
 * left 36 budget plans still serving a dish two days running, because ticking
 * "cheap staples" weights cost hard enough to outbid a smaller penalty. Since
 * rearranging a week is free — see `monotonyCost` — buying those back costs
 * nothing worth counting:
 *
 *   2   36 budget plans repeating   £108.36
 *   3   14                          £108.70
 *   4    2                          £108.60
 *   6    0                          £108.48
 *
 * Twelve pence, for the complaint that started this. There is no case for
 * charging an athlete more to be told no.
 */
const DISH_RECENCY = 6.0;

/**
 * What it costs to serve this meal on this day, in pounds, given what has
 * already been eaten this week.
 *
 * `weight` is the planner's repeat penalty, already scaled for budget mode.
 * Returns 0 for a dish not yet served, which is the common case.
 *
 * DISHES ONLY. The ingredient half of the complaint is handled by
 * `ingredientFatigue` and deliberately NOT charged here — see that function for
 * the measurement that forced the split.
 */
export function monotonyCost(
  log: ServedLog,
  meal: Pick<Meal, "id" | "items">,
  dayIndex: number,
  weight: number,
  /**
   * SPACING IS FREE, SO IT IS PRICED SEPARATELY.
   *
   * Budget mode scales `weight` down to a third, because eating a dish twice
   * genuinely is cheaper — the second serving's ingredients are already in the
   * trolley. But WHICH DAY the second serving lands on costs nothing at all:
   * tofu satay on Monday and Tuesday and tofu satay on Monday and Thursday
   * produce the byte-identical shopping list.
   *
   * Scaling both together is what let budget mode keep serving the identical
   * three-day block this module was written to kill — and it was charging the
   * athlete nothing for the fix it was declining to make. So recency is handed
   * the unscaled penalty and stays at full strength for everybody.
   */
  recencyWeight: number = weight,
): number {
  // How often, all week. The original term, unchanged: a second helping of
  // something good is fine, a third is the app being lazy.
  const uses = log.mealUses.get(meal.id) ?? 0;
  let cost = Math.pow(uses, 1.8) * weight;

  // How recently — the half `repeatCost` could not see, because it was handed a
  // count and never a date.
  const lastDay = log.mealDay.get(meal.id);
  if (lastDay != null) cost += recency(dayIndex - lastDay) * DISH_RECENCY * recencyWeight;

  return cost;
}

/**
 * How tired the athlete is of this meal's star ingredient — a RANKING number,
 * not pounds, and never added to the score.
 *
 * WHY THIS IS NOT A COST, WHICH IS THE WHOLE POINT.
 *
 * Charging ingredient repetition in the score is the obvious implementation and
 * it was built first, twice. Both versions worked and both broke the plans.
 *
 * FLAT CHARGE. The top ingredient falls from 6.5 days a week to 4.2, worst-case
 * protein falls from 97% of target to 78%, and the shop rises from £102.59 to
 * £120.26. Dropping the weight does not recover it — 0.5 gives 76%, 0.15 gives
 * 79% — so it is the structure and not the tuning. A 115kg vegan on a cut needs
 * 0.09g of protein per calorie and tofu dishes are close to the only things in
 * the book that clear it; taxing them does not find a better dinner, because
 * there isn't one. It buys a worse dinner and charges £18 for it.
 *
 * CHARGE BOUNDED BY THE MEAL'S PROTEIN SURPLUS. Better reasoning, same failure:
 * vegan weeks went to 86%. The bug is the one the contender filter in
 * meal-plan.ts is already commented for — a protein-dense breakfast looks
 * over-provisioned in isolation, but that surplus is exactly what covers a
 * thinner lunch, so charging against it spends the same protein twice.
 *
 * So variety is spent where it is free, exactly as the week-on-week rotation
 * already is: the planner picks on merit, and this decides between options that
 * are already just as good for this athlete. A ranking can never cost a gram of
 * protein, because everything it chooses between has cleared the same bar.
 *
 * THE MAX, NOT THE SUM. A meal is as tiring as its most-repeated star
 * ingredient. Summing would charge Turkish eggs twice for having two proteins,
 * biasing the planner toward plainer dishes — the opposite of what this is for.
 */
export function ingredientFatigue(
  log: ServedLog,
  meal: Pick<Meal, "id" | "items">,
  dayIndex: number,
): number {
  let worst = 0;
  for (const food of headlineFoods(meal)) {
    const uses = log.foodUses.get(food) ?? 0;
    const lastDay = log.foodDay.get(food);
    // Gentler than the dish exponent (1.8) on purpose: an ingredient SHOULD
    // turn up more often than a recipe. The same tofu in four different meals
    // is not the same failure as the same dish four times.
    const here = Math.pow(uses, 1.5)
      // "Tuna every day" is this term. Yesterday's ingredient weighs about as
      // much as having had it twice already.
      + (lastDay != null ? recency(dayIndex - lastDay) * 2 : 0);
    if (here > worst) worst = here;
  }
  return worst;
}

// --- reporting on a finished week --------------------------------------------

/**
 * The two numbers the complaint was about, measured on a built week.
 *
 * Exported because the regression tests assert on them and because a number
 * nobody can reproduce is not evidence. `sameDishRuns` counts consecutive-day
 * repeats of one dish; `topFoodDays` is the most days any single headline
 * ingredient appears on.
 */
export function monotonyReport(days: { meals: { meal: Pick<Meal, "id" | "items" | "name"> }[] }[]): {
  backToBack: number;
  threeInARow: number;
  topFoodDays: number;
  /**
   * How many of the week's SLOTS the commonest ingredient owns.
   *
   * The number that matches the complaint. "Tuna every day" counted in days
   * cannot tell a week with one tuna lunch a day from a week that is tuna for
   * breakfast, lunch and dinner — 7/7 either way — and those are not remotely
   * the same week. Measured before this module existed, a 58kg woman cutting
   * got tofu on 7 days across SIXTEEN of her 28 slots.
   */
  topFoodSlots: number;
  topFood: string;
  slots: number;
} {
  const ids = days.map((d) => new Set(d.meals.map((m) => m.meal.id)));
  const slots = days.reduce((n, d) => n + d.meals.length, 0);

  let backToBack = 0;
  let threeInARow = 0;
  for (let i = 1; i < ids.length; i++) {
    for (const id of ids[i]) {
      if (!ids[i - 1].has(id)) continue;
      backToBack++;
      if (i >= 2 && ids[i - 2].has(id)) threeInARow++;
    }
  }

  const foodDays = new Map<string, number>();
  for (const day of days) {
    const seen = new Set<string>();
    for (const m of day.meals) {
      for (const f of headlineFoods(m.meal as Pick<Meal, "id" | "items">)) {
        if (seen.has(f)) continue;
        seen.add(f);
        foodDays.set(f, (foodDays.get(f) ?? 0) + 1);
      }
    }
  }
  const foodSlots = new Map<string, number>();
  for (const day of days) {
    for (const m of day.meals) {
      for (const f of headlineFoods(m.meal as Pick<Meal, "id" | "items">)) {
        foodSlots.set(f, (foodSlots.get(f) ?? 0) + 1);
      }
    }
  }

  let topFood = "";
  let topFoodDays = 0;
  for (const [food, n] of foodDays) if (n > topFoodDays) { topFoodDays = n; topFood = food; }

  let topFoodSlots = 0;
  for (const n of foodSlots.values()) if (n > topFoodSlots) topFoodSlots = n;

  return { backToBack, threeInARow, topFoodDays, topFoodSlots, topFood, slots };
}
