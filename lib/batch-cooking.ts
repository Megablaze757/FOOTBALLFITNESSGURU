/**
 * Cook once, eat twice.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS IS THE CHEAPEST LEVER LEFT.
 *
 * The planner pays REPEAT_PENALTY — £4 and escalating — to avoid serving the
 * same meal twice, and it is right to: an average week used to contain twelve
 * distinct meals across 28 slots with Monday, Tuesday and Wednesday identical,
 * and "the meals are repetitive" survived every attempt to fix it by adding
 * recipes. Variety costs money and the money was worth spending.
 *
 * But that penalty treats two different things as the same thing. Being served
 * chilli on Monday and again on Thursday, as though it were a new meal, is
 * monotony. Eating Sunday's chilli for Monday's lunch is not — it is how
 * everybody who cooks actually eats, it is the single most common piece of
 * advice given to anybody trying to eat well on little money, and nobody
 * experiences it as the same meal twice.
 *
 * The difference is entirely in whether it is DECLARED. A leftover that says it
 * is a leftover reads as intent; the identical plate served silently reads as
 * the app running out of ideas. So batching is labelled, capped, and only ever
 * next-day — and the repeat penalty is waived for exactly that case.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The saving is real rather than notional: the second serving adds portions of
 * food the basket has already bought, so it costs marginal ingredients instead
 * of a fresh set. See `ongoingMarginalCost` in meal-plan.ts.
 */

import type { Meal } from "@/lib/meal-plan";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A LEFTOVER HAS TO STILL BE GOOD TOMORROW, and most food is not.
 *
 * The default is NO. A soggy reheated salad presented as tomorrow's lunch is
 * worse than the two pounds it saved — somebody eats it once, decides the meal
 * plans are rubbish, and stops opening the app. So a meal is batched only when
 * it is recognisably the kind of thing that improves overnight, and anything
 * unrecognised is left alone.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Dishes that genuinely reheat, and mostly taste better the next day. */
const KEEPS = [
  "chilli", "chili", "curry", "dal", "daal", "dhal", "stew", "casserole", "hotpot",
  "bolognese", "ragu", "ragù", "lasagne", "lasagna", "chowder", "soup", "broth",
  "tagine", "goulash", "jambalaya", "gumbo", "risotto", "paella", "biryani",
  "traybake", "tray bake", "bake", "pie", "cottage pie", "shepherd", "moussaka",
  "pulled", "braised", "slow-cook", "slow cook", "batch", "stroganoff",
  "meatballs", "burrito bowl", "chickpea", "lentil", "bean",
];

/**
 * Dishes that do not survive a night, whatever else their name says.
 *
 * CHECKED FIRST AND WINS, because the two lists overlap in exactly the places
 * that matter: "chicken salad bowl with lentils" contains `lentil` and is still
 * a salad, and a "soup and toasted sandwich" is half a thing that goes soft.
 */
const SPOILS = [
  "salad", "smoothie", "shake", "juice", "cereal", "porridge", "oats", "overnight",
  "toast", "sandwich", "wrap", "bagel", "croissant", "pancake", "waffle", "omelette",
  "omelet", "scrambled", "fried egg", "poached", "sushi", "sashimi", "carpaccio",
  "crisp", "chips", "fries", "tempura", "battered", "yoghurt", "yogurt", "granola",
  "ice", "sorbet", "avocado", "guacamole", "fresh", "raw", "tartare", "ceviche",
];

const has = (name: string, words: string[]) => {
  const n = name.toLowerCase();
  return words.some((w) => n.includes(w));
};

/** Will this still be worth eating tomorrow? Unrecognised means no. */
export function keepsWell(meal: Pick<Meal, "name" | "slot">): boolean {
  // Only a cooked main. A batched breakfast is a strange idea and a batched
  // snack saves nothing worth the monotony.
  if (meal.slot !== "Dinner" && meal.slot !== "Lunch") return false;
  if (has(meal.name, SPOILS)) return false;
  return has(meal.name, KEEPS);
}

/**
 * How many leftover meals a week may contain.
 *
 * Three is cook-once-eat-twice on three of seven dinners, which is what a
 * person doing this deliberately actually does. Above that the week stops
 * being a meal plan and becomes a rota — and the whole reason the repeat
 * penalty exists is that a week of four distinct dinners is miserable.
 */
export const MAX_LEFTOVERS = 3;

/** One planned batch: cook it on `cookDay`, eat it again on `eatDay`. */
export interface Leftover {
  /** Index into the week, 0-6. */
  cookDay: number;
  eatDay: number;
  /** The slot the leftover fills — always the day after, always lunch. */
  slot: "Lunch";
  mealId: string;
  mealName: string;
}

interface DayLike {
  meals: { meal: Pick<Meal, "id" | "name" | "slot"> }[];
}

/**
 * Which dinners this week are worth cooking double.
 *
 * ALWAYS NEXT-DAY LUNCH, and never anything else. Two days later is a food
 * safety question this app has no business answering, and the same dinner
 * twice in a row is the monotony the penalty exists to prevent — the lunch slot
 * is the one where "that's last night's, and it's better today" is simply true.
 *
 * Days are not reused: a lunch that is already somebody else's leftover cannot
 * also be replaced, and a dinner already being eaten as a leftover is not
 * batched again into a third serving.
 */
export function planLeftovers(days: DayLike[], limit = MAX_LEFTOVERS): Leftover[] {
  const out: Leftover[] = [];
  const spokenFor = new Set<number>();

  for (let i = 0; i < days.length - 1 && out.length < limit; i++) {
    if (spokenFor.has(i)) continue;
    const dinner = days[i]?.meals.find((m) => m.meal.slot === "Dinner");
    if (!dinner || !keepsWell(dinner.meal)) continue;

    const next = days[i + 1];
    if (!next || spokenFor.has(i + 1)) continue;
    // Something has to be there to replace — a day with no lunch planned is a
    // day somebody said they were eating out.
    if (!next.meals.some((m) => m.meal.slot === "Lunch")) continue;

    out.push({
      cookDay: i, eatDay: i + 1, slot: "Lunch",
      mealId: dinner.meal.id, mealName: dinner.meal.name,
    });
    // Neither day can take part in another batch: no three-serving chains, and
    // no day that is both a leftover and a source.
    spokenFor.add(i);
    spokenFor.add(i + 1);
  }

  return out;
}

/** "Last night's chilli con carne" — what the lunch slot is called. */
export function leftoverLabel(mealName: string): string {
  return `Last night's ${mealName.toLowerCase()}`;
}

/**
 * What to tell them at the point of cooking, which is the night before.
 *
 * A leftover only works if somebody knew to make extra. Finding out at lunchtime
 * that you were supposed to have cooked double is the plan being wrong about
 * your day, which is worse than not suggesting it.
 */
export function batchTip(mealName: string): string {
  return `Cook double — half of this is tomorrow's lunch. It keeps overnight and ${mealName.toLowerCase()} is better for it.`;
}
