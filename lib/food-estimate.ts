// =============================================================================
// "Today I had chicken and rice" → calories and macros.
//
// Two ways into the daily log: tick meals off the plan (exact — we know every
// gram), or describe what you actually ate. Most people eat off-plan most days,
// and the honest options there were "work out the macros yourself" or "don't
// log it", which is why nutrition logging gets abandoned.
//
// This is the on-device estimator. It recognises the foods already in
// lib/food-db.ts, applies a typical portion when none is given, and reports
// what it could NOT identify rather than quietly under-counting. The Worker's
// AI endpoint handles everything outside the database; this runs when that's
// unavailable, and as an instant preview while typing.
//
// Estimates, not measurements — every surface showing these must say so.
// Pure + tested.
// =============================================================================

import { FOOD_BY_ID } from "./food-db";
import { FOOD_KEYWORDS, itemMacros, type Macros } from "./meal-plan";

export interface EstimatedItem {
  foodId: string | null;   // null when the AI supplied it and we have no match
  name: string;
  qty: number;
  unit: "g" | "ml" | "each";
  macros: Macros;
  /** true when the athlete stated a quantity; false when we assumed one. */
  explicit: boolean;
}

export interface FoodEstimate {
  items: EstimatedItem[];
  total: Macros;
  /** Phrases we couldn't identify — shown so the gap is visible. */
  unmatched: string[];
}

export const EMPTY_ESTIMATE: FoodEstimate = {
  items: [], total: { kcal: 0, protein: 0, carbs: 0, fats: 0 }, unmatched: [],
};

// A normal serving of each food, used when someone just says "chicken and rice".
// Dry weights for things cooked from dry (rice, pasta, oats) — that's how the
// food database stores them, and 90g of dry rice is a big plate of cooked.
const PORTION: Record<string, number> = {
  chicken_breast: 170, beef_mince_5: 150, turkey_mince: 150, salmon_fillet: 130,
  tuna_tin: 100, eggs: 2, tofu: 150,
  rice: 90, pasta: 100, oats: 60, potatoes: 300, sweet_potato: 250, quinoa: 80,
  wholemeal_bread: 80, tortilla_wrap: 2,
  greek_yoghurt: 200, coconut_yoghurt: 200, milk: 250, soy_milk: 250, cheddar: 30,
  whey_protein: 30, pea_protein: 30,
  broccoli: 100, spinach: 60, mixed_veg_frozen: 150, onion: 60, tomatoes_tin: 200,
  banana: 1, apple: 1, berries_frozen: 80,
  peanut_butter: 20, almonds: 25, seeds_mixed: 20, olive_oil: 10,
  beans_baked: 200, chickpeas: 150, red_lentils: 100, black_beans: 150,
};

function defaultPortion(foodId: string): number {
  const explicit = PORTION[foodId];
  if (explicit != null) return explicit;
  const food = FOOD_BY_ID[foodId];
  if (!food) return 100;
  return food.unit === "each" ? 1 : food.unit === "ml" ? 250 : 120;
}

// Rough multipliers for the words people actually use instead of numbers.
const SIZE_WORDS: { re: RegExp; factor: number }[] = [
  { re: /\b(large|big|huge|massive|double|extra)\b/i, factor: 1.5 },
  { re: /\b(small|little|light|half a|half)\b/i, factor: 0.5 },
];

// "200g", "2", "300 ml", "a couple of"
const QTY = /(\d+(?:\.\d+)?)\s*(g|grams?|kg|ml|l|litres?)?\b/i;
const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  couple: 2, "a couple of": 2, few: 3,
};

/** Split a description into the individual foods someone listed. */
function phrases(text: string): string[] {
  return text
    .toLowerCase()
    .split(/,|\band\b|\bwith\b|\bplus\b|\+|\bthen\b|\balso\b|\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 1);
}

/** Which food (if any) a phrase names. Longest keyword wins, so "sweet potato" beats "potato". */
function matchFood(phrase: string): string | null {
  let best: { id: string; len: number } | null = null;
  for (const [id, words] of Object.entries(FOOD_KEYWORDS)) {
    for (const w of words) {
      if (phrase.includes(w) && (!best || w.length > best.len)) best = { id, len: w.length };
    }
  }
  return best?.id ?? null;
}

/** Quantity in the food's own unit, and whether the athlete actually said it. */
function quantityFor(phrase: string, foodId: string): { qty: number; explicit: boolean } {
  const food = FOOD_BY_ID[foodId];
  const unit = food?.unit ?? "g";

  const m = phrase.match(QTY);
  if (m) {
    let n = Number(m[1]);
    const suffix = (m[2] ?? "").toLowerCase();
    if (suffix.startsWith("kg") || suffix === "l" || suffix.startsWith("litre")) n *= 1000;
    // A bare number against a weight-based food means servings, not grams —
    // "2 chicken" is two portions, not two grams.
    if (!suffix && unit !== "each") return { qty: n * defaultPortion(foodId), explicit: true };
    return { qty: n, explicit: true };
  }

  for (const [word, n] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b${word}\\b`).test(phrase)) {
      return { qty: unit === "each" ? n : n * defaultPortion(foodId), explicit: n > 1 };
    }
  }

  let qty = defaultPortion(foodId);
  for (const { re, factor } of SIZE_WORDS) if (re.test(phrase)) qty *= factor;
  return { qty: Math.round(qty), explicit: false };
}

function addMacros(a: Macros, b: Macros): Macros {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fats: a.fats + b.fats };
}

export function roundMacros(m: Macros): Macros {
  return {
    kcal: Math.round(m.kcal), protein: Math.round(m.protein),
    carbs: Math.round(m.carbs), fats: Math.round(m.fats),
  };
}

/**
 * Estimate a meal from free text using the local food database.
 * Anything it can't identify comes back in `unmatched` — a silent zero would
 * make the day's total look complete when it isn't.
 */
export function estimateMeal(text: string): FoodEstimate {
  const input = (text ?? "").trim();
  if (input.length < 2) return { ...EMPTY_ESTIMATE, items: [] };

  const items: EstimatedItem[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();

  for (const phrase of phrases(input)) {
    const foodId = matchFood(phrase);
    if (!foodId) {
      // Ignore filler like "i had" or "for lunch" — only report phrases that
      // look like they were meant to name a food.
      const cleaned = phrase.replace(/\b(i|had|ate|for|my|some|today|breakfast|lunch|dinner|tea|snack|of|the|a|an)\b/g, "").trim();
      if (cleaned.length > 2) unmatched.push(cleaned);
      continue;
    }
    if (seen.has(foodId)) continue; // "chicken and chicken rice" shouldn't double up
    seen.add(foodId);

    const food = FOOD_BY_ID[foodId];
    if (!food) continue;
    const { qty, explicit } = quantityFor(phrase, foodId);
    items.push({
      foodId, name: food.name, qty: Math.round(qty), unit: food.unit,
      macros: roundMacros(itemMacros(food, qty)), explicit,
    });
  }

  const total = items.reduce((s, i) => addMacros(s, i.macros), { kcal: 0, protein: 0, carbs: 0, fats: 0 });
  return { items, total: roundMacros(total), unmatched };
}

/** Fold an AI response into the same shape, so both paths render identically. */
export function fromAiItems(
  raw: { name?: string; qty?: number; unit?: string; kcal?: number; protein?: number; carbs?: number; fats?: number }[]
): FoodEstimate {
  const items: EstimatedItem[] = [];
  for (const r of raw ?? []) {
    const name = (r.name ?? "").trim();
    if (!name) continue;
    const kcal = Number(r.kcal) || 0;
    // A food with no calories is a parse failure, not a zero-calorie food.
    if (kcal <= 0) continue;
    items.push({
      foodId: null,
      name,
      qty: Math.max(1, Math.round(Number(r.qty) || 1)),
      unit: r.unit === "ml" ? "ml" : r.unit === "each" ? "each" : "g",
      macros: roundMacros({
        kcal, protein: Number(r.protein) || 0, carbs: Number(r.carbs) || 0, fats: Number(r.fats) || 0,
      }),
      explicit: true,
    });
  }
  const total = items.reduce((s, i) => addMacros(s, i.macros), { kcal: 0, protein: 0, carbs: 0, fats: 0 });
  return { items, total: roundMacros(total), unmatched: [] };
}
