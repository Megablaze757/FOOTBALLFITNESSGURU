// =============================================================================
// Meal plan + shopping list. Turns body stats and training load into calorie
// and macro targets, builds a week of meals that hits them, then aggregates the
// ingredients into a costed shopping list.
//
// Costs are estimates from our own maintained price table — see lib/food-db.ts
// for why live supermarket pricing isn't available. Pure + tested.
// =============================================================================

import { FOODS, FOOD_BY_ID, packPriceFor, isCorrected, type Aisle, type Food, type FoodTag, type PriceOverrides, type StoreId } from "./food-db";
import { skipReason, EMPTY_SCHEDULE, type DietSchedule } from "./meal-schedule";
import { ingredientFatigue, monotonyCost, newServedLog, recordServing } from "./meal-monotony";
import { planLeftovers } from "./batch-cooking";
import { measureLevers, budgetAdvice, type BudgetAdvice } from "./budget-advice";
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
  // Honey is excluded here and nowhere else: it is an animal product, so vegans
  // don't eat it, but vegetarians do and the pescatarian/omnivore patterns have
  // no reason to care. Before it was tagged, six vegan meals contained honey and
  // the vegan shopping list told people to go and buy a jar of it.
  { id: "vegan", label: "Vegan", excludes: ["meat", "pork", "fish", "dairy", "egg", "honey"] },
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
  /**
   * How much cooking they are up for.
   *
   * "easy" is a PREFERENCE, not a filter. Cutting the book to the 38% of
   * recipes rated easy would leave some slots with a handful of candidates,
   * and the variety rule, the diet rules and the macro targets all need room
   * to move — a plan that hits none of its protein targets but is simple to
   * cook is not the trade anybody asked for. So the easy ones are offered
   * first and the rest stay available. See lib/recipe-difficulty.ts.
   */
  cookLevel?: CookPreference;
  /**
   * A weekly shop they cannot go over, in pounds.
   *
   * The tick box asks "would you rather be cheap"; this asks "how much have you
   * got". They are different questions and only one of them has an answer you
   * can check afterwards, which is why the plan can say whether it managed it.
   * Null means no ceiling — the tick box alone.
   */
  weeklyBudget?: number | null;
  dislikes: string[];   // food ids the athlete never wants to see
  /** Food ids they've said they like. A nudge toward, not a guarantee of. */
  favourites?: string[];
  /**
   * MEAL ids they've starred. A much stronger signal than `favourites`.
   *
   * The two are deliberately separate. `favourites` is ingredients, inferred
   * from a sentence like "I like eggs", and it is a guess about a whole class
   * of food. This is a specific dish the athlete tapped a star on, which is
   * about as unambiguous as preference data gets — so it is worth more, and it
   * also overrides the week-on-week variety rule. Somebody who starred the
   * shakshuka wants the shakshuka again; being told they had it last week is
   * not a reason to take it away from them.
   */
  starred?: string[];
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
  // THE FOODS THE BOX COULD NEVER HEAR. Thirty-one entries had no keywords at
  // all, and they were not obscure ones — mushrooms, avocado, prawns, peppers,
  // halloumi, cucumber. "I don't like mushrooms" is about as ordinary as a
  // sentence in this box gets, and it did precisely nothing. The aromatics are
  // here too: somebody who cannot eat garlic has a real problem, and it is not
  // the app's place to decide that is too small a request to hear.
  garlic: ["garlic"],
  ginger: ["ginger"],
  // NARROW ON PURPOSE. These keywords are read by two things — the dislikes
  // parser and the meal-photo estimator — and the second one punishes a broad
  // match: "curry" alone caught "chicken and a katsu curry sauce" and quietly
  // costed it as 180 kcal of curry paste instead of reporting that it did not
  // know what katsu sauce was. A word that names a DISH cannot name an
  // ingredient here, however natural it feels to add it.
  chilli_fresh: ["chilli", "chili", "chillies", "spicy"],
  spice_mix: ["cumin", "paprika", "turmeric", "spices"],
  curry_paste: ["curry paste"],
  soy_sauce: ["soy sauce", "soya sauce"],
  stock_cubes: ["stock", "stock cubes", "bouillon"],
  lemon: ["lemon", "lemons"],
  honey: ["honey"],
  maple_syrup: ["maple", "maple syrup"],
  pesto: ["pesto"],
  coconut_milk: ["coconut milk"],
  passata: ["passata", "tomato", "tomatoes"],
  hummus: ["hummus", "houmous"],
  peppers: ["pepper", "peppers", "bell pepper"],
  mushrooms: ["mushroom", "mushrooms"],
  courgette: ["courgette", "courgettes", "zucchini"],
  carrots: ["carrot", "carrots"],
  sweetcorn: ["sweetcorn", "corn"],
  peas_frozen: ["peas", "pea"],
  cucumber: ["cucumber"],
  avocado: ["avocado", "avocados"],
  tomatoes_fresh: ["tomato", "tomatoes", "cherry tomatoes"],
  feta: ["feta", "cheese"],
  halloumi: ["halloumi", "cheese"],
  cottage_cheese: ["cottage cheese", "cheese"],
  prawns: ["prawn", "prawns", "shrimp", "fish", "shellfish"],
  edamame: ["edamame", "soya", "soy"],
  noodles: ["noodles", "noodle"],
  couscous: ["couscous"],
  pitta: ["pitta", "pita", "bread"],
  // The second wave of ingredients (see the block at the end of FOODS). A food
  // the notes box cannot name is a food the athlete cannot refuse: "I don't eat
  // pork" has to reach the bacon, or the sentence does nothing.
  oat_milk: ["oat milk", "oatly"],
  almond_milk: ["almond milk"],
  rice_noodles: ["rice noodles", "noodles"],
  corn_tortilla: ["corn tortilla", "tortilla", "taco", "tacos"],
  rice_cakes: ["rice cakes", "rice cake"],
  oatcakes: ["oatcake", "oatcakes"],
  white_fish: ["cod", "white fish", "fish"],
  mackerel_tin: ["mackerel", "fish"],
  sardines_tin: ["sardine", "sardines", "fish"],
  chicken_thigh: ["chicken", "thigh", "thighs"],
  bacon_medallions: ["bacon", "pork"],
  chorizo: ["chorizo", "pork"],
  butter_beans: ["butter bean", "butter beans"],
  kidney_beans: ["kidney bean", "kidney beans"],
  tahini: ["tahini", "sesame"],
  cashews: ["cashew", "cashews"],
  harissa: ["harissa"],
  gochujang: ["gochujang"],
  mozzarella: ["mozzarella", "cheese"],
  kale: ["kale"],
  mango_frozen: ["mango"],
  dates: ["date", "dates"],
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

/**
 * The preferences a plan is ACTUALLY built from.
 *
 * `buildWeek` is pure with respect to all of its inputs, which is what lets the
 * app store a plan as a single seed and rebuild it anywhere. That only works if
 * every caller passes the same inputs — and two of them did not.
 *
 * The Meal plan tab merged the athlete's starred dishes and the foods inferred
 * from their notes into prefs before building. The Today tick-list passed the
 * raw saved prefs. Starring is worth a £30 bonus in the planner and exempts a
 * dish from the had-it-last-week rule, so the moment anyone starred anything,
 * the two screens showed different food for the same day — the plan said one
 * dinner and the thing you tick off said another.
 *
 * One derivation, used by both, so they cannot disagree again. Same reason
 * planTargets exists as a single calculation rather than two.
 */
export function effectiveMealPrefs(
  prefs: MealPrefs,
  notes: string | null | undefined,
  starred: string[] | undefined
): MealPrefs {
  return {
    ...prefs,
    dislikes: [...prefs.dislikes, ...dislikedFoodIds(notes ?? "")],
    starred: starred ?? prefs.starred,
  };
}

export const DEFAULT_PREFS: MealPrefs = {
  pattern: "omnivore", avoid: [], mealsPerDay: 4, budget: false, cookLevel: "any",
  dislikes: [], favourites: [], starred: [],
};

/**
 * Layer saved preferences over the defaults, ignoring the ones that are absent.
 *
 * A PLAIN SPREAD IS WRONG HERE, and quietly. The saved profile is read with
 * `?? undefined` on every field, so an athlete who has never set a diet pattern
 * produces `{ pattern: undefined, avoid: undefined, mealsPerDay: undefined }` —
 * and `{ ...DEFAULT_PREFS, ...that }` is not the defaults, it is undefined
 * three times over. `prefs.avoid.length` then throws, and the only reason it
 * never has is that migration 0030 backfilled every existing row with a
 * default. One row inserted with an explicit null and the meal planner is a
 * blank screen.
 *
 * Absent is not a value — the same rule the rest of this codebase keeps
 * relearning.
 */
export function mergePrefs(base: MealPrefs, saved?: Partial<MealPrefs> | null): MealPrefs {
  const merged = { ...base };
  for (const [key, value] of Object.entries(saved ?? {})) {
    if (value !== undefined && value !== null) (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}

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
 * The method-to-steps logic lives in `recipe-steps.ts` now.
 *
 * Re-exported here because every caller already imports it from this module,
 * exactly as MEALS is below. It moved so that lib/recipe-difficulty.ts — which
 * counts a recipe's steps, and which this module now sorts on — could import it
 * without the two of them forming a cycle.
 */
export { recipeSteps, recipeNote } from "./recipe-steps";

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
 * The recipes live in `meals-data.ts` now.
 *
 * Six hundred lines of dinners inside the scoring engine made both harder to
 * read and impossible to review separately — the maths and the menu change for
 * completely different reasons. Re-exported here because every caller already
 * imports MEALS from this module.
 */
import { MEALS } from "./meals-data";
import { cookRating, type CookPreference } from "./recipe-difficulty";
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

export interface PlannedMeal {
  meal: Meal;
  scale: number;
  macros: Macros;
  /** Set when this plate is the night before's dinner. See applyLeftovers. */
  leftoverFrom?: string;
  /** Set on the dinner that has to be cooked double to make that work. */
  batchFor?: string;
}
export interface SkippedMeal { slot: Slot; reason: string }
export interface PlannedDay {
  day: string;
  meals: PlannedMeal[];
  macros: Macros;
  /** Slots deliberately left unplanned — eating out, fasting, skipped. */
  skipped: SkippedMeal[];
  /**
   * Why this day is the size it is.
   *
   * "even" when the athlete hasn't said which days they train, which is most of
   * them — the plan stays flat rather than guessing. The UI uses this to say so
   * on the day, because a day carrying 300 more calories than yesterday with no
   * explanation reads as a bug rather than as coaching.
   */
  load: "training" | "rest" | "even";
  /**
   * THIS day's calorie target, which is not the week's on a cycled plan.
   *
   * The UI compares the day against it. Without it the calorie bar reads a
   * training day as 12% over and a rest day as 9% under, and the athlete is
   * told they have overeaten on exactly the day the plan fed them more on
   * purpose.
   */
  targetKcal: number;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const cheapest = (a: Meal, b: Meal) => mealCost(a) - mealCost(b);

/**
 * What a serving of this meal costs the WEEK.
 *
 * THIS WAS PRO-RATA AND THAT IS WHY A CHEAP WEEK WAS NOT CHEAP. Charging every
 * ingredient at qty/packSize prices a splash of coconut milk at 17p — and then
 * the shopping list buys the whole £1.20 carton, because you cannot buy 57ml of
 * coconut milk and the rest of it goes off. Measured on a "keep it cheap" week
 * for a 78kg athlete, the pro-rata view understated the milk line by 16x, the
 * coconut milk by 7x and the avocado by 2x. Those three lines and the ones like
 * them are most of what makes a budget week expensive, and the planner could
 * not see any of them.
 *
 * So a serving is priced the way `shoppingList` will charge it:
 *
 *   - anything that KEEPS is pro-rata, because the rest of the bag is still in
 *     the cupboard on Monday and next week's plan will use it;
 *   - anything perishable costs the whole packs it forces, because the leftover
 *     is not next week's, it is the bin.
 *
 * The same rule as `ongoingCost`, which is the number the athlete is judged
 * against — and a planner optimising a different cost from the one it is
 * marked on is a planner that cannot be told it is wrong. Shared by
 * `ongoingPackCost` so the two definitions cannot drift.
 *
 * DELIBERATELY NOT BASKET-AWARE, and deliberately over-charging a perishable
 * used by six meals. This term answers "is this dish dear" — see
 * SERVING_COST_WEIGHT, where the reasoning is set out — and `marginalCost` is
 * the term that knows what is already in the trolley. Making both basket-aware
 * is the lock-in this file has had to fix twice.
 */
function mealCost(meal: Meal, scale = 1): number {
  let c = 0;
  for (const it of meal.items) {
    const f = FOOD_BY_ID[it.foodId];
    if (f) c += ongoingPackCost(f, it.qty * scale);
  }
  return c;
}

/**
 * The portion this meal would actually be served in this slot.
 *
 * WHY THE COST TERMS HAVE TO KNOW. Meals are scored as written and then scaled
 * to land the day on its calorie target, so a 400 kcal bowl in a 700 kcal slot
 * is bought at 1.6 servings and costs 1.6 servings. Scored at 1.0 it looked
 * like the cheapest thing on the list.
 *
 * That is why leaning harder on price used to make the shop DEARER: cost
 * outbids `sizeMismatch` first, so pressure picked small cheap meals, and the
 * scaling step then bought half as much again of each of them. Every step of
 * the ladder spent more money looking for a saving.
 *
 * Same clamp as the scaling step itself — see the note on `scale` there — so
 * the price quoted here is the price that gets paid.
 */
function servedScale(meal: Meal, slotKcal: number): number {
  const kcal = mealMacros(meal).kcal;
  if (slotKcal <= 0 || kcal <= 0) return 1;
  return Math.round(Math.min(1.6, Math.max(0.55, slotKcal / kcal)) * 20) / 20;
}

/**
 * What `qty` of a food costs in an ordinary week.
 *
 * The one definition of "what this actually costs", used by the planner when it
 * scores a meal and by the shopping list when it prices the week. They were two
 * expressions of the same idea and they disagreed, which is the whole bug.
 */
function ongoingPackCost(food: Food, qty: number, unitPrice = food.packPrice): number {
  if (qty <= 0) return 0;
  return food.keeps
    ? (qty / food.packSize) * unitPrice
    : Math.ceil(qty / food.packSize) * unitPrice;
}

function bySlot(slot: Slot, prefs: MealPrefs): Meal[] {
  const ok = MEALS.filter((m) => m.slot === slot && mealAllowed(m, prefs));
  // Cooking level is NOT applied here. Ordering the candidate list only shifts
  // a tie-break worth a tenth of a penny — the same reason `seed` decided
  // nothing for so long — and sorting the pool easy-first moved a simple week
  // from 33% easy to 39%. It is a real preference, so it is priced in the
  // score like every other real preference. See FAFF_WEIGHT.
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
/**
 * Whole packs, because shops sell whole packs — and because the planner needs
 * to feel that.
 *
 * PRICING THIS PRO-RATA WAS TRIED AND IS WRONG, which is worth recording since
 * the argument for it is a good one: a 500ml bottle of oil used 165ml a week
 * lasts three weeks, so charging the whole £3.50 every week overstates it. True
 * of the SHOPPING LIST, where `ongoingCost` now says exactly that. False here.
 *
 * What this number does is stop the planner opening a new cupboard line for a
 * pinch of something. Softened to per-gram, opening a jar became almost free
 * and the planner opened fifteen of them, while the till still charged fifteen
 * whole jars. Measured over 54 plans, amortising a keeps pack over N weeks:
 *
 *   N=1 (this)   flavour-shelf meals 99%   shop £106.31
 *   N=2          96%                       £109.70
 *   N=3          92%                       £115.57
 *   N=6          86%                       £133.29
 *
 * Both worse, in the same direction, the whole way. The suspicion that pack
 * pricing was taxing seasoning out of the menu is simply not true — 99% of
 * meals already carry something off the flavour shelf, and it is this term that
 * keeps them concentrated in a few jars rather than spread over the aisle.
 */
function packCost(foodId: string, qty: number): number {
  const f = FOOD_BY_ID[foodId];
  if (!f || qty <= 0) return 0;
  return Math.ceil(qty / f.packSize) * f.packPrice;
}

/**
 * The trolley as it stands, from meals already planned.
 *
 * Exported so the swap sheet can ask what a change would cost. Swapping one
 * dinner is the athlete's main lever on the shop once the week is built, and
 * until now it was the only one they had to pull blind: the sheet ranked
 * alternatives by how well they fit the slot and said nothing at all about
 * money, so somebody who had just told the app they were on a budget picked
 * their replacement with no idea whether it was the £1 option or the £4 one.
 */
export function basketOf(meals: { meal: Meal; scale?: number }[]): Basket {
  const basket: Basket = new Map();
  for (const m of meals) addToBasket(m.meal, basket, m.scale ?? 1);
  return basket;
}

/**
 * What adding this meal does to an ORDINARY WEEK's bill.
 *
 * The sibling of `marginalCost`, and the difference is which question is being
 * asked. `marginalCost` prices whole packs because it is the planner's "do not
 * open a new cupboard line for one pinch" signal. This one prices the way the
 * athlete is charged — keeps pro-rata, perishables by the pack, see
 * `ongoingPackCost` — because it answers "does this swap cost me anything",
 * and a bag of rice you will finish over three weeks does not cost a whole bag
 * to use once.
 *
 * Both read zero for a pack already in the basket, which is the honest answer:
 * a second meal using the spinach you have already bought is free.
 */
export function ongoingMarginalCost(meal: Meal, basket: Basket, scale = 1): number {
  let delta = 0;
  const after = new Map(basket);
  for (const it of meal.items) {
    const food = FOOD_BY_ID[it.foodId];
    if (!food) continue;
    const have = after.get(it.foodId) ?? 0;
    const want = have + it.qty * scale;
    delta += ongoingPackCost(food, want) - ongoingPackCost(food, have);
    after.set(it.foodId, want);
  }
  return delta;
}

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
 * How much worse a fit the planner will accept to stop serving one ingredient
 * every day, in pounds.
 *
 * Only SIZE can move. The second pass already requires a replacement either to
 * be at least as protein-dense as what it displaces or to leave the day at its
 * target, so of the three things in `fit` this tolerance can buy nothing but
 * calorie mismatch — a slightly small dinner, never a thin one.
 *
 * Swept over the 90-plan audit. It is a small effect and, unusually, it is free
 * in both directions:
 *
 *   0    top ingredient 6.2 days a week   £109.66
 *   3    6.1                              £110.24
 *   6    6.0                              £108.48
 *   12   6.0                              £108.24
 *
 * Six is where it stops moving. It comes out CHEAPER than zero rather than
 * dearer, which is not the trade this looked like it would be: a wider door
 * lets the pass find a fresher meal whose ingredients are already in the
 * trolley, instead of settling for a repeat. Twelve buys nothing further, so
 * this stops at the knee rather than taking slack it has no use for.
 */
const INGREDIENT_FIT_TOLERANCE = 6; // £

/**
 * What eating a different protein may add to the WEEK's shop, in pounds.
 *
 * A PER-WEEK CAP, and it has to be, because a per-slot allowance does not
 * compose. Every other budget in this file is spent one meal at a time, which
 * works when the thing being bought is a different recipe — its ingredients are
 * mostly already in the trolley. A different PROTEIN is a whole new pack, and a
 * pack is a fixed cost amortised over however many meals use it.
 *
 * That difference is invisible on a full week and glaring on a short one. This
 * pass, budgeted per slot, cost an athlete cooking every night £1 and an
 * athlete eating out twice SIXTEEN pounds — reproducing exactly the inversion a
 * previous round removed the old slot-scaling to fix: telling the app you eat
 * out on Tuesdays made your shop dearer, which is indefensible however varied
 * the week is.
 *
 * Measured in real money rather than score, because "at most £10 a week" is a
 * promise that can be kept and checked, and the score is not pounds of
 * shopping. Scaled by how much of the week is cooked — see `ingredientBudget`.
 *
 * Swept against both invariants at once, which is the only way it means
 * anything: the ingredient rotation has to be strong enough that an omnivore
 * with real choice is not served one protein all week, and weak enough that
 * eating out twice still makes the shop cheaper rather than dearer.
 *
 *        one ingredient owns the week?   eating out cheaper?   shop
 *   £6   no                              NO                    £104.88
 *   £8   no                              yes                   £105.41
 *   £10  yes                             yes                   £105.69
 *   £14  yes                             yes                   £106.12
 *
 * Ten is the first value that satisfies both. Fourteen buys nothing further and
 * costs another 43p, so this stops at the point the two constraints meet rather
 * than taking slack neither of them asked for.
 */
const INGREDIENT_WEEKLY_BUDGET = 10; // £

/**
 * AN OMNIVORE WAS BEING SERVED A VEGAN PLAN.
 *
 * Measured over four consecutive weeks for a bulking omnivore with no
 * restrictions at all: 112 meals, of which 8 contained meat and 12 contained
 * fish. Eighty-two per cent of what the app told them to cook was plant
 * protein, and in budget mode it was a hundred per cent — not one meat or fish
 * meal in a month. The book holds 24 meat dishes and 20 fish ones. They were
 * simply never reached.
 *
 * WHY, EXACTLY. `proteinShortfall` is clamped at zero, so every meal that meets
 * the athlete's protein density scores an identical 0 on the term that is
 * supposed to represent nutrition. A chicken tikka traybake at 0.104 g/kcal and
 * a tofu satay at 0.057 both clear a bulking athlete's 0.045 target, so both
 * score zero, and from there the only thing separating them is money. Animal
 * protein is dearer per serving in every single case — £16.99 against £13.87
 * averaged across dinners — so it loses every time, on every day, forever.
 *
 * That is a cheapest-adequate-basket optimiser, and it produces a defensible
 * shopping list and an indefensible plan. Somebody who told the app they eat
 * everything and gets lentils for a month has been ignored, and they will say
 * the recipes are bad rather than that the optimiser is working correctly.
 *
 * The pattern is a PREFERENCE, not only a filter. It has only ever been read as
 * a list of exclusions — see `mealAllowed` — so nothing anywhere expressed the
 * positive half of "I eat meat and fish".
 *
 * So the same shape as the ingredient rotation below it: a bounded weekly
 * allowance, spent only to keep the athlete's stated protein sources on their
 * menu, and unable to cost protein or to undo either rotation. Swept over five
 * athletes on both patterns that have a source, four consecutive weeks each:
 *
 *    allowance   meat-or-fish mains   weekly shop   days under 90% protein
 *          off                  27%       £106.05                     0.0%
 *           £4                  42%       £112.55                     0.0%
 *           £6                  39%       £110.12                     0.0%
 *          £10                  41%       £109.52                     0.0%
 *          £14                  44%       £111.37                     0.0%
 *          £20                  49%       £114.75                     0.0%
 *          £28                  51%       £115.66                     0.0%
 *
 * Ten. It buys the first and biggest half of the gap — 27% to 41% for £3.47 a
 * week — and the rate turns after it: twenty costs £8.70 for another eight
 * points. The £4 and £6 rows are out of order against each other, which is pack
 * rounding rather than signal, and is the reason for choosing on the shape of
 * the curve rather than on any single row.
 *
 * Per athlete it takes the worst omnivore case from 18% of mains to 36% and the
 * average from 35% to 49%; the worst pescatarian from 9% to 29%. Not one day in
 * the sweep landed under 90% of its protein target, before or after, which is
 * the guarantee the pass is built around rather than a happy result.
 *
 * BUDGET MODE IS EXCLUDED, exactly as it is excluded from dish and ingredient
 * variety — that tick means "I would rather have the money", and this is the
 * one preference the money argument genuinely does answer. It is not a free
 * inclusion either: run for budget shoppers it took their meat-or-fish mains
 * from 0% to 18% and their shop from £88.28 to £96.03, a 9% rise. The cause is
 * the lock-in this file documents twice already — marginal cost reads near zero
 * for anything already bought, so a gate written in marginal pounds does not
 * bind on the term (`mealCost * servingCostWeight`) that keeps dear food out of
 * a budget week.
 */
const SOURCE_WEEKLY_BUDGET = 10; // £

/**
 * What share of an athlete's main meals should carry the protein they eat.
 *
 * Half. Not all of them, because plant-protein dinners are good food and the
 * book's best dishes are among them; not a token one or two, because that is
 * what the plan already did and it is what prompted this. Applied to lunches
 * and dinners only — a meat breakfast is a minority taste and forcing one would
 * be the same mistake in the other direction.
 */
const SOURCE_SHARE = 0.5;

/** The protein sources each pattern positively includes, rather than excludes. */
const PATTERN_SOURCES: Record<DietPattern, FoodTag[]> = {
  omnivore: ["meat", "fish"],
  pescatarian: ["fish"],
  // Nothing to keep on the menu: for these two the pattern's exclusions already
  // describe the whole preference, and the pass below correctly does nothing.
  vegetarian: [],
  vegan: [],
};

/**
 * The sources this athlete's pattern positively includes.
 *
 * Not filtered against their avoidances or dislikes, and deliberately so: the
 * pool this pass chooses from has already been through `mealAllowed`, which is
 * the one place exclusions are applied. Re-deriving them here would be a second
 * copy of that logic, free to drift from the first — and it would still not be
 * the thing that keeps a disallowed dish off the plate, because the pool is.
 */
function statedSources(prefs: MealPrefs): FoodTag[] {
  return PATTERN_SOURCES[prefs.pattern];
}

function carriesSource(meal: Meal, sources: FoodTag[]): boolean {
  if (!sources.length) return false;
  const tags = mealTags(meal);
  return sources.some((s) => tags.includes(s));
}

/**
 * What a fresh dish is allowed to add to the shopping bill, per meal.
 *
 * The reason last week's meals keep winning is not that they're better — it's
 * that their ingredients are already in the trolley, so they cost nothing at
 * the margin while an unfamiliar dish drags a new pack in behind it. Preferring
 * the unseen meal with no cap at all does produce the most variety (69% of the
 * week turning over) and puts £24 a week on the shop, which nobody asked for.
 *
 * Swept over four athletes and seven diet patterns, five weeks each, at £3:
 *
 *   - 51% of slots differ from last week, against 0% before any of this
 *   - 11% of each week is a dish the athlete has never been served
 *   - 20.9 distinct meals a week, up from 19.1
 *   - days missing their protein target: 2.5%, against 2.7% before — variety
 *     costs nothing here because `fit` is guarded separately
 *   - £105 against £100
 *
 * A fiver buys 55% and £24 buys 69%, so the curve flattens hard just past
 * here. Budget mode is the lever for anyone who would rather have the £5.
 *
 * FLAT, not scaled to the slot's calories, though that was tried: a 203 kcal
 * snack getting the same licence as a 1,100 kcal dinner looks obviously wrong,
 * and scaling it by size dropped week-on-week change from 61% to 42% while
 * doing nothing about the bill. The apparent problem it was meant to solve —
 * a 15% jump between week one and week two — was a measurement artefact.
 * Week one is the cost-optimal week by construction, because nothing has been
 * eaten yet, so every subsequent week compares badly against it. Averaged over
 * five consecutive weeks, which is what an athlete actually pays, it is 5%.
 */
/**
 * How far a training day's calories sit above the athlete's weekly average.
 *
 * 12% either side is enough to be visible on the plate — roughly a whole extra
 * snack on a hard day — without producing a rest day nobody would stick to. The
 * real ceiling on going further is that carbohydrate is doing all the moving:
 * protein is held, so at 25% a rest day starts demanding a protein density most
 * of the book can't reach, and the planner buys the deficit out of the one
 * macro that was never supposed to move.
 */
const CYCLE_DEPTH = 0.12;
const VARIETY_BUDGET = 3; // £ per meal

/**
 * What a starred dish is worth against everything else in the slot.
 *
 * Bigger than FAVOURITE_BONUS (5.0) because it is a far better signal: that one
 * is inferred from a sentence and covers a whole ingredient class, while this is
 * a dish the athlete deliberately tapped a star on.
 *
 * Swept by starring each of 339 athlete/meal combinations in turn and counting
 * whether the star was honoured:
 *
 *      bonus   appearances/wk   stars ignored   worst day off target
 *          8            0.92        156 (46%)                  10.0%
 *         12            1.43        104 (31%)                  10.7%
 *         30            2.80          11  (3%)                  15.6%
 *         50            3.00           0  (0%)                  30.1%
 *
 * 30. Starring something and never once seeing it is the failure that matters —
 * at 12 it happened to a third of stars, which would read as the button not
 * working. Past 30 the last few percent are bought by forcing dishes into slots
 * they do not fit, and a day 30% off its calorie target is not a plan.
 *
 * The 3% that stay unhonoured are meals whose size is hopeless for that slot: a
 * 524 kcal stir-fry starred into a 1,026 kcal dinner. Portions scale 0.55x-1.6x
 * and no bonus should override that, because the result is a plate nobody would
 * serve.
 */
const STARRED_BONUS = 30; // £

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
 *
 * MOVED TO ./meal-variety, where it gained the two things it was missing: WHEN
 * the dish was last served, and WHAT it is made of. Counting servings alone let
 * three identical days sit next to each other, and counting recipes alone let
 * seven different tofu dinners register as seven different dinners.
 */

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
  // A meal with no calories has no density to judge; one with no PROTEIN is
  // maximally short, and must not be confused with it.
  if (mealMacros(meal).kcal <= 0) return 0;
  return Math.max(0, (requiredPerKcal - proteinDensity(meal)) / requiredPerKcal);
}

/** Grams of protein per calorie. Zero for a meal with no calories in it. */
function proteinDensity(meal: Meal): number {
  const m = mealMacros(meal);
  return m.kcal > 0 ? m.protein / m.kcal : 0;
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
  swaps: MealSwaps = {},
  /**
   * Meal ids served in the PREVIOUS plan, so the next one can move on.
   *
   * WHY A SEED WAS NEVER GOING TO DO THIS. `seed` shifted a tie-break worth a
   * tenth of a penny against terms weighted 4, 8 and 35, so it decided nothing:
   * measured across three athletes and three diet patterns, every seed from 0
   * to 5 produced the byte-identical week, and "Regenerate week" had therefore
   * never once returned a different plan. Widening the seed range from 3 to 997
   * — an earlier attempt at this same complaint — changed nothing, because the
   * range was not the problem.
   *
   * Raising the rotation's weight is not the fix either. Swept to fourteen
   * pounds a slot it still moved only 6% of the week, because the top-scoring
   * meal for a given athlete and slot genuinely IS better than the rest, by a
   * wide margin, and that margin is the whole point of the size and protein
   * terms. Anything strong enough to overturn it on merit is strong enough to
   * hand someone a badly-fitting meal.
   *
   * So the planner remembers instead. Week-on-week variety is the same problem
   * as day-on-day variety, one level up, and it takes the same mechanism: last
   * week's meals arrive already carrying repeat cost, so this week reaches past
   * them unless nothing better exists. It stays a COST and never a ban, which
   * is what keeps a narrow diet from running out of food.
   */
  recent: string[] = [],
  /**
   * How hard to lean on price, as a multiplier on the two cost terms.
   *
   * NOT A PREFERENCE, which is why it is a parameter and not a field on
   * MealPrefs: nothing in the UI sets it and nothing persists it. It exists so
   * `planWithinBudget` can ask the same planner the same question at four
   * different intensities and keep the cheapest answer that is still a
   * defensible week. 1 is the ordinary plan.
   */
  costPressure = 1
): PlannedDay[] {
  const pools: Record<Slot, Meal[]> = {
    Breakfast: bySlot("Breakfast", prefs), Lunch: bySlot("Lunch", prefs),
    Dinner: bySlot("Dinner", prefs), Snack: bySlot("Snack", prefs),
  };

  const basket: Basket = new Map();
  // Dishes AND ingredients, with the day each was last served. See
  // ./meal-variety for why a bare serving count was not enough.
  const served = newServedLog();

  /**
   * Last week's picks, entered into the repeat counter at a discount.
   *
   * Discounted because a repeat NEXT week is a much smaller sin than a repeat
   * on Tuesday when you ate it on Monday, and because `repeatCost` escalates
   * — feeding raw counts in would make anything served three times last week
   * effectively unreachable, which is how you starve a vegan's Thursday.
   *
   * Held separately from the served log so it does not count toward MAX_REPEATS: last
   * week must not be able to cap a meal out of this week entirely.
   */
  const lastWeek = new Map<string, number>();
  for (const id of recent) lastWeek.set(id, (lastWeek.get(id) ?? 0) + 1);

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
  /**
   * WHAT AN INVOLVED RECIPE COSTS SOMEBODY WHO ASKED FOR SIMPLE FOOD, in pounds.
   *
   * Priced into the score for the same reason budget mode had to be. Sorting
   * the candidate list changes almost nothing, because the top-scoring meal for
   * an athlete and a slot genuinely is better than the rest by a wide margin —
   * ordering the pool easy-first moved a simple week from 37% easy to 39%,
   * which is not a preference anybody would notice they had set.
   *
   * A PRICE, NOT A FILTER, and that is the whole design. Cutting the book to
   * the 38% rated easy leaves some slots with a handful of candidates, and the
   * variety, diet and protein rules all need room to move. A simple week that
   * misses its protein target every day is not the trade anybody asked for.
   *
   * Swept over 24 athlete/diet/seed combinations, reporting everything the
   * weight can spend:
   *
   *     weight   easy   protein short   distinct meals   shop
   *        0      37%            0.0%             24.7   £107.52
   *        3      61%            0.0%             22.9   £110.85
   *        5      67%            0.0%             21.3   £111.06
   *        8      71%            0.0%             20.4   £111.29
   *       12      75%            1.2%             19.6         —
   *
   * 5. Protein is untouched right up to 12, so the real currency here is
   * VARIETY: leaning harder buys easy dinners with repetition, and by 8 the
   * week has lost four distinct dishes for four more points of ease. Two thirds
   * of the week is a preference you can feel, and "keep it simple" was never a
   * promise that every single meal would be.
   *
   * The shop goes up about £3.50 — three per cent — because simple food is
   * slightly less pack-efficient. Anybody who cares about that has "keep it
   * cheap" beside this, and the two can be ticked together.
   */
  const FAFF_WEIGHT = 5;
  const faff = (meal: Meal) =>
    prefs.cookLevel === "easy" ? cookRating(meal).score * FAFF_WEIGHT : 0;

  /**
   * A £ ceiling IS budget mode, with a number attached. Someone who says they
   * have sixty pounds has told you at least as much as the tick box does.
   */
  const thrifty = prefs.budget || prefs.weeklyBudget != null;
  const budgetScale = thrifty ? 0.35 : 1;
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
  /**
   * How hard the MARGINAL cost of a meal counts — what the extra packs cost on
   * top of what is already in the trolley.
   *
   * Dropped from 2.5 to 1.5 when the book went from 143 recipes to 195. Marginal
   * cost reads near zero for anything whose ingredients are already in the
   * basket, so weighting it heavily makes budget mode lock on: it bought one £9
   * salmon pack and every further salmon dinner then looked free. Measured on a
   * 95kg athlete building, budget mode came out at £106.55 against £93.95 for
   * not using it at all. Sharing the weight with the pro-rata term below fixes
   * it — see SERVING_COST_WEIGHT, which was swept jointly with this.
   *
   * RAISED TO 2 AT 256 RECIPES, and this is the third time this pair has had to
   * move for the same reason: the right weights depend on how much choice there
   * is, so every substantial addition to the book invalidates the last sweep.
   * At 1.5/4 two of 36 athlete/diet combinations came out DEARER in budget
   * mode, one of them by £6.45 — the exact failure `budget mode is cheaper for
   * every athlete` exists to catch, and it caught it.
   *
   * Swept jointly again over 36 combinations, reporting both things that matter
   * rather than only the money:
   *
   *      pair    dearer   avg saving   budget days under 90% protein
   *    1.5/4       2/36        £15.99                           0.4%
   *    1.75/4      2/36        £15.59                           0.8%
   *    1.9/4       1/36        £15.67                           2.8%
   *    2/4         0/36        £15.52                           2.8%
   *    2/4.5       0/36        £14.89                           0.8%
   *    2/5         0/36        £16.83                           2.4%
   *    1.5/6       0/36        £19.64                           2.0%
   *
   * 2/4.5. It is the only pairing that is clean on the constraint AND keeps the
   * protein where it was — every other zero-dearer option buys the last pound or
   * two of saving out of the athlete's protein target, which is the trade this
   * file has refused four times now. 1.5/6 saves the most and takes the worst
   * budget day down to 71% of target; nobody ticked a box asking for that.
   */
  /**
   * RE-SWEPT AT 1.5 once a serving was priced the way the week is charged.
   *
   * The pairing below was chosen against a pro-rata serving cost, and that cost
   * was wrong — see `mealCost`. Re-running the same 48-combination sweep with
   * the corrected definition, and scoring it on `ongoingTotal` (what the
   * athlete is judged against) rather than the till total:
   *
   *      pair    dearer   avg weekly saving   budget days under 90% protein
   *    1.5/2.5     0/48              £16.61                            0%
   *    1.5/3.5     0/48              £17.99                            0%
   *    1.5/4.5     0/48              £20.60                            0%
   *      2/3.5     0/48              £18.10                          0.9%
   *      2/4.5     0/48              £18.48                            0%
   *      3/4.5     0/48              £19.00                          4.5%
   *
   * 1.5/4.5 — clean on both constraints and £2.12 a week better than the pair
   * it replaces. Going the other way on this weight (3) buys its last pound out
   * of the protein target, which is the trade this file has now refused five
   * times.
   */
  const costWeight = (thrifty ? 1.5 : 1) * costPressure;
  /**
   * AND IT HAS TO WEIGHT WHAT A DISH COSTS, not only what it adds today.
   *
   * `costWeight` above amplifies MARGINAL cost — what the trolley goes up by,
   * given what's already in it. That is the right number for "do I need
   * another bag of rice" and the wrong one for "is salmon expensive", because
   * once a pack is in the basket its marginal cost is zero. Amplifying a
   * gradient that reads zero for anything already bought produces lock-in: the
   * first expensive thing picked becomes the cheapest-looking option for the
   * rest of the week, and budget mode's softened repeat penalty doesn't push
   * back.
   *
   * It happened. Budget mode was picking salmon FIVE times and prawns three —
   * the two dearest proteins in the database — landing a £113.40 shop against
   * the normal plan's £104.65, on fourteen distinct meals instead of twenty.
   * Less variety AND more money, which is both of the things it promises not
   * to do.
   *
   * So the pro-rata cost of a serving is scored too. It doesn't care what's in
   * the basket, so it never reads zero, and a budget shopper avoids salmon for
   * the reason a real one does: salmon is dear.
   *
   * Swept over five athletes and four diet patterns, and RE-SWEPT after the
   * lean tier was added, because the right weight depends on what's in the
   * book: at 1 it was clean on 20 combinations, and eighteen new recipes later
   * it was letting a bulking vegan's budget shop come out at £89.90 against
   * £84.55. That is what `budget mode is cheaper for every athlete` exists to
   * catch, and it caught it.
   *
   * RE-SWEPT AGAIN at 195 recipes, this time JOINTLY with `costWeight` below,
   * because the two spend against each other and sweeping either alone finds a
   * false floor: at the old 2.5/3 pairing six of 96 athlete/diet combinations
   * came out DEARER in budget mode, and no value of this weight alone fixed
   * them — at 0 it was still three of sixteen, which is what proved the lock-in
   * was coming from the marginal term rather than from here.
   *
   * At 1.5/4: none of 96 combinations comes out dearer, average weekly saving
   * £14.50. It is a plateau rather than a knife-edge — 1.5 paired with 4, 5 or 6
   * is clean throughout — which is the difference between a calibration and a
   * coincidence.
   *
   * Going further is tempting, because the saving keeps climbing. It gets
   * bought with food: the protein target starts going missing, which is budget
   * mode deciding the athlete would rather be cheap than fed. Nobody ticked
   * that box.
   */
  const SERVING_COST_WEIGHT = 4.5;
  const servingCostWeight = (thrifty ? SERVING_COST_WEIGHT : 0) * costPressure;

  /**
   * PRESSURE MUST NOT BE SPENDABLE ON PROTEIN.
   *
   * Both money terms above scale with `costPressure` and PROTEIN_WEIGHT did
   * not, so every step up the budget ladder made food nine, then twenty-seven
   * times louder than nutrition. The search duly found cheaper weeks by buying
   * less protein: a 58kg athlete on a 128g target was offered a £32 week whose
   * worst day carried 76g, and `feedsThem` threw every one of them out. The
   * ladder looked like it was failing to find savings. It was finding nothing
   * BUT savings, in the one currency it was not allowed to spend.
   *
   * This is the same failure the `fit` split above was written for, one level
   * up: when two things live in one number, the cheaper one always pays.
   * Raising the protein term in step means pressure now has to find cheap
   * PROTEIN — lentils, eggs, tinned fish, beans — instead of cheap calories,
   * which is what a budget plan is supposed to mean.
   *
   * Scaled by pressure^0.65 rather than linearly: matching pressure exactly
   * would freeze the trade-off and the ladder would return the same week at
   * every rung, which is just a slower way of not searching.
   *
   * The exponent was swept at 0.5, 0.65, 0.8 and 1.0 against the three
   * reference athletes. 0.5 left a 58kg athlete cutting at £51.36; 0.65 takes
   * her to £48.12 and costs a 95kg athlete building £0.99. Above 0.65 she gets
   * DEARER again — protein starts being bought where it was not needed — so
   * this is a measured minimum rather than "more is better".
   */
  const proteinWeight = PROTEIN_WEIGHT * (thrifty ? Math.pow(costPressure, 0.65) : 1);
  /**
   * Budget mode does not pay for variety.
   *
   * A new dish means a new pack, so week-on-week rotation has a price — about
   * 5% on an average shop, but 13% for a lean athlete cutting, whose basket is
   * small and whose food comes in small packs. Someone who ticked "cheap
   * staples" has already answered the question that trade poses. Charging them
   * for a change of menu they didn't ask for was also, concretely, making
   * budget mode come out DEARER than not using it for a bulking vegan.
   */
  const varietyBudget = prefs.budget ? 0 : VARIETY_BUDGET;
  const favourites = new Set(prefs.favourites ?? []);
  /**
   * Dishes the athlete starred.
   *
   * Worth more than an inferred ingredient preference (see STARRED_BONUS) and,
   * below, exempt from the had-it-last-week rule — a star is a request for the
   * dish to keep coming back, so variety must not quietly undo it.
   */
  const starred = new Set(prefs.starred ?? []);

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
  /**
   * HARD DAYS AND EASY DAYS ARE NOT THE SAME DAY.
   *
   * Every day of the plan used to carry identical calories, so an athlete
   * training Tuesday and Thursday ate the same on Sunday as on a double
   * session. That is the single biggest reason a plan reads as generic: it is
   * the one thing about their week the plan visibly ignored.
   *
   * Calories move, PROTEIN DOES NOT. Protein is a daily floor tied to
   * bodyweight and it does not care what you did that day; carbohydrate is the
   * fuel and it is what should follow the work. So the day's calorie target
   * scales and its protein target is held, which means the density the planner
   * demands goes UP on a rest day — fewer calories, same grams.
   *
   * The week still averages to the athlete's target: whatever the training days
   * gain, the rest days give back. `CYCLE_DEPTH` is capped so that a five-day
   * trainer with two rest days doesn't end up with a rest day 30% down — the
   * shortfall is spread over however many rest days there are, and the depth
   * shrinks to keep the easiest day within 12% of target.
   */
  const trainingDays = new Set(schedule?.trainingDays ?? []);
  const hardCount = trainingDays.size;
  const easyCount = DAYS.length - hardCount;
  const depth = hardCount > 0 && easyCount > 0
    ? Math.min(CYCLE_DEPTH, CYCLE_DEPTH * (easyCount / hardCount))
    : 0;
  const dayScale = (dayIndex: number): number =>
    depth === 0 ? 1
      : trainingDays.has(dayIndex) ? 1 + depth
      : 1 - depth * (hardCount / easyCount);

  const dayCalories = (dayIndex: number) => targets.calories * dayScale(dayIndex);
  // Protein per calorie RISES as calories fall, because the grams stay put.
  const proteinPerKcalOn = (dayIndex: number): number => {
    const kcal = dayCalories(dayIndex);
    return kcal > 0 ? targets.protein / kcal : 0;
  };

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
  /**
   * NO LONGER SCALED BY HOW MANY SLOTS THE WEEK HAS.
   *
   * It used to be `* min(1, weeklySlots / 28)`, added to stop a shorter week
   * being spread across more distinct dishes than it could amortise packs
   * over — the bug where telling the app you eat out twice made the shop
   * DEARER, £104 against £100.
   *
   * Right diagnosis, wrong lever: it treated a pack-amortisation problem by
   * suppressing variety, and it only half-worked even then. At 195 recipes it
   * had stopped working altogether and started causing the inversion it was
   * added to fix. Removing it is what actually fixes it — eating out on
   * Tuesdays and Thursdays now costs £90.30 against £100.10 for cooking every
   * night, which is the direction an athlete would expect.
   *
   * A global cost pass over the finished week was tried instead and dropped. It
   * did save 6.5%, but it re-planned 20 of 28 slots when the athlete swapped a
   * single dinner. A swap is not a regenerate, and nobody wants Monday's
   * breakfast to move because they changed their mind about Wednesday.
   */
  const repeatPenalty = REPEAT_PENALTY * budgetScale;

  /**
   * The ingredient rotation's allowance, scaled to how much of the week is
   * actually cooked — and this one genuinely is a pack-amortisation problem,
   * which is what makes the scaling right here and wrong for `repeatPenalty`.
   *
   * The note above explains why slot-scaling was removed from the dish repeat
   * penalty: it treated a pack problem by suppressing variety, which is the
   * wrong lever for a term about recipes, whose ingredients are mostly in the
   * trolley already. A different PROTEIN is a different matter. It is a whole
   * new pack, a fixed cost divided by however many meals use it, so what an
   * athlete can afford to diversify falls with the number of meals they cook.
   *
   * Left flat, this pass put £16 on the shop of someone eating out twice a week
   * against £1 for someone cooking every night, and re-created the inversion
   * that removal was meant to end — telling the app you eat out on Tuesdays
   * made your shopping DEARER. Budget mode scales it too, for the same reason
   * it scales everything else: that tick means "I would rather have the money".
   */
  const ingredientBudget = INGREDIENT_WEEKLY_BUDGET * Math.min(1, weeklySlots / 28) * budgetScale;

  const shareTotal = wanted.reduce((s, w) => s + SLOT_SHARE[w.slot], 0);
  /**
   * The calories this slot should carry.
   *
   * Deliberately computed from the FULL day, including meals being eaten out.
   * Scaling only the remaining meals would inflate breakfast to cover a
   * restaurant dinner, which is not what anyone wants.
   */
  const slotKcal = (slot: Slot, dayIndex: number): number =>
    shareTotal > 0 ? dayCalories(dayIndex) * (SLOT_SHARE[slot] / shareTotal) : 0;

  /**
   * The day's protein, banked as it is filled.
   *
   * WHY THIS EXISTS. The ingredient rotation below sometimes wants a slightly
   * less protein-dense meal — a different dinner instead of tofu for the fifth
   * time — and whether that is affordable is a fact about the DAY, not about
   * the meal. Judging it per meal is what broke the first two attempts: a dense
   * breakfast looks over-provisioned on its own, but its surplus is what covers
   * a thinner lunch, so spending it twice took vegan weeks from 98% of target
   * to 86%.
   *
   * Counted in slot-target calories rather than the recipe's own, because every
   * meal is scaled to its slot afterwards and scaling preserves density. So
   * these two running totals are what the finished day will actually contain.
   *
   * Reset by `buildDay`. A day that cannot reach its requirement at all — a
   * vegan cut, usually — simply never has anything spare, and the rotation
   * below correctly does nothing for them.
   */
  let dayProtein = 0;
  let daySlotKcal = 0;

  /**
   * Pounds the ingredient rotation has already added to this week's shop.
   *
   * Runs for the whole week rather than resetting per day, because a pack is
   * bought once and the promise being kept is about the shop, not the Tuesday.
   */
  let ingredientSpend = 0;

  /**
   * Keeping the athlete's stated protein sources on their menu — see
   * SOURCE_WEEKLY_BUDGET for the measurement that made this necessary.
   *
   * Counted over main meals only, and over the WEEK rather than the day: an
   * athlete eating chicken at four of their fourteen lunches and dinners has a
   * mixed week, and demanding one every day would be the same rigidity in the
   * opposite direction.
   */
  const sources = statedSources(prefs);
  // Zero in budget mode, which switches the pass off entirely rather than
  // merely tightening it — see SOURCE_WEEKLY_BUDGET for why a gate written in
  // marginal pounds does not hold a budget week down on its own.
  const sourceBudget = prefs.budget ? 0 : SOURCE_WEEKLY_BUDGET;
  let sourceSpend = 0;
  let mainsServed = 0;
  let sourcesServed = 0;

  /** Would serving this leave the day, so far, still at or above target? */
  const staysOnTarget = (meal: Meal, slot: Slot, dayIndex: number): boolean => {
    const kcal = slotKcal(slot, dayIndex);
    const need = proteinPerKcalOn(dayIndex);
    if (need <= 0 || kcal <= 0) return true;
    return dayProtein + proteinDensity(meal) * kcal >= need * (daySlotKcal + kcal) - 1e-9;
  };

  const bank = (meal: Meal, slot: Slot, dayIndex: number): void => {
    const kcal = slotKcal(slot, dayIndex);
    dayProtein += proteinDensity(meal) * kcal;
    daySlotKcal += kcal;
  };

  const choose = (slot: Slot, dayIndex: number, nth = 0, avoid: Set<string> = new Set()): Meal | undefined => {
    const list = pools[slot].filter((m) => !avoid.has(m.id));
    if (!list.length) return undefined;
    const ranked = list
      .map((meal, idx) => {
        /**
         * How well this meal suits THIS ATHLETE in THIS SLOT, in pounds.
         *
         * Split out from the money terms because the two are spendable on
         * completely different things. An extra pack in the trolley is a fair
         * price for a different dinner — plenty of people would pay it — and a
         * day 15% short of its protein target is not a price anyone agreed to.
         * Keeping them in one number meant variety could only be bought by
         * spending whichever was cheapest, which was always the nutrition.
         */
        const fit = proteinShortfall(meal, proteinPerKcalOn(dayIndex)) * proteinWeight
          // How far this meal's own calories sit from what this slot should
          // carry, so a big athlete is offered big meals rather than a small
          // one scaled past the point of sense.
          + sizeMismatch(meal, slotKcal(slot, dayIndex)) * SIZE_WEIGHT
          // How tired of this dish the athlete would be — how often this week,
          // and how recently. Sits in `fit` rather than beside it so the
          // variety tie-break below inherits it: a contender has to be at least
          // as good as the winner on fit, which now includes not being
          // yesterday's dinner.
          // The serving count is budget-scaled; WHEN it lands is not, because
          // rearranging a week costs nothing at the till.
          + monotonyCost(served, meal, dayIndex, repeatPenalty, REPEAT_PENALTY);
        return {
          meal,
          fit,
          // The seed/nth term is a fraction of a penny — it only breaks ties
          // between meals that cost the same, never overrides a real saving.
          // A meal built round something they said they like is discounted, so
          // it wins ties and near-ties. Deliberately a nudge and not an
          // override: "I like eggs" should mean eggs turn up regularly, not
          // eggs at every meal, and the repeat penalty still applies on top.
          score: marginalCost(meal, basket, servedScale(meal, slotKcal(slot, dayIndex))) * costWeight
            + mealCost(meal, servedScale(meal, slotKcal(slot, dayIndex))) * servingCostWeight
            - (isFavourite(meal, favourites) ? FAVOURITE_BONUS : 0)
            - (starred.has(meal.id) ? STARRED_BONUS : 0)
            // What the faff is worth to somebody who said "keep it simple".
            // Priced rather than filtered, so a recipe they need for their
            // protein can still outbid it. See FAFF_WEIGHT.
            + faff(meal)
            + fit
            + ((idx + seed + nth) % list.length) * 0.001,
          capped: (served.mealUses.get(meal.id) ?? 0) >= MAX_REPEATS,
        };
      })
      .sort((a, b) => a.score - b.score);
    // If everything is capped (a narrow diet with few options), take the best
    // anyway rather than leaving the slot empty.
    const best = ranked.find((r) => !r.capped) ?? ranked[0];

    /**
     * VARIETY IS SPENT ONLY WHERE IT IS FREE.
     *
     * The obvious way to avoid last week's meals is another term in the score
     * above, and it works — measured across three athletes and six diet
     * patterns it moved 30% of the week. It also drove the worst day's protein
     * from bang on target to 15.7% SHORT, because that is what the term does:
     * it outbids `proteinShortfall` for meals whose only fault is having been
     * eaten on Tuesday. Telling someone they need 180g of protein and then
     * planning them 152g so their menu looks fresh is not variety, it is the
     * app quietly failing at its job.
     *
     * The meals the planner kept re-picking were the ones that FIT. So variety
     * is taken out of the tie instead of out of the nutrition: rank on merit,
     * then among everything within a few pounds of the best — which is to say
     * everything just as good for this athlete in this slot — prefer what they
     * haven't just eaten. When nothing else is close, the best meal wins and
     * the week repeats, which is the honest answer for a narrow diet.
     */
    // Contenders are judged on FIT, not on the full score, so the slack is
    // spent on the shopping bill rather than on the athlete's macros. Two
    // earlier versions compared full scores and both leaked protein: pounds of
    // tolerance buy protein shortfall more cheaply than anything else, because
    // `proteinShortfall` is a fraction and the money terms are absolute.
    //
    // The density floor on top catches what a fit tolerance alone cannot.
    // Shortfall is clamped at zero, so every meal at or above its share scores
    // an identical 0 — and trading a protein-rich breakfast for a merely
    // adequate one therefore looked free while quietly spending the surplus
    // that was covering lunch.
    const bestDensity = proteinDensity(best.meal);
    const contenders = ranked.filter((r) =>
      !r.capped
      // Fits this athlete at least as well as the meal that won on score.
      && r.fit <= best.fit + 1e-9
      // As protein-dense as this athlete needs; or where even the best meal in
      // the slot can't manage that, at least as dense as the best.
      && proteinDensity(r.meal) >= Math.min(proteinPerKcalOn(dayIndex), bestDensity) - 1e-9
      // And costs no more than this much extra. Variety is worth paying for and
      // is not worth paying anything at all for: uncapped, preferring the
      // unseen meal every time added £7 a week to the shop, because an unseen
      // meal is usually one whose ingredients aren't in the trolley yet.
      && r.score <= best.score + varietyBudget);
    let pick = contenders.length > 1
      ? contenders.reduce((a, b) => {
          // A starred dish counts as unseen however often it was served. The
          // athlete asked for it; "you had this last week" is the reason they
          // starred it, not a reason to withhold it.
          const seenA = starred.has(a.meal.id) ? 0 : lastWeek.get(a.meal.id) ?? 0;
          const seenB = starred.has(b.meal.id) ? 0 : lastWeek.get(b.meal.id) ?? 0;
          return seenB < seenA || (seenB === seenA && b.score < a.score) ? b : a;
        })
      : best;

    /**
     * SECOND PASS: THE SAME INGREDIENT AGAIN.
     *
     * Everything above rotates DISHES, and an athlete does not eat dishes. The
     * book has 37 tofu meals and 7 tuna ones, so a week of nothing but tofu
     * clears every rotation rule in this function with a repeat count of zero —
     * which is exactly the "tuna every day" complaint, and why it survived the
     * variety work that came before it.
     *
     * WHY A SEPARATE PASS RATHER THAN A TERM IN THE SCORE. Charging ingredient
     * repetition was tried first, both flat and bounded by the athlete's
     * protein surplus, and both broke the plans. The bounded version fell into
     * the trap the contender filter above is already commented for: a
     * protein-dense breakfast looks over-provisioned in isolation, but the
     * surplus is what covers a thinner lunch, so taxing it drops the DAY.
     * Vegan weeks went from 98% of target to 86%.
     *
     * So the swap is made unable to cost protein rather than merely discouraged
     * from it. A replacement qualifies on either of two grounds, and both are
     * guarantees rather than preferences:
     *
     *   - it is AT LEAST AS PROTEIN-DENSE as the meal it displaces, so the
     *     trade cannot lose anything; or
     *   - the day it is being served into is still at or above its protein
     *     target with it in, counted on the running total rather than on the
     *     meal in isolation. This is the surplus idea done correctly: spent
     *     once, out of what has actually been banked, and never twice.
     *
     * The first alone is nearly inert — the ingredient that takes over a week
     * does so PRECISELY because it is the densest thing in the pool, so almost
     * nothing clears it. The second is what makes the rotation work, and it
     * does nothing at all for a diet with no surplus to spend, which is the
     * correct answer for a vegan cut rather than a compromise.
     */
    const seenLastWeek = (m: Meal) => (starred.has(m.id) ? 0 : lastWeek.get(m.id) ?? 0);
    const pickFatigue = starred.has(pick.meal.id) ? 0 : ingredientFatigue(served, pick.meal, dayIndex);
    if (pickFatigue > 0) {
      const pickDensity = proteinDensity(pick.meal);
      const pickSeen = seenLastWeek(pick.meal);
      // What is left of the week's allowance for eating something different.
      const left = ingredientBudget - ingredientSpend;
      // The real pounds this swap would add to the trolley — not the score,
      // which mixes money with protein and portion size and cannot be promised
      // to an athlete in any units they recognise.
      const extraCost = (m: Meal) => Math.max(0, marginalCost(m, basket) - marginalCost(pick.meal, basket));
      const fresher = ranked
        .filter((r) => !r.capped
          && extraCost(r.meal) <= left
          // The guarantee. Everything else here is a preference; this is why
          // the audit does not move.
          && (proteinDensity(r.meal) >= pickDensity - 1e-9 || staysOnTarget(r.meal, slot, dayIndex))
          // ONE VARIETY BUDGET PER SLOT, not one per pass. Measured against
          // `best` rather than against `pick` deliberately: anchoring it to the
          // dish rotation's winner would let a slot spend the £3 twice, and it
          // did — £108.32 a week against £102.59, for £3 of that being an
          // accounting mistake rather than a decision.
          && r.score <= best.score + varietyBudget
          && r.fit <= best.fit + INGREDIENT_FIT_TOLERANCE
          // Never undo the dish rotation. Without this the ingredient pass can
          // reach back for yesterday's dinner because its INGREDIENT is fresher
          // than today's winner, which reintroduces exactly the back-to-back
          // repeat the first half of this fixed — one plan in ninety, but the
          // complaint was about that one.
          && (served.mealDay.get(r.meal.id) ?? -99) < dayIndex - 1
          // And never undo the WEEK-on-week rotation either, for the same
          // reason. Left off, this pass reached back for last week's dish
          // whenever its ingredient happened to be fresher, and a cutting
          // vegetarian's second week went to 0% changed — the exact "Regenerate
          // week does nothing" bug a previous round was built to kill.
          && seenLastWeek(r.meal) <= pickSeen
          && (starred.has(r.meal.id) ? 0 : ingredientFatigue(served, r.meal, dayIndex)) < pickFatigue);
      if (fresher.length) {
        // Last week still gets its say among the fresher options, and it has to.
        // Without this tie-break the ingredient pass silently overrode the
        // week-on-week rotation — a cutting pescatarian's second week went back
        // to 11% changed, against a 15% floor that a previous complaint about
        // "Regenerate week does nothing" is the whole reason for.
        const swapped = fresher.reduce((a, b) => {
          const fa = starred.has(a.meal.id) ? 0 : ingredientFatigue(served, a.meal, dayIndex);
          const fb = starred.has(b.meal.id) ? 0 : ingredientFatigue(served, b.meal, dayIndex);
          if (fa !== fb) return fb < fa ? b : a;
          const seenA = starred.has(a.meal.id) ? 0 : lastWeek.get(a.meal.id) ?? 0;
          const seenB = starred.has(b.meal.id) ? 0 : lastWeek.get(b.meal.id) ?? 0;
          return seenB < seenA || (seenB === seenA && b.score < a.score) ? b : a;
        });
        // Charged BEFORE the reassignment, because `extraCost` is measured
        // against the meal being displaced — reading it afterwards would price
        // the swap against itself and always come out free.
        ingredientSpend += extraCost(swapped.meal);
        pick = swapped;
      }
    }

    /**
     * THIRD PASS: THE PROTEIN THEY ACTUALLY EAT.
     *
     * Everything above rotates dishes and then ingredients, and both are
     * satisfied by a month of tofu, lentils and beans for someone who told the
     * app they eat everything — those ARE varied dishes with varied
     * ingredients. See SOURCE_WEEKLY_BUDGET for the numbers.
     *
     * Deliberately last, so it is the rotations that get first call on the
     * slot: this pass exists to make sure meat and fish appear at all, not to
     * take over. And deliberately built to the same guarantees as the
     * ingredient pass above, because they are the guarantees that stopped
     * every previous attempt at variety from quietly eating the athlete's
     * protein target:
     *
     *   - at least as protein-dense as what it displaces, or the day is still
     *     on target with it in, counted on the running total;
     *   - inside a bounded weekly allowance, in real pounds on the trolley;
     *   - never yesterday's dinner, and never something last week's rotation
     *     just moved away from.
     */
    if (sourceBudget > 0 && sources.length && (slot === "Lunch" || slot === "Dinner")) {
      mainsServed++;
      // Rounded rather than floored so a fourteen-main week aims at seven
      // instead of drifting a slot behind all week.
      const owed = Math.round(mainsServed * SOURCE_SHARE);
      /**
       * A STARRED DISH IS NEVER DISPLACED, by this or by anything.
       *
       * Left out, this pass would quietly reach past the one meal the athlete
       * explicitly asked for — the ingredient rotation above it has guarded
       * against exactly that since it was written (`pickFatigue` reads zero for
       * a star), and omitting the same guard here took starred dishes served in
       * week one and then dropped from 3% to 4.4%.
       *
       * The star is the strongest preference signal the app has: somebody
       * pressed a button on that specific dish. "You should eat more fish" is
       * not a good enough reason to take it away from them.
       */
      if (sourcesServed < owed && !starred.has(pick.meal.id) && !carriesSource(pick.meal, sources)) {
        const left = sourceBudget - sourceSpend;
        const pickDensity = proteinDensity(pick.meal);
        const pickSeen = seenLastWeek(pick.meal);
        const extraCost = (m: Meal) => Math.max(0, marginalCost(m, basket) - marginalCost(pick.meal, basket));
        const withSource = ranked.filter((r) =>
          !r.capped
          && carriesSource(r.meal, sources)
          && extraCost(r.meal) <= left
          // The guarantee. Everything else is a preference; this is why the
          // protein audit does not move.
          && (proteinDensity(r.meal) >= pickDensity - 1e-9 || staysOnTarget(r.meal, slot, dayIndex))
          && r.fit <= best.fit + INGREDIENT_FIT_TOLERANCE
          // Never undo the dish rotation, and never undo the week-on-week one.
          && (served.mealDay.get(r.meal.id) ?? -99) < dayIndex - 1
          && seenLastWeek(r.meal) <= pickSeen);
        if (withSource.length) {
          const taken = withSource.reduce((a, b) => {
            const seenA = seenLastWeek(a.meal);
            const seenB = seenLastWeek(b.meal);
            return seenB < seenA || (seenB === seenA && b.score < a.score) ? b : a;
          });
          sourceSpend += extraCost(taken.meal);
          pick = taken;
        }
      }
      if (carriesSource(pick.meal, sources)) sourcesServed++;
    }

    recordServing(served, pick.meal, dayIndex);
    addToBasket(pick.meal, basket);
    bank(pick.meal, slot, dayIndex);
    return pick.meal;
  };

  const buildDay = (day: string, i: number): PlannedDay => {
    const skipped: SkippedMeal[] = [];
    const picks: Meal[] = [];
    // A 5-meal day has two snack slots; without this they'd both resolve to the
    // cheapest snack and the day would list the same thing twice.
    const usedToday = new Set<string>();
    // A new day banks its own protein. Carrying yesterday's surplus over would
    // let a good Monday pay for a thin Tuesday, which is not how eating works.
    dayProtein = 0;
    daySlotKcal = 0;
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
        recordServing(served, forced, i);
        addToBasket(forced, basket);
        bank(forced, slot, i);
        picks.push(forced);
        usedToday.add(forced.id);
        continue;
      }

      const m = choose(slot, i, nth, usedToday);
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
      const want = slotKcal(meal.slot, i);
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
    return {
      day, meals, macros, skipped,
      load: depth === 0 ? "even" : trainingDays.has(i) ? "training" : "rest",
      targetKcal: dayCalories(i),
    };
  };

  return DAYS.map(buildDay).map((day) => topUpProtein(day, targets, thrifty));
}

/**
 * Trade a day's carbs for its protein when the day lands just short.
 *
 * WHY THIS EXISTS. A 58kg athlete cutting was handed a £55.73 week when a
 * £50.33 one was sitting right there, and the only thing wrong with the cheaper
 * week was ONE day, short of its protein floor BY 0.2 GRAMS. `feedsThem` threw
 * the whole week away — correctly, on its own terms — and the search reported
 * that £50 could not be done. Five pounds a week, lost to two tenths of a gram
 * on a Thursday.
 *
 * Rejecting a week for one bad day is the wrong move when the day is fixable,
 * and it is fixable: every day here has a protein-dense meal and a starchy one,
 * and the portions are already scaled. So the dense meal goes up and the least
 * dense comes down by the calories it gained. The day's energy is unchanged,
 * which is what a cutting athlete actually cares about, and the trolley barely
 * moves because these are portions of food already on the list rather than new
 * food.
 *
 * DELIBERATELY SMALL AND ONLY WHEN ASKED. It runs on budget plans only, and
 * only on a day already under the floor — this is a repair, not a lever, and it
 * must never quietly re-portion a plan nobody complained about. It works within
 * the same 0.55-1.6 clamp as everything else, so it cannot invent a portion
 * nobody would plate, and if one pass is not enough the day stays short and
 * `feedsThem` still refuses it.
 */
function topUpProtein(day: PlannedDay, targets: PlanTargets, thrifty: boolean): PlannedDay {
  if (!thrifty || day.meals.length < 2) return day;
  const floor = targets.protein * BUDGET_PROTEIN_FLOOR;
  if (day.macros.protein >= floor) return day;

  const total = (meals: PlannedDay["meals"]) => meals.reduce(
    (t, m) => ({
      kcal: t.kcal + m.macros.kcal, protein: t.protein + m.macros.protein,
      carbs: t.carbs + m.macros.carbs, fats: t.fats + m.macros.fats,
    }),
    { kcal: 0, protein: 0, carbs: 0, fats: 0 },
  );

  const step = 0.05;
  let meals = day.meals;

  /**
   * WORKS THROUGH THE DAY, not just its best dish.
   *
   * The first version raised the single densest meal and lowered the single
   * least dense, which fixed the 0.2g misses it was written for and then stalled
   * — one dish reaches the 1.6 cap in a handful of steps and the day is still
   * short. So it walks the pairs: densest against least dense, and when either
   * runs out of room it takes the next one in. Same clamp, same rule, more of
   * the day available to it.
   */
  for (let pass = 0; pass < 40; pass++) {
    const now = total(meals);
    if (now.protein >= floor) break;

    const order = meals.map((m, i) => ({ i, d: proteinDensity(m.meal) })).sort((a, b) => b.d - a.d);
    const up = order.find(({ i }) => meals[i].scale + step <= 1.6);
    const down = [...order].reverse().find(({ i }) => meals[i].scale - step >= 0.55 && i !== up?.i);
    // Nothing left to trade, or the trade would swap a dish for a denser one,
    // which takes protein OUT of the day.
    if (!up || !down || up.d <= down.d) break;

    const upScale = Math.round((meals[up.i].scale + step) * 20) / 20;
    // Come down by the calories that went up, so the day's energy holds.
    const gained = mealMacros(meals[up.i].meal, upScale).kcal - meals[up.i].macros.kcal;
    const perUnit = mealMacros(meals[down.i].meal, 1).kcal;
    const downScale = Math.round(
      (meals[down.i].scale - (perUnit > 0 ? gained / perUnit : step)) * 20,
    ) / 20;
    if (downScale < 0.55) break;

    meals = meals.map((m, i) => {
      const scale = i === up.i ? upScale : i === down.i ? downScale : m.scale;
      return scale === m.scale ? m : { ...m, scale, macros: mealMacros(m.meal, scale) };
    });
  }

  return meals === day.meals ? day : { ...day, meals, macros: total(meals) };
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
  /**
   * What this line costs in a TYPICAL week, once the cupboard is stocked.
   *
   * Equal to `cost` for anything perishable: buy a 240g pack of salmon for one
   * fillet and the rest goes off, so the whole pack is the price of eating it.
   *
   * Lower for anything that keeps, because the leftover is not waste — it is
   * next week's. A week using 165ml from a 500ml bottle of olive oil was being
   * charged £3.50 for it every seven days, which is £3.50 for a bottle bought
   * every three weeks. Across a typical plan that single mistake, repeated over
   * the oil, the spices, the honey and the peanut butter, overstated the shop
   * by 40% — £45.80 of a £113.55 week charged to food nobody ever eats.
   */
  ongoingCost: number;
  /**
   * True when the athlete told us this price rather than us estimating it.
   *
   * The UI marks these, because the difference between "we think" and "you told
   * us" is the whole point of letting them correct it.
   */
  corrected: boolean;
}

export interface ShoppingList {
  lines: ShoppingLine[];
  byAisle: { aisle: Aisle; lines: ShoppingLine[]; cost: number }[];
  /** What this shop costs at the till, assuming an empty cupboard. */
  total: number;
  /**
   * What a week costs once the cupboard is stocked — the number an athlete
   * budgeting month to month actually wants, and the one they cannot get from
   * `total` because `total` re-buys the olive oil every Monday.
   */
  ongoingTotal: number;
  /** Meals the list actually feeds — excludes anything eaten out. */
  mealsPlanned: number;
  /** Total ÷ meals planned. The number that tells you if a plan is affordable. */
  costPerMeal: number;
  /** The same, for a week that isn't also restocking the cupboard. */
  ongoingCostPerMeal: number;
}

/**
 * Options that decide what a pack COSTS, as opposed to how much of it is needed.
 *
 * Optional throughout: the planner's own scoring calls this to compare baskets
 * and wants the baseline table, not one athlete's corrections, so that a plan
 * built for a Tesco shopper and one built for an Aldi shopper are the same plan
 * at different prices rather than two different plans.
 */
export interface PricingOptions {
  store?: StoreId;
  overrides?: PriceOverrides;
}

export function shoppingList(week: PlannedDay[], pricing: PricingOptions = {}): ShoppingList {
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
    const unitPrice = packPriceFor(food, pricing);
    lines.push({
      food,
      needed: Math.round(qty),
      packs,
      cost: Math.round(packs * unitPrice * 100) / 100,
      corrected: isCorrected(food, pricing.overrides),
      meals: mealCount.get(foodId) ?? 0,
      used: Math.min(1, qty / (packs * food.packSize)),
      // Perishables cost what they cost. Anything that keeps is charged for
      // what the week eats, because the rest is still in the cupboard on Monday.
      // Same function the planner scores with — see `ongoingPackCost`.
      ongoingCost: Math.round(ongoingPackCost(food, qty, unitPrice) * 100) / 100,
    });
  }
  lines.sort((a, b) => a.food.name.localeCompare(b.food.name));

  const aisles = [...new Set(lines.map((l) => l.food.aisle))];
  const byAisle = aisles.map((aisle) => {
    const ls = lines.filter((l) => l.food.aisle === aisle);
    return { aisle, lines: ls, cost: Math.round(ls.reduce((s, l) => s + l.cost, 0) * 100) / 100 };
  });

  const total = Math.round(lines.reduce((s, l) => s + l.cost, 0) * 100) / 100;
  const ongoingTotal = Math.round(lines.reduce((s, l) => s + l.ongoingCost, 0) * 100) / 100;
  const mealsPlanned = week.reduce((n, d) => n + d.meals.length, 0);
  return {
    lines,
    byAisle,
    total,
    ongoingTotal,
    mealsPlanned,
    costPerMeal: mealsPlanned > 0 ? Math.round((total / mealsPlanned) * 100) / 100 : 0,
    ongoingCostPerMeal: mealsPlanned > 0 ? Math.round((ongoingTotal / mealsPlanned) * 100) / 100 : 0,
  };
}

/** Plain-text list, for pasting into a supermarket app or messaging it to someone. */
/**
 * A week that fits a stated budget, or the closest honest attempt at one.
 *
 * WHY A TICK BOX WAS NOT ENOUGH. "Keep it cheap" asks whether they would rather
 * be cheap; a number asks how much they have. Only the second has an answer you
 * can check afterwards, and checking it is most of the value — somebody with
 * sixty pounds needs to know before Monday whether this plan is a sixty-pound
 * plan.
 *
 * HOW IT SEARCHES. The planner already prices every candidate meal; the two
 * cost terms just carry a fixed weight. So this asks the same planner the same
 * question at increasing cost pressure and takes the FIRST week that comes in
 * under the ceiling — first rather than cheapest, because pressure is spent in
 * variety and in how well each meal fits the slot, and there is no reason to
 * spend more of either than the budget actually requires.
 *
 * WHAT IT WILL NOT DO IS LIE. If no pressure gets under the number, it returns
 * the cheapest week it could build and says so, with what that week costs.
 * Silently serving a £78 plan to somebody who typed £60 is the failure mode
 * this whole feature exists to prevent, and quietly starving the plan to hit
 * £60 is the other one — so a week that drops a day below 90% of its protein
 * target is rejected however cheap it is.
 *
 * Judged on `ongoingTotal`: a weekly budget means an ordinary week, and `total`
 * re-buys the olive oil and the spice jars every Monday. The first shop is
 * dearer and the result says by how much.
 */
export interface BudgetedWeek {
  days: PlannedDay[];
  list: ShoppingList;
  /** The ceiling asked for, or null when there wasn't one. */
  budget: number | null;
  /** An ordinary week's shop — what the budget is judged against. */
  weeklyCost: number;
  /** The first shop, which also stocks the cupboard. */
  firstShopCost: number;
  /** False when even the cheapest defensible week came in over. */
  met: boolean;
  /** One line for the athlete. Null when there is no budget to report on. */
  note: string | null;
  /**
   * The priced way out, when the budget could not be met.
   *
   * Only present on a miss — a week that came in under budget has nothing to
   * advise about. See lib/budget-advice.ts.
   */
  advice?: BudgetAdvice;
}

/**
 * How hard to lean on price, in order. 1 is the ordinary plan; each step buys
 * a cheaper shop with variety and slot-fit. Stops at 6 because past there the
 * week collapses onto the same four cheap dinners and the protein floor starts
 * rejecting the results anyway.
 */
/**
 * The rungs the budget search tries, in order.
 *
 * FINER AT THE BOTTOM, because that is where the answer is. With [1, 2, 3.5, 6]
 * a 58kg athlete cutting got £55.86 at rung one and £50.33 at rung two, and the
 * £50.33 week missed her protein floor on a single day BY 0.2 GRAMS. There was
 * a perfectly good week between those two rungs and the ladder stepped straight
 * over it.
 *
 * The steps above 3.5 stay coarse on purpose: by then the planner is already
 * choosing the cheapest thing that clears the floor, and the extra rungs buy
 * pennies while costing a full week's build each.
 */
const BUDGET_PRESSURE = [1, 1.35, 1.7, 2, 2.4, 3, 3.5, 4.5, 6, 8, 12];

/** No day may fall below this share of its protein target, however cheap it is. */
const BUDGET_PROTEIN_FLOOR = 0.9;

/**
 * …nor below this share of what the unpressured week would have delivered.
 *
 * 5% is inside the noise of portion scaling and well outside a real loss: it
 * lets a cheaper chicken thigh replace a chicken breast and stops a week of
 * pasta replacing a week of food.
 */
const BUDGET_PROTEIN_KEEP = 0.95;

/**
 * Turn one dinner into two meals, wherever the dish will take it.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS IS ALLOWED WHEN A PLAIN REPEAT IS NOT.
 *
 * The planner pays REPEAT_PENALTY — £4, escalating — to keep the same dish off
 * the week twice, and it is right to. But that penalty treats two different
 * things as one. Chilli on Monday and again on Thursday, presented as a new
 * meal, is monotony. Sunday's chilli as Monday's lunch is not: it is how
 * everybody who cooks actually eats, and nobody experiences it as the same meal
 * twice.
 *
 * The difference is whether it is DECLARED, which is why the leftover is
 * labelled and the source dinner carries "cook double". An unlabelled repeat
 * reads as the app running out of ideas; a labelled one reads as the plan
 * knowing how a kitchen works.
 *
 * The saving is real, not notional: the second serving draws on food the basket
 * has already bought, so it costs marginal ingredients rather than a fresh set.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function applyLeftovers(days: PlannedDay[], costOf?: (d: PlannedDay[]) => number): PlannedDay[] {
  const plan = planLeftovers(days);
  if (plan.length === 0) return days;

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * EVERY SWAP HAS TO PROVE IT SAVES MONEY, and the first version did not ask.
   *
   * "A leftover is free" is true of the SERVING and false of the WEEK. The swap
   * replaces a lunch that was chosen partly because it was cheap with a second
   * portion of a dinner that was chosen for other reasons — so it scales up the
   * dearer set of ingredients and drops the cheaper one. Measured on the first
   * version: a 78kg cutting week went from £51.94 to £61.61. It made the budget
   * feature worse while looking like a saving.
   *
   * So each swap is applied, costed, and kept only if the week got cheaper.
   * Greedy rather than exhaustive: three candidates at most, and the interaction
   * between them is small next to the cost of searching every combination.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const out = days.map((d) => ({ ...d, meals: [...d.meals] }));
  for (const l of plan) {
    const source = out[l.cookDay].meals.find((m) => m.meal.id === l.mealId);
    const lunchAt = out[l.eatDay].meals.findIndex((m) => m.meal.slot === "Lunch");
    if (!source || lunchAt < 0) continue;

    /**
     * SCALED TO THE LUNCH IT REPLACES, not to the dinner it came from.
     *
     * A leftover is the same food, not the same portion — lunch and dinner have
     * different calorie targets, and serving a dinner-sized plate at midday
     * would blow the day's numbers to save two pounds. The scale that was
     * already computed for that slot is the right one.
     */
    const replacing = out[l.eatDay].meals[lunchAt];
    // Same food, NOT the same portion — lunch and dinner have different targets,
    // and a dinner-sized plate at midday would blow the day's numbers to save
    // two pounds. The scale already chosen for that slot is the right one.
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * A LEFTOVER MAY NOT COST THEM PROTEIN TO SAVE THEM MONEY.
     *
     * The lunch being replaced was chosen for that slot's protein as well as
     * its price. A chilli scaled down to a lunch's calories can deliver far
     * less — and when it does, the day fails the protein floor, the whole
     * budget search rejects every attempt, and the athlete is handed the
     * unpressured week with "we cannot do it" written under it. Measured on the
     * version without this check: 78kg cutting went from £51.94 to £83.02,
     * which is the budget feature turning itself off.
     *
     * Ten per cent of slack, because a swap that is fractionally under is a
     * real saving and the day has other meals in it. Anything more and the
     * money is coming out of their food.
     * ═══════════════════════════════════════════════════════════════════════
     */
    const leftoverMacros = mealMacros(source.meal, replacing.scale);
    if (leftoverMacros.protein < replacing.macros.protein * 0.9) continue;

    const before = costOf ? costOf(out) : null;
    const priorLunch = out[l.eatDay].meals[lunchAt];
    const priorDinners = out[l.cookDay].meals;

    out[l.eatDay].meals[lunchAt] = {
      meal: source.meal,
      scale: replacing.scale,
      macros: leftoverMacros,
      leftoverFrom: days[l.cookDay].day,
    } as PlannedMeal;
    out[l.cookDay].meals = out[l.cookDay].meals.map((m) =>
      m.meal.id === l.mealId ? ({ ...m, batchFor: days[l.eatDay].day } as PlannedMeal) : m);

    if (before !== null && costOf!(out) >= before) {
      // Put it back. A leftover that costs more is just the same dinner twice.
      out[l.eatDay].meals[lunchAt] = priorLunch;
      out[l.cookDay].meals = priorDinners;
    }
  }

  // The day macros were computed before the swap and are now wrong.
  // The day totals were computed before the swap and are now wrong.
  return out.map((d) => ({
    ...d,
    macros: d.meals.reduce(
      (sum, m) => ({
        kcal: sum.kcal + m.macros.kcal, protein: sum.protein + m.macros.protein,
        carbs: sum.carbs + m.macros.carbs, fats: sum.fats + m.macros.fats,
      }),
      { kcal: 0, protein: 0, carbs: 0, fats: 0 } as Macros,
    ),
  }));
}

export function planWithinBudget(
  targets: PlanTargets,
  seed = 0,
  prefs: MealPrefs = DEFAULT_PREFS,
  schedule: DietSchedule = EMPTY_SCHEDULE,
  swaps: MealSwaps = {},
  recent: string[] = [],
  pricing: PricingOptions = {},
): BudgetedWeek {
  /**
   * LEFTOVERS ARE PART OF THE SEARCH, not a garnish applied afterwards.
   *
   * Applied before the shopping list is costed, because that is the only place
   * the saving is visible: the second serving draws on food the basket already
   * holds. Applied only under a budget or the cheap tick — somebody who never
   * mentioned money did not ask to eat last night's dinner, and getting it
   * anyway would be the plan making a decision on their behalf to save them
   * money they never said they needed.
   */
  const wantsBatching = prefs.budget || (Number(prefs.weeklyBudget) > 0);
  const build = (pressure: number) => {
    const raw = buildWeek(targets, seed, prefs, schedule, swaps, recent, pressure);
    const days = wantsBatching
      ? applyLeftovers(raw, (d) => shoppingList(d, pricing).ongoingTotal)
      : raw;
    return { days, list: shoppingList(days, pricing) };
  };

  const budget = Number.isFinite(Number(prefs.weeklyBudget)) && Number(prefs.weeklyBudget) > 0
    ? Number(prefs.weeklyBudget)
    : null;

  const baseline = build(1);

  /**
   * NOTHING ASKED FOR — the ordinary plan, untouched.
   *
   * Somebody who never mentions money must get the same week they would have
   * got before this function existed.
   */
  if (budget == null && !prefs.budget) {
    return {
      ...baseline, budget: null, met: true, note: null,
      weeklyCost: baseline.list.ongoingTotal,
      firstShopCost: baseline.list.total,
    };
  }

  /**
   * The week they would have had if they had never mentioned money.
   *
   * NOT `baseline`. A stated budget turns budget mode on, so even at pressure 1
   * the plan is already leaning on price — and measuring the protein floor
   * against THAT lets the whole drop happen for free before the search starts.
   * Measured, on a 62kg athlete: the returned week was 36% short of the worst
   * day in the plan they would otherwise have been served, and every step of
   * the search passed its own floor. The reference has to be the plan without
   * the budget. Built once, never returned.
   */
  const reference = buildWeek(targets, seed, { ...prefs, budget: false, weeklyBudget: null }, schedule, swaps, recent);

  let best: { days: PlannedDay[]; list: ShoppingList } | null = null;
  /**
   * The cheapest week that is merely ADEQUATE, kept for when nothing clears the
   * stricter bar. See feedsThemAbsolutely — without it the "we could not do it"
   * branch handed back the unpressured week, which is the DEAREST thing the
   * search can produce, to the one person who has said they cannot afford it.
   */
  let adequate: { days: PlannedDay[]; list: ShoppingList } | null = null;
  for (const pressure of BUDGET_PRESSURE) {
    const attempt = pressure === 1 ? baseline : build(pressure);
    // Every returned week passes the floor, INCLUDING the unpressured one. It
    // was seeded as `best` at first and therefore never checked, which is how a
    // 62kg athlete asking for £30 was handed a week 36% short on its worst day
    // — the answer to an impossible budget is the plan they would have had,
    // not the cheapest thing the search happened to start from.
    if (feedsThemAbsolutely(attempt.days, targets)
      && (!adequate || attempt.list.ongoingTotal < adequate.list.ongoingTotal)) {
      adequate = attempt;
    }
    if (!feedsThem(attempt.days, reference, targets)) continue;
    if (!best || attempt.list.ongoingTotal < best.list.ongoingTotal) best = attempt;
    // With a ceiling, stop at the first week under it — pressure is spent in
    // variety and slot fit, and there is no reason to spend more of either than
    // the number actually requires. With only the tick there is no line to
    // stop at, so the loop runs on and `best` keeps the cheapest.
    if (budget != null && attempt.list.ongoingTotal <= budget) {
      return { ...attempt, budget, met: true, ...costs(attempt.list), note: metNote(attempt.list, budget) };
    }
  }

  /**
   * THE TICK ON ITS OWN IS A QUESTION TOO, and it used to be answered with a
   * sort order.
   *
   * "Keep it cheap" set `thrifty`, which reorders the candidate list and
   * doubles a weight — one pass, at pressure 1 — while the whole ladder that
   * actually finds savings was reachable only by typing a number into a
   * separate box. Most people tick the box and type nothing.
   *
   * So the tick searches the same ladder and keeps the cheapest week that still
   * passes the protein floor. Measured across nine athlete/diet combinations
   * that is £4 to £17 a week, and the floor is what stops it becoming £39 of
   * pasta for a 58kg athlete on 64% of her protein — the search offers that
   * week and `feedsThem` refuses it.
   */
  if (budget == null) {
    const cheapest = best ?? baseline;
    return {
      ...cheapest, budget: null, met: true, ...costs(cheapest.list),
      note: `An ordinary week comes to £${cheapest.list.ongoingTotal.toFixed(2)}`
        + `, about £${cheapest.list.ongoingCostPerMeal.toFixed(2)} a meal.`
        + (cheapest.list.total > cheapest.list.ongoingTotal
          ? ` The first shop is £${cheapest.list.total.toFixed(2)} because it also stocks the cupboard.`
          : ""),
    };
  }

  /**
   * Cheapest passing week, then cheapest adequate week, and only then the
   * unpressured one. Handing somebody who asked for £50 the £89 week because no
   * attempt cleared a floor defined by that same £89 week is the worst answer
   * available, and it is what this used to do.
   */
  const fallback = best ?? adequate ?? { days: reference, list: shoppingList(reference, pricing) };

  /**
   * The week they would have had may fit the budget by itself.
   *
   * Every pressured week can fail the protein floor while the ordinary one is
   * comfortably under the ceiling — that is precisely the 95kg cutting athlete,
   * whose £88 week clears their protein and whose every cheaper week does not.
   * Reporting "we could not manage £200" about an £88 plan is nonsense, and it
   * is what happens if the only way to be `met` is to have found a saving.
   */
  if (fallback.list.ongoingTotal <= budget) {
    return { ...fallback, budget, met: true, ...costs(fallback.list), note: metNote(fallback.list, budget) };
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * A MISS IS THE MOST USEFUL THING THIS FUNCTION KNOWS, so it stops being a
   * shrug.
   *
   * This used to end "£39 over your budget. Cooking fewer, larger meals or
   * eating out less are the two biggest levers left." The number tells somebody
   * they failed, and the advice was never measured — one sentence written once
   * and shown to every athlete, including the ones already on three meals a
   * day, for whom half of it is worth nothing and the app knew it.
   *
   * The app knows exactly what it costs to feed this person, which is genuinely
   * rare. So each lever is PRICED by re-planning with it, and the answer is
   * their real floor, what the protein alone costs, and what each change is
   * worth in their week. "£50 is not possible, £64 is, and here is the £14" is
   * a useful answer; "£39 over" is not.
   *
   * Costs a handful of extra plan builds, and only on the path where the
   * athlete has already been told no.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const floor = fallback.list.ongoingTotal;

  /**
   * LIKE FOR LIKE, or the number is not the change's.
   *
   * Measuring a lever against `floor` overstates it whenever the fallback is
   * the unpressured reference week — the difference then includes "a budget
   * plan existed at all" as well as the change itself. Measured on a 95kg
   * cutter that inflated "go meat-free" from its real value to £36.49, which
   * would have been the app promising a saving that was mostly something else.
   *
   * So every lever is compared against the SAME build with nothing changed.
   */
  const costOfPlan = (change: Partial<MealPrefs>) => {
    const withChange = mergePrefs(prefs, change);
    const week = buildWeek(targets, seed, withChange, schedule, swaps, recent, 1);
    const batched = (withChange.budget || Number(withChange.weeklyBudget) > 0)
      ? applyLeftovers(week, (d) => shoppingList(d, pricing).ongoingTotal)
      : week;
    return shoppingList(batched, pricing).ongoingTotal;
  };
  const levers = measureLevers(prefs, costOfPlan({}), costOfPlan);

  const advice = budgetAdvice(budget, floor, levers, targets.protein, bestProteinPerPound());

  return {
    ...fallback, budget, met: false, ...costs(fallback.list),
    advice,
    note: advice.headline + (advice.proteinNote ? ` ${advice.proteinNote}` : ""),
  };
}

const costs = (list: ShoppingList) => ({ weeklyCost: list.ongoingTotal, firstShopCost: list.total });

/**
 * The best protein-per-pound anywhere in the book.
 *
 * Measured rather than written down, because a number in a comment goes stale
 * the first time somebody adds a recipe — and this one is load bearing: it is
 * what lets the app say "even at the cheapest source here, your protein alone
 * is £42" and be right about it.
 *
 * Computed once. It depends only on the recipe data, which does not change at
 * runtime.
 */
let cheapestProtein: number | null = null;
function bestProteinPerPound(): number {
  if (cheapestProtein !== null) return cheapestProtein;
  const empty = basketOf([]);
  let best = 0;
  for (const meal of MEALS) {
    const protein = mealMacros(meal, 1).protein;
    const cost = ongoingMarginalCost(meal, empty, 1);
    if (protein > 0 && cost > 0) best = Math.max(best, protein / cost);
  }
  cheapestProtein = best;
  return best;
}

function metNote(list: ShoppingList, budget: number): string {
  const under = budget - list.ongoingTotal;
  const first = list.total > list.ongoingTotal
    ? ` The first shop is £${list.total.toFixed(2)} because it stocks the cupboard — oil, spices and rice last for weeks.`
    : "";
  return `An ordinary week comes to £${list.ongoingTotal.toFixed(2)}, £${under.toFixed(2)} under your budget.${first}`;
}

/**
 * A cheap week still has to be the week they would otherwise have had.
 *
 * Protein is the term the planner spends first when cost is pushed hard, and
 * the one an athlete cannot make up elsewhere, so it is the floor. Calories
 * look after themselves: the size term keeps every slot near its target and
 * cheap food is not small food.
 *
 * MEASURED AGAINST THE UNPRESSURED WEEK, not only against the target. A flat
 * "90% of target" bar rejected every single option for a 95kg athlete cutting —
 * because the ordinary plan does not reach 90% for them either, and holding the
 * cheap week to a standard the normal week never met means the budget feature
 * silently does nothing for exactly the people most likely to use it. The
 * question a floor should ask is "is this materially worse than what they would
 * have got", and the answer here is the more forgiving of the two bars.
 */
/**
 * The floor with no reference to what they would otherwise have had.
 *
 * `feedsThem` measures against the unpressured week, which is right for
 * choosing between weeks and wrong as a last resort: it RATCHETS. Add cheaper,
 * better recipes to the book and the unpressured week improves, so the relative
 * floor rises, so weeks that were acceptable yesterday are refused today — and
 * the athlete is handed something dearer than they were being handed before.
 * Measured while adding fourteen budget recipes: a 78kg cutting week went from
 * £49.21 to £59.46 and a 95kg one from £65.86 to £89.06, purely because the
 * comparison moved.
 *
 * This is the absolute version: enough protein for the athlete in front of you,
 * whatever some other week might have contained.
 */
function feedsThemAbsolutely(days: PlannedDay[], targets: PlanTargets): boolean {
  return days.every((day) =>
    day.meals.length === 0 || day.macros.protein >= targets.protein * BUDGET_PROTEIN_FLOOR);
}

function feedsThem(days: PlannedDay[], baseline: PlannedDay[], targets: PlanTargets): boolean {
  return days.every((day, i) => {
    if (day.meals.length === 0) return true; // a day they said they are eating out
    const wouldHaveHad = baseline[i]?.macros.protein ?? 0;
    const floor = Math.min(targets.protein * BUDGET_PROTEIN_FLOOR, wouldHaveHad * BUDGET_PROTEIN_KEEP);
    return day.macros.protein >= floor;
  });
}

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
  // Only when the two genuinely differ, so a week of nothing but fresh food
  // doesn't carry a line explaining that it has no cupboard stock in it.
  if (list.ongoingTotal < list.total - 1) {
    out.push(`Of that, ~£${list.ongoingTotal.toFixed(2)} is food you'll eat this week — the rest is cupboard and freezer stock that lasts.`);
  }
  const perMeal = list.mealsPlanned > 0 ? list.total / list.mealsPlanned : 0;
  if (perMeal > 0) out.push(`That's about £${perMeal.toFixed(2)} a meal across ${list.mealsPlanned} planned meals.`);
  out.push("(estimates from typical UK supermarket prices, not live pricing)");
  return out.join("\n");
}

export { FOODS };
