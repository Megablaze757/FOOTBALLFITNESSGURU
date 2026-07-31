"use client";

import { useMemo, useState } from "react";
import { invokeAI } from "@/lib/api";
import {
  planTargets, buildWeek, mealMacros, DEFAULT_PREFS,
  type BodyStats, type MealPrefs, type PlannedMeal,
} from "@/lib/meal-plan";
import { parseSchedule } from "@/lib/meal-schedule";
import { estimateMeal, fromAiItems, roundMacros, type FoodEstimate } from "@/lib/food-estimate";
import type { Macros } from "@/lib/meal-plan";

interface Props {
  stats: Partial<BodyStats> | null;
  prefs: Partial<MealPrefs> | null;
  dietNotes: string | null;
  /**
   * The seed of the plan they're actually on.
   *
   * THIS IS THE BUG THIS PROP EXISTS TO FIX. This component used to call
   * buildWeek with a hard-coded seed of 0 and targets it estimated itself — so
   * "tick off today's meals" listed food from a plan that existed nowhere else.
   * Someone generated a week on the Meal plan tab, came to Today, and was shown
   * different meals entirely. The old comment said seed 0 was "so it's stable
   * between visits", which it was: stably wrong.
   *
   * Null means they've never generated a plan, and there is nothing to tick.
   */
  seed: number | null;
  /** Adds the eaten macros into the day's running totals. */
  onAdd: (m: Macros) => void;
}

const DAY_INDEX = () => (new Date().getDay() + 6) % 7; // JS weeks start Sunday; ours start Monday

/**
 * Two ways to log what you actually ate:
 *   1. Tick meals off today's plan — exact, since every gram is known.
 *   2. Describe it — estimated, via the AI endpoint with an on-device fallback.
 *
 * Both feed the same daily totals, which the tracker above then saves.
 */
export function MealCheckIn({ stats, prefs, dietNotes, seed, onAdd }: Props) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [estimate, setEstimate] = useState<FoodEstimate | null>(null);
  const [source, setSource] = useState<"local" | "ai">("local");
  /** Why the AI estimate didn't happen. Null when it did, or wasn't asked for. */
  const [aiError, setAiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  /**
   * Today's row of THEIR plan — same seed, same targets, same preferences as the
   * Meal plan tab, so the two agree.
   *
   * buildWeek is pure, so given the stored seed it reproduces the exact week they
   * generated. That's the whole mechanism: the plan isn't stored meal by meal,
   * it's stored as one number and rebuilt. Which is fine, and was being fed the
   * wrong number here.
   *
   * Targets stay on planTargets(body) rather than the page's richer
   * nutritionTargets, because planTargets is what MealPlanner feeds buildWeek.
   * Using the "better" number here would reintroduce the same bug in a subtler
   * form: two plans that disagree, for a more defensible reason. The fallback
   * defaults below are deliberately identical to MealPlanner's.
   */
  const todaysMeals = useMemo<PlannedMeal[]>(() => {
    if (seed === null) return [];
    const body: BodyStats = {
      sex: stats?.sex ?? "male",
      age: stats?.age ?? 20,
      heightCm: stats?.heightCm ?? 178,
      weightKg: stats?.weightKg ?? 75,
      activity: stats?.activity ?? "moderate",
      goal: stats?.goal ?? "maintain",
    };
    const week = buildWeek(planTargets(body), seed, { ...DEFAULT_PREFS, ...(prefs ?? {}) }, parseSchedule(dietNotes));
    return week[DAY_INDEX()]?.meals ?? [];
  }, [stats, prefs, dietNotes, seed]);

  // Instant on-device preview as they type; the AI call refines it on request.
  const preview = useMemo(() => estimateMeal(text), [text]);
  const shown = estimate ?? (text.trim().length > 2 ? preview : null);

  function toggle(pm: PlannedMeal) {
    const key = pm.meal.id;
    const next = new Set(ticked);
    const macros = roundMacros(mealMacros(pm.meal, pm.scale));
    if (next.has(key)) {
      next.delete(key);
      onAdd({ kcal: -macros.kcal, protein: -macros.protein, carbs: -macros.carbs, fats: -macros.fats });
    } else {
      next.add(key);
      onAdd(macros);
    }
    setTicked(next);
  }

  async function askAi() {
    if (text.trim().length < 3) return;
    setBusy(true);
    setAiError(null);
    try {
      const res = await invokeAI<{ items?: Parameters<typeof fromAiItems>[0] }>("estimate-food", { text: text.trim() });
      const parsed = fromAiItems(res?.items ?? []);
      // An AI answer with nothing usable in it is worse than the local guess.
      if (parsed.items.length === 0) throw new Error("The AI didn't recognise any food in that.");
      setEstimate(parsed);
      setSource("ai");
    } catch (e) {
      // Falling back to the local estimate is right — but doing it SILENTLY is
      // how this looked like a working AI feature while never once calling the
      // AI successfully. The fallback still happens; it just says why now.
      setEstimate(preview);
      setSource("local");
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function addEstimate() {
    if (!shown || shown.items.length === 0) return;
    onAdd(shown.total);
    setAdded(`Added ${shown.total.kcal} kcal`);
    setText("");
    setEstimate(null);
    setTimeout(() => setAdded(null), 2500);
  }

  return (
    <div className="card p-5">
      <h2 className="field-label">What have you eaten today?</h2>

      {/* No plan yet. This used to render nothing at all — the section simply
          wasn't there, so there was no way to tell "you haven't made a plan"
          apart from "the plan is empty" or "this is broken". */}
      {seed === null && (
        <p className="mb-4 rounded-2xl bg-white/[0.03] px-4 py-3 text-xs text-slate-400">
          Build a week on the <b className="text-slate-200">Meal plan</b> tab and today&apos;s meals
          appear here to tick off — with the exact macros, so nothing has to be estimated.
        </p>
      )}

      {/* 1. Off the plan */}
      {todaysMeals.length > 0 && (
        <div className="mb-4">
          <span className="mb-2 block text-xs text-slate-500">Tick anything you ate from today&apos;s plan</span>
          <ul className="space-y-1.5">
            {todaysMeals.map((pm) => {
              const on = ticked.has(pm.meal.id);
              const m = roundMacros(mealMacros(pm.meal, pm.scale));
              return (
                <li key={pm.meal.id}>
                  <button
                    onClick={() => toggle(pm)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                      on ? "border-pitch-400/40 bg-pitch-400/[0.07]" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                  >
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] ${on ? "border-pitch-400 bg-pitch-400 text-ink-900" : "border-white/25 text-transparent"}`}>✓</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] uppercase tracking-wide text-slate-500">{pm.meal.slot}</span>
                      <span className="block truncate text-sm font-semibold text-slate-100">{pm.meal.name}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-400">{m.kcal} kcal</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 2. Free text */}
      <div>
        <span className="mb-2 block text-xs text-slate-500">Or just tell me — &ldquo;chicken, rice and broccoli&rdquo;</span>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setEstimate(null); }}
          rows={2}
          placeholder="200g chicken, rice, two eggs…"
          className="field resize-none"
        />

        {shown && (
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                ~{shown.total.kcal} kcal · {shown.total.protein}g protein
              </span>
              <span className="chip text-slate-400">{source === "ai" ? "AI estimate" : "On-device estimate"}</span>
              {aiError && (
                <span className="mt-1 block break-words text-[11px] text-amber-300">
                  AI estimate unavailable — {aiError} Showing the on-device guess instead.
                </span>
              )}
            </div>

            <ul className="space-y-1 text-xs text-slate-400">
              {shown.items.map((it, i) => (
                <li key={`${it.name}-${i}`} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {it.name}
                    <span className="text-slate-600">
                      {" "}{it.unit === "each" ? `× ${it.qty}` : `${it.qty}${it.unit}`}
                      {/* Say when the portion was assumed — otherwise a guessed
                          200g reads as something the athlete told us. */}
                      {!it.explicit && " (assumed)"}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{it.macros.kcal}</span>
                </li>
              ))}
            </ul>

            {shown.unmatched.length > 0 && (
              <p className="mt-2 text-xs text-amber-300">
                Not recognised: {shown.unmatched.join(", ")} — try &ldquo;Estimate with AI&rdquo;, or add the calories by hand below.
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={addEstimate} disabled={shown.items.length === 0} className="btn-primary w-auto px-4 py-2 text-sm disabled:opacity-40">
                Add to today
              </button>
              <button onClick={askAi} disabled={busy} className="btn-ghost w-auto px-4 py-2 text-sm">
                {busy ? "Working it out…" : "Estimate with AI"}
              </button>
            </div>
          </div>
        )}

        {added && <p className="mt-2 text-sm text-pitch-400">{added} ✓ — remember to save below.</p>}
        <p className="mt-2 text-xs text-slate-500">
          Estimates, not measurements — portions vary. Adjust the numbers below if you know better.
        </p>
      </div>
    </div>
  );
}
