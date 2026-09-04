// =============================================================================
// Recipe topic hubs — "tofu recipes", "breakfast recipes".
//
// The exercise catalogue got hubs; the recipes did not. Their only grouping was
// lib/collections.ts, and every collection there is anchored on protein by
// design — "cheap high-protein", "high-protein breakfasts". That is a good
// niche and it leaves the ordinary ground uncovered: somebody searching "red
// lentil recipes" or "breakfast recipes" landed on a flat index of 335.
//
// ═══════════════════════════════════════════════════════════════════════════
// FREQUENCY IS NOT SIGNIFICANCE, AND THIS IS WHERE THAT BITES.
//
// The obvious rule — group by the ingredients a recipe contains — produces
// "Olive oil recipes" with 189 members, then lemons, garlic, onions and ground
// spices. Those are the most COMMON ingredients precisely because they are
// cooking fat and seasoning: they are in half the book and define none of it.
// A page for them is a doorway with a keyword in the title, which is the exact
// failure programmatic SEO is known for.
//
// So a recipe has ONE defining ingredient: the one contributing the most
// protein to the plate. That is not a proxy for "important" in general, but it
// is a very good one here — it picks the tofu out of a stir fry and the lentils
// out of a dhal, and it leaves the olive oil where it belongs.
// ═══════════════════════════════════════════════════════════════════════════

import type { Meal } from "./meal-plan";
import { FOOD_BY_ID } from "./food-db";
import { recipeFacts, type RecipeFacts } from "./collections";
import { slugify } from "./seo";

/** Same floor as lib/collections.ts and lib/hubs.ts. Below it, it is a list. */
export const MIN_RECIPE_HUB = 12;

export type RecipeHubKind = "ingredient" | "meal";

export interface RecipeHub {
  kind: RecipeHubKind;
  name: string;
  slug: string;
}

/**
 * The ingredient a recipe is built on, by protein contributed.
 *
 * Grams, not percentage of the food: a 200g block of tofu beats a 20g scatter
 * of seeds even though seeds are the denser food, because the plate is what
 * the reader is looking at.
 */
export function definingIngredient(meal: Meal): string | null {
  let best: { name: string; grams: number } | null = null;
  for (const item of meal.items) {
    const food = FOOD_BY_ID[item.foodId];
    if (!food) continue;
    // Foods sold by the item carry macros per item; everything else per 100g.
    const grams = food.unit === "each" ? food.protein * item.qty : (food.protein * item.qty) / 100;
    if (grams > 0 && (!best || grams > best.grams)) best = { name: food.name, grams };
  }
  return best?.name ?? null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SHELF NAME IS NOT THE SEARCH TERM.
 *
 * food-db holds what a product is called in a supermarket, which is exactly
 * right for a shopping list and wrong for a page: the first pass produced
 * "Recipes with tuna chunks in spring water" at
 * /recipes/with/tuna-chunks-in-spring-water/, and
 * /recipes/with/greek-style-yoghurt-0-fat/. Nobody searches either.
 *
 * Stripped rather than mapped by hand, so a new ingredient crossing the floor
 * gets a usable name without anybody remembering to add one — and
 * lib/recipe-hubs.test.ts fails the build if what comes out is still not a
 * name, rather than letting it ship as a URL.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const QUALIFIERS = [
  // How it was preserved, packed or reared — true of the product, not the food.
  "frozen", "fresh", "dried", "tinned", "canned", "free range", "organic",
  "cooked", "raw", "firm", "style", "chunks", "fillets", "fillet", "mince",
  "in spring water", "in brine", "in olive oil", "no added sugar", "reduced fat",
  "low fat", "wholemeal", "plain", "natural", "unsalted", "salted", "skinless",
  "boneless", "lean",
];

export function searchName(shelfName: string): string {
  let name = shelfName.toLowerCase()
    // "(0% fat)", "(5% fat)" — a grade, not a different food.
    .replace(/\([^)]*\)/g, " ")
    // "5%", "0% fat" left bare after the brackets go.
    .replace(/\d+\s*%/g, " ");

  for (const q of QUALIFIERS) {
    name = name.replace(new RegExp(`\\b${q}\\b`, "g"), " ");
  }
  return name.replace(/\s+/g, " ").trim();
}

function valuesOf(facts: RecipeFacts, kind: RecipeHubKind): string[] {
  if (kind === "meal") return [facts.meal.slot];
  const ingredient = definingIngredient(facts.meal);
  return ingredient ? [searchName(ingredient)] : [];
}

export function recipeHubMembers(hub: RecipeHub, all: RecipeFacts[]): RecipeFacts[] {
  const want = hub.name.toLowerCase();
  return all
    .filter((f) => valuesOf(f, hub.kind).some((v) => v.toLowerCase() === want))
    .sort((a, b) => a.meal.name.localeCompare(b.meal.name));
}

/**
 * Memoised for the default set, which is every caller that is not a test.
 *
 * findRecipeHub, recipeHubsFor and both page components each call this, and
 * the page components call it twice — so rendering one hub recomputed the
 * whole set four times, each pass walking 335 recipes per candidate hub.
 * Noticed when a mutation test removing the size floor did not fail but timed
 * out: the quadratic was always there, and only a few hundred hubs made it
 * loud enough to hear.
 */
let cached: { hub: RecipeHub; members: RecipeFacts[] }[] | null = null;

/**
 * EVERY candidate hub, including the ones too thin to publish.
 *
 * An ingredient two recipes short of a page is a page that does not exist, and
 * only the already-published set could be seen — so what was nearly ready was
 * invisible by construction. See lib/content-gaps.ts.
 *
 * The memoisation lives here rather than on publishableRecipeHubs because this
 * is the expensive half: computeHubs walks every recipe once per candidate, and
 * a quadratic version of it was found by a mutation test TIMING OUT rather than
 * failing. Filtering a cached list costs nothing.
 */
export function allRecipeHubs(all?: RecipeFacts[]): { hub: RecipeHub; members: RecipeFacts[] }[] {
  if (!all && cached) return cached;
  const facts = all ?? recipeFacts();
  const result = computeHubs(facts);
  if (!all) cached = result;
  return result;
}

/** Only the hubs with enough behind them to be worth a page. A filter over
 *  allRecipeHubs, so the two cannot disagree about what a hub contains. */
export function publishableRecipeHubs(all?: RecipeFacts[]): { hub: RecipeHub; members: RecipeFacts[] }[] {
  return allRecipeHubs(all).filter(({ members }) => members.length >= MIN_RECIPE_HUB);
}

function computeHubs(all: RecipeFacts[]): { hub: RecipeHub; members: RecipeFacts[] }[] {
  const out: { hub: RecipeHub; members: RecipeFacts[] }[] = [];

  for (const kind of ["ingredient", "meal"] as const) {
    const seen = new Map<string, string>();
    for (const f of all) {
      for (const v of valuesOf(f, kind)) {
        if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
      }
    }
    for (const name of seen.values()) {
      const hub: RecipeHub = { kind, name, slug: slugify(name) };
      out.push({ hub, members: recipeHubMembers(hub, all) });
    }
  }

  return out.sort((a, b) => b.members.length - a.members.length || a.hub.name.localeCompare(b.hub.name));
}

export function recipeHubPath(hub: RecipeHub): string {
  return `/recipes/${hub.kind === "meal" ? "meal" : "with"}/${hub.slug}/`;
}

export function findRecipeHub(kind: RecipeHubKind, slug: string, all?: RecipeFacts[]) {
  return publishableRecipeHubs(all).find((h) => h.hub.kind === kind && h.hub.slug === slug) ?? null;
}

export function recipeHubsFor(meal: Meal, all?: RecipeFacts[]): RecipeHub[] {
  const source = all ?? recipeFacts();
  const facts = source.find((f) => f.meal.id === meal.id);
  if (!facts) return [];
  return publishableRecipeHubs(all)
    .filter(({ hub }) => valuesOf(facts, hub.kind).some((v) => v.toLowerCase() === hub.name.toLowerCase()))
    .map(({ hub }) => hub);
}

/** What the page calls itself. Slot hubs read as meals, ingredients as "with". */
export function recipeHubTitle(hub: RecipeHub): string {
  return hub.kind === "meal"
    ? `${hub.name} recipes`
    : `Recipes with ${hub.name.toLowerCase()}`;
}

export function recipeHubBlurb(hub: RecipeHub, count: number, cheapest: RecipeFacts | null): string {
  const price = cheapest ? ` The cheapest is ${cheapest.meal.name.toLowerCase()}.` : "";
  return hub.kind === "meal"
    ? `${count} ${hub.name.toLowerCase()} recipes, costed to the ingredient with the macros worked out.${price}`
    : `${count} recipes built on ${hub.name.toLowerCase()}, costed to the ingredient.${price}`;
}
