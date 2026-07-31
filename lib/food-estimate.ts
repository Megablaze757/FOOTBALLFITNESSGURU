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

// FOOD_KEYWORDS is tuned for dislike detection, where EVERY match is applied.
// Ambiguous words are therefore qualified there on purpose — milk only matches
// as "cow milk" or "dairy milk", because otherwise "no soya milk" would ban
// dairy milk too. Estimation resolves ambiguity the other way, by taking the
// longest match, so bare words are safe here and necessary: "1l milk" is what
// people actually type, and it matched nothing at all.
const EXTRA_KEYWORDS: Record<string, string[]> = {
  milk: ["milk"],
};

const KEYWORDS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const [id, words] of Object.entries(FOOD_KEYWORDS)) out[id] = [...words];
  for (const [id, words] of Object.entries(EXTRA_KEYWORDS)) out[id] = [...(out[id] ?? []), ...words];
  return out;
})();

/** Which food (if any) a phrase names. Longest keyword wins, so "sweet potato" beats "potato". */
function matchFood(phrase: string): string | null {
  let best: { id: string; len: number } | null = null;
  for (const [id, words] of Object.entries(KEYWORDS)) {
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

// --- Meal photos -------------------------------------------------------------

/**
 * The longest edge a meal photo is scaled down to before it's sent.
 *
 * A phone camera produces 3–5MB and 4000px across. None of that helps a model
 * identify a chicken breast, and all of it costs: the upload is the slowest
 * part of the whole round trip on a gym's signal, and image tokens are charged
 * by area, so a full-resolution photo is several times the price for the same
 * answer. 768px is comfortably enough to read a plate.
 */
export const PHOTO_MAX_EDGE = 768;

/** JPEG quality for the same. Food photos are noisy, so this is invisible. */
export const PHOTO_QUALITY = 0.7;

/**
 * Scale (w, h) so the longest edge is at most `max`, preserving aspect ratio.
 *
 * Never scales UP — a small photo is left alone rather than being interpolated
 * into a bigger file that carries no more detail.
 */
export function fitDimensions(w: number, h: number, max = PHOTO_MAX_EDGE): { width: number; height: number } {
  if (!(w > 0) || !(h > 0)) return { width: 0, height: 0 };
  const longest = Math.max(w, h);
  if (longest <= max) return { width: Math.round(w), height: Math.round(h) };
  const scale = max / longest;
  // At least 1px on the short edge: a very wide panorama would otherwise round
  // its height to zero and produce a canvas nothing can be drawn on.
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

// --- Correcting an estimate --------------------------------------------------
//
// An estimate — from a photo or a sentence — is a guess about portions, and
// portions are most of the error in a calorie count. The athlete can usually
// see immediately that it has said 200g of rice when they ate half that, and
// "accept all of it or throw all of it away" is the worst possible affordance
// for something you can nearly fix. These two let the UI make it editable.

/**
 * Rescale one item to a new quantity, moving its macros with it.
 *
 * Linear, because that is what a portion IS — twice the rice is twice
 * everything. Guards zero and negatives: a quantity of 0 means "I didn't eat
 * this", which is a removal, and the caller handles that rather than storing a
 * zero-calorie row.
 */
export function scaleItem(item: EstimatedItem, newQty: number): EstimatedItem {
  const qty = Math.max(0, Math.round(newQty));
  // The item's own qty is the reference. Falling back to 1 stops a corrupt
  // qty:0 item turning every correction into a division by zero.
  const factor = qty / (item.qty > 0 ? item.qty : 1);
  return {
    ...item,
    qty,
    macros: roundMacros({
      kcal: item.macros.kcal * factor,
      protein: item.macros.protein * factor,
      carbs: item.macros.carbs * factor,
      fats: item.macros.fats * factor,
    }),
    // A number the athlete typed is no longer an assumption, so the "(assumed)"
    // hint has to come off — it would be claiming they told us something they
    // didn't, in reverse.
    explicit: true,
  };
}

/** Re-total a list after edits. The displayed total must never drift from the rows. */
export function totalOf(items: EstimatedItem[]): Macros {
  return roundMacros(
    items.reduce(
      (s, i) => addMacros(s, i.macros),
      { kcal: 0, protein: 0, carbs: 0, fats: 0 },
    ),
  );
}
