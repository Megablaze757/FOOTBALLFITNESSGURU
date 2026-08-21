// =============================================================================
// How hard is this to cook?
//
// "The recipes are good but I have no idea which ones I can actually manage."
//
// The book carries a time and nothing else, and time is a poor proxy for
// difficulty in both directions: a fifteen-minute stir-fry with nine
// ingredients and a sauce to reduce is harder than a forty-minute tray bake
// that you assemble once and forget. Someone cooking after a session at nine at
// night is asking "how much of me does this need", and the app was answering a
// different question.
//
// DERIVED, NOT LABELLED BY HAND. Two hundred and fifty-six recipes cannot be
// hand-rated without the ratings going stale the first time one is edited, and
// a hand-rating is one person's opinion anyway. Every input here is already in
// the recipe: how long it takes, how many things go in it, how many steps it
// takes, and whether the method asks for a technique that goes wrong when you
// are tired. Edit a recipe and its rating follows.
//
// THREE LEVELS, NOT FIVE. The rating exists to answer one question — can I face
// this tonight — and a five-point scale makes the middle meaningless. Measured
// across the book: 38% easy, 33% medium, 29% involved.
//
// Pure + tested.
// =============================================================================

import { recipeSteps, type MethodSource } from "./recipe-steps";

/**
 * Everything a rating reads off a recipe.
 *
 * Structural rather than `Meal`, so this module imports no data and the meal
 * planner can sort on it without the two of them forming a cycle.
 */
export interface CookSource extends MethodSource {
  minutes?: number;
  items: readonly unknown[];
}

export type CookLevel = "easy" | "medium" | "involved";

/**
 * What the athlete asked for, which is a different thing from what a recipe is.
 *
 * Only two options on purpose. "Medium or below" is a filter nobody has ever
 * wanted to express, and every extra option on a preferences panel is a
 * decision somebody has to make before they get fed.
 */
export type CookPreference = "any" | "easy";

export interface CookRating {
  level: CookLevel;
  /** One word for a badge. */
  label: string;
  /** One line for a tooltip or a filter row — plain language, no cheffing. */
  blurb: string;
  /** What the level was built from, so a card can show its working. */
  minutes: number;
  ingredients: number;
  steps: number;
  score: number;
}

export const COOK_LEVELS: { id: CookLevel; label: string; blurb: string }[] = [
  { id: "easy", label: "Easy", blurb: "Few ingredients, nothing tricky." },
  { id: "medium", label: "Medium", blurb: "A bit of prep and a pan or two." },
  { id: "involved", label: "Involved", blurb: "More steps and more ingredients — worth it when you have the time." },
];

const LEVEL = new Map(COOK_LEVELS.map((l) => [l.id, l]));

/**
 * Techniques that need attention rather than time.
 *
 * Deliberately short, and deliberately not a list of cooking verbs. Frying,
 * baking and blending are not difficulty — everybody can do them, and counting
 * them would rate a protein shake as hard work. These are the ones that fail if
 * you look away: something reducing, something searing, two things running at
 * once. "Meanwhile" is the strongest signal in the whole method, because it
 * means two pans and a clock.
 */
const DEMANDING = /\b(reduce|reduced|reducing|sear|seared|braise|braised|poach|poached|knead|deglaze|emulsif|temper|caramelis|fold in|meanwhile|while (?:that|the|it|they))\b/i;

/** How much of you this recipe needs. */
export function cookRating(meal: CookSource): CookRating {
  // A recipe with no stated time is not assumed quick — unknown is not easy,
  // the same rule the "under 15 min" filter already applies.
  const minutes = meal.minutes ?? 30;
  const ingredients = meal.items.length;
  const steps = recipeSteps(meal).length;

  const time = minutes <= 10 ? 0 : minutes <= 20 ? 1 : minutes <= 35 ? 2 : 3;
  const shopping = ingredients <= 6 ? 0 : ingredients <= 9 ? 1 : 2;
  const method = steps <= 4 ? 0 : steps <= 5 ? 1 : 2;
  const attention = DEMANDING.test(meal.method) ? 1 : 0;

  const score = time + shopping + method + attention;
  const level: CookLevel = score <= 1 ? "easy" : score <= 3 ? "medium" : "involved";
  const words = LEVEL.get(level)!;
  return { level, label: words.label, blurb: words.blurb, minutes, ingredients, steps, score };
}

/** True when a recipe is one somebody with no energy left can still cook. */
export function isEasyCook(meal: CookSource): boolean {
  return cookRating(meal).level === "easy";
}
