// =============================================================================
// Related pages — the links that turn 719 islands into a site.
//
// WHAT WAS WRONG. Measured off the built output: 382 of 383 exercise pages and
// 335 of 336 recipe pages linked to no other page in their own section. Every
// one had twelve outbound links and all twelve were the header and the footer.
// So a crawler arriving on "cable shrug" could reach the home page and nothing
// else about shrugs, and a reader who wanted the next thing had to go back to
// an index of 383 and start again.
//
// It also made them thin: 504 of 776 pages are under 200 words, and the worst
// exercise page is 107. Six real links is not padding — it is the part of the
// page a person actually uses, and it happens to be the part a crawler reads
// as "this page belongs to a topic".
//
// COMPUTED, NOT CURATED. Relatedness is overlap in the data that is already
// there: muscles, equipment and category for a movement; shared ingredients
// and the same meal slot for a recipe. Nothing is written, so nothing goes
// stale, and adding a row to the catalogue wires it in automatically.
// =============================================================================

import type { Exercise } from "./exercises";
import type { Meal } from "./meal-plan";

/** Six: enough to be a topic, few enough to still be a recommendation. */
export const RELATED_COUNT = 6;

interface Scored<T> { item: T; score: number }

/**
 * Rank by overlap, break ties by name.
 *
 * The tie-break is not cosmetic. Without it the order depends on the
 * catalogue's order, so inserting one row silently reshuffles the related
 * block on hundreds of pages — every one of them a changed page to a crawler,
 * for no change in meaning.
 */
function top<T extends { id: string; name: string }>(scored: Scored<T>[], count: number): T[] {
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, count)
    .map((s) => s.item);
}

/**
 * Movements that train the same thing, or train it with the same kit.
 *
 * Muscles weigh most: someone reading about a cable shrug wants other trap
 * work far more than they want other cable work. Equipment second, because
 * "what else can I do with a cable machine" is the other real question.
 */
export function relatedExercises(exercise: Exercise, all: Exercise[], count = RELATED_COUNT): Exercise[] {
  const muscles = new Set(exercise.muscles.map((m) => m.toLowerCase()));
  return top(
    all
      .filter((e) => e.id !== exercise.id)
      .map((e) => {
        const shared = e.muscles.filter((m) => muscles.has(m.toLowerCase())).length;
        let score = shared * 4;
        if (e.equipment === exercise.equipment) score += 2;
        if (e.category === exercise.category) score += 1;
        // A different way to load the same movement is the most useful link on
        // the page, and it is the one a muscle match alone would rank equal
        // with any other accessory.
        if (shared > 0 && e.equipment !== exercise.equipment) score += 1;
        return { item: e, score };
      }),
    count,
  );
}

/**
 * Recipes built from the same food, or eaten at the same time of day.
 *
 * Ingredients weigh most because that is what the reader is actually solving
 * for — they have chicken thighs, or they are trying to use up the lentils.
 */
export function relatedMeals(meal: Meal, all: Meal[], count = RELATED_COUNT): Meal[] {
  const foods = new Set(meal.items.map((i) => i.foodId));
  return top(
    all
      .filter((m) => m.id !== meal.id)
      .map((m) => {
        const shared = m.items.filter((i) => foods.has(i.foodId)).length;
        let score = shared * 3;
        if (m.slot === meal.slot) score += 2;
        return { item: m, score };
      }),
    count,
  );
}
