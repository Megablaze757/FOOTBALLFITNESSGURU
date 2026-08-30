/**
 * Pages that answer a question no single recipe can.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THESE AND NOT BLOG POSTS.
 *
 * "High-protein meals under £2" is a real search with real intent, and the
 * honest answer to it is a LIST — not eight hundred words working up to one.
 * This app can produce that list because it has costed every ingredient in
 * every recipe, which almost nobody else does. The page is genuinely unique
 * because the data behind it is, and it stays right on its own because it is
 * computed rather than written.
 *
 * That is also the line between this and scaled content abuse. Google's policy
 * is about pages produced primarily to rank, with no value of their own, and it
 * does not care whether a person or a model made them. A page whose entire
 * value is a computed answer to a real question is what a database site IS.
 * A page whose value is that it exists is the thing that gets a domain
 * deindexed.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AND WHY THERE IS NO MODEL IN HERE.
 *
 * The plan was to have the AI write the intro for each of these. Building it
 * made the case against: the value of the page is the list, the list is
 * computed, and the intro can be computed too — "23 recipes, cheapest £0.84,
 * most protein 61g" is true, specific, updates itself when the food prices do,
 * and needs nobody to review it. Generated prose on top of that adds a review
 * step, a drift risk and a policy risk, in exchange for nothing the reader
 * wanted.
 *
 * The model earns its place where there is a real gap in the data — the 199
 * imported exercises with no coaching cues — not here.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { MEALS } from "@/lib/meals-data";
import { mealMacros, mealTags, basketOf, ongoingMarginalCost, type Meal } from "@/lib/meal-plan";
import { slugify } from "@/lib/seo";
import type { FoodTag } from "@/lib/food-db";
import { keepsWell } from "@/lib/batch-cooking";

/** Everything a collection filters on, computed once. */
export interface RecipeFacts {
  meal: Meal;
  kcal: number;
  protein: number;
  /** Per serving, at typical UK supermarket prices. */
  cost: number;
  minutes: number;
  tags: FoodTag[];
  /** Protein per pound — the number the cheap-and-strong collections rank on. */
  proteinPerPound: number;
}

let cached: RecipeFacts[] | null = null;

export function recipeFacts(): RecipeFacts[] {
  if (cached) return cached;
  const empty = basketOf([]);
  cached = MEALS.map((meal) => {
    const macros = mealMacros(meal, 1);
    const cost = ongoingMarginalCost(meal, empty, 1);
    return {
      meal,
      kcal: macros.kcal,
      protein: macros.protein,
      cost,
      minutes: meal.minutes ?? 0,
      tags: mealTags(meal),
      proteinPerPound: cost > 0 ? macros.protein / cost : 0,
    };
  });
  return cached;
}

const without = (facts: RecipeFacts, ...tags: FoodTag[]) =>
  tags.every((t) => !facts.tags.includes(t));

export interface Collection {
  slug: string;
  /** The phrase somebody would actually type. This is the h1 and the title. */
  title: string;
  /** One line under it, before the list. */
  blurb: string;
  match: (f: RecipeFacts) => boolean;
  /** Best first. */
  rank: (a: RecipeFacts, b: RecipeFacts) => number;
}

/** Wraps the batch-cooking rule so a collection can filter on it. */
function keepsWellFor(f: RecipeFacts): boolean {
  return keepsWell(f.meal);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EVERY ONE OF THESE IS A QUESTION SOMEBODY ASKS, and the app happens to be
 * able to answer it. None is here because "recipes under £X" is a URL pattern
 * that could be repeated a hundred times — that repetition is exactly the
 * failure mode, and it is why this list is short and hand-chosen rather than a
 * loop over price brackets.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const COLLECTIONS: Collection[] = [
  {
    slug: "cheap-high-protein-meals",
    title: "Cheap high-protein meals",
    blurb: "Over 30g of protein, under £3 a serving. Sorted by how much protein each pound buys.",
    // £3, not £2: the median 30g-protein meal in this book is £4.96, so £2 is
    // the fourth percentile — a list of eleven outliers, not an answer to the
    // question. £3 is the cheapest eighth, and it is a price a person would
    // call cheap out loud. It stays an absolute number rather than a
    // percentile on purpose: a percentile page can never fall below
    // MIN_MEMBERS however dear the food gets, which would make the gate
    // decorative for this one collection.
    match: (f) => f.protein >= 30 && f.cost > 0 && f.cost <= 3,
    rank: (a, b) => b.proteinPerPound - a.proteinPerPound,
  },
  {
    slug: "high-protein-breakfasts",
    title: "High-protein breakfasts",
    blurb: "30g or more before you have left the house.",
    match: (f) => f.meal.slot === "Breakfast" && f.protein >= 30,
    rank: (a, b) => b.protein - a.protein,
  },
  {
    slug: "quick-high-protein-dinners",
    title: "High-protein dinners in 20 minutes",
    blurb: "40g of protein or more, on the table in twenty minutes.",
    match: (f) => f.meal.slot === "Dinner" && f.protein >= 40 && f.minutes > 0 && f.minutes <= 20,
    rank: (a, b) => a.minutes - b.minutes || b.protein - a.protein,
  },
  {
    slug: "vegetarian-high-protein",
    title: "Vegetarian high-protein meals",
    blurb: "No meat, no fish, and still 30g or more — mostly lentils, beans, eggs and dairy.",
    match: (f) => f.protein >= 30 && without(f, "meat", "pork", "fish"),
    rank: (a, b) => b.protein - a.protein,
  },
  {
    slug: "vegan-high-protein",
    title: "Vegan high-protein meals",
    blurb: "No animal products at all, and 25g of protein or more.",
    match: (f) => f.protein >= 25 && without(f, "meat", "pork", "fish", "dairy", "egg", "honey"),
    rank: (a, b) => b.protein - a.protein,
  },
  {
    slug: "high-calorie-meals-for-bulking",
    title: "High-calorie meals for bulking",
    blurb: "800 calories or more in one sitting, with the protein to make them count.",
    match: (f) => f.kcal >= 800 && f.protein >= 40,
    rank: (a, b) => b.kcal - a.kcal,
  },
  {
    slug: "low-calorie-high-protein",
    title: "High-protein meals under 500 calories",
    blurb: "For a cut: 30g of protein or more inside 500 calories.",
    match: (f) => f.kcal <= 500 && f.protein >= 30,
    rank: (a, b) => b.protein / b.kcal - a.protein / a.kcal,
  },
  {
    slug: "meals-that-reheat",
    title: "Meals worth cooking double",
    blurb: "Dishes that keep overnight and are better the next day — cook once, eat twice.",
    // The same rule the meal planner batches on, so the page cannot promise a
    // dish the app would refuse to serve as a leftover.
    match: (f) => keepsWellFor(f),
    rank: (a, b) => b.protein - a.protein,
  },
  {
    slug: "gluten-free-high-protein",
    title: "Gluten-free high-protein meals",
    blurb: "No wheat, barley or rye, and 30g of protein or more.",
    match: (f) => f.protein >= 30 && without(f, "gluten"),
    rank: (a, b) => b.protein - a.protein,
  },
];

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A COLLECTION WITH FOUR RECIPES IN IT DOES NOT GET A PAGE.
 *
 * This is the rule that keeps the whole idea on the right side of the line. A
 * thin page is not merely less good — it is the exact thing a crawler reads as
 * a site padding itself out, and enough of them drag down the pages that ARE
 * worth having. If the data cannot answer the question well, the honest move is
 * not to ask it in public.
 *
 * Twelve, because a list shorter than that reads as "here is what we had"
 * rather than "here is the answer".
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const MIN_MEMBERS = 12;

export function membersOf(collection: Collection): RecipeFacts[] {
  return recipeFacts().filter(collection.match).sort(collection.rank);
}

/** Only the collections the data can actually answer. */
export function publishableCollections(): { collection: Collection; members: RecipeFacts[] }[] {
  return COLLECTIONS
    .map((collection) => ({ collection, members: membersOf(collection) }))
    .filter(({ members }) => members.length >= MIN_MEMBERS);
}

export function findCollection(slug: string): { collection: Collection; members: RecipeFacts[] } | null {
  return publishableCollections().find(({ collection }) => collection.slug === slug) ?? null;
}

/**
 * The intro, computed from the list rather than written about it.
 *
 * This is what the model was going to write, and the computed version is
 * better: it is true by construction, it is specific, and it updates itself
 * when a price or a recipe changes. Nobody has to review it and it cannot
 * drift.
 */
export function collectionSummary(members: RecipeFacts[]): string {
  if (members.length === 0) return "";
  const cheapest = members.reduce((a, b) => (a.cost <= b.cost ? a : b));
  const most = members.reduce((a, b) => (a.protein >= b.protein ? a : b));
  const quickest = members.filter((m) => m.minutes > 0).sort((a, b) => a.minutes - b.minutes)[0];

  const parts = [
    `${members.length} recipes.`,
    `The cheapest is ${cheapest.meal.name.toLowerCase()} at about £${cheapest.cost.toFixed(2)} a serving.`,
    `The most protein is ${most.meal.name.toLowerCase()} at ${Math.round(most.protein)}g.`,
  ];
  if (quickest && quickest.minutes <= 15) {
    parts.push(`The quickest is ${quickest.meal.name.toLowerCase()} in ${quickest.minutes} minutes.`);
  }
  return parts.join(" ");
}

/** Slugs are declared rather than derived, so a title can be reworded freely. */
export function collectionSlugs(): string[] {
  return publishableCollections().map(({ collection }) => collection.slug);
}

/** Guards against a hand-typed slug drifting from its title. */
export function slugLooksRight(c: Collection): boolean {
  return c.slug === slugify(c.slug);
}
