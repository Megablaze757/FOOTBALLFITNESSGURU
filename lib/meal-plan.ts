// =============================================================================
// Meal plan + shopping list. Turns body stats and training load into calorie
// and macro targets, builds a week of meals that hits them, then aggregates the
// ingredients into a costed shopping list.
//
// Costs are estimates from our own maintained price table — see lib/food-db.ts
// for why live supermarket pricing isn't available. Pure + tested.
// =============================================================================

import { FOODS, FOOD_BY_ID, type Aisle, type Food } from "./food-db";

export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "high" | "athlete";
export type DietGoal = "cut" | "maintain" | "build";

export const ACTIVITY_LEVELS: { id: ActivityLevel; label: string; blurb: string; factor: number }[] = [
  { id: "sedentary", label: "Sedentary", blurb: "Desk job, little training", factor: 1.2 },
  { id: "light", label: "Light", blurb: "1–2 sessions a week", factor: 1.375 },
  { id: "moderate", label: "Moderate", blurb: "3–4 sessions a week", factor: 1.55 },
  { id: "high", label: "High", blurb: "5–6 sessions a week", factor: 1.725 },
  { id: "athlete", label: "Athlete", blurb: "Daily training or two-a-days", factor: 1.9 },
];

export const DIET_GOALS: { id: DietGoal; label: string; blurb: string; adjust: number }[] = [
  { id: "cut", label: "Lean down", blurb: "Lose fat, hold muscle", adjust: -0.18 },
  { id: "maintain", label: "Maintain", blurb: "Fuel performance", adjust: 0 },
  { id: "build", label: "Build muscle", blurb: "Gain size and strength", adjust: 0.12 },
];

export interface BodyStats {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: DietGoal;
}

export interface PlanTargets {
  bmr: number;
  tdee: number;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  rationale: string;
}

/**
 * Mifflin-St Jeor — the equation with the best track record for estimating
 * resting metabolic rate in non-obese adults. Needs height and age, which is
 * why weight alone was never enough.
 */
export function basalRate({ sex, age, heightCm, weightKg }: BodyStats): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(sex === "male" ? base + 5 : base - 161);
}

export function planTargets(stats: BodyStats): PlanTargets {
  const bmr = basalRate(stats);
  const factor = ACTIVITY_LEVELS.find((a) => a.id === stats.activity)?.factor ?? 1.55;
  const tdee = Math.round(bmr * factor);
  const adjust = DIET_GOALS.find((g) => g.id === stats.goal)?.adjust ?? 0;
  const calories = Math.round((tdee * (1 + adjust)) / 10) * 10;

  // Protein first (it's what protects muscle in a deficit and builds it in a
  // surplus), then fats for hormones, carbs take the remainder as training fuel.
  const proteinPerKg = stats.goal === "cut" ? 2.2 : stats.goal === "build" ? 2.0 : 1.8;
  const protein = Math.round(stats.weightKg * proteinPerKg);
  const fats = Math.round(stats.weightKg * 0.9);
  const remaining = calories - protein * 4 - fats * 9;
  const carbs = Math.max(50, Math.round(remaining / 4));

  const goalLabel = DIET_GOALS.find((g) => g.id === stats.goal)?.label.toLowerCase() ?? "maintain";
  return {
    bmr, tdee, calories, protein, carbs, fats,
    rationale: `Your body burns about ${bmr} kcal at rest and roughly ${tdee} with your training load. To ${goalLabel} we've set ${calories} kcal with ${protein}g protein (${proteinPerKg}g per kg) to protect muscle.`,
  };
}

// --- meals -------------------------------------------------------------------

export type Slot = "Breakfast" | "Lunch" | "Dinner" | "Snack";

export interface MealItem { foodId: string; qty: number } // grams/ml, or count for "each"

export interface Meal {
  id: string;
  name: string;
  slot: Slot;
  items: MealItem[];
  method: string;
}

export const MEALS: Meal[] = [
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
export interface PlannedDay { day: string; meals: PlannedMeal[]; macros: Macros }

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const bySlot = (s: Slot) => MEALS.filter((m) => m.slot === s);

/**
 * Build a week. Meals rotate so nobody eats the same thing seven days running,
 * then each day is scaled to land on the calorie target. Portions are clamped
 * so we never prescribe a comically small or huge plate.
 */
export function buildWeek(targets: PlanTargets, seed = 0): PlannedDay[] {
  const breakfasts = bySlot("Breakfast"), lunches = bySlot("Lunch");
  const dinners = bySlot("Dinner"), snacks = bySlot("Snack");

  return DAYS.map((day, i) => {
    const picks = [
      breakfasts[(i + seed) % breakfasts.length],
      lunches[(i + seed) % lunches.length],
      dinners[(i + seed) % dinners.length],
      snacks[(i + seed) % snacks.length],
    ].filter(Boolean);

    const base = picks.reduce((s, m) => s + mealMacros(m).kcal, 0);
    const raw = base > 0 ? targets.calories / base : 1;
    const scale = Math.round(Math.min(1.6, Math.max(0.6, raw)) * 20) / 20; // 0.05 steps

    const meals = picks.map((meal) => ({ meal, scale, macros: mealMacros(meal, scale) }));
    const macros = meals.reduce(
      (s, m) => ({
        kcal: s.kcal + m.macros.kcal, protein: s.protein + m.macros.protein,
        carbs: s.carbs + m.macros.carbs, fats: s.fats + m.macros.fats,
      }),
      { kcal: 0, protein: 0, carbs: 0, fats: 0 }
    );
    return { day, meals, macros };
  });
}

// --- shopping list -----------------------------------------------------------

export interface ShoppingLine {
  food: Food;
  needed: number;   // total grams/ml/count across the week
  packs: number;    // whole packs to buy
  cost: number;     // £ estimate
}

export interface ShoppingList {
  lines: ShoppingLine[];
  byAisle: { aisle: Aisle; lines: ShoppingLine[]; cost: number }[];
  total: number;
}

export function shoppingList(week: PlannedDay[]): ShoppingList {
  const needed = new Map<string, number>();
  for (const day of week) {
    for (const pm of day.meals) {
      for (const it of pm.meal.items) {
        needed.set(it.foodId, (needed.get(it.foodId) ?? 0) + it.qty * pm.scale);
      }
    }
  }

  const lines: ShoppingLine[] = [];
  for (const [foodId, qty] of needed) {
    const food = FOOD_BY_ID[foodId];
    if (!food) continue;
    const packs = Math.max(1, Math.ceil(qty / food.packSize));
    lines.push({ food, needed: Math.round(qty), packs, cost: Math.round(packs * food.packPrice * 100) / 100 });
  }
  lines.sort((a, b) => a.food.name.localeCompare(b.food.name));

  const aisles = [...new Set(lines.map((l) => l.food.aisle))];
  const byAisle = aisles.map((aisle) => {
    const ls = lines.filter((l) => l.food.aisle === aisle);
    return { aisle, lines: ls, cost: Math.round(ls.reduce((s, l) => s + l.cost, 0) * 100) / 100 };
  });

  return {
    lines,
    byAisle,
    total: Math.round(lines.reduce((s, l) => s + l.cost, 0) * 100) / 100,
  };
}

/** Plain-text list, for pasting into a supermarket app or messaging it to someone. */
export function shoppingListText(list: ShoppingList): string {
  const out: string[] = ["Shopping list — Fitness Guru", ""];
  for (const group of list.byAisle) {
    out.push(`${group.aisle}`);
    for (const l of group.lines) {
      out.push(`  - ${l.food.name} x${l.packs} (${l.food.packLabel}) ~£${l.cost.toFixed(2)}`);
    }
    out.push("");
  }
  out.push(`Estimated total: ~£${list.total.toFixed(2)}`);
  out.push("(estimates from typical UK supermarket prices, not live pricing)");
  return out.join("\n");
}

export { FOODS };
