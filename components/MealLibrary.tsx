"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Portal } from "@/components/Portal";
import { Recipe } from "@/components/Recipe";
import { EmptyState } from "@/components/EmptyState";
import { MEALS, mealMacros, mealTags, DIET_PATTERNS, mealAllowed, DEFAULT_PREFS, type Meal, type Slot } from "@/lib/meal-plan";
import { selectProfile } from "@/lib/profile-columns";
import { MealFilterBar } from "@/components/MealFilterBar";
import { passesFilters, matchesQuery, activeFilterCount, NO_FILTERS, type MealFilters } from "@/lib/meal-filters";
import { FOOD_BY_ID } from "@/lib/food-db";
import { cookRating } from "@/lib/recipe-difficulty";

/**
 * Every recipe in the book, browsable.
 *
 * WHY IT BELONGS HERE. The 139 recipes existed only inside a generated plan —
 * you could read the one the planner handed you on Thursday and nothing else.
 * Someone who wanted to know what was in there, or to find the quick ones, or
 * to look up the shakshuka they liked last month, had no way in. The exercise
 * library has answered exactly this question for movements since day one.
 *
 * WHAT IT IS FOR, in order:
 *   1. Find something to cook tonight — hence time and calories on the card,
 *      and a filter for "under 15 minutes".
 *   2. Star the ones you like, so the planner serves them more. This is the
 *      only place you can star a dish you have never been served.
 *   3. Look up the numbers on something.
 *
 * Filtering defaults to the athlete's own diet, because a vegan scrolling past
 * ninety meat dishes is being shown a library that isn't theirs. Turning it off
 * is one tap and the count says how many are hidden.
 */

const SLOTS: Slot[] = ["Breakfast", "Lunch", "Dinner", "Snack"];
const PAGE = 18;

/** Quick, everyday words for the tags a meal inherits from its ingredients. */
const TAG_LABEL: Record<string, string> = {
  meat: "Meat", pork: "Pork", fish: "Fish", dairy: "Dairy",
  egg: "Egg", honey: "Honey", gluten: "Gluten", nuts: "Nuts", soy: "Soy",
};

export function MealLibrary({ userId }: { userId: string }) {
  const [q, setQ] = useState("");
  const [slot, setSlot] = useState<Slot | "All">("All");
  // The chip row is shared with the swap sheet — see lib/meal-filters.ts. It
  // replaced this component's own quick/starred pair, which had drifted into
  // being a different set of filters from the one the swap sheet never had.
  const [filters, setFilters] = useState<MealFilters>(NO_FILTERS);
  const [myDiet, setMyDiet] = useState(true);
  const [open, setOpen] = useState<Meal | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [starred, setStarred] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<{ pattern: string; avoid: string[] } | null>(null);
  /**
   * Whether a star can actually be saved.
   *
   * False when the column isn't in the database yet. The control is hidden
   * rather than shown-and-broken: a star that lights up and is gone on reload
   * is worse than no star, because the athlete believes they've told us
   * something.
   */
  const [canStar, setCanStar] = useState(true);

  useEffect(() => {
    let active = true;
    // meal_plan_starred comes from a recent migration, and naming a column the
    // database hasn't got makes PostgREST reject the whole row — which would
    // take the diet filter down with it and show a vegan every meat dish in the
    // book. Split so the starring feature degrades on its own.
    selectProfile<{ diet_pattern?: string; diet_avoid?: string[]; meal_plan_starred?: string[] }>(
      createClient(), userId, "diet_pattern, diet_avoid", ["meal_plan_starred"],
    ).then(({ data: p, missing }) => {
      if (!active || !p) return;
      setStarred(p.meal_plan_starred ?? []);
      setCanStar(!missing.includes("meal_plan_starred"));
      if (p.diet_pattern) setPrefs({ pattern: p.diet_pattern, avoid: p.diet_avoid ?? [] });
    });
    return () => { active = false; };
  }, [userId]);

  /**
   * Starring from here writes straight through.
   *
   * Optimistic, like the planner's star: the state flips before the round trip
   * so the tap feels instant, and a failure leaves the star lit rather than
   * silently reverting under someone's finger. The cost of getting that wrong
   * is one meal appearing slightly more often than intended.
   */
  async function toggleStar(id: string) {
    const next = starred.includes(id) ? starred.filter((x) => x !== id) : [...starred, id];
    setStarred(next);
    try {
      await createClient().from("profiles").update({ meal_plan_starred: next }).eq("id", userId);
    } catch { /* ignore */ }
  }

  // Diet filtering reuses the planner's own rule rather than reimplementing it,
  // so what the library says a vegan can eat is what the planner will serve.
  const dietPrefs = useMemo(() => prefs ? {
    ...DEFAULT_PREFS,
    pattern: prefs.pattern as never,
    avoid: prefs.avoid as never,
  } : null, [prefs]);

  const hiddenByDiet = useMemo(
    () => (myDiet && dietPrefs ? MEALS.filter((m) => !mealAllowed(m, dietPrefs)).length : 0),
    [myDiet, dietPrefs]
  );

  const list = useMemo(() => MEALS.filter((m) => {
    if (slot !== "All" && m.slot !== slot) return false;
    if (myDiet && dietPrefs && !mealAllowed(m, dietPrefs)) return false;
    return passesFilters(m, filters, starred)
      && matchesQuery(m, q, (id) => FOOD_BY_ID[id]?.name);
  }), [q, slot, filters, myDiet, dietPrefs, starred]);

  useEffect(() => { setShown(PAGE); }, [q, slot, filters, myDiet]);

  return (
    <div className="space-y-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search recipes or ingredients…"
        className="field"
        aria-label="Search recipes or ingredients"
      />

      <div className="flex flex-wrap gap-2">
        {(["All", ...SLOTS] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSlot(s)}
            aria-pressed={slot === s}
            className="chip-option chip-option-sm"
          >
            {s}
          </button>
        ))}
      </div>

      <MealFilterBar
        filters={filters}
        onChange={setFilters}
        // "Fits my diet" already hides everything a vegan can't eat, so the
        // Veggie and Vegan chips would be no-ops sitting next to it.
        hide={[
          ...(canStar ? [] : (["starred"] as const)),
          ...(myDiet && dietPrefs?.pattern === "vegan" ? (["veggie", "vegan"] as const) : []),
          ...(myDiet && dietPrefs?.pattern === "vegetarian" ? (["veggie"] as const) : []),
        ]}
      >
        {dietPrefs && (
          <button onClick={() => setMyDiet(!myDiet)} aria-pressed={myDiet} className="chip-option chip-option-sm">
            <span aria-hidden>✓</span> Fits my diet
          </button>
        )}
      </MealFilterBar>

      <p className="text-xs text-slate-500">
        {list.length} recipe{list.length === 1 ? "" : "s"}
        {myDiet && hiddenByDiet > 0 && ` · ${hiddenByDiet} hidden by your diet`}
      </p>

      {list.length === 0 ? (
        <EmptyState
          icon="🍳"
          title="Nothing matches that"
          body={
            filters.starred && starred.length === 0
              ? "You haven't starred anything yet. Open a recipe and tap the star — the planner will start serving it more often."
              : activeFilterCount(filters) > 0
                ? "No recipe matches all of those at once. Try clearing one."
                : "Try a shorter search. Searching an ingredient works too — \"chickpeas\", \"salmon\"."
          }
          action={{ label: "Clear filters", onClick: () => { setQ(""); setSlot("All"); setFilters(NO_FILTERS); setMyDiet(true); } }}
        />
      ) : (
        <>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {list.slice(0, shown).map((m) => {
              const macros = mealMacros(m);
              return (
                <li key={m.id}>
                  {/* The whole card opens the recipe. The star is the one thing
                      that isn't "read this", so it is the one separate control,
                      and it is 44px with its own label rather than a decoration
                      in the corner. */}
                  <div className="flex items-stretch gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] transition hover:bg-white/[0.04]">
                    <button onClick={() => setOpen(m)} className="min-w-0 flex-1 p-3.5 text-left">
                      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
                        {m.slot}
                        {m.minutes != null && <span className="normal-case">· {m.minutes} min</span>}
                        {/* HOW MUCH OF YOU IT NEEDS, which the time alone does
                            not say — see lib/recipe-difficulty.ts. */}
                        <CookBadge meal={m} />
                      </span>
                      <span className="mt-0.5 block text-sm font-bold text-slate-100">{m.name}</span>
                      {/* Value before label, and the two numbers anyone
                          actually chooses on. */}
                      <span className="mt-2 flex items-baseline gap-3">
                        <span className="text-base font-bold tabular-nums text-slate-200">
                          {Math.round(macros.kcal)}<span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">kcal</span>
                        </span>
                        <span className="text-base font-bold tabular-nums text-slate-200">
                          {Math.round(macros.protein)}<span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">g protein</span>
                        </span>
                      </span>
                    </button>
                    {canStar && (
                    <button
                      onClick={() => toggleStar(m.id)}
                      aria-pressed={starred.includes(m.id)}
                      aria-label={starred.includes(m.id) ? `Unstar ${m.name}` : `Star ${m.name}`}
                      // The divider is load-bearing. Without it the column read
                      // as part of the card and an unstarred ☆ looked like
                      // decoration in the corner rather than something to tap.
                      className="min-h-[44px] grid w-12 shrink-0 place-items-center rounded-r-2xl border-l border-white/[0.06] text-lg transition hover:bg-white/[0.06]"
                    >
                      <span aria-hidden className={starred.includes(m.id) ? "text-amber-400" : "text-slate-600"}>
                        {starred.includes(m.id) ? "★" : "☆"}
                      </span>
                    </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {shown < list.length && (
            <button onClick={() => setShown((n) => n + PAGE)} className="btn-ghost w-full">
              Show {Math.min(PAGE, list.length - shown)} more
            </button>
          )}
        </>
      )}

      {open && (
        <MealModal
          meal={open}
          canStar={canStar}
          starred={starred.includes(open.id)}
          onStar={() => toggleStar(open.id)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function MealModal({ meal, canStar, starred, onStar, onClose }: {
  meal: Meal; canStar: boolean; starred: boolean; onStar: () => void; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  const macros = mealMacros(meal);
  const tags = mealTags(meal);
  // Which diet patterns this suits, said positively. "Vegan" is more useful on
  // a recipe card than the list of nine things it doesn't contain.
  const patterns = DIET_PATTERNS.filter((d) => !d.excludes.some((e) => tags.includes(e)))
    .filter((d) => d.id !== "omnivore");

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
        <div
          className="animate-scale-in max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-surface-raised p-6 pb-28 shadow-card sm:rounded-3xl sm:pb-6"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={meal.name}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{meal.slot}</p>
              <h3 className="text-xl font-extrabold tracking-tight text-slate-100">{meal.name}</h3>
            </div>
            <button onClick={onClose} className="tap-target grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.06] text-slate-300 transition hover:bg-white/10" aria-label="Close">✕</button>
          </div>

          {/* Portion is 1x here on purpose: the library shows the recipe AS
              WRITTEN. In a plan it is scaled to the athlete's slot, and saying
              "1.35x portion" to someone browsing would be answering a question
              they haven't asked. */}
          <Recipe meal={meal} scale={1} macros={macros} />

          {(patterns.length > 0 || tags.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-4">
              {patterns.map((p) => (
                <span key={p.id} className="chip text-pitch-400">{p.label}</span>
              ))}
              {tags.map((t) => (
                <span key={t} className="chip text-slate-400">Contains {TAG_LABEL[t]?.toLowerCase() ?? t}</span>
              ))}
            </div>
          )}

          {canStar && (
            <button
              onClick={onStar}
              aria-pressed={starred}
              className="chip-option mt-4 w-full justify-center"
            >
              <span aria-hidden className={starred ? "text-amber-400" : ""}>{starred ? "★" : "☆"}</span>
              {starred ? "Starred — planned more often" : "Star this recipe"}
            </button>
          )}
        </div>
      </div>
    </Portal>
  );
}

/**
 * Easy / Medium / Involved, derived from the recipe itself.
 *
 * Colour-coded like the exercise difficulties on the other tab, because it is
 * the same promise being made about a different kind of work.
 */
function CookBadge({ meal }: { meal: Meal }) {
  const rating = cookRating(meal);
  const tone = rating.level === "easy"
    ? "bg-emerald-400/10 text-emerald-300"
    : rating.level === "medium"
      ? "bg-amber-400/10 text-amber-300"
      : "bg-rose-400/10 text-rose-300";
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold normal-case ${tone}`} title={rating.blurb}>
      {rating.label}
    </span>
  );
}
