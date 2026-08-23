"use client";

import { useMemo, useState } from "react";
import {
  MEALS, mealAllowed, mealMacros, recipeSteps, ongoingMarginalCost,
  type Meal, type MealPrefs, type Slot,
} from "@/lib/meal-plan";
import { cookRating } from "@/lib/recipe-difficulty";
import { FOOD_BY_ID } from "@/lib/food-db";
import { MealFilterBar } from "@/components/MealFilterBar";
import { passesFilters, matchesQuery, activeFilterCount, NO_FILTERS, type MealFilters } from "@/lib/meal-filters";

/**
 * Change one meal without regenerating the week.
 *
 * WHY THIS EXISTS. The only control over the plan was "regenerate", which
 * rerolls all twenty-eight meals. Someone who likes their week except for
 * Thursday's dinner had to gamble the whole thing to fix one slot — so nobody
 * did, and the plan was take-it-or-leave-it. A meal plan you cannot edit is a
 * suggestion, not a plan.
 *
 * THE UX DECISION THAT MATTERS: the alternatives are RANKED BY FIT, and each
 * one shows what it costs you. A flat alphabetical list of eighty meals is not
 * a choice, it is homework — and picking blind means the day silently stops
 * hitting its targets, which is the one thing the planner is for.
 *
 * So each option carries its calories against this slot's target, its protein,
 * and its cooking time, and the list opens with the ones that fit best. Someone
 * who wants the 900 kcal option anyway can still have it; they just get to see
 * that it is 900 rather than finding out from the day's total.
 */

export interface SwapTarget {
  dayIndex: number;
  dayName: string;
  slot: Slot;
  nth: number;
  current: Meal;
  /** Calories this slot is meant to carry, for the athlete. */
  slotKcal: number;
}

export function MealSwap({ target, prefs, starred = [], basket, onPick, onClose }: {
  target: SwapTarget;
  prefs: MealPrefs;
  /** Dishes the athlete starred, so the Starred chip means something here too. */
  starred?: string[];
  /**
   * The rest of the week's trolley, so each option can be priced against it.
   *
   * WITHOUT IT THIS SHEET IS A BUDGET FEATURE'S BLIND SPOT. Swapping a meal is
   * the athlete's main lever on the shop once the week is built, and the sheet
   * ranked by slot fit and said nothing about money — so somebody who had just
   * told the app they were on a budget chose their replacement with no idea
   * whether it was the £1 option or the £4 one.
   *
   * It has to be the rest of the week and not the whole week, or the meal being
   * replaced pays for its own ingredients twice and every alternative looks
   * dear by comparison.
   *
   * Optional: the library opens this sheet with no week behind it, and a
   * missing basket means the prices are simply not shown rather than shown
   * wrong.
   */
  basket?: Map<string, number>;
  onPick: (mealId: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<MealFilters>(NO_FILTERS);

  const options = useMemo(() => {
    const pool = MEALS.filter(
      (m) => m.slot === target.slot && mealAllowed(m, prefs) && m.id !== target.current.id
    );
    const scored = pool.map((meal) => {
      const macros = mealMacros(meal);
      // Portion scaling covers 0.55–1.6, so "fit" is really "can this be served
      // at a sensible portion for this slot" rather than raw calorie distance.
      const ratio = target.slotKcal > 0 ? macros.kcal / target.slotKcal : 1;
      const fit = ratio < 0.55 ? 0.55 / ratio : ratio > 1.6 ? ratio / 1.6 : 1;
      // Priced at the portion it would be served in, for the same reason the
      // planner does: a meal scaled to 1.6 costs 1.6 servings, and quoting the
      // recipe price would understate exactly the swaps that cost the most.
      const scale = target.slotKcal > 0 && macros.kcal > 0
        ? Math.round(Math.min(1.6, Math.max(0.55, target.slotKcal / macros.kcal)) * 20) / 20
        : 1;
      const cost = basket ? ongoingMarginalCost(meal, basket, scale) : null;
      return { meal, macros, fit, cost };
    });
    // Search now covers ingredients as well as names — "chickpeas" is a
    // reasonable thing to want from a swap list, and matching only the title
    // answered it wrong. Same rule as the library, from lib/meal-filters.
    const filtered = scored.filter((s) =>
      matchesQuery(s.meal, q, (id) => FOOD_BY_ID[id]?.name) && passesFilters(s.meal, filters, starred));
    return filtered.sort((a, b) => a.fit - b.fit || b.macros.protein - a.macros.protein);
  }, [target, prefs, q, filters, starred, basket]);

  /**
   * What the meal being replaced costs, so the others can be quoted against it.
   *
   * A price on its own ("£2.40") is a number the athlete has to hold in their
   * head and compare; a difference ("80p more") is the answer. And most of
   * these come out at nothing, which is the useful, non-obvious fact: the
   * ingredients are already in the trolley for another day.
   */
  const currentCost = useMemo(() => {
    if (!basket) return null;
    const kcal = mealMacros(target.current).kcal;
    const scale = target.slotKcal > 0 && kcal > 0
      ? Math.round(Math.min(1.6, Math.max(0.55, target.slotKcal / kcal)) * 20) / 20
      : 1;
    return ongoingMarginalCost(target.current, basket, scale);
  }, [target, basket]);

  /** Every option for this slot, ignoring the search and chips. */
  const poolSize = useMemo(
    () => MEALS.filter((m) => m.slot === target.slot && mealAllowed(m, prefs) && m.id !== target.current.id).length,
    [target, prefs]
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Swap ${target.dayName} ${target.slot.toLowerCase()}`}
      onClick={onClose}
    >
      {/* A sheet from the bottom on a phone, a centred dialog on a laptop. The
          list can run to eighty rows, so it scrolls inside a fixed frame rather
          than growing the page behind it. */}
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-ink-900 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-white/[0.08] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="stat-label">{target.dayName} · {target.slot}</span>
              <h3 className="mt-0.5 truncate text-lg font-extrabold text-slate-100">
                Swap {target.current.name}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Best fit first — around {Math.round(target.slotKcal)} kcal for this slot.
              </p>
            </div>
            <button onClick={onClose} className="tap-target shrink-0 text-slate-400 hover:text-slate-200" aria-label="Close">
              ✕
            </button>
          </div>

          {/* Keyed off the SLOT'S POOL, not the filtered result. Keying it off
              `options` made the search box disappear the moment a search
              narrowed the list to six — removing the control you were using,
              mid-type, with no way to widen it again. */}
          {poolSize > 6 && (
            <>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search meals or ingredients…"
                className="field mt-3"
                aria-label="Search meals or ingredients"
              />
              <div className="mt-3">
                <MealFilterBar
                  filters={filters}
                  onChange={setFilters}
                  // The list is already restricted to this athlete's diet, so a
                  // vegan filtering for "Vegan" would be filtering to
                  // everything — a chip that cannot change the result.
                  hide={[
                    ...(prefs.pattern === "vegan" ? (["veggie", "vegan"] as const) : []),
                    ...(prefs.pattern === "vegetarian" ? (["veggie"] as const) : []),
                    ...(starred.length ? [] : (["starred"] as const)),
                  ]}
                />
              </div>
            </>
          )}
        </div>

        {/* pb-28 on the SCROLLING element, not on the sheet.
            On a phone this opens as a bottom sheet (`items-end`), flush to the
            bottom of the viewport — and the tab bar is z-[60] against this
            sheet's z-50, so it is drawn ON TOP. Measured: the last row ended
            90px below the top of the bar, unreadable and untappable, with
            nothing on screen to suggest the list continued.

            Padding the sheet would leave a dead gap under a short list. Padding
            the scroll container means the last item can always be scrolled
            clear, and only when there is something to scroll. Same 7rem as
            ExerciseModal, which solved this once already. */}
        <ul className="min-h-0 flex-1 divide-y divide-white/[0.05] overflow-y-auto pb-28 sm:pb-0">
          {options.map(({ meal, macros, fit, cost }) => {
            // "Fits" is not a score anyone should have to interpret. It becomes
            // one word, and only when it's a warning.
            const stretch = fit > 1.25 ? (macros.kcal > target.slotKcal ? "big for this slot" : "small for this slot") : null;
            return (
              <li key={meal.id}>
                <button
                  onClick={() => onPick(meal.id)}
                  className="flex w-full items-start gap-3 p-3.5 text-left transition hover:bg-white/[0.04]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-100">{meal.name}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {Math.round(macros.kcal)} kcal · {Math.round(macros.protein)}g protein
                      {meal.minutes != null && ` · ${meal.minutes} min`}
                      {` · ${recipeSteps(meal).length} steps · ${cookRating(meal).label.toLowerCase()}`}
                    </span>
                    {stretch && (
                      <span className="mt-1 inline-block rounded-md bg-amber-400/10 px-1.5 py-0.5 text-[11px] text-amber-300">
                        {stretch}
                      </span>
                    )}
                  </span>
                  {/* WHAT IT DOES TO THE WEEK, not what it costs in isolation.
                      Rounded to 10p and silent inside that, because a 4p
                      difference is noise dressed as information — and "same
                      price" is the answer for most of the list, since the
                      ingredients are already being bought for another day. */}
                  {cost != null && currentCost != null && (
                    <span className={`shrink-0 self-center text-xs tabular-nums ${
                      cost < currentCost - 0.05 ? "text-pitch-400"
                        : cost > currentCost + 0.05 ? "text-slate-400" : "text-slate-600"
                    }`}>
                      {cost < currentCost - 0.05
                        ? `−£${(currentCost - cost).toFixed(2)}`
                        : cost > currentCost + 0.05
                          ? `+£${(cost - currentCost).toFixed(2)}`
                          : "same"}
                    </span>
                  )}
                  <span className="shrink-0 self-center text-xs font-bold text-pitch-400">Use</span>
                </button>
              </li>
            );
          })}
          {!options.length && (
            <li className="px-4 py-8 text-center text-sm text-slate-500">
              {/* Says which of the three reasons it is, because "no results"
                  with a search box AND five chips on screen leaves the athlete
                  guessing which one to undo. */}
              {activeFilterCount(filters) > 0
                ? "Nothing matches those filters for this slot. Try clearing one."
                : q.trim()
                  ? `Nothing called "${q.trim()}" for this slot.`
                  : "No other meals fit your diet for this slot yet."}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
