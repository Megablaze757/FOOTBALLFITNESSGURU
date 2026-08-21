import { mealMacros, mealTags, type Meal } from "./meal-plan";
import { isEasyCook } from "./recipe-difficulty";

/**
 * The filter row shared by the recipe library and the swap sheet.
 *
 * WHY IT IS SHARED. These are the two places you go looking for a meal, and
 * they were answering the same question differently: the library had slot,
 * time, starred and diet chips, while the swap sheet — the one you use with a
 * plan already in front of you — had a search box and nothing else. Scrolling
 * forty options to find something quick is not a choice, it is homework.
 *
 * Two lists of filters would drift. "Quick" meaning 15 minutes in one place and
 * 20 in the other is the kind of difference nobody notices and everybody feels,
 * so the definitions live here once and both screens import them.
 *
 * WHAT EARNED A CHIP. Only the questions people actually arrive with:
 *
 *   - "I have no time tonight"          -> Under 15 min
 *   - "I have no energy tonight"        -> Easy to cook
 *   - "I need to hit my protein"        -> High protein
 *   - "the ones I like"                 -> Starred
 *   - "no meat" / "no animal products"  -> Veggie, Vegan
 *
 * Deliberately NOT here: calorie sliders, macro ranges, cuisine tags. The
 * planner already sizes portions to the slot, so a calorie filter would be
 * asking the athlete to solve a problem the app has solved — and every extra
 * chip costs a row of screen on a phone that is mostly meant to show meals.
 */

export interface MealFilters {
  quick: boolean;
  /**
   * Easy to COOK, which is not the same question as quick.
   *
   * A fifteen-minute stir-fry with nine ingredients and a sauce to reduce
   * passes "under 15 min" and is harder work than a forty-minute tray bake you
   * assemble once. Somebody cooking at nine at night after a session is asking
   * how much of them the recipe needs, and time alone answers a different
   * question. See lib/recipe-difficulty.ts.
   */
  easy: boolean;
  highProtein: boolean;
  starred: boolean;
  veggie: boolean;
  vegan: boolean;
}

export const NO_FILTERS: MealFilters = {
  quick: false, easy: false, highProtein: false, starred: false, veggie: false, vegan: false,
};

/** Hands-on minutes at or under which a meal counts as "quick". */
export const QUICK_MINUTES = 15;

/**
 * Grams of protein at or above which a meal counts as high-protein.
 *
 * A flat 30g rather than a share of the slot, because this is a filter and not
 * the planner: someone tapping it wants "show me the protein-heavy ones", and a
 * threshold that shifted per slot would make the same dish qualify at dinner
 * and not at lunch, which reads as a bug. 30g is roughly a third of a typical
 * athlete's day and is what a portion of meat, fish or a shake delivers.
 */
export const HIGH_PROTEIN_G = 30;

export interface FilterChip {
  id: keyof MealFilters;
  label: string;
  icon: string;
}

export const FILTER_CHIPS: FilterChip[] = [
  { id: "quick", label: `Under ${QUICK_MINUTES} min`, icon: "⏱" },
  { id: "easy", label: "Easy to cook", icon: "🍳" },
  { id: "highProtein", label: `${HIGH_PROTEIN_G}g+ protein`, icon: "💪" },
  { id: "starred", label: "Starred", icon: "★" },
  { id: "veggie", label: "Veggie", icon: "🌱" },
  { id: "vegan", label: "Vegan", icon: "🌿" },
];

/** Does this meal pass every active filter? */
export function passesFilters(
  meal: Meal,
  f: MealFilters,
  starredIds: readonly string[] = [],
): boolean {
  // A meal with no stated time is not assumed quick. Unknown is not fast.
  if (f.quick && (meal.minutes ?? Number.POSITIVE_INFINITY) > QUICK_MINUTES) return false;
  if (f.easy && !isEasyCook(meal)) return false;
  if (f.highProtein && mealMacros(meal).protein < HIGH_PROTEIN_G) return false;
  if (f.starred && !starredIds.includes(meal.id)) return false;

  if (f.veggie || f.vegan) {
    const tags = mealTags(meal);
    // Veggie and vegan use the SAME tag rules the planner enforces, so a chip
    // can never show a meal the plan would refuse to serve.
    if (tags.some((t) => t === "meat" || t === "pork" || t === "fish")) return false;
    if (f.vegan && tags.some((t) => t === "dairy" || t === "egg" || t === "honey")) return false;
  }
  return true;
}

/** How many filters are on — for a "clear" affordance that only shows when needed. */
export function activeFilterCount(f: MealFilters): number {
  return FILTER_CHIPS.reduce((n, c) => n + (f[c.id] ? 1 : 0), 0);
}

/**
 * Matches a free-text query against a meal's name OR its ingredients.
 *
 * Ingredients included because "what can I make with chickpeas" is the question
 * a recipe list gets asked most, and matching only names answers it wrong.
 */
export function matchesQuery(meal: Meal, query: string, foodName: (id: string) => string | undefined): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (meal.name.toLowerCase().includes(needle)) return true;
  return meal.items.some((it) => foodName(it.foodId)?.toLowerCase().includes(needle));
}
