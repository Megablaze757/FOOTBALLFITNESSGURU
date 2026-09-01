/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CHEAPEST 30g OF PROTEIN IN A UK SUPERMARKET.
 *
 * This is the one marketing asset this app has that nobody else can copy. Every
 * ingredient in the food database carries a real pack size and a real shelf
 * price, so the cost of a fixed amount of protein is a number that can simply
 * be worked out — 31p from red lentils, £3.19 from king prawns, a ten-fold
 * spread that most people would not guess.
 *
 * It is a data product rather than content. Nobody wrote it, it updates itself
 * when a price is corrected, and it answers a question people genuinely ask.
 * That is the difference between a page worth publishing and the scaled blog
 * posts this project turned down.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TWO RULES DECIDE WHAT COUNTS AS A PROTEIN SOURCE, AND BOTH ARE NEEDED.
 *
 * Either one alone produces an embarrassing list.
 *
 *   THE SHARE TEST is the statutory one. Retained EU Regulation 1924/2006 lets
 *   a food be called "high in protein" when at least 20% of its energy comes
 *   from protein. Using the legal definition rather than a number chosen to
 *   look good is what makes the page defensible — and it is what removes stock
 *   cubes and ground spices, which are cheap per gram of protein and are not
 *   food anybody eats for protein.
 *
 *   THE PORTION TEST is the honest one. The index answers "the cheapest 30g of
 *   protein", so an entry only belongs if a person could eat 30g of protein
 *   from it in one sitting. Soy sauce passes the share test and would need
 *   375ml. Broccoli would need a kilo. Semi-skimmed milk would need 833ml.
 *
 * With only the share test the list contains soy sauce; with only the portion
 * test it contains stock cubes. Both, and it is 23 things somebody would
 * actually cook.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { FOODS, type Food } from "@/lib/food-db";

/** Retained EU Reg 1924/2006: "high in protein" is >=20% of energy. */
export const HIGH_PROTEIN_ENERGY_SHARE = 0.2;

/** Protein yields 4 kcal per gram — the Atwater factor behind the share above. */
export const KCAL_PER_G_PROTEIN = 4;

/** The most of one food a person would eat in a sitting, in grams or ml. */
export const MAX_PORTION = 300;

/** The reference amount. One meal's worth for most people, and a round number. */
export const REFERENCE_PROTEIN = 30;

export interface IndexEntry {
  id: string;
  name: string;
  /** £ for REFERENCE_PROTEIN grams of protein from this food. */
  cost: number;
  /** How much of it that takes, in the food's own unit. */
  portion: number;
  unit: Food["unit"];
  /** Share of the food's energy that comes from protein, 0-1. */
  energyShare: number;
  proteinPer100: number;
  tags: string[];
}

function entryFor(food: Food): IndexEntry | null {
  // Foods sold by the item carry macros per item rather than per 100g, so a
  // portion in grams is not a thing this can compute. Left out rather than
  // guessed at — an egg is a fine protein source and belongs in a later
  // version that handles counts properly.
  if (food.unit === "each") return null;
  if (food.protein <= 0 || food.kcal <= 0) return null;
  if (food.packPrice <= 0 || food.packSize <= 0) return null;

  const energyShare = (food.protein * KCAL_PER_G_PROTEIN) / food.kcal;
  const portion = (REFERENCE_PROTEIN / food.protein) * 100;
  const proteinInPack = (food.packSize / 100) * food.protein;

  return {
    id: food.id,
    name: food.name,
    cost: (food.packPrice / proteinInPack) * REFERENCE_PROTEIN,
    portion,
    unit: food.unit,
    energyShare,
    proteinPer100: food.protein,
    tags: food.tags ?? [],
  };
}

export function qualifies(entry: IndexEntry): boolean {
  return entry.energyShare >= HIGH_PROTEIN_ENERGY_SHARE && entry.portion <= MAX_PORTION;
}

let cached: IndexEntry[] | null = null;

/** Cheapest first. */
export function proteinIndex(): IndexEntry[] {
  if (cached) return cached;
  cached = FOODS
    .map(entryFor)
    .filter((e): e is IndexEntry => e !== null && qualifies(e))
    .sort((a, b) => a.cost - b.cost);
  return cached;
}

const isAnimal = (e: IndexEntry) =>
  ["meat", "pork", "fish", "dairy", "egg"].some((t) => e.tags.includes(t));

export interface IndexFacts {
  count: number;
  cheapest: IndexEntry;
  dearest: IndexEntry;
  /** How many times dearer the last one is than the first. */
  spread: number;
  cheapestPlant: IndexEntry | null;
  cheapestAnimal: IndexEntry | null;
  /** £ difference between the cheapest plant and the cheapest animal source. */
  plantSaving: number | null;
}

/**
 * The handful of numbers worth saying out loud.
 *
 * Everything a post or an email claims has to come from here, so that no part
 * of the copy is a thing somebody remembered rather than a thing the data says.
 */
export function indexFacts(): IndexFacts | null {
  const index = proteinIndex();
  if (index.length === 0) return null;

  const cheapest = index[0];
  const dearest = index[index.length - 1];
  const cheapestPlant = index.find((e) => !isAnimal(e)) ?? null;
  const cheapestAnimal = index.find(isAnimal) ?? null;

  return {
    count: index.length,
    cheapest,
    dearest,
    spread: dearest.cost / cheapest.cost,
    cheapestPlant,
    cheapestAnimal,
    plantSaving: cheapestPlant && cheapestAnimal
      ? cheapestAnimal.cost - cheapestPlant.cost
      : null,
  };
}

export const money = (n: number) => `£${n.toFixed(2)}`;

/** How much of it, phrased the way a person would say it. */
export function portionLabel(entry: IndexEntry): string {
  const rounded = entry.portion >= 100 ? Math.round(entry.portion / 5) * 5 : Math.round(entry.portion);
  return `${rounded}${entry.unit}`;
}
