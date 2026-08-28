/**
 * What a budget actually buys, when the answer is "not that".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RULE NOBODY CAN FIX, TURNED INTO THE THING THE APP IS FOR.
 *
 * A 95kg athlete cutting needs 209g of protein a day — 1,463g a week. At the
 * single cheapest rate anywhere in the recipe book (34.7g per pound, and that is
 * a carb-heavy dhal) the protein alone is £42.20 before a vegetable. £50 a week
 * is not a hard target for that person; it is an arithmetic impossibility, and
 * no amount of searching will find it.
 *
 * The app used to answer that with a number and a shrug: "£39 over your budget.
 * Cooking fewer, larger meals or eating out less are the two biggest levers
 * left." Both halves are bad. The number tells them they failed, and the advice
 * was never measured — it is a sentence somebody wrote once, offered to every
 * athlete regardless of whether either lever moves anything for them.
 *
 * But the app knows exactly what it costs to feed this person, which is
 * genuinely rare and worth more than the plan. So the failure becomes the
 * feature: here is your real floor, here is what the protein alone costs, and
 * here is what each change is worth IN YOUR WEEK — measured by re-planning it,
 * not guessed at.
 *
 * "£50 is not possible, £64 is, and here is the £14" is a useful answer.
 * "£39 over" is not.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure: every price comes from a re-plan the caller performs. Nothing here
 * touches the planner, which is what keeps it testable and keeps meal-plan.ts
 * from importing its own advice.
 */

import type { MealPrefs } from "@/lib/meal-plan";

/** One measured change and what it is worth. */
export interface BudgetLever {
  id: string;
  /** What the athlete would be choosing. */
  label: string;
  /** What it means in practice — the cost of the saving, in their terms. */
  detail: string;
  /** Pounds off the week. Always positive; a lever that costs money is dropped. */
  saving: number;
  /** The preference change that produces it, for a one-tap apply. */
  change: Partial<MealPrefs>;
}

/**
 * The levers worth measuring, in the order they cost the athlete something.
 *
 * DELIBERATELY SHORT AND ALL REAL. Every one is a preference this app already
 * has, so "apply it" is a setting change rather than a promise. Anything the
 * planner cannot actually do is not on the list, however good the advice would
 * sound.
 */
export interface LeverSpec {
  id: string;
  label: string;
  detail: string;
  change: Partial<MealPrefs>;
  /** Skip when it is already true — offering somebody a change they have made. */
  redundant: (prefs: MealPrefs) => boolean;
}

export const LEVER_SPECS: LeverSpec[] = [
  {
    id: "fewer-meals",
    label: "Three meals a day instead of more",
    detail: "Fewer, bigger plates. The same food in less packaging and less waste.",
    change: { mealsPerDay: 3 },
    redundant: (p) => p.mealsPerDay <= 3,
  },
  {
    id: "meat-free",
    label: "Go meat-free",
    detail: "Lentils, beans and eggs carry protein at three to five times the pounds-per-gram of meat.",
    change: { pattern: "vegetarian" },
    redundant: (p) => p.pattern === "vegetarian" || p.pattern === "vegan",
  },
  {
    id: "cheap-mode",
    label: "Let it lean harder on price",
    detail: "The planner trades some variety and slot fit for a cheaper shop.",
    change: { budget: true },
    redundant: (p) => p.budget === true,
  },
];

/**
 * Price each lever by re-planning with it, and keep only the ones that pay.
 *
 * MEASURED, NOT ASSERTED. The old advice named two levers without ever checking
 * either against the athlete in front of it — and "cook fewer, larger meals" is
 * worth nothing to somebody already on three meals a day, which the app knew
 * and said anyway. A lever that saves nothing here is not shown here.
 *
 * @param costWith re-plans with the change applied and returns the weekly cost
 */
export function measureLevers(
  prefs: MealPrefs,
  baselineCost: number,
  costWith: (change: Partial<MealPrefs>) => number,
): BudgetLever[] {
  const out: BudgetLever[] = [];

  for (const spec of LEVER_SPECS) {
    if (spec.redundant(prefs)) continue;
    const cost = costWith(spec.change);
    const saving = Math.round((baselineCost - cost) * 100) / 100;
    // A pound is the floor worth mentioning. Below that it is noise in the
    // pack-size rounding, and offering somebody a diet change for 40p is
    // insulting.
    if (saving < 1) continue;
    out.push({ id: spec.id, label: spec.label, detail: spec.detail, saving, change: spec.change });
  }

  return out.sort((a, b) => b.saving - a.saving);
}

export interface BudgetAdvice {
  /** The cheapest week that still feeds them, as they are set up now. */
  floor: number;
  /** What they asked for. */
  budget: number;
  /** Measured, biggest first. Empty when nothing available moves it. */
  levers: BudgetLever[];
  /** Floor minus every lever — the best this athlete can do inside the app. */
  bestPossible: number;
  /** True when the levers close the gap. */
  reachable: boolean;
  /** The honest headline. */
  headline: string;
  /** What the protein alone costs, when it is the thing driving the number. */
  proteinNote: string | null;
}

/**
 * The best protein-per-pound anywhere in the book, as a rate.
 *
 * Passed in rather than computed here so this module stays free of the recipe
 * data — and so a test can pin the number rather than track the book.
 */
export function proteinFloorCost(proteinPerDay: number, bestGramsPerPound: number): number {
  if (!(proteinPerDay > 0) || !(bestGramsPerPound > 0)) return 0;
  return Math.round(((proteinPerDay * 7) / bestGramsPerPound) * 100) / 100;
}

export function budgetAdvice(
  budget: number,
  floor: number,
  levers: BudgetLever[],
  proteinPerDay: number,
  bestGramsPerPound: number,
): BudgetAdvice {
  /**
   * Savings are NOT simply added up.
   *
   * Two levers that both work by moving the plan onto lentils do not save twice
   * — and presenting them as if they did is exactly the sort of arithmetic that
   * gets somebody to the till £12 short. Each is measured alone, so the honest
   * combined claim is "at least the largest of them", and the rest are offered
   * as further options rather than as a total.
   */
  const best = levers.length ? Math.round((floor - levers[0].saving) * 100) / 100 : floor;
  const reachable = best <= budget;

  const proteinCost = proteinFloorCost(proteinPerDay, bestGramsPerPound);
  /**
   * Only when protein is genuinely most of the bill. On a maintenance plan for
   * a 62kg athlete it is a third of it, and leading with it would be pointing
   * at the wrong thing.
   */
  const proteinNote = proteinCost >= floor * 0.5
    ? `Most of that is the protein itself: ${Math.round(proteinPerDay)}g a day is ${Math.round(proteinPerDay * 7)}g across the week, `
      + `and even at the cheapest source in the book that is about £${proteinCost.toFixed(2)} before a single vegetable.`
    : null;

  const headline = reachable
    ? `£${budget.toFixed(2)} is doable, but not the way you are set up now — as things stand the cheapest week that still feeds you is £${floor.toFixed(2)}. `
      + `${levers[0].label} brings it to about £${best.toFixed(2)}.`
    : levers.length
      ? `£${budget.toFixed(2)} is not reachable for what you are asking your body to do. The cheapest week that still feeds you properly is £${floor.toFixed(2)}, `
        + `and the biggest change available takes it to about £${best.toFixed(2)}.`
      : `£${budget.toFixed(2)} is not reachable for what you are asking your body to do. The cheapest week that still feeds you properly is £${floor.toFixed(2)}, `
        + `and there is nothing left to trade that would not come out of your food.`;

  return { floor, budget, levers, bestPossible: best, reachable, headline, proteinNote };
}
