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

export const MEALS: Meal[] = [
  // ===========================================================================
  // RECIPE-FIRST MEALS, added to fill measured gaps in the pool.
  //
  // Not a general "more recipes" pass. A sweep of every diet pattern crossed
  // with every avoidance found where the planner was actually starved of
  // options, and the worst was stark: GLUTEN-FREE BREAKFAST HAD EXACTLY ONE
  // MEAL. A coeliac athlete was handed the same breakfast seven mornings a
  // week, and with MAX_REPEATS at 3 the planner could not even honour its own
  // variety rule. Vegan lunch (5) and vegetarian dinner (6) were next.
  //
  // These are written recipes rather than ingredient piles — `steps`, a time,
  // and a tip — because they are the first ones the new recipe view renders,
  // and a feature is judged on what it shows first. All original, built from
  // the existing food table on the archetypes athlete cooking actually uses:
  // one pan, batchable, protein-led, nothing that needs a scale mid-cook.
  // ===========================================================================

  // --- Gluten-free breakfasts (the pool had one) -----------------------------
  { id: "gf_potato_hash_eggs", name: "Potato hash & eggs", slot: "Breakfast",
    items: [{ foodId: "potatoes", qty: 300 }, { foodId: "eggs", qty: 3 }, { foodId: "spinach", qty: 80 }, { foodId: "olive_oil", qty: 12 }, { foodId: "onion", qty: 60 }],
    minutes: 20,
    steps: [
      "Dice the potatoes small — 1cm, or they will not cook through in time.",
      "Fry them in the oil over a medium heat for 12 minutes, turning only every few minutes so they crust rather than steam.",
      "Add the onion for the last 5 minutes, then the spinach for the last 1.",
      "Push it all to one side, crack the eggs into the space, and cover the pan for 2 minutes.",
    ],
    tip: "Boil the potatoes the night before and this is a 7-minute breakfast.",
    method: "Dice and fry the potatoes until crusted, add onion then spinach, and cook the eggs in the same pan." },
  { id: "gf_quinoa_porridge", name: "Quinoa breakfast bowl", slot: "Breakfast",
    items: [{ foodId: "quinoa", qty: 90 }, { foodId: "milk", qty: 300 }, { foodId: "whey_protein", qty: 30 }, { foodId: "berries_frozen", qty: 100 }, { foodId: "seeds_mixed", qty: 15 }],
    minutes: 18,
    steps: [
      "Rinse the quinoa in a sieve until the water runs clear, or it tastes soapy.",
      "Simmer it in the milk for 15 minutes until the grains uncurl and it goes creamy.",
      "Take it off the heat and let it stop steaming before stirring the protein in — added to a boiling pan it goes lumpy.",
      "Berries and seeds on top.",
    ],
    tip: "Cook the whole bag at the weekend. It reheats with a splash of milk.",
    method: "Rinse the quinoa, simmer in milk for 15 minutes, cool slightly, stir protein through and top with berries and seeds." },
  { id: "gf_yoghurt_stack", name: "Big yoghurt & fruit stack", slot: "Breakfast",
    items: [{ foodId: "greek_yoghurt", qty: 400 }, { foodId: "berries_frozen", qty: 120 }, { foodId: "almonds", qty: 30 }, { foodId: "peanut_butter", qty: 20 }, { foodId: "banana", qty: 1 }],
    minutes: 4,
    steps: [
      "Defrost the berries in the microwave for 40 seconds so they release their juice.",
      "Layer yoghurt, berries and sliced banana in a bowl or a jar.",
      "Peanut butter melted over the top, almonds last so they stay crunchy.",
    ],
    tip: "Built in a jar the night before, this travels to a morning session.",
    method: "Defrost the berries, layer with yoghurt and banana, then peanut butter and almonds on top." },
  { id: "gf_tofu_sweet_potato", name: "Tofu & sweet potato hash", slot: "Breakfast",
    items: [{ foodId: "tofu", qty: 250 }, { foodId: "sweet_potato", qty: 250 }, { foodId: "spinach", qty: 80 }, { foodId: "olive_oil", qty: 12 }],
    minutes: 22,
    steps: [
      "Cube the sweet potato and get it into the hot oil first — it takes twice as long as the tofu.",
      "After 12 minutes, crumble the tofu in with plenty of turmeric, paprika and salt.",
      "Fry another 6 minutes without stirring much, so it browns instead of scrambling.",
      "Spinach in at the very end, off the heat.",
    ],
    tip: "Press the tofu under something heavy for 10 minutes first and it crisps properly.",
    method: "Fry the sweet potato, add crumbled seasoned tofu, brown it, then wilt spinach in off the heat." },

  // --- Vegan lunches and dinners (5 and 6 respectively) ----------------------
  { id: "vg_burrito_bowl", name: "Black bean burrito bowl", slot: "Lunch",
    items: [{ foodId: "black_beans", qty: 240 }, { foodId: "rice", qty: 90 }, { foodId: "tofu", qty: 150 }, { foodId: "tomatoes_tin", qty: 150 }, { foodId: "olive_oil", qty: 10 }],
    minutes: 20,
    steps: [
      "Rice on. While it cooks, fry the tofu in the oil until the edges catch.",
      "Add the beans and tomatoes with cumin, smoked paprika and a lot of black pepper.",
      "Simmer 8 minutes until it thickens and stops looking like soup.",
      "Over the rice, with lime if you have it.",
    ],
    tip: "Doubles cleanly and is better on day two.",
    method: "Fry tofu, add beans, tomatoes and spices, simmer until thick, serve over rice." },
  { id: "vg_peanut_noodle_tofu", name: "Peanut tofu noodles", slot: "Lunch",
    items: [{ foodId: "tofu", qty: 250 }, { foodId: "pasta", qty: 100 }, { foodId: "peanut_butter", qty: 30 }, { foodId: "broccoli", qty: 150 }, { foodId: "soy_milk", qty: 80 }],
    minutes: 18,
    steps: [
      "Pasta on. Drop the broccoli into the same water for the last 3 minutes.",
      "Fry the tofu hard in a dry pan until it squeaks and colours.",
      "Loosen the peanut butter with the soya milk and a splash of the pasta water into a sauce.",
      "Everything into the pan together, tossed until it coats.",
    ],
    tip: "Any nut butter works. Thin the sauce more than feels right — it tightens off the heat.",
    method: "Cook pasta and broccoli together, crisp the tofu, make a peanut sauce with soya milk and pasta water, toss it all through." },
  { id: "vg_lentil_shepherds", name: "Lentil shepherd's pie", slot: "Dinner",
    items: [{ foodId: "red_lentils", qty: 120 }, { foodId: "potatoes", qty: 350 }, { foodId: "mixed_veg_frozen", qty: 200 }, { foodId: "tomatoes_tin", qty: 200 }, { foodId: "olive_oil", qty: 12 }],
    minutes: 40,
    steps: [
      "Potatoes on to boil, 20 minutes, then mash with half the oil and a lot of seasoning.",
      "Meanwhile simmer the lentils with the tomatoes, veg and herbs for 20 minutes until thick.",
      "Lentils into a dish, mash spread over the top, fork the surface so it crisps.",
      "Under a hot grill for 6-8 minutes until the peaks brown.",
    ],
    tip: "Makes two portions. The second is better.",
    method: "Boil and mash the potatoes, simmer the lentils with tomatoes and veg, top and grill until browned." },
  { id: "vg_tofu_katsu", name: "Baked tofu katsu & rice", slot: "Dinner",
    items: [{ foodId: "tofu", qty: 300 }, { foodId: "rice", qty: 100 }, { foodId: "mixed_veg_frozen", qty: 200 }, { foodId: "olive_oil", qty: 12 }, { foodId: "tomatoes_tin", qty: 100 }],
    minutes: 35,
    steps: [
      "Oven to 200C. Press the tofu, slice into thick slabs, oil and season both sides.",
      "Bake 25 minutes, turning once, until the edges are firm and golden.",
      "Rice and veg on in the last 15 minutes.",
      "Blitz or mash the tomatoes with curry powder and a little oil for the sauce, warmed through.",
    ],
    tip: "Baking beats frying here — the slabs hold together instead of falling apart.",
    method: "Bake pressed, oiled tofu slabs at 200C for 25 minutes, serve with rice, veg and a quick curry sauce." },

  /**
   * The densest vegan lunch in the pool, added because 95kg/cut/vegan landed at
   * 89% of protein — one point under the floor.
   *
   * The other new vegan lunches (burrito bowl, peanut noodles) are good meals
   * and carry rice, pasta and peanut butter, which dilute density. A cutting
   * athlete needs one option with almost nothing in it but protein, so this is
   * tofu and lentils and greens, and no starch at all.
   */
  { id: "vg_tofu_lentil_no_starch", name: "Tofu, lentil & greens plate", slot: "Lunch",
    items: [{ foodId: "tofu", qty: 320 }, { foodId: "red_lentils", qty: 70 }, { foodId: "broccoli", qty: 200 }, { foodId: "spinach", qty: 100 }, { foodId: "olive_oil", qty: 10 }],
    minutes: 25,
    steps: [
      "Lentils on with double their volume of water and a stock cube, 20 minutes until they collapse.",
      "Press the tofu, cube it, and fry hard in the oil until every side has colour — 10 minutes, and resist stirring it.",
      "Steam the broccoli for 5 minutes, wilt the spinach into the lentils at the end.",
      "Plate the lentils, tofu on top, greens alongside.",
    ],
    tip: "No rice, no bread. That is the point — it is the meal for a day when calories are tight and protein isn't.",
    method: "Simmer the lentils, fry the tofu hard, steam the broccoli and wilt spinach through, then plate together." },

  // --- Vegetarian dinner (6) ------------------------------------------------
  { id: "vt_halloumi_traybake", name: "Egg & chickpea traybake", slot: "Dinner",
    items: [{ foodId: "chickpeas", qty: 240 }, { foodId: "eggs", qty: 3 }, { foodId: "sweet_potato", qty: 250 }, { foodId: "spinach", qty: 80 }, { foodId: "olive_oil", qty: 15 }],
    minutes: 35,
    steps: [
      "Oven to 200C. Cubed sweet potato and drained chickpeas onto a tray with the oil, paprika and cumin.",
      "Roast 25 minutes, shaking the tray once.",
      "Stir the spinach through, make three wells, and crack an egg into each.",
      "Back in for 6-8 minutes until the whites set and the yolks still move.",
    ],
    tip: "One tray, one wash-up. The chickpeas go crunchy, which is the point.",
    method: "Roast sweet potato and chickpeas at 200C, stir spinach through, bake eggs into wells for the last 8 minutes." },
  { id: "vt_paneer_style_curry", name: "Cheese & chickpea curry", slot: "Dinner",
    items: [{ foodId: "cheddar", qty: 80 }, { foodId: "chickpeas", qty: 240 }, { foodId: "tomatoes_tin", qty: 200 }, { foodId: "rice", qty: 90 }, { foodId: "spinach", qty: 100 }],
    minutes: 25,
    steps: [
      "Rice on.",
      "Tomatoes, chickpeas and curry powder into a pan, simmer 12 minutes until it thickens.",
      "Spinach wilted in, then the cheese cubed and folded through off the heat so it softens rather than melts away.",
    ],
    tip: "Paneer if you can get it. Cheddar is what most people actually have in.",
    method: "Simmer chickpeas with tomatoes and curry powder, wilt spinach in, fold cubed cheese through off the heat, serve with rice." },

  // --- Dairy-free snacks (8) ------------------------------------------------
  { id: "df_trail_pot", name: "Seed & fruit trail pot", slot: "Snack",
    items: [{ foodId: "almonds", qty: 30 }, { foodId: "seeds_mixed", qty: 25 }, { foodId: "banana", qty: 1 }, { foodId: "peanut_butter", qty: 20 }],
    minutes: 2,
    steps: ["Everything in a pot or a bag.", "Peanut butter on the banana, nuts and seeds alongside."],
    tip: "The one that survives a kit bag. Nothing here needs a fridge.",
    method: "Combine the nuts and seeds, eat with the banana and peanut butter." },
  { id: "df_bean_toast", name: "Beans on toast, properly", slot: "Snack",
    items: [{ foodId: "beans_baked", qty: 250 }, { foodId: "wholemeal_bread", qty: 80 }, { foodId: "seeds_mixed", qty: 15 }],
    minutes: 6,
    steps: [
      "Beans into a pan, not a microwave — 4 minutes over a medium heat reduces them and concentrates the flavour.",
      "Toast under them, seeds and black pepper over.",
    ],
    tip: "A splash of vinegar in the beans is the difference between fine and good.",
    method: "Reduce the beans in a pan for 4 minutes, serve on toast with seeds and pepper." },

  // ---------------------------------------------------------------------------
  // BIG MEALS, AND VEGAN MEALS THAT ACTUALLY CARRY PROTEIN.
  //
  // An audit across body types x goals x diets found two failures the pool
  // caused on its own, neither of which any amount of portion scaling can fix:
  //
  //   1. Big athletes were under-fed. A 115kg forward building at 4,370 kcal
  //      was handed 3,508 — 80% of target, 862 kcal short every day, for the
  //      one athlete whose entire goal is gaining. The heaviest dinner in the
  //      pool was 777 kcal and portions cap at 1.6x, so the ceiling was
  //      arithmetic, not preference.
  //
  //   2. Vegan plans collapsed on protein: 58-63% of target on a cut. Losing
  //      weight on 60% of your protein is how you lose muscle instead of fat.
  //      Vegan meals existed but were built from lentils and beans alone.
  //
  // These are deliberately calorie-dense and protein-dense rather than merely
  // larger portions of the same thing.
  { id: "big_oats_pb", name: "Bulking oats, peanut butter & banana", slot: "Breakfast",
    items: [{ foodId: "oats", qty: 120 }, { foodId: "milk", qty: 400 }, { foodId: "peanut_butter", qty: 40 }, { foodId: "whey_protein", qty: 30 }, { foodId: "banana", qty: 1 }],
    method: "Simmer the oats in the milk, stir the peanut butter through while hot, add the protein once it cools slightly, top with banana. Around 1,000 kcal without feeling like a challenge." },
  { id: "tofu_scramble", name: "Tofu scramble on toast", slot: "Breakfast",
    items: [{ foodId: "tofu", qty: 200 }, { foodId: "wholemeal_bread", qty: 80 }, { foodId: "spinach", qty: 60 }, { foodId: "seeds_mixed", qty: 20 }, { foodId: "olive_oil", qty: 10 }],
    method: "Crumble the tofu into hot oil, season hard (turmeric and black salt if you have them), wilt the spinach in, serve on toast with the seeds over." },
  { id: "pea_protein_oats", name: "Seeded overnight oats", slot: "Breakfast",
    items: [{ foodId: "oats", qty: 100 }, { foodId: "soy_milk", qty: 350 }, { foodId: "pea_protein", qty: 30 }, { foodId: "seeds_mixed", qty: 25 }, { foodId: "berries_frozen", qty: 80 }],
    method: "Stir everything but the berries together the night before. Top with berries in the morning. No cooking at all." },

  { id: "big_chicken_rice", name: "Double chicken & rice bowl", slot: "Lunch",
    items: [{ foodId: "chicken_breast", qty: 250 }, { foodId: "rice", qty: 150 }, { foodId: "olive_oil", qty: 15 }, { foodId: "mixed_veg_frozen", qty: 150 }, { foodId: "cheddar", qty: 30 }],
    method: "The batch-cook staple, sized for someone big. Pan-fry the chicken in the oil, boil the rice, steam the veg, cheese over the top." },
  { id: "tofu_quinoa_bowl", name: "Tofu & quinoa power bowl", slot: "Lunch",
    items: [{ foodId: "tofu", qty: 250 }, { foodId: "quinoa", qty: 100 }, { foodId: "black_beans", qty: 150 }, { foodId: "olive_oil", qty: 15 }, { foodId: "spinach", qty: 60 }],
    method: "Roast the tofu hard so it crisps, boil the quinoa, warm the beans through, toss it all with the oil and spinach." },

  { id: "big_beef_pasta", name: "Loaded beef pasta", slot: "Dinner",
    items: [{ foodId: "beef_mince_5", qty: 250 }, { foodId: "pasta", qty: 175 }, { foodId: "tomatoes_tin", qty: 200 }, { foodId: "cheddar", qty: 40 }, { foodId: "olive_oil", qty: 15 }],
    method: "Brown the mince, add the tomatoes and reduce, boil the pasta, cheese over the top. Makes two portions if you are not building." },
  { id: "big_salmon_potato", name: "Salmon, potatoes & greens", slot: "Dinner",
    items: [{ foodId: "salmon_fillet", qty: 220 }, { foodId: "potatoes", qty: 400 }, { foodId: "broccoli", qty: 150 }, { foodId: "olive_oil", qty: 20 }],
    method: "Roast the potatoes in most of the oil, bake the salmon for the last 15 minutes, steam the broccoli." },
  { id: "lentil_tofu_curry", name: "Lentil & tofu curry with rice", slot: "Dinner",
    items: [{ foodId: "red_lentils", qty: 120 }, { foodId: "tofu", qty: 200 }, { foodId: "rice", qty: 120 }, { foodId: "tomatoes_tin", qty: 200 }, { foodId: "olive_oil", qty: 15 }],
    method: "Simmer the lentils with the tomatoes until they break down, fry the tofu separately so it holds its shape, fold together and serve on rice." },

  { id: "pb_shake", name: "Peanut butter mass shake", slot: "Snack",
    items: [{ foodId: "milk", qty: 400 }, { foodId: "peanut_butter", qty: 40 }, { foodId: "oats", qty: 50 }, { foodId: "whey_protein", qty: 30 }, { foodId: "banana", qty: 1 }],
    method: "Blend. The easiest 800 kcal you will ever eat, and the answer when a big target won't fit into solid food." },
  /**
   * HIGH-PROTEIN PLANT MEALS, added because the numbers said so.
   *
   * A 115kg athlete cutting needs 72g of protein per 1000 kcal. The vegan pool
   * had 17 meals with a MEDIAN density of 53 — so most days simply could not
   * reach the target no matter which meals were picked, and the measured result
   * was 77-86% of protein on every vegetarian and vegan cut.
   *
   * No amount of scoring fixes a pool that does not contain the answer. These
   * are built around the only plant foods dense enough to move it: tofu (104),
   * pea protein (213) and soya milk (100), with starch kept deliberately low.
   * Each clears 80g/1000kcal, and they are sized generously so they also serve
   * the big athletes the size term is now looking after.
   */
  { id: "tofu_lentil_bowl", name: "Tofu, lentil & spinach bowl", slot: "Lunch",
    items: [{ foodId: "tofu", qty: 300 }, { foodId: "red_lentils", qty: 80 }, { foodId: "spinach", qty: 100 }, { foodId: "tomatoes_tin", qty: 200 }, { foodId: "olive_oil", qty: 10 }],
    method: "Simmer the lentils with the tomatoes and spices for 20 minutes. Fry the tofu hard until it colours, fold it through with the spinach at the end." },
  { id: "tofu_stirfry_big", name: "Tofu & broccoli stir-fry", slot: "Dinner",
    items: [{ foodId: "tofu", qty: 350 }, { foodId: "broccoli", qty: 200 }, { foodId: "rice", qty: 90 }, { foodId: "olive_oil", qty: 12 }, { foodId: "seeds_mixed", qty: 15 }],
    method: "Press the tofu, cube it, fry until crisp on every side. Steam the broccoli, keep the rice modest, seeds over at the end for crunch." },
  { id: "protein_soya_porridge", name: "Soya protein porridge", slot: "Breakfast",
    items: [{ foodId: "oats", qty: 70 }, { foodId: "soy_milk", qty: 450 }, { foodId: "pea_protein", qty: 40 }, { foodId: "berries_frozen", qty: 80 }],
    method: "Simmer the oats in the soya milk, take off the heat, then stir the protein through once it has cooled a little or it goes claggy." },
  { id: "chickpea_tofu_curry", name: "Chickpea & tofu curry", slot: "Dinner",
    items: [{ foodId: "tofu", qty: 250 }, { foodId: "chickpeas", qty: 240 }, { foodId: "tomatoes_tin", qty: 200 }, { foodId: "spinach", qty: 100 }, { foodId: "rice", qty: 70 }],
    method: "Onion, spices, tomatoes, then the chickpeas and tofu. Twenty minutes. Spinach wilted in right at the end." },
  { id: "pea_protein_shake_big", name: "Double pea protein shake", slot: "Snack",
    items: [{ foodId: "soy_milk", qty: 500 }, { foodId: "pea_protein", qty: 50 }, { foodId: "banana", qty: 1 }],
    method: "Blend. Deliberately light on fat so it tops up protein without eating into the day's calories." },

  /**
   * The same density, in a smaller portion.
   *
   * Adding big high-protein plant meals fixed the large athletes and left three
   * cases behind: a 55-65kg woman cutting on a vegan diet, at 84-86% of protein.
   * Density is scale-invariant, so scaling a dense meal down does not lose
   * protein — but the size term now correctly penalises a 900 kcal bowl for a
   * 1500 kcal day, so those meals stopped being picked for her at all.
   *
   * The pool therefore needs density at BOTH ends. Same foods, smaller plates.
   */
  { id: "tofu_salad_small", name: "Tofu & chickpea salad", slot: "Lunch",
    items: [{ foodId: "tofu", qty: 180 }, { foodId: "chickpeas", qty: 120 }, { foodId: "spinach", qty: 80 }, { foodId: "olive_oil", qty: 8 }],
    method: "Crisp the tofu in a dry pan, toss with the chickpeas and spinach, dress with the oil, lemon and plenty of pepper." },
  { id: "soya_protein_pot", name: "Soya protein pot", slot: "Snack",
    items: [{ foodId: "soy_milk", qty: 250 }, { foodId: "pea_protein", qty: 25 }, { foodId: "berries_frozen", qty: 60 }],
    method: "Shake it up in a bottle. Under 250 kcal and most of it protein — the gap-filler for a day that is already near its calorie target." },
  { id: "tofu_scramble_lean", name: "Lean tofu scramble", slot: "Breakfast",
    items: [{ foodId: "tofu", qty: 200 }, { foodId: "spinach", qty: 80 }, { foodId: "tomatoes_tin", qty: 100 }, { foodId: "olive_oil", qty: 5 }],
    method: "No toast. Crumble the tofu in with turmeric, add the tomatoes, wilt the spinach through at the end." },

  { id: "vegan_shake", name: "Soya, seed & pea protein shake", slot: "Snack",
    items: [{ foodId: "soy_milk", qty: 400 }, { foodId: "pea_protein", qty: 30 }, { foodId: "peanut_butter", qty: 30 }, { foodId: "banana", qty: 1 }],
    method: "Blend. Covers the protein a plant-based day usually misses." },
  { id: "oats_berries", name: "Protein porridge & berries", slot: "Breakfast",
    items: [{ foodId: "oats", qty: 80 }, { foodId: "milk", qty: 300 }, { foodId: "whey_protein", qty: 30 }, { foodId: "berries_frozen", qty: 80 }],
    method: "Simmer the oats in the milk for 4–5 minutes, take off the heat, stir the protein through once it's cooled slightly, then top with the berries." },
  { id: "eggs_toast", name: "Scrambled eggs on wholemeal", slot: "Breakfast",
    items: [{ foodId: "eggs", qty: 3 }, { foodId: "wholemeal_bread", qty: 80 }, { foodId: "spinach", qty: 50 }, { foodId: "olive_oil", qty: 5 }],
    method: "Scramble the eggs low and slow, wilt the spinach in at the end, and serve on toast." },
  { id: "yoghurt_bowl", name: "Greek yoghurt breakfast bowl", slot: "Breakfast",
    items: [{ foodId: "greek_yoghurt", qty: 250 }, { foodId: "oats", qty: 40 }, { foodId: "banana", qty: 1 }, { foodId: "peanut_butter", qty: 20 }],
    method: "Layer the yoghurt with oats, sliced banana and a spoon of peanut butter. No cooking — good for early starts." },

  { id: "chicken_rice", name: "Chicken, rice & broccoli", slot: "Lunch",
    items: [{ foodId: "chicken_breast", qty: 180 }, { foodId: "rice", qty: 90 }, { foodId: "broccoli", qty: 120 }, { foodId: "olive_oil", qty: 10 }],
    method: "Pan-fry the chicken in the oil, boil the rice, steam the broccoli. The batch-cook staple — make three at once." },
  { id: "tuna_wrap", name: "Tuna & salad wraps", slot: "Lunch",
    items: [{ foodId: "tuna_tin", qty: 100 }, { foodId: "tortilla_wrap", qty: 2 }, { foodId: "spinach", qty: 40 }, { foodId: "cheddar", qty: 25 }],
    method: "Drain the tuna, load the wraps with spinach and cheese, roll tight. Travels well in a kit bag." },
  { id: "beans_toast", name: "Beans, eggs & toast", slot: "Lunch",
    items: [{ foodId: "beans_baked", qty: 200 }, { foodId: "eggs", qty: 2 }, { foodId: "wholemeal_bread", qty: 80 }],
    method: "Heat the beans, poach or fry the eggs, toast the bread. Cheap, fast and surprisingly well balanced." },

  { id: "beef_pasta", name: "Beef bolognese & pasta", slot: "Dinner",
    items: [{ foodId: "beef_mince_5", qty: 150 }, { foodId: "pasta", qty: 100 }, { foodId: "tomatoes_tin", qty: 200 }, { foodId: "onion", qty: 80 }],
    method: "Brown the mince with the onion, add the tomatoes and simmer 20 minutes, serve over the pasta." },
  { id: "salmon_potato", name: "Salmon, potatoes & greens", slot: "Dinner",
    items: [{ foodId: "salmon_fillet", qty: 130 }, { foodId: "potatoes", qty: 300 }, { foodId: "broccoli", qty: 120 }, { foodId: "olive_oil", qty: 10 }],
    method: "Roast the salmon 15 minutes at 200°C, boil or roast the potatoes, steam the greens." },
  { id: "turkey_chilli", name: "Turkey chilli & rice", slot: "Dinner",
    items: [{ foodId: "turkey_mince", qty: 160 }, { foodId: "chickpeas", qty: 150 }, { foodId: "tomatoes_tin", qty: 200 }, { foodId: "rice", qty: 80 }],
    method: "Brown the turkey, add chickpeas and tomatoes, simmer 25 minutes and serve with rice. Freezes well." },
  { id: "chicken_sweet_potato", name: "Chicken & sweet potato traybake", slot: "Dinner",
    items: [{ foodId: "chicken_breast", qty: 180 }, { foodId: "sweet_potato", qty: 300 }, { foodId: "mixed_veg_frozen", qty: 150 }, { foodId: "olive_oil", qty: 10 }],
    method: "Everything on one tray, 25 minutes at 200°C. Minimal washing up." },

  { id: "shake_banana", name: "Protein shake & banana", slot: "Snack",
    items: [{ foodId: "whey_protein", qty: 30 }, { foodId: "milk", qty: 300 }, { foodId: "banana", qty: 1 }],
    method: "Blend or shake. The go-to within an hour of finishing training." },
  { id: "yoghurt_almonds", name: "Yoghurt & almonds", slot: "Snack",
    items: [{ foodId: "greek_yoghurt", qty: 200 }, { foodId: "almonds", qty: 25 }],
    method: "Straight from the tub. Slow-digesting protein — good before bed." },
  { id: "apple_pb", name: "Apple & peanut butter", slot: "Snack",
    items: [{ foodId: "apple", qty: 1 }, { foodId: "peanut_butter", qty: 25 }],
    method: "Slice the apple, dip. Easy carbs before a session." },

  // --- Plant-based, so vegetarian and vegan plans aren't empty --------------
  { id: "oats_soy", name: "Oats with soya milk & seeds", slot: "Breakfast",
    items: [{ foodId: "oats", qty: 80 }, { foodId: "soy_milk", qty: 300 }, { foodId: "seeds_mixed", qty: 20 }, { foodId: "banana", qty: 1 }],
    method: "Simmer the oats in soya milk, top with seeds and sliced banana." },
  // Renamed from a SECOND "tofu_scramble". There were two different recipes
  // under one id — 53 meals, 52 unique ids — so which one you got depended on
  // array order, and the repeat counter treated them as the same meal. Kept
  // rather than deleted: a lighter and a heavier version of the same dish is
  // exactly what the size-aware picker wants, now that it can tell them apart.
  { id: "tofu_scramble_light", name: "Tofu scramble on toast (lighter)", slot: "Breakfast",
    items: [{ foodId: "tofu", qty: 150 }, { foodId: "wholemeal_bread", qty: 80 }, { foodId: "spinach", qty: 50 }, { foodId: "olive_oil", qty: 8 }],
    method: "Crumble the tofu into a hot pan with turmeric and black pepper, wilt the spinach in, serve on toast." },
  { id: "coconut_bowl", name: "Coconut yoghurt & seed bowl", slot: "Breakfast",
    items: [{ foodId: "coconut_yoghurt", qty: 200 }, { foodId: "oats", qty: 40 }, { foodId: "berries_frozen", qty: 80 }, { foodId: "seeds_mixed", qty: 20 }],
    method: "Layer it all up the night before and it's ready when you are." },
  { id: "lentil_dhal", name: "Red lentil dhal & rice", slot: "Lunch",
    items: [{ foodId: "red_lentils", qty: 100 }, { foodId: "tomatoes_tin", qty: 200 }, { foodId: "onion", qty: 80 }, { foodId: "rice", qty: 80 }],
    method: "Soften the onion, add lentils, tomatoes and spices, simmer 25 minutes until thick. Cheap, high protein and it freezes." },
  { id: "chickpea_wrap", name: "Chickpea & spinach wraps", slot: "Lunch",
    items: [{ foodId: "chickpeas", qty: 200 }, { foodId: "tortilla_wrap", qty: 2 }, { foodId: "spinach", qty: 50 }, { foodId: "olive_oil", qty: 8 }],
    method: "Crush the chickpeas roughly with oil and lemon, load into wraps with spinach." },
  { id: "quinoa_beans", name: "Black bean & quinoa bowl", slot: "Dinner",
    items: [{ foodId: "black_beans", qty: 200 }, { foodId: "quinoa", qty: 90 }, { foodId: "mixed_veg_frozen", qty: 150 }, { foodId: "olive_oil", qty: 10 }],
    method: "Cook the quinoa, warm the beans with cumin and paprika, roast or steam the veg and combine." },
  { id: "tofu_stirfry", name: "Tofu & veg stir-fry with rice", slot: "Dinner",
    items: [{ foodId: "tofu", qty: 200 }, { foodId: "mixed_veg_frozen", qty: 200 }, { foodId: "rice", qty: 90 }, { foodId: "olive_oil", qty: 10 }],
    method: "Press and cube the tofu, fry until golden, throw in the veg for the last few minutes, serve over rice." },
  { id: "lentil_bolognese", name: "Lentil bolognese", slot: "Dinner",
    items: [{ foodId: "red_lentils", qty: 100 }, { foodId: "tomatoes_tin", qty: 200 }, { foodId: "onion", qty: 80 }, { foodId: "pasta", qty: 100 }],
    method: "Same method as a meat bolognese - soften the onion, add lentils and tomatoes, simmer until thick." },
  { id: "pea_shake", name: "Plant protein shake", slot: "Snack",
    items: [{ foodId: "pea_protein", qty: 30 }, { foodId: "soy_milk", qty: 300 }, { foodId: "banana", qty: 1 }],
    method: "Blend. Straightforward post-training protein without dairy." },
  { id: "seed_snack", name: "Seeds & apple", slot: "Snack",
    items: [{ foodId: "seeds_mixed", qty: 30 }, { foodId: "apple", qty: 1 }],
    method: "No prep, no allergens beyond seeds, travels anywhere." },

  // --- More of everything, because 23 meals could not fill a week -----------
  //
  // The library was 6 breakfasts, 5 lunches, 7 dinners and 5 snacks. A week
  // needs SEVEN breakfasts, so repetition wasn't a scoring failure, it was
  // arithmetic — and since everyone drew from the same six, two athletes with
  // completely different targets got identical weeks. No amount of clever
  // ranking fixes a pool smaller than the number of slots.
  //
  // Built from the 42 foods already in the database, so every one of these has
  // real prices and real macros and lands on the shopping list correctly.
  // Weighted toward the higher-protein end, which is where the pool was thinnest
  // and where the targets actually bite.
  { id: "eggs_scramble_wrap", name: "Scrambled egg & cheese wrap", slot: "Breakfast",
    items: [{ foodId: "eggs", qty: 3 }, { foodId: "tortilla_wrap", qty: 2 }, { foodId: "cheddar", qty: 30 }, { foodId: "spinach", qty: 40 }],
    method: "Scramble the eggs soft, fold through the cheese and wilted spinach, roll into the wraps." },
  { id: "yoghurt_whey_oats", name: "High-protein overnight oats", slot: "Breakfast",
    items: [{ foodId: "oats", qty: 70 }, { foodId: "greek_yoghurt", qty: 200 }, { foodId: "whey_protein", qty: 25 }, { foodId: "berries_frozen", qty: 80 }],
    method: "Stir it all together the night before. Nothing to cook and it travels." },
  { id: "salmon_bagel_eggs", name: "Salmon & scrambled eggs on toast", slot: "Breakfast",
    items: [{ foodId: "salmon_fillet", qty: 100 }, { foodId: "eggs", qty: 2 }, { foodId: "wholemeal_bread", qty: 80 }],
    method: "Flake cooked salmon through soft scrambled eggs, pile onto toast." },
  { id: "cottage_oats_pb", name: "Peanut butter banana oats", slot: "Breakfast",
    items: [{ foodId: "oats", qty: 80 }, { foodId: "milk", qty: 300 }, { foodId: "peanut_butter", qty: 25 }, { foodId: "banana", qty: 1 }],
    method: "Simmer the oats in milk, stir the peanut butter through at the end, top with banana." },

  { id: "chicken_wrap_salad", name: "Chicken salad wraps", slot: "Lunch",
    items: [{ foodId: "chicken_breast", qty: 180 }, { foodId: "tortilla_wrap", qty: 2 }, { foodId: "spinach", qty: 50 }, { foodId: "greek_yoghurt", qty: 60 }],
    method: "Shred cooked chicken, dress with yoghurt, lemon and pepper, load into wraps with spinach." },
  { id: "tuna_pasta_salad", name: "Tuna pasta salad", slot: "Lunch",
    items: [{ foodId: "tuna_tin", qty: 2 }, { foodId: "pasta", qty: 100 }, { foodId: "tomatoes_tin", qty: 100 }, { foodId: "olive_oil", qty: 10 }],
    method: "Cook the pasta, cool it, fold in tuna, tomatoes and oil. Better cold the next day." },
  { id: "turkey_rice_bowl", name: "Turkey rice bowl", slot: "Lunch",
    items: [{ foodId: "turkey_mince", qty: 180 }, { foodId: "rice", qty: 90 }, { foodId: "mixed_veg_frozen", qty: 150 }, { foodId: "olive_oil", qty: 8 }],
    method: "Brown the mince with whatever spice you like, serve over rice with the veg through it." },
  { id: "jacket_beans_cheese", name: "Jacket potato, beans & cheese", slot: "Lunch",
    items: [{ foodId: "potatoes", qty: 350 }, { foodId: "beans_baked", qty: 200 }, { foodId: "cheddar", qty: 40 }],
    method: "Bake or microwave the potato, split, load. The cheapest hot lunch there is." },
  { id: "quinoa_chicken_salad", name: "Chicken & quinoa salad", slot: "Lunch",
    items: [{ foodId: "chicken_breast", qty: 150 }, { foodId: "quinoa", qty: 80 }, { foodId: "broccoli", qty: 100 }, { foodId: "olive_oil", qty: 10 }],
    method: "Cook the quinoa, steam the broccoli, slice the chicken over the top and dress with oil and lemon." },

  { id: "chicken_pasta_bake", name: "Chicken pasta bake", slot: "Dinner",
    items: [{ foodId: "chicken_breast", qty: 200 }, { foodId: "pasta", qty: 100 }, { foodId: "tomatoes_tin", qty: 200 }, { foodId: "cheddar", qty: 40 }],
    method: "Combine cooked pasta, chicken and sauce in a dish, cheese on top, 15 minutes in the oven." },
  { id: "beef_rice_stirfry", name: "Beef & broccoli with rice", slot: "Dinner",
    items: [{ foodId: "beef_mince_5", qty: 200 }, { foodId: "rice", qty: 90 }, { foodId: "broccoli", qty: 150 }, { foodId: "olive_oil", qty: 8 }],
    method: "Brown the mince hard, add broccoli and a splash of water to steam, serve over rice." },
  { id: "salmon_quinoa_veg", name: "Salmon, quinoa & greens", slot: "Dinner",
    items: [{ foodId: "salmon_fillet", qty: 160 }, { foodId: "quinoa", qty: 90 }, { foodId: "broccoli", qty: 150 }],
    method: "Oven the salmon 14 minutes, cook the quinoa, steam the greens." },
  { id: "turkey_sweet_potato", name: "Turkey mince & sweet potato mash", slot: "Dinner",
    items: [{ foodId: "turkey_mince", qty: 200 }, { foodId: "sweet_potato", qty: 300 }, { foodId: "mixed_veg_frozen", qty: 150 }],
    method: "Mash the sweet potato, brown the mince with onion and herbs, veg on the side." },
  { id: "chicken_potato_veg", name: "Roast chicken, potatoes & veg", slot: "Dinner",
    items: [{ foodId: "chicken_breast", qty: 200 }, { foodId: "potatoes", qty: 300 }, { foodId: "broccoli", qty: 150 }, { foodId: "olive_oil", qty: 10 }],
    method: "Everything on one tray at 200C, greens steamed at the end. Minimal washing up." },
  { id: "tuna_jacket", name: "Tuna jacket potato", slot: "Dinner",
    items: [{ foodId: "tuna_tin", qty: 2 }, { foodId: "potatoes", qty: 350 }, { foodId: "greek_yoghurt", qty: 60 }, { foodId: "spinach", qty: 50 }],
    method: "Yoghurt instead of mayo — same texture, considerably more protein." },

  { id: "yoghurt_berries_snack", name: "Greek yoghurt & berries", slot: "Snack",
    items: [{ foodId: "greek_yoghurt", qty: 200 }, { foodId: "berries_frozen", qty: 80 }],
    method: "Defrost the berries in the microwave for 30 seconds and stir through." },
  { id: "eggs_boiled_snack", name: "Boiled eggs & an apple", slot: "Snack",
    items: [{ foodId: "eggs", qty: 3 }, { foodId: "apple", qty: 1 }],
    method: "Boil a batch at the start of the week. Seven minutes, then cold water." },
  { id: "cheese_bread_snack", name: "Cheese on toast", slot: "Snack",
    items: [{ foodId: "cheddar", qty: 50 }, { foodId: "wholemeal_bread", qty: 80 }],
    method: "Grill rather than toast, so the cheese goes properly molten." },
  { id: "whey_milk_snack", name: "Whey & milk", slot: "Snack",
    items: [{ foodId: "whey_protein", qty: 30 }, { foodId: "milk", qty: 300 }],
    method: "Thirty seconds, 45g of protein. The fallback when there's no time." },
  { id: "chickpea_snack", name: "Roast chickpeas", slot: "Snack",
    items: [{ foodId: "chickpeas", qty: 150 }, { foodId: "olive_oil", qty: 8 }],
    method: "Drain, dry, toss in oil and paprika, 25 minutes at 200C until they rattle." },
];

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
const REPEAT_PENALTY = 0.85; // £
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
const FAVOURITE_BONUS = 3.0; // £
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
export function buildWeek(
  targets: PlanTargets,
  seed = 0,
  prefs: MealPrefs = DEFAULT_PREFS,
  schedule: DietSchedule = EMPTY_SCHEDULE
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
  const repeatPenalty = prefs.budget ? REPEAT_PENALTY * 0.35 : REPEAT_PENALTY;
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
          + (uses.get(meal.id) ?? 0) * repeatPenalty
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
