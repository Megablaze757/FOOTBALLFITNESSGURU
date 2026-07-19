"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  planTargets, buildWeek, shoppingList, shoppingListText,
  ACTIVITY_LEVELS, DIET_GOALS,
  type BodyStats, type Sex, type ActivityLevel, type DietGoal, type PlannedDay,
} from "@/lib/meal-plan";
import { SUPERMARKETS, PRICES_REVIEWED, FOOD_BY_ID as FOOD_LOOKUP } from "@/lib/food-db";

interface Props {
  userId: string;
  initial?: Partial<BodyStats> | null;
}

export function MealPlanner({ userId, initial }: Props) {
  const [sex, setSex] = useState<Sex>(initial?.sex ?? "male");
  const [age, setAge] = useState(String(initial?.age ?? 20));
  const [heightCm, setHeightCm] = useState(String(initial?.heightCm ?? 178));
  const [weightKg, setWeightKg] = useState(String(initial?.weightKg ?? 75));
  const [activity, setActivity] = useState<ActivityLevel>(initial?.activity ?? "moderate");
  const [goal, setGoal] = useState<DietGoal>(initial?.goal ?? "maintain");
  const [week, setWeek] = useState<PlannedDay[] | null>(null);
  const [openDay, setOpenDay] = useState(0);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [store, setStore] = useState(SUPERMARKETS[0]);

  const stats: BodyStats = {
    sex, goal, activity,
    age: Number(age) || 20,
    heightCm: Number(heightCm) || 178,
    weightKg: Number(weightKg) || 75,
  };
  const targets = useMemo(() => planTargets(stats), [sex, age, heightCm, weightKg, activity, goal]);
  const list = useMemo(() => (week ? shoppingList(week) : null), [week]);

  async function generate() {
    setWeek(buildWeek(targets, Math.floor(Math.random() * 3)));
    setOpenDay(0);
    // Remember the stats so the plan doesn't have to be re-entered next time.
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({
      height_cm: stats.heightCm,
      birth_year: new Date().getFullYear() - stats.age,
      sex, activity_level: activity, diet_goal: goal,
    }).eq("id", userId);
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  }

  async function copyList() {
    if (!list) return;
    try {
      await navigator.clipboard.writeText(shoppingListText(list));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — the list is on screen anyway */ }
  }

  return (
    <section className="space-y-4">
      <div className="card-premium space-y-4 p-6">
        <div>
          <h2 className="text-xl font-extrabold">Meal plan &amp; shopping list</h2>
          <p className="mt-1 text-sm text-slate-400">
            Your stats set the calories — we build the week and the shop to match.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Age" value={age} onChange={setAge} suffix="yrs" />
          <Field label="Height" value={heightCm} onChange={setHeightCm} suffix="cm" />
          <Field label="Weight" value={weightKg} onChange={setWeightKg} suffix="kg" />
          <label className="block">
            <span className="field-label">Sex</span>
            <select value={sex} onChange={(e) => setSex(e.target.value as Sex)} className="field [color-scheme:dark]">
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="field-label">Training load</span>
          <select value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)} className="field [color-scheme:dark]">
            {ACTIVITY_LEVELS.map((a) => <option key={a.id} value={a.id}>{a.label} — {a.blurb}</option>)}
          </select>
        </label>

        <div>
          <span className="field-label">Goal</span>
          <div className="grid grid-cols-3 gap-2">
            {DIET_GOALS.map((g) => (
              <button
                key={g.id}
                onClick={() => setGoal(goal === g.id ? "maintain" : g.id)}
                className={`card p-3 text-left transition ${goal === g.id ? "ring-2 ring-pitch-400/70" : "card-hover"}`}
              >
                <div className="text-sm font-bold text-slate-100">{g.label}</div>
                <div className="mt-0.5 text-xs text-slate-400">{g.blurb}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-pitch-400/25 bg-pitch-400/[0.05] p-4">
          <div className="grid grid-cols-4 gap-2 text-center">
            <Metric label="kcal" value={targets.calories} accent />
            <Metric label="Protein" value={`${targets.protein}g`} />
            <Metric label="Carbs" value={`${targets.carbs}g`} />
            <Metric label="Fats" value={`${targets.fats}g`} />
          </div>
          <p className="mt-3 text-xs text-slate-400">{targets.rationale}</p>
        </div>

        <button onClick={generate} className="btn-primary">
          {week ? "Regenerate week" : "Build my week"}
        </button>
        {saved && <p className="text-xs text-readiness-green">✓ Stats saved to your profile.</p>}
      </div>

      {week && (
        <>
          <div className="card p-5">
            <div className="stat-label mb-3">Your week</div>
            <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1">
              {week.map((d, i) => (
                <button
                  key={d.day}
                  onClick={() => setOpenDay(i)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${i === openDay ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-400" : "border-white/10 bg-white/[0.03] text-slate-300"}`}
                >
                  {d.day.slice(0, 3)}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {week[openDay].meals.map((pm) => (
                <details key={pm.meal.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <summary className="flex cursor-pointer items-center gap-2 list-none">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] uppercase tracking-wide text-slate-500">{pm.meal.slot}</span>
                      <span className="block text-sm font-bold text-slate-100">{pm.meal.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{Math.round(pm.macros.kcal)} kcal</span>
                  </summary>
                  <ul className="mt-2 space-y-1 text-sm text-slate-300">
                    {pm.meal.items.map((it) => {
                      const f = FOOD_LOOKUP[it.foodId];
                      if (!f) return null;
                      const q = Math.round(it.qty * pm.scale);
                      return (
                        <li key={it.foodId} className="flex gap-2">
                          <span className="text-pitch-400">·</span>
                          {f.name} — {f.unit === "each" ? `${Math.max(1, q)}` : `${q}${f.unit}`}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2 text-sm text-slate-400">{pm.meal.method}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {Math.round(pm.macros.protein)}g protein · {Math.round(pm.macros.carbs)}g carbs · {Math.round(pm.macros.fats)}g fats
                  </p>
                </details>
              ))}
            </div>

            <div className="mt-3 rounded-xl bg-white/[0.03] p-3 text-center text-sm">
              <span className="font-bold text-slate-100">{Math.round(week[openDay].macros.kcal)} kcal</span>
              <span className="text-slate-400"> · {Math.round(week[openDay].macros.protein)}g protein</span>
              <span className="text-slate-500"> (target {targets.calories} / {targets.protein}g)</span>
            </div>
          </div>

          {list && (
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <div className="stat-label">Shopping list</div>
                <button onClick={copyList} className="text-xs text-pitch-400 hover:underline">
                  {copied ? "Copied ✓" : "Copy list"}
                </button>
              </div>

              <div className="mt-3 space-y-4">
                {list.byAisle.map((group) => (
                  <div key={group.aisle}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{group.aisle}</span>
                      <span className="text-xs text-slate-500">~£{group.cost.toFixed(2)}</span>
                    </div>
                    <ul className="space-y-1.5">
                      {group.lines.map((l) => (
                        <li key={l.food.id} className="flex items-center gap-2 text-sm">
                          <span className="min-w-0 flex-1">
                            {/* Each item searches the chosen store directly — no
                                API needed, and it can't go stale. */}
                            <a
                              href={store.search(l.food.name)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-200 underline-offset-2 hover:text-pitch-400 hover:underline"
                            >
                              {l.food.name}
                            </a>
                            <span className="text-slate-500"> × {l.packs} <span className="text-slate-600">({l.food.packLabel})</span></span>
                          </span>
                          <span className="shrink-0 tabular-nums text-slate-400">~£{l.cost.toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                <span className="text-sm font-bold text-slate-100">Estimated weekly shop</span>
                <span className="text-lg font-extrabold text-pitch-400">~£{list.total.toFixed(2)}</span>
              </div>

              <p className="mt-2 text-xs text-slate-500">
                Estimates from typical UK supermarket prices (reviewed {PRICES_REVIEWED}) — not live pricing,
                so your actual basket will differ. Tap any item to search it in:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {SUPERMARKETS.map((sm) => (
                  <button
                    key={sm.id}
                    onClick={() => setStore(sm)}
                    className={`chip transition ${store.id === sm.id ? "border-pitch-400/50 text-pitch-400" : "hover:text-slate-200"}`}
                  >
                    {sm.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Field({ label, value, onChange, suffix }: {
  label: string; value: string; onChange: (v: string) => void; suffix: string;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <div className="relative">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="field pr-10"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">{suffix}</span>
      </div>
    </label>
  );
}

function Metric({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div>
      <div className={`text-lg font-extrabold ${accent ? "text-pitch-400" : "text-slate-100"}`}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
