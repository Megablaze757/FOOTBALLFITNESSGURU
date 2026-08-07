// =============================================================================
// Meal plan + shopping list. Turns body stats and training load into calorie
// and macro targets, builds a week of meals that hits them, then aggregates the
// ingredients into a costed shopping list.
//
// Costs are estimates from our own maintained price table — see lib/food-db.ts
// for why live supermarket pricing isn't available. Pure + tested.
// =============================================================================

import { FOODS, FOOD_BY_ID, type Aisle, type Food, type FoodTag } from "./food-db";
import { skipReason, EMPTY_SCHEDULE, type DietSchedule } from "./meal-schedule";
import type { PlanTargets } from "./nutrition"; // used below; also re-exported

// The energy maths moved to ./nutrition so the Coach targets card and the meal
// planner share one set of constants instead of two that drift apart. Re-exported
// here because callers already import them from this module.
export { ACTIVITY_LEVELS, DIET_GOALS, basalRate, planTargets } from "./nutrition";
export type { Sex, ActivityLevel, DietGoal, BodyStats, PlanTargets } from "./nutrition";

export type DietPattern = "omnivore" | "pescatarian" | "vegetarian" | "vegan";

export const DIET_PATTERNS: { id: DietPattern; label: string; excludes: FoodTag[] }[] = [
  { id: "omnivore", label: "Everything", excludes: [] },
  { id: "pescatarian", label: "Pescatarian", excludes: ["meat", "pork"] },
  { id: "vegetarian", label: "Vegetarian", excludes: ["meat", "pork", "fish"] },
  { id: "vegan", label: "Vegan", excludes: ["meat", "pork", "fish", "dairy", "egg"] },
];

// Things people avoid for allergy or preference reasons, separate from the
// overall pattern.
export type Avoidance = "dairy" | "gluten" | "nuts" | "egg" | "soy" | "pork";
export const AVOIDANCES: { id: Avoidance; label: string }[] = [
  { id: "dairy", label: "Dairy" },
  { id: "gluten", label: "Gluten" },
  { id: "nuts", label: "Nuts" },
  { id: "egg", label: "Egg" },
  { id: "soy", label: "Soy" },
  { id: "pork", label: "Pork" },
];

export interface MealPrefs {
  pattern: DietPattern;
  avoid: Avoidance[];
  mealsPerDay: 3 | 4 | 5;
  budget: boolean;      // prefer cheaper staples
  dislikes: string[];   // food ids the athlete never wants to see
  /** Food ids they've said they like. A nudge toward, not a guarantee of. */
  favourites?: string[];
}


// Food keywords for parsing free-text dietary notes ("I don't like yogurt").
// Hand-mapped rather than derived from names, so matching is reliable — this
// decides what's excluded from someone's plan, so a wrong guess is worse than
// a miss. British and American spellings both included.
export const FOOD_KEYWORDS: Record<string, string[]> = {
  chicken_breast: ["chicken"],
  beef_mince_5: ["beef", "mince"],
  salmon_fillet: ["salmon", "fish"],
  tuna_tin: ["tuna", "fish"],
  turkey_mince: ["turkey"],
  eggs: ["egg", "eggs"],
  greek_yoghurt: ["greek yoghurt", "greek yogurt", "yoghurt", "yogurt"],
  milk: ["cow milk", "cows milk", "dairy milk", "semi-skimmed", "regular milk"],
  cheddar: ["cheddar", "cheese"],
  oats: ["oats", "oat", "porridge"],
  rice: ["rice"],
  pasta: ["pasta"],
  potatoes: ["potato", "potatoes"],
  sweet_potato: ["sweet potato"],
  wholemeal_bread: ["bread", "wholemeal", "toast"],
  tortilla_wrap: ["wrap", "wraps", "tortilla"],
  banana: ["banana", "bananas"],
  berries_frozen: ["berries", "berry"],
  broccoli: ["broccoli"],
  mixed_veg_frozen: ["mixed veg", "mixed vegetables"],
  spinach: ["spinach"],
  apple: ["apple", "apples"],
  onion: ["onion", "onions"],
  tomatoes_tin: ["tomato", "tomatoes"],
  olive_oil: ["olive oil"],
  peanut_butter: ["peanut butter", "peanut"],
  almonds: ["almond", "almonds"],
  whey_protein: ["whey"],
  beans_baked: ["baked beans"],
  chickpeas: ["chickpea", "chickpeas", "garbanzo"],
  tofu: ["tofu"],
  red_lentils: ["lentil", "lentils", "dhal", "dahl"],
  black_beans: ["black bean", "black beans"],
  soy_milk: ["soya milk", "soy milk", "soya"],
  pea_protein: ["pea protein"],
  quinoa: ["quinoa"],
  coconut_yoghurt: ["coconut yoghurt", "coconut yogurt", "yoghurt", "yogurt"],
  seeds_mixed: ["seeds", "seed"],
};

const NEGATION = /(don'?t|do not|dont|\bno\b|\bnot\b|hate|avoid|without|can'?t|cant|dislike|allerg|rather not|no more)/;

/**
 * Phrases that mean "give me more of this".
 *
 * The notes box only ever understood exclusions, so writing "my favourite food
 * is egg" did precisely nothing — the plan might contain egg, by luck, and
 * usually didn't. Naming something you like and being ignored is worse than
 * having no box at all, because it reads as the app not listening.
 */
const AFFECTION = /(favourite|favorite|\blove\b|\blike\b|\blikes\b|enjoy|prefer|more of|lots of|plenty of|keen on|please include|include)/;

/**
 * Food ids to exclude, inferred from a free-text note. Only foods named inside a
 * NEGATED phrase are excluded — the note is split on conjunctions and
 * punctuation, so "I love chicken but no fish" drops fish, not chicken.
 */
export function dislikedFoodIds(notes: string): string[] {
  return foodIdsIn(notes, NEGATION);
}

/**
 * Food ids the athlete has said they LIKE.
 *
 * Meals containing these are made cheaper to pick (see buildWeek), so they turn
 * up often without crowding out the macros. A preference is a nudge, not an
 * instruction — "I like eggs" shouldn't mean eggs at every meal.
 */
export function favouriteFoodIds(notes: string): string[] {
  const liked = foodIdsIn(notes, AFFECTION);
  // A food mentioned in both a positive and a negative clause is a
  // contradiction ("I love cheese but no dairy"). The exclusion wins: getting
  // served something you said to avoid is a worse failure than missing a treat,
  // and it might be an allergy.
  const disliked = new Set(dislikedFoodIds(notes));
  return liked.filter((id) => !disliked.has(id));
}

/** Foods named inside a clause matching `mood`. */
function foodIdsIn(notes: string, mood: RegExp): string[] {
  const text = (notes ?? "").toLowerCase();
  if (text.trim().length < 3) return [];
  // Clause-split so "I love chicken but no fish" reads each half separately.
  const clauses = text.split(/[,.;\n]|\band\b|\bbut\b|\balso\b|\bplus\b/);
  const matching = clauses.filter((c) => mood.test(c)).join(" | ");
  if (!matching.trim()) return [];
  const out = new Set<string>();
  for (const [id, words] of Object.entries(FOOD_KEYWORDS)) {
    if (words.some((w) => matching.includes(w))) out.add(id);
  }
  return [...out];
}

export const DEFAULT_PREFS: MealPrefs = {
  pattern: "omnivore", avoid: [], mealsPerDay: 4, budget: false, dislikes: [], favourites: [],
};

/** Does this meal contain something the athlete said they like? */
function isFavourite(meal: Meal, favourites: Set<string>): boolean {
  if (!favourites.size) return false;
  return meal.items.some((it) => favourites.has(it.foodId));
}

/** Every tag a meal carries, via its ingredients. */
export function mealTags(meal: Meal): FoodTag[] {
  const out = new Set<FoodTag>();
  for (const it of meal.items) {
    for (const t of FOOD_BY_ID[it.foodId]?.tags ?? []) out.add(t);
  }
  return [...out];
}

/** Does this meal fit the athlete's diet, allergies and dislikes? */
export function mealAllowed(meal: Meal, prefs: MealPrefs): boolean {
  const banned = new Set<string>([
    ...(DIET_PATTERNS.find((d) => d.id === prefs.pattern)?.excludes ?? []),
    ...prefs.avoid,
  ]);
  if (mealTags(meal).some((t) => banned.has(t))) return false;
  return !meal.items.some((it) => prefs.dislikes.includes(it.foodId));
}

// basalRate() and planTargets() now live in ./nutrition, re-exported at the top
// of this file. Everything below is food selection, which is what this module
// is actually for.

// --- meals -------------------------------------------------------------------

export type Slot = "Breakfast" | "Lunch" | "Dinner" | "Snack";

export interface MealItem { foodId: string; qty: number } // grams/ml, or count for "each"

export interface Meal {
  id: string;
  name: string;
  slot: Slot;
  items: MealItem[];
  /**
   * How to cook it, as prose. Every meal has one.
   *
   * Kept as the source of truth so nothing had to be rewritten at once, but it
   * is no longer what the UI renders directly — see `recipeSteps`. A paragraph
   * is a fine way to STORE a method and a poor way to COOK from one: you are
   * holding a phone with one hand and a pan with the other, and you need to
   * know which line you are on.
   */
  method: string;
  /**
   * The method as numbered steps, when it has been written out properly.
   *
   * Optional on purpose. `recipeSteps()` falls back to splitting `method` into
   * sentences, so every meal gets a usable numbered list today and the good
   * ones can be written by hand over time — rather than blocking the whole
   * feature on rewriting sixty-one recipes in one go.
   */
  steps?: string[];
  /** Hands-on time in minutes. Shown so a 40-minute dinner isn't a surprise. */
  minutes?: number;
  /** One thing worth knowing — batching, swaps, what goes wrong. */
  tip?: string;
}

/**
 * A meal's method as steps you can follow one at a time.
 *
 * Splits on SENTENCE boundaries only, never on commas. Comma-splitting looked
 * tempting — most of these methods are comma-separated instructions — but it
 * mangles the ones with an aside in them ("season hard (turmeric and black
 * salt, if you have them)") and turns "Cheap, high protein and it freezes"
 * into three imaginary steps. A conservative split is never wrong; an
 * aggressive one is wrong in a way that makes the app look careless.
 */
export function recipeSteps(meal: Meal): string[] {
  return splitMethod(meal).steps;
}

/**
 * Somewhere to look up another version of this dish.
 *
 * WHY A SEARCH LINK AND NOT THEIR RECIPE. BBC Good Food's recipes are
 * copyrighted work owned by Immediate Media. The ingredient list alone is close
 * to fact and thin on protection, but the method — the wording, the order, the
 * asides — is exactly the creative expression copyright covers, and rewriting
 * it lightly does not change that. So none of it is copied.
 *
 * A search link costs nothing, never goes stale, needs no licence, and is
 * genuinely more useful than one borrowed recipe would be: someone who wants a
 * different take on shakshuka gets fifty, from a source they already trust.
 * It is the same decision `productLink` made about supermarket pricing — deep
 * link out rather than scrape.
 *
 * The dish name is searched rather than our recipe title, so "Big tofu, bean
 * and potato hash" doesn't return nothing. Anything in brackets or after a dash
 * is ours, not the dish's.
 */
export function recipeSearchUrl(meal: Meal): string {
  const dish = meal.name
    .replace(/\s*\([^)]*\)/g, "")
    .split(/\s+[—–-]\s+/)[0]
    .trim();
  return `https://www.bbcgoodfood.com/search?q=${encodeURIComponent(dish)}`;
}

/**
 * The bit of a method that is commentary rather than instruction.
 *
 * Most of these recipes end on an aside — "Cheap, high protein and it freezes",
 * "Around 1,000 kcal without feeling like a challenge". True, useful, and not a
 * step. Numbering it tells someone to go and do it, which is the kind of small
 * wrongness that makes a whole feature feel machine-generated.
 */
export function recipeNote(meal: Meal): string | undefined {
  return meal.tip ?? splitMethod(meal).note;
}

/**
 * Verbs a cooking instruction actually starts with.
 *
 * A list, not a parts-of-speech guess. The set of imperatives used in a recipe
 * is small and closed, and enumerating it is both more accurate than a
 * heuristic and honest about where it will fail — a method starting with a verb
 * that isn't here degrades to "treated as a note", which is safe, rather than
 * to a mangled step.
 */
const COOK_VERBS = new Set([
  "add", "assemble", "bake", "beat", "blend", "blitz", "boil", "bring", "build",
  "chop", "combine", "cook", "cover", "crack", "crisp", "crumble", "cube", "cut",
  "defrost", "dice", "drain", "dress", "drizzle", "everything", "fill", "finish",
  "fold", "fork", "fry", "grate", "grill", "heat", "keep", "layer", "leave",
  "let", "loosen", "mash", "meanwhile", "microwave", "mix", "oven", "pan",
  "plate", "pour", "press", "push", "put", "reduce", "reheat", "rinse", "roast",
  "scramble", "sear", "season", "serve", "shake", "simmer", "slice", "snap",
  "soften", "spread", "sprinkle", "squeeze", "steam", "stir", "take", "toast",
  "top", "toss", "turn", "warm", "wilt", "whisk", "spoon", "tip", "rice",
  "pasta", "potatoes", "beans", "lentils", "oven's", "under",
]);

function isInstruction(sentence: string): boolean {
  const first = sentence.trim().toLowerCase().replace(/^[^a-z]+/, "").split(/[\s,]/)[0] ?? "";
  return COOK_VERBS.has(first);
}

/**
 * Split a prose method into steps plus a trailing note.
 *
 * Sentence boundaries only — never commas. Comma-splitting was tempting, since
 * most of these are comma-separated instructions, but it turns an aside like
 * "season hard (turmeric and black salt, if you have them)" into two steps and
 * "Cheap, high protein and it freezes" into three. A conservative split is
 * never wrong; an aggressive one is wrong in a way that looks careless.
 *
 * Trailing sentences that don't begin with a cooking verb are lifted out as the
 * note. Only TRAILING ones: a non-instruction in the middle is usually context
 * for the step after it ("The tofu needs to be dry. Fry it hard...") and pulling
 * that to the bottom would break the sequence.
 */
function splitMethod(meal: Meal): { steps: string[]; note?: string } {
  if (meal.steps?.length) return { steps: meal.steps, note: meal.tip };

  const sentences = meal.method
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);

  const steps = [...sentences];
  const notes: string[] = [];
  // Peel commentary off the end, but never take the last instruction with it —
  // a method must always have at least one step.
  while (steps.length > 1 && !isInstruction(steps[steps.length - 1])) {
    notes.unshift(steps.pop()!);
  }

  return { steps, note: notes.length ? notes.join(" ") : undefined };
}

/**
 * The recipes live in `meals-data.ts` now.
 *
 * Six hundred lines of dinners inside the scoring engine made both harder to
 * read and impossible to review separately — the maths and the menu change for
 * completely different reasons. Re-exported here because every caller already
 * imports MEALS from this module.
 */
import { MEALS } from "./meals-data";
export { MEALS };

// --- macros ------------------------------------------------------------------

export interface Macros { kcal: number; protein: number; carbs: number; fats: number }

/** Macros for a quantity of a food ("each" foods are priced/counted per unit). */
export function itemMacros(food: Food, qty: number): Macros {
  const mult = food.unit === "each" ? qty : qty / 100;
  return {
    kcal: food.kcal * mult,
    protein: food.protein * mult,
    carbs: food.carbs * mult,
    fats: food.fats * mult,
  };
}

export function mealMacros(meal: Meal, scale = 1): Macros {
  const out: Macros = { kcal: 0, protein: 0, carbs: 0, fats: 0 };
  for (const it of meal.items) {
    const food = FOOD_BY_ID[it.foodId];
    if (!food) continue;
    const m = itemMacros(food, it.qty * scale);
    out.kcal += m.kcal; out.protein += m.protein; out.carbs += m.carbs; out.fats += m.fats;
  }
  return out;
}

// --- plan --------------------------------------------------------------------

export interface PlannedMeal { meal: Meal; scale: number; macros: Macros }
export interface SkippedMeal { slot: Slot; reason: string }
export interface PlannedDay {
  day: string;
  meals: PlannedMeal[];
  macros: Macros;
  /** Slots deliberately left unplanned — eating out, fasting, skipped. */
  skipped: SkippedMeal[];
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const cheapest = (a: Meal, b: Meal) => mealCost(a) - mealCost(b);
function mealCost(meal: Meal): number {
  let c = 0;
  for (const it of meal.items) {
    const f = FOOD_BY_ID[it.foodId];
    if (f) c += (it.qty / f.packSize) * f.packPrice;
  }
  return c;
}

function bySlot(slot: Slot, prefs: MealPrefs): Meal[] {
  const ok = MEALS.filter((m) => m.slot === slot && mealAllowed(m, prefs));
  return prefs.budget ? [...ok].sort(cheapest) : ok;
}

// --- bulk buying -------------------------------------------------------------
//
// You don't buy 90g of rice — you buy a 1kg bag, and it covers a lot of meals.
// Costing a meal pro-rata therefore flatters anything with a one-off ingredient:
// a bowl using 90g of quinoa looked cheap while actually forcing a whole bag
// into the trolley for one meal. Planning meal-by-meal on that number is how a
// week ends up with a dozen part-used packets.
//
// So meals are chosen on MARGINAL pack cost instead: given everything already
// in the basket, how much more does the trolley cost if we add this meal? A
// second rice dish is nearly free once the bag is in; a lone quinoa bowl is not.

type Basket = Map<string, number>;

/** Cost of the whole packs needed to cover `qty` of a food. */
function packCost(foodId: string, qty: number): number {
  const f = FOOD_BY_ID[foodId];
  if (!f || qty <= 0) return 0;
  return Math.ceil(qty / f.packSize) * f.packPrice;
}

/** What adding this meal would add to the shopping bill, given the basket so far. */
export function marginalCost(meal: Meal, basket: Basket, scale = 1): number {
  let delta = 0;
  const after = new Map(basket);
  for (const it of meal.items) {
    const have = after.get(it.foodId) ?? 0;
    const want = have + it.qty * scale;
    delta += packCost(it.foodId, want) - packCost(it.foodId, have);
    after.set(it.foodId, want);
  }
  return delta;
}

function addToBasket(meal: Meal, basket: Basket, scale = 1): void {
  for (const it of meal.items) basket.set(it.foodId, (basket.get(it.foodId) ?? 0) + it.qty * scale);
}

// Eating the same thing all week is cheap and miserable. Each prior use of a
// meal adds this much to its effective cost, so reuse has to genuinely save
// money to win, and no meal may appear more than MAX_REPEATS times.
/**
 * What it costs to serve the same meal again, per previous use.
 *
 * ESCALATING, NOT LINEAR — see `repeatCost`. At the old flat 0.85 a repeat was
 * nearly free next to a protein term weighted 35, so the planner simply picked
 * its favourite three times: an average athlete's week contained TWELVE
 * distinct meals across 28 slots, with Monday, Tuesday and Wednesday
 * identical. Adding sixty recipes changes nothing if the scoring will not
 * reach for them, which is why "the meals are repetitive" survived every
 * previous attempt to fix it by adding more.
 */
const REPEAT_PENALTY = 4; // £
// Discount applied to a meal containing a food they said they like. Sized to
// beat a typical price gap between meals but not a large one, so a favourite
// wins ties and near-ties without wrecking the shopping bill.
/**
 * RAISED FROM 1.2 WHEN SIZE_WEIGHT WENT UP, and it had to be.
 *
 * These two constants compete for the same decision, so one cannot move alone.
 * At SIZE_WEIGHT 8 with the undersize bias, a meal 10% under its slot already
 * costs 2.4 — so a 1.2 bonus could no longer win anything, and "I like eggs"
 * silently stopped producing eggs. `a favourite food shows up more often in the
 * week` caught it, which is the entire reason that test exists.
 *
 * Swept against both constraints: 2.0 is the lowest value that passes, and
 * every value from 2.0 to 6.0 leaves the macro audit identical (worst-case 94%
 * calories, 92% protein, zero misses). 3.0 takes the headroom rather than
 * sitting exactly on the edge, and keeps the original intent — a meal ~10%
 * off-size yields to a preference, one 20% off-size does not.
 */
const FAVOURITE_BONUS = 5.0; // £
const MAX_REPEATS = 3;

/**
 * What a full miss on a meal's protein share is worth, in the same made-up
 * pounds the rest of the score uses.
 *
 * 2.2 puts it above FAVOURITE_BONUS and well above REPEAT_PENALTY, so protein
 * outranks both "they said they like this" and "we've had it twice" — but it is
 * still a weight, not a veto. A meal that misses its protein share and costs 30p
 * can still beat one that hits it and costs £4, which is the right trade for
 * someone eating on a budget.
 */
/**
 * Tuned by measurement, not taste. A 60kg athlete cutting and a 95kg athlete
 * bulking, protein hit as a % of target and how many of their weekly meals were
 * identical:
 *
 *   weight  2.2 | cut  80% | bulk  96% | 13 of 14 meals shared
 *   weight  5   | cut  88% | bulk 101% |  9 of 14
 *   weight  9   | cut 103% | bulk 106% |  9 of 13   <- chosen
 *   weight 14   | cut 122% | bulk 116% |  6 of 13
 *   weight 20   | cut 122% | bulk 116% |  7 of 14
 *
 * 9 is where both athletes actually reach their target. Below it the cutter
 * falls short, because marginal cost collapses once a food is already in the
 * basket and cheap repetition wins. Above it the plan overshoots protein by 20%,
 * which is money spent on protein nobody asked for.
 */
const PROTEIN_WEIGHT = 35; // £ per unit of normalised density shortfall

/**
 * How the day's calories divide between meals.
 *
 * Portion scaling used to work off one flat `targets.calories / mealCount`,
 * which treats a snack as a third of a dinner's equal — so a snack got pushed
 * to 1.6× to reach a "per-meal" target it was never meant to hit, and dinner
 * got the same multiplier as breakfast.
 *
 * Normalised over whichever slots are actually planned, so three meals a day
 * still totals the target rather than landing 12% short.
 */
const SLOT_SHARE: Record<Slot, number> = {
  Breakfast: 0.25, Lunch: 0.30, Dinner: 0.33, Snack: 0.12,
};

/**
 * MEALS ARE CHOSEN BY SIZE, NOT JUST BY PRICE AND PROTEIN.
 *
 * A 105kg forward on 3,720 kcal and a 52kg athlete on 1,740 were handed
 * identical dishes and told apart only by a portion multiplier — and that
 * multiplier is clamped at 1.6, so the big athlete finished 8% under target
 * with a Greek yoghurt bowl scaled to 811 kcal. Scaling is for fine adjustment;
 * it cannot turn a snack into a footballer's dinner, and pretending otherwise
 * produces portions nobody would serve.
 *
 * Scoring the gap between a meal's own calories and its slot's share means big
 * targets pull in inherently bigger meals, small targets pull in lighter ones,
 * and the scale needed afterwards stays near 1.
 *
 * Weighted below protein deliberately: being handed a meal that misses the
 * protein target matters more than one that needs scaling to 1.2×.
 */
const SIZE_WEIGHT = 8; // £ per unit of normalised calorie mismatch

/**
 * How far this meal's own calories sit from what the slot should carry.
 *
 * ASYMMETRIC ON PURPOSE, and this is the fix for the biggest complaint the
 * planner had: too small is much worse than too big, because the two are not
 * equally recoverable. Portions scale by `Math.min(1.6, max(0.6, want / base))`,
 * so a meal that is twice the size it needs just gets served at 0.6 and lands
 * near enough — while a meal at a third of the size hits the 1.6 ceiling and
 * simply cannot reach the target, however hungry the athlete is.
 *
 * Measured, not guessed. A 115kg athlete on a build had 23 of his 28 weekly
 * meals pinned at the 1.6 clamp and ate 75% of his target: the planner kept
 * choosing a 507 kcal breakfast for a 1198 kcal slot when a 1099 kcal one was
 * in the pool, because at SIZE_WEIGHT 4 a few pence of cost outweighed being
 * half the required size.
 *
 * A grid over SIZE_WEIGHT × undersize bias, scored across 90 combinations of
 * body size, goal, diet and meal count:
 *
 *     4 × 1 (was)   worst day 76% of calories, 35% of meals clamped
 *     8 × 3 (now)   worst day 89% of calories, 21% of meals clamped
 *    30 × 3         worst day 92%, but worst protein falls 77% → 65%
 *
 * Pushing size harder keeps buying calories and starts selling protein, because
 * the two terms compete for the same choice. 8 × 3 is the corner: it takes the
 * calorie floor from 76% to 89% and halves the clamping, with worst-case
 * protein unchanged.
 */
const UNDERSIZE_BIAS = 3;

/**
 * Cost of an nth serving, rising faster than n.
 *
 * A second helping of something good across a week is fine — people cook in
 * batches and eat the same dinner twice. A third is the app being lazy. Linear
 * cost cannot express that difference: whatever value makes the third serving
 * expensive also makes the second one unlikely, which produces a week of
 * twenty-eight unrelated shopping lists.
 *
 * The exponent does the work instead. At weight 4: one repeat costs 4, two
 * costs 14. The second serving stays affordable, the third rarely wins.
 */
function repeatCost(uses: number, weight: number): number {
  return Math.pow(uses, 1.8) * weight;
}

function sizeMismatch(meal: Meal, slotKcal: number): number {
  if (slotKcal <= 0) return 0;
  const diff = (mealMacros(meal).kcal - slotKcal) / slotKcal;
  return diff < 0 ? -diff * UNDERSIZE_BIAS : diff;
}

/**
 * How far short a meal falls on protein DENSITY — grams per calorie — against
 * what the day needs. 0 means it's dense enough, 1 means it has none.
 *
 * Density, not grams, because portions are scaled to hit CALORIES afterwards.
 * Scaling multiplies protein and calories together, so it can never fix a ratio:
 * an athlete cutting on 1,900 kcal and 132g of protein needs 0.069 g/kcal, and
 * no amount of shrinking a pasta bowl gets there. Ranking on absolute grams also
 * made every athlete pick the same meals, since the biggest meals win regardless
 * of who's eating.
 *
 * This is the term that makes the plan personal: a lean athlete on a deficit
 * needs a high ratio and gets chicken, fish and yoghurt; someone bulking needs a
 * low one and gets pasta, rice and oats. Same library, different weeks, for a
 * reason that's actually about them.
 */
function proteinShortfall(meal: Meal, requiredPerKcal: number): number {
  if (requiredPerKcal <= 0) return 0;
  const m = mealMacros(meal);
  if (m.kcal <= 0) return 0;
  const density = m.protein / m.kcal;
  return Math.max(0, (requiredPerKcal - density) / requiredPerKcal);
}

/** Slots that have nothing left once the athlete's rules are applied. */
export function unmetSlots(prefs: MealPrefs): Slot[] {
  return (["Breakfast", "Lunch", "Dinner", "Snack"] as Slot[])
    .filter((slot) => bySlot(slot, prefs).length === 0);
}

/**
 * Build a week. Meals rotate so nobody eats the same thing seven days running,
 * then each day is scaled to land on the calorie target. Portions are clamped
 * so we never prescribe a comically small or huge plate.
 */
/**
 * Meals the athlete chose by hand, replacing what the planner picked.
 *
 * Keyed by POSITION — `"2:Dinner:0"` is Wednesday's dinner — rather than by the
 * meal being replaced. That matters: a swap has to survive the plan being
 * rebuilt, and `buildWeek` is re-run from the seed on every visit. Keying by
 * the original meal's id would break the moment anything upstream changed what
 * that slot would otherwise have held, which is exactly when someone's choice
 * matters most.
 */
/**
 * What one slot is meant to carry, for this athlete.
 *
 * Exported because the swap dialog has to show alternatives against the same
 * number the planner scores them by — a UI that ranked meals on its own idea of
 * "about right" would recommend things the engine would then scale oddly.
 * Duplicating the share maths in the component is how those two drift.
 */
export function slotTargetKcal(targets: PlanTargets, prefs: MealPrefs, slot: Slot): number {
  const wanted: Slot[] = [
    "Breakfast", "Lunch", "Dinner",
    ...(prefs.mealsPerDay >= 4 ? (["Snack"] as Slot[]) : []),
    ...(prefs.mealsPerDay >= 5 ? (["Snack"] as Slot[]) : []),
  ];
  const total = wanted.reduce((sum, sl) => sum + SLOT_SHARE[sl], 0);
  return total > 0 ? targets.calories * (SLOT_SHARE[slot] / total) : 0;
}

export type MealSwaps = Record<string, string>;

/** The key a swap is stored under. Exported so the UI cannot invent its own. */
export function swapKey(dayIndex: number, slot: Slot, nth: number): string {
  return `${dayIndex}:${slot}:${nth}`;
}

export function buildWeek(
  targets: PlanTargets,
  seed = 0,
  prefs: MealPrefs = DEFAULT_PREFS,
  schedule: DietSchedule = EMPTY_SCHEDULE,
  swaps: MealSwaps = {}
): PlannedDay[] {
  const pools: Record<Slot, Meal[]> = {
    Breakfast: bySlot("Breakfast", prefs), Lunch: bySlot("Lunch", prefs),
    Dinner: bySlot("Dinner", prefs), Snack: bySlot("Snack", prefs),
  };

  const basket: Basket = new Map();
  const uses = new Map<string, number>();

  /**
   * Cheapest addition to the trolley that isn't already on repeat. `nth`
   * separates the two snack slots so a 5-meal day doesn't pick the same snack
   * twice, and `seed` lets the UI reshuffle for someone who wants a different
   * week without changing any of their settings.
   */
  // Budget mode leans harder on repetition: reusing what's already bought is the
  // single biggest lever on the bill, and someone who ticked "cheap staples" has
  // told us they'd rather eat the same thing than pay more.
  /**
   * Variety is scaled to how many meals there are to spread it over.
   *
   * A flat penalty broke a real case: someone eating out twice a week got a
   * MORE expensive shop than someone cooking every night — £111 against £103 —
   * because the planner spread twenty-six slots across twenty-one different
   * dishes and the extra ingredients cost more in whole packs than the two
   * dinners saved. Cooking less and paying more is indefensible however varied
   * the week is.
   *
   * The cause is that a repeat costs the same whether there are 28 slots or 18,
   * while pack efficiency gets steadily more important as slots come out — a
   * bag of rice has fewer meals to amortise over. So the pressure to vary now
   * falls with the number of slots, and the scale is set against a full 4-meal
   * week (28) so an ordinary plan is unaffected.
   *
   * Set in `weeklyRepeatPenalty` below, once `wanted` is known.
   */
  const budgetScale = prefs.budget ? 0.35 : 1;
  /**
   * BUDGET MODE HAS TO ACTUALLY WEIGHT COST, and it didn't.
   *
   * The only thing ticking "cheap staples" changed was the repeat penalty
   * above — a nudge toward eating the same thing twice. Cost itself was scored
   * identically in both modes, so budget mode was competing against protein and
   * size terms it had no extra leverage over. It mostly came out cheaper by
   * luck, via the repetition.
   *
   * Adding twelve meals to the pool broke the luck: with more good-fitting
   * options available, `budget mode produces a cheaper shop than the default`
   * started failing at £68.90 against £63.90. Budget mode was producing the
   * DEARER shop, which is the one thing it exists not to do.
   *
   * So cost gets a real multiplier. It is deliberately a multiplier on the term
   * rather than a reduction of the others: someone on a budget still needs
   * their protein, and this way cost outranks a marginal nutritional gain
   * without ever overriding a large one.
   */
  const costWeight = prefs.budget ? 2.5 : 1;
  const favourites = new Set(prefs.favourites ?? []);

  /**
   * PROTEIN IS A TARGET, NOT AN ACCIDENT.
   *
   * Selection used to score on marginalCost alone, so the planner was a
   * cheapest-basket optimiser wearing a nutrition label. Two consequences, both
   * of which people noticed:
   *
   *   - Everyone got broadly the same week. Cost doesn't depend on you, so a
   *     60kg runner on 1,900 kcal and a 95kg lifter chasing 190g of protein were
   *     handed the same meals, just scaled.
   *   - Protein landed wherever it landed. Portions are scaled to hit CALORIES
   *     (see `scale` below), and nothing anywhere was aiming at the protein
   *     number the app had just told the athlete to hit.
   *
   * Meals are now also scored on how much of their share of the day's protein
   * they actually deliver. Cost still matters — it's what makes the shopping
   * list affordable — but it no longer decides alone, so the plan differs by
   * person because their protein target differs.
   */
  // Grams of protein per calorie this athlete needs. Cutting pushes it up
  // (protein held while calories come down), bulking pushes it down.
  const requiredProteinPerKcal = targets.calories > 0 ? targets.protein / targets.calories : 0;

  // The slots for a day. Constant across the week — mealsPerDay doesn't vary by
  // day — so it's hoisted out of the map to give `choose` its size target.
  const wanted: { slot: Slot; nth: number }[] = [
    { slot: "Breakfast", nth: 0 }, { slot: "Lunch", nth: 0 }, { slot: "Dinner", nth: 0 },
    ...(prefs.mealsPerDay >= 4 ? [{ slot: "Snack" as Slot, nth: 0 }] : []),
    ...(prefs.mealsPerDay >= 5 ? [{ slot: "Snack" as Slot, nth: 1 }] : []),
  ];
  // Slots actually COOKED this week, which is the number that matters. The
  // first version of this multiplied `wanted` by seven and never changed,
  // because days eaten out are skipped inside the day loop rather than removed
  // from `wanted` — so the scaling silently did nothing. Counted properly here.
  let weeklySlots = 0;
  for (let d = 0; d < DAYS.length; d++) {
    for (const w of wanted) if (!skipReason(schedule, d, w.slot)) weeklySlots++;
  }
  const repeatPenalty = REPEAT_PENALTY * budgetScale * Math.min(1, weeklySlots / 28);

  const shareTotal = wanted.reduce((s, w) => s + SLOT_SHARE[w.slot], 0);
  /**
   * The calories this slot should carry.
   *
   * Deliberately computed from the FULL day, including meals being eaten out.
   * Scaling only the remaining meals would inflate breakfast to cover a
   * restaurant dinner, which is not what anyone wants.
   */
  const slotKcal = (slot: Slot): number =>
    shareTotal > 0 ? targets.calories * (SLOT_SHARE[slot] / shareTotal) : 0;

  const choose = (slot: Slot, nth = 0, avoid: Set<string> = new Set()): Meal | undefined => {
    const list = pools[slot].filter((m) => !avoid.has(m.id));
    if (!list.length) return undefined;
    const ranked = list
      .map((meal, idx) => ({
        meal,
        // The seed/nth term is a fraction of a penny — it only breaks ties
        // between meals that cost the same, never overrides a real saving.
        // A meal built round something they said they like is discounted, so
        // it wins ties and near-ties. Deliberately a nudge and not an
        // override: "I like eggs" should mean eggs turn up regularly, not
        // eggs at every meal, and the repeat penalty still applies on top.
        score: marginalCost(meal, basket) * costWeight
          - (isFavourite(meal, favourites) ? FAVOURITE_BONUS : 0)
          + repeatCost(uses.get(meal.id) ?? 0, repeatPenalty)
          // How far this meal falls short of its share of the day's protein,
          // as a fraction of that share, priced in pounds so it trades against
          // cost. Only shortfall is penalised — going over is free, because
          // extra protein is not a problem to solve.
          + proteinShortfall(meal, requiredProteinPerKcal) * PROTEIN_WEIGHT
          // How far this meal's own calories sit from what this slot should
          // carry, so a big athlete is offered big meals rather than a small
          // one scaled past the point of sense.
          + sizeMismatch(meal, slotKcal(slot)) * SIZE_WEIGHT
          + ((idx + seed + nth) % list.length) * 0.001,
        capped: (uses.get(meal.id) ?? 0) >= MAX_REPEATS,
      }))
      .sort((a, b) => a.score - b.score);
    // If everything is capped (a narrow diet with few options), take the best
    // anyway rather than leaving the slot empty.
    const pick = ranked.find((r) => !r.capped) ?? ranked[0];
    uses.set(pick.meal.id, (uses.get(pick.meal.id) ?? 0) + 1);
    addToBasket(pick.meal, basket);
    return pick.meal;
  };

  return DAYS.map((day, i) => {
    const skipped: SkippedMeal[] = [];
    const picks: Meal[] = [];
    // A 5-meal day has two snack slots; without this they'd both resolve to the
    // cheapest snack and the day would list the same thing twice.
    const usedToday = new Set<string>();
    for (const { slot, nth } of wanted) {
      const reason = skipReason(schedule, i, slot);
      if (reason) {
        // Record it and move on — no meal chosen, so nothing lands on the
        // shopping list for a meal the athlete was never going to cook.
        if (!skipped.some((s) => s.slot === slot)) skipped.push({ slot, reason });
        continue;
      }
      /**
       * A hand-picked meal wins outright.
       *
       * It still goes through `addToBasket` and the repeat counter, so the
       * shopping list and the rest of the week account for it exactly as if the
       * planner had chosen it — a swap that the costing ignored would produce a
       * list that doesn't match the plan.
       *
       * An unknown or now-ineligible id (they went vegan since choosing it)
       * falls through to the planner rather than erroring or leaving a hole.
       */
      const chosen = swaps[swapKey(i, slot, nth)];
      const forced = chosen
        ? pools[slot].find((x) => x.id === chosen && !usedToday.has(x.id))
        : undefined;
      if (forced) {
        uses.set(forced.id, (uses.get(forced.id) ?? 0) + 1);
        addToBasket(forced, basket);
        picks.push(forced);
        usedToday.add(forced.id);
        continue;
      }

      const m = choose(slot, nth, usedToday);
      if (m) { picks.push(m); usedToday.add(m.id); }
    }

    /**
     * Each meal is scaled to its own slot, not to one figure for the whole day.
     *
     * The old version averaged every pick's calories and applied a single
     * multiplier to all of them, so a light breakfast and a heavy dinner moved
     * together — and the snack, whose "fair share" was a quarter of the day,
     * was dragged towards a main meal's size. Scaling per slot keeps each meal
     * near a portion a person would actually serve.
     */
    const meals = picks.map((meal) => {
      const want = slotKcal(meal.slot);
      const base = mealMacros(meal).kcal;
      const raw = base > 0 ? want / base : 1;
      /**
       * 0.55, not 0.6, at the bottom.
       *
       * The last failing case in the audit was a 55kg woman cutting on five
       * meals a day: a ~1400 kcal target split five ways leaves about 280 kcal
       * for a main, and the smallest meal in the pool at 0.6 still overshot —
       * she was handed 110% of the calories she was trying to eat under, which
       * defeats the entire point of a cut.
       *
       * A twentieth of a portion is the difference between the plan working and
       * not, and 0.55 of a serving is still a serving. Going lower buys nothing
       * measurable (0.5 and 0.45 score identically) and starts producing
       * portions nobody would plate, so it stops here.
       */
      const scale = Math.round(Math.min(1.6, Math.max(0.55, raw)) * 20) / 20; // 0.05 steps
      return { meal, scale, macros: mealMacros(meal, scale) };
    });
    const macros = meals.reduce(
      (s, m) => ({
        kcal: s.kcal + m.macros.kcal, protein: s.protein + m.macros.protein,
        carbs: s.carbs + m.macros.carbs, fats: s.fats + m.macros.fats,
      }),
      { kcal: 0, protein: 0, carbs: 0, fats: 0 }
    );
    return { day, meals, macros, skipped };
  });
}

// --- shopping list -----------------------------------------------------------

export interface ShoppingLine {
  food: Food;
  needed: number;   // total grams/ml/count across the week
  packs: number;    // whole packs to buy
  cost: number;     // £ estimate
  /** How many meals in the week this pack is spread across. */
  meals: number;
  /** Fraction of the packs actually eaten — the rest is left over. */
  used: number;     // 0..1
}

export interface ShoppingList {
  lines: ShoppingLine[];
  byAisle: { aisle: Aisle; lines: ShoppingLine[]; cost: number }[];
  total: number;
  /** Meals the list actually feeds — excludes anything eaten out. */
  mealsPlanned: number;
  /** Total ÷ meals planned. The number that tells you if a plan is affordable. */
  costPerMeal: number;
}

export function shoppingList(week: PlannedDay[]): ShoppingList {
  const needed = new Map<string, number>();
  const mealCount = new Map<string, number>();
  for (const day of week) {
    for (const pm of day.meals) {
      for (const it of pm.meal.items) {
        needed.set(it.foodId, (needed.get(it.foodId) ?? 0) + it.qty * pm.scale);
        mealCount.set(it.foodId, (mealCount.get(it.foodId) ?? 0) + 1);
      }
    }
  }

  const lines: ShoppingLine[] = [];
  for (const [foodId, qty] of needed) {
    const food = FOOD_BY_ID[foodId];
    if (!food) continue;
    const packs = Math.max(1, Math.ceil(qty / food.packSize));
    lines.push({
      food,
      needed: Math.round(qty),
      packs,
      cost: Math.round(packs * food.packPrice * 100) / 100,
      meals: mealCount.get(foodId) ?? 0,
      used: Math.min(1, qty / (packs * food.packSize)),
    });
  }
  lines.sort((a, b) => a.food.name.localeCompare(b.food.name));

  const aisles = [...new Set(lines.map((l) => l.food.aisle))];
  const byAisle = aisles.map((aisle) => {
    const ls = lines.filter((l) => l.food.aisle === aisle);
    return { aisle, lines: ls, cost: Math.round(ls.reduce((s, l) => s + l.cost, 0) * 100) / 100 };
  });

  const total = Math.round(lines.reduce((s, l) => s + l.cost, 0) * 100) / 100;
  const mealsPlanned = week.reduce((n, d) => n + d.meals.length, 0);
  return {
    lines,
    byAisle,
    total,
    mealsPlanned,
    costPerMeal: mealsPlanned > 0 ? Math.round((total / mealsPlanned) * 100) / 100 : 0,
  };
}

/** Plain-text list, for pasting into a supermarket app or messaging it to someone. */
export function shoppingListText(list: ShoppingList): string {
  const out: string[] = ["Shopping list — PocketAthlete", ""];
  for (const group of list.byAisle) {
    out.push(`${group.aisle}`);
    for (const l of group.lines) {
      // Saying a pack covers 6 meals is the difference between "£1.45 of rice"
      // and "£1.45 for the week's rice" — it's why the plan buys the big bag.
      const spread = l.meals > 1 ? ` — covers ${l.meals} meals` : "";
      out.push(`  - ${l.food.name} x${l.packs} (${l.food.packLabel}) ~£${l.cost.toFixed(2)}${spread}`);
    }
    out.push("");
  }
  out.push(`Estimated total: ~£${list.total.toFixed(2)}`);
  const perMeal = list.mealsPlanned > 0 ? list.total / list.mealsPlanned : 0;
  if (perMeal > 0) out.push(`That's about £${perMeal.toFixed(2)} a meal across ${list.mealsPlanned} planned meals.`);
  out.push("(estimates from typical UK supermarket prices, not live pricing)");
  return out.join("\n");
}

export { FOODS };
