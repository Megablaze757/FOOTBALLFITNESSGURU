"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { tierMeets } from "@/lib/subscription";
import { MealPlanner } from "@/components/MealPlanner";
import { nutritionTargets, type NutritionTargets } from "@/lib/nutrition";
import type { GoalType } from "@/lib/coach";
import type { Subscription, Tier, TrainingLog } from "@/lib/types";

const MACROS = [
  { key: "protein", label: "Protein", color: "#e3b53f", kcal: 4 },
  { key: "carbs", label: "Carbs", color: "#38bdf8", kcal: 4 },
  { key: "fats", label: "Fats", color: "#fbbf24", kcal: 9 },
] as const;

export default function NutritionPage() {
  const user = useCurrentUser();
  const today = new Date().toISOString().slice(0, 10);

  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const since = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
    const [{ data: sub }, { data: log }, { data: weightRow }, { data: program }, { data: training }, { data: profile }] = await Promise.all([
      supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("nutrition_logs").select("*").eq("user_id", user.id).eq("log_date", today).maybeSingle(),
      supabase.from("daily_check_ins").select("weight_kg").eq("user_id", user.id).not("weight_kg", "is", null).order("check_in_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("programs").select("goal_type").eq("user_id", user.id).eq("status", "active").maybeSingle(),
      supabase.from("training_logs").select("log_date, total_minutes").eq("user_id", user.id).gte("log_date", since),
      supabase.from("profiles").select("height_cm, birth_year, sex, activity_level, diet_goal, diet_pattern, diet_avoid, meals_per_day, diet_notes").eq("id", user.id).maybeSingle(),
    ]);
    const pr = profile as {
      height_cm?: number; birth_year?: number; sex?: string;
      activity_level?: string; diet_goal?: string;
      diet_pattern?: string; diet_avoid?: string[]; meals_per_day?: number; diet_notes?: string;
    } | null;
    return {
      sub: (sub ?? null) as Subscription | null,
      log,
      weightKg: (weightRow?.weight_kg ?? null) as number | null,
      goal: (program?.goal_type ?? null) as GoalType | null,
      avgMinutes: avgDailyMinutes((training ?? []) as Pick<TrainingLog, "total_minutes">[]),
      // Seed the planner from the profile so stats survive between visits.
      stats: {
        heightCm: pr?.height_cm ?? undefined,
        age: pr?.birth_year ? new Date().getFullYear() - pr.birth_year : undefined,
        sex: (pr?.sex as "male" | "female" | undefined) ?? undefined,
        activity: (pr?.activity_level as never) ?? undefined,
        goal: (pr?.diet_goal as never) ?? undefined,
        weightKg: (weightRow?.weight_kg ?? undefined) as number | undefined,
      },
      prefs: {
        pattern: (pr?.diet_pattern as never) ?? undefined,
        avoid: (pr?.diet_avoid as never) ?? undefined,
        mealsPerDay: (pr?.meals_per_day as never) ?? undefined,
      },
      dietNotes: pr?.diet_notes ?? "",
    };
  }, [user.id], `nutrition:${user.id}`);

  const tier: Tier = data?.sub?.status === "active" ? data.sub.tier : "bronze";

  if (loading) return <div className="card mt-6 h-80 animate-pulse" />;

  if (!tierMeets(tier, "silver")) {
    return (
      <div className="animate-fade-up">
        <Header />
        <div className="card mt-6 p-6 text-center">
          <div className="text-3xl">🔒</div>
          <h2 className="mt-2 text-lg font-extrabold">Nutrition is a Silver feature</h2>
          <p className="mt-1 text-sm text-slate-400">Track calories, macros and hydration with Silver or Gold.</p>
          <Link href="/pricing" className="btn-primary mx-auto mt-4 max-w-[14rem]">See plans</Link>
        </div>
      </div>
    );
  }

  const targets = nutritionTargets({ weightKg: data?.weightKg ?? null, goal: data?.goal ?? null, avgTrainingMinutes: data?.avgMinutes ?? 0 });
  return (
    <div className="space-y-6">
      <NutritionTracker userId={user.id} today={today} initial={data?.log} targets={targets} />
      <MealPlanner userId={user.id} initial={data?.stats ?? null} initialPrefs={data?.prefs ?? null} initialNotes={data?.dietNotes ?? null} />
    </div>
  );
}

function avgDailyMinutes(rows: Pick<TrainingLog, "total_minutes">[]): number {
  if (!rows.length) return 0;
  const total = rows.reduce((s, r) => s + (r.total_minutes ?? 0), 0);
  return Math.round(total / 14); // spread across the 14-day window
}

function Header() {
  return (
    <header className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Nutrition</h1>
        <p className="mt-1 text-sm text-slate-400">Fuel for recovery and performance.</p>
      </div>
      <Link href="/dashboard" className="text-sm text-slate-400 hover:text-pitch-400">← Back</Link>
    </header>
  );
}

function NutritionTracker({ userId, today, initial, targets }: { userId: string; today: string; initial: any; targets: NutritionTargets | null }) {
  const [calories, setCalories] = useState<string>(initial?.daily_calorie_target?.toString() ?? "");
  const [macros, setMacros] = useState<Record<string, string>>({
    protein: initial?.macros?.protein?.toString() ?? "",
    carbs: initial?.macros?.carbs?.toString() ?? "",
    fats: initial?.macros?.fats?.toString() ?? "",
  });
  const [water, setWater] = useState<number>(initial?.daily_water_intake_ml ?? 0);
  const [eaten, setEaten] = useState<number>(initial?.calories_eaten ?? 0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setSaved(false); }, [calories, macros, water, eaten]);

  const macroKcal = MACROS.reduce((sum, m) => sum + (Number(macros[m.key]) || 0) * m.kcal, 0);
  const waterGoal = targets?.water_ml ?? 3000;

  function applyTargets() {
    if (!targets) return;
    setCalories(String(targets.calories));
    setMacros({ protein: String(targets.protein), carbs: String(targets.carbs), fats: String(targets.fats) });
  }

  async function save() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.from("nutrition_logs").upsert(
      {
        user_id: userId,
        log_date: today,
        daily_calorie_target: calories ? Number(calories) : null,
        calories_eaten: eaten || null,
        macros: {
          protein: Number(macros.protein) || 0,
          carbs: Number(macros.carbs) || 0,
          fats: Number(macros.fats) || 0,
        },
        daily_water_intake_ml: water,
      },
      { onConflict: "user_id,log_date" }
    );
    if (e) setError(e.message);
    else setSaved(true);
    setSaving(false);
  }

  return (
    <div className="animate-fade-up mx-auto max-w-2xl space-y-5">
      <Header />

      {/* Coach-set smart targets */}
      {targets && (
        <div className="card p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-pitch-400">
              <span className="h-1.5 w-1.5 rounded-full bg-pitch-400" /> Coach targets
            </h2>
            <button onClick={applyTargets} className="text-xs font-medium text-pitch-400 hover:underline">Apply to today</button>
          </div>
          <p className="text-xs text-slate-400">{targets.rationale}</p>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            {[
              { label: "kcal", val: targets.calories, logged: macroKcal, color: "#e3b53f" },
              { label: "Protein", val: targets.protein, logged: Number(macros.protein) || 0, color: "#e3b53f" },
              { label: "Carbs", val: targets.carbs, logged: Number(macros.carbs) || 0, color: "#38bdf8" },
              { label: "Fats", val: targets.fats, logged: Number(macros.fats) || 0, color: "#fbbf24" },
            ].map((t) => (
              <div key={t.label} className="rounded-2xl bg-white/[0.04] p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">{t.label}</div>
                <div className="text-sm font-bold text-slate-100">{t.val.toLocaleString()}</div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (t.logged / t.val) * 100)}%`, background: t.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Direct calorie logging */}
      <div className="card p-5">
        <div className="flex items-baseline justify-between">
          <span className="field-label !mb-0">🍽️ Calories eaten today</span>
          {calories && <span className="text-xs text-slate-400">target {Number(calories).toLocaleString()}</span>}
        </div>
        <div className="mt-2 text-center text-4xl font-extrabold text-pitch-400">{eaten.toLocaleString()}<span className="ml-1 text-base font-normal text-slate-500">kcal</span></div>
        {calories ? (
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-pitch-400 to-pitch-600 transition-all" style={{ width: `${Math.min(100, (eaten / Number(calories)) * 100)}%` }} />
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {[200, 400, 600].map((kc) => (
            <button key={kc} onClick={() => setEaten((c) => c + kc)} className="btn-ghost flex-1 py-2">+{kc}</button>
          ))}
          <input type="number" inputMode="numeric" value={eaten || ""} onChange={(e) => setEaten(Number(e.target.value) || 0)} className="field w-24 text-center" placeholder="edit" />
          <button onClick={() => setEaten(0)} className="btn-ghost w-auto px-4 py-2 text-slate-400">Reset</button>
        </div>
        {calories && eaten > 0 && (
          <p className="mt-2 text-xs text-slate-400">{Number(calories) - eaten > 0 ? `${(Number(calories) - eaten).toLocaleString()} kcal left today` : `${(eaten - Number(calories)).toLocaleString()} kcal over target`}</p>
        )}
      </div>

      {/* Calories from macros */}
      <div className="card p-5 text-center">
        <div className="stat-label">Or track by macros</div>
        <div className="mt-1 text-4xl font-extrabold text-pitch-400">{macroKcal.toLocaleString()}<span className="ml-1 text-base font-normal text-slate-500">kcal</span></div>
        {calories && (
          <div className="mt-1 text-xs text-slate-400">Target {Number(calories).toLocaleString()} kcal · {Math.round((macroKcal / Number(calories)) * 100) || 0}%</div>
        )}
        {/* macro split bar */}
        <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-white/10">
          {MACROS.map((m) => {
            const kcal = (Number(macros[m.key]) || 0) * m.kcal;
            const pct = macroKcal ? (kcal / macroKcal) * 100 : 0;
            return <div key={m.key} style={{ width: `${pct}%`, background: m.color }} />;
          })}
        </div>
        <div className="mt-2 flex justify-center gap-4 text-xs text-slate-400">
          {MACROS.map((m) => (
            <span key={m.key} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: m.color }} />{m.label}
            </span>
          ))}
        </div>
      </div>

      {/* Inputs */}
      <div className="card space-y-4 p-5">
        <label className="block">
          <span className="field-label">Daily calorie target</span>
          <input type="number" inputMode="numeric" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="e.g. 2800" className="field" />
        </label>
        <div className="grid grid-cols-3 gap-3">
          {MACROS.map((m) => (
            <label key={m.key} className="block">
              <span className="field-label" style={{ color: m.color }}>{m.label} (g)</span>
              <input type="number" inputMode="numeric" value={macros[m.key]} onChange={(e) => setMacros((p) => ({ ...p, [m.key]: e.target.value }))} className="field text-center" />
            </label>
          ))}
        </div>
      </div>

      {/* Water */}
      <div className="card p-5">
        <div className="flex items-baseline justify-between">
          <span className="field-label">Hydration</span>
          <span className="text-sm font-bold text-sky-300">{(water / 1000).toFixed(2)} L / {(waterGoal / 1000).toFixed(0)} L</span>
        </div>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-300 transition-all" style={{ width: `${Math.min(100, (water / waterGoal) * 100)}%` }} />
        </div>
        <div className="mt-3 flex gap-2">
          {[250, 500].map((ml) => (
            <button key={ml} onClick={() => setWater((w) => w + ml)} className="btn-ghost flex-1 py-2">+{ml} ml</button>
          ))}
          <button onClick={() => setWater(0)} className="btn-ghost w-auto px-4 py-2 text-slate-400">Reset</button>
        </div>
      </div>

      {error && <p className="text-sm text-readiness-red">{error}</p>}
      <button onClick={save} disabled={saving} className="btn-primary">{saving ? "Saving…" : saved ? "Saved ✓" : "Save today's nutrition"}</button>
    </div>
  );
}
