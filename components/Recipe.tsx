import { recipeSteps, recipeNote, recipeSearchUrl, type Meal, type Macros } from "@/lib/meal-plan";
import { FOOD_BY_ID } from "@/lib/food-db";

/**
 * A meal, as something you can actually cook from.
 *
 * WHAT IT REPLACED. One `<ul>` of ingredients and then the whole method as a
 * single grey paragraph — about sixty words of comma-separated instructions in
 * 14px, with no way to tell where you were in it. You cook holding a phone in
 * one hand and a pan in the other, glancing down between stirs, and the one
 * thing that view could not answer was "which bit am I on".
 *
 * THE THREE DECISIONS THAT MATTER:
 *
 * 1. NUMBERED STEPS, one instruction each. A step you can find again after
 *    looking away is the entire job of a recipe on a phone.
 *
 * 2. QUANTITIES SCALED TO THIS ATHLETE. The plan serves this meal at some
 *    portion — 1.35x, 0.6x — and the numbers here are that portion, not the
 *    recipe's nominal one. A recipe that says 200g of tofu next to a plan that
 *    counted 270g is a recipe that gets ignored.
 *
 * 3. TIME BEFORE INGREDIENTS. "40 minutes" decides whether you cook this
 *    tonight, and it decides it before anything else on the card matters.
 *
 * Ingredients are checkable — not persisted, deliberately. This is a
 * mise-en-place aid for the ten minutes you are stood at the counter, and a
 * tick that survives until next Tuesday is a tick that lies to you. The
 * shopping list is where persistence belongs, and it has it.
 */
export function Recipe({ meal, scale, macros }: {
  meal: Meal;
  /** Portion multiplier the planner chose for this athlete. */
  scale: number;
  macros: Macros;
}) {
  const steps = recipeSteps(meal);
  const note = recipeNote(meal);

  return (
    <div className="space-y-4">
      {/* Time and portion, before anything else. Both change whether you cook
          it at all, so neither is buried in the body. */}
      <div className="flex flex-wrap items-center gap-2">
        {meal.minutes != null && (
          <span className="chip text-slate-300">
            <span aria-hidden>⏱</span> {meal.minutes} min
          </span>
        )}
        <span className="chip text-slate-300">
          {Math.round(macros.kcal)} kcal · {Math.round(macros.protein)}g protein
        </span>
        {/* Only when it isn't 1x. "Serves 1.0" is noise; "1.35x" explains why
            the numbers below aren't round. */}
        {Math.abs(scale - 1) > 0.02 && (
          <span className="chip text-slate-400" title="Your portion, scaled to your calorie target">
            {scale.toFixed(2)}× portion
          </span>
        )}
      </div>

      <section>
        <h4 className="stat-label mb-2">What you need</h4>
        <ul className="space-y-0.5">
          {meal.items.map((it) => {
            const f = FOOD_BY_ID[it.foodId];
            if (!f) return null;
            const q = Math.round(it.qty * scale);
            return (
              <li key={it.foodId}>
                {/* The whole row is the target — the same decision the shopping
                    list made, for the same reason: you are tapping this with a
                    wet hand while something is on the hob. */}
                {/* min-h-[44px], not just padding. These rows measured 36px —
                    a 20px checkbox with py-2 around it — and had done since the
                    recipe view was written, because the UI audit only ever sees
                    a page's default state and nothing in it opens a recipe. The
                    meal library put the same component behind a tap that IS
                    reachable from a browse, which is how it finally got
                    measured. You tick these with a wet hand, mid-cook. */}
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl py-2 pl-1 pr-2 transition hover:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0 rounded-md accent-pitch-500"
                  />
                  <span className="min-w-0 flex-1 text-sm text-slate-200">{f.name}</span>
                  <span className="shrink-0 tabular-nums text-sm text-slate-400">
                    {f.unit === "each" ? `${Math.max(1, q)}` : `${q}${f.unit}`}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h4 className="stat-label mb-2">Method</h4>
        <ol className="space-y-2.5">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              {/* A real number in a real circle. The step you are on has to be
                  findable in the half-second you look down. */}
              <span
                className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-pitch-400/15 text-xs font-bold text-pitch-400"
                aria-hidden
              >
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed text-slate-300">{s}</span>
            </li>
          ))}
        </ol>
      </section>

      {note && (
        <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-xs leading-relaxed text-slate-400">
          <span className="font-semibold text-slate-300">Worth knowing —</span> {note}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
        <p className="text-xs text-slate-500">
          {Math.round(macros.protein)}g protein · {Math.round(macros.carbs)}g carbs · {Math.round(macros.fats)}g fats
        </p>
        {/* Deliberately small, and deliberately last. Someone who wants a
            different take on this dish should be able to get one, but the
            recipe above is the one whose macros the plan counted — sending
            people off to a 900-calorie version by accident would quietly break
            the day's numbers. Same reasoning as the shopping list's search
            icon: leaving the app is a thing you sometimes want and never want
            by accident. */}
        <a
          href={recipeSearchUrl(meal)}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-target -mr-2 gap-1 px-2 text-xs text-slate-500 transition hover:text-pitch-400"
        >
          Other versions <span aria-hidden>↗</span>
        </a>
      </div>
    </div>
  );
}
