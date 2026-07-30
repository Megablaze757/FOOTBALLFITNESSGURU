"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { can } from "@/lib/subscription";
import { FeatureLock } from "@/components/FeatureLock";
import { MealPlanner } from "@/components/MealPlanner";
import { MealCheckIn } from "@/components/MealCheckIn";
import { Tabs } from "@/components/Tabs";
import { nutritionTargets, type NutritionTargets } from "@/lib/nutrition";
import { sportProfile, type SportProfile } from "@/lib/sport-profile";
import type { BodyStats, MealPrefs } from "@/lib/meal-plan";
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
      supabase.from("profiles").select("height_cm, birth_year, sex, activity_level, diet_goal, diet_pattern, diet_avoid, meals_per_day, diet_notes, meal_plan_seed, sport").eq("id", user.id).maybeSingle(),
    ]);
    const pr = profile as {
      height_cm?: number; birth_year?: number; sex?: string;
      activity_level?: string; diet_goal?: string;
      diet_pattern?: string; diet_avoid?: string[]; meals_per_day?: number; diet_notes?: string;
      meal_plan_seed?: number | null; sport?: string;
    } | null;
    return {
      sub: (sub ?? null) as Subscription | null,
      log,
      weightKg: (weightRow?.weight_kg ?? null) as number | null,
      goal: (program?.goal_type ?? null) as GoalType | null,
      avgMinutes: avgDailyMinutes((training ?? []) as Pick<TrainingLog, "total_minutes">[]),
      // How much of the window is actually backed by a log. Below a handful of
      // days we trust what they told us about their week over what we measured,
      // so a quiet fortnight doesn't quietly cut their calories.
      trainingDays: (training ?? []).length,
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
      mealSeed: pr?.meal_plan_seed ?? null,
      // Frames the verdict in their sport's terms — carbs for a runner, protein
      // for a lifter, rather than one neutral sentence for everyone.
      sport: sportProfile(pr?.sport as string | undefined),
    };
  }, [user.id], `nutrition:${user.id}`);

  const tier: Tier = data?.sub?.status === "active" ? data.sub.tier : "bronze";

  // The header renders immediately. A bare grey box told you nothing about where
  // you were, and the title then popped in and shoved the content down — the
  // page title is the one thing we already know before any query returns.
  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Header />
        <div className="card h-80 animate-pulse" />
      </div>
    );
  }

  // can(), not tierMeets(tier, "silver") — naming the tier here is what made
  // every other gate in the app break when the plans changed. The capability
  // stays true whatever the plans are called.
  if (!can(tier, "nutrition")) {
    return (
      <div className="animate-fade-up">
        <Header />
        <div className="mt-6">
          <FeatureLock
            capability="nutrition"
            title="Nutrition is part of Pro"
            blurb="Meal plans that fit your week — say you eat out on Tuesdays and Tuesday is left alone. The shopping list thinks in packs, so one bag of rice covers three meals."
          />
        </div>
      </div>
    );
  }

  // Everything the profile knows goes in. This page already loaded height, age
  // and sex for the meal planner and then handed the targets card nothing but a
  // weight — so the card was estimating from scratch beside a planner that had
  // the real numbers.
  const targets = nutritionTargets({
    weightKg: data?.weightKg ?? null,
    goal: data?.goal ?? null, // sport goal — sets the macro split
    avgTrainingMinutes: data?.avgMinutes ?? 0,
    heightCm: data?.stats.heightCm ?? null,
    age: data?.stats.age ?? null,
    sex: data?.stats.sex ?? null,
    activity: data?.stats.activity ?? null,
    dietGoal: data?.stats.goal ?? null, // diet goal — cut / maintain / build
    trainingDaysLogged: data?.trainingDays ?? 0,
  });
  return (
    <NutritionTabs
      userId={user.id}
      today={today}
      log={data?.log}
      targets={targets}
      stats={data?.stats ?? null}
      prefs={data?.prefs ?? null}
      dietNotes={data?.dietNotes ?? null}
      mealSeed={data?.mealSeed ?? null}
      sport={data?.sport ?? sportProfile(null)}
    />
  );
}

/**
 * Whether today is going well, said once, at the top.
 *
 * The page showed a target, a macro breakdown, a water figure, a log form and a
 * meal planner — and never once said whether you were on track. Everything
 * needed to answer that was already on screen; nothing did the subtraction.
 * "You're 600 under" is the whole point of a calorie target.
 */
function FuelVerdict({ targets, eaten, waterMl, sport }: {
  targets: NutritionTargets | null;
  eaten: number | null;
  waterMl: number | null;
  sport: SportProfile;
}) {
  if (!targets) return null;

  // Nothing logged yet is not "you're 2,600 under" — it's an empty log, and
  // saying otherwise would be alarming and wrong first thing in the morning.
  if (!eaten) {
    return (
      <div className="card border-l-4 border-l-white/15 p-4">
        <span className="eyebrow">Today</span>
        <h2 className="mt-1 text-lg font-extrabold">Target {targets.calories.toLocaleString()} kcal</h2>
        <p className="mt-1 text-sm text-slate-400">
          {targets.protein}g protein, {targets.carbs}g carbs, {targets.fats}g fat.
          Log what you&apos;ve eaten and this becomes a running total.
        </p>
      </div>
    );
  }

  const diff = eaten - targets.calories;
  // A calorie target is an estimate, so treating a 100 kcal miss as a failure
  // would be false precision. 250 is roughly a snack — the point at which the
  // gap is worth doing something about.
  const TOLERANCE = 250;
  const short = -diff;
  const thirsty = waterMl != null && waterMl < targets.water_ml * 0.6;

  const priority = sport.id === "weightlifting" || sport.id === "gym"
    ? `Protein is the one to protect — aim for the ${targets.protein}g.`
    : sport.id === "running"
      ? `Carbs are what you run on — the ${targets.carbs}g matters more than the total.`
      : `Get the ${targets.protein}g protein in and the rest looks after itself.`;

  const v = short > TOLERANCE
    ? {
        tone: "#fbbf24",
        eyebrow: "Worth topping up",
        headline: `You're ${short.toLocaleString()} kcal short`,
        body: `Under-eating on training days is how people stall and get injured, not how they get lean. ${priority}`,
      }
    : diff > TOLERANCE
      ? {
          tone: "#38bdf8",
          eyebrow: "Over target",
          headline: `You're ${diff.toLocaleString()} kcal over`,
          body: `One day doesn't undo a week — it's the pattern that counts. ${priority}`,
        }
      : {
          tone: sport.accent,
          eyebrow: "On target",
          headline: `${eaten.toLocaleString()} of ${targets.calories.toLocaleString()} kcal`,
          body: `Within range for today. ${priority}`,
        };

  return (
    <div className="card border-l-4 p-4" style={{ borderLeftColor: v.tone }}>
      <span className="eyebrow" style={{ color: v.tone }}>{v.eyebrow}</span>
      <h2 className="mt-1 text-lg font-extrabold">{v.headline}</h2>
      <p className="mt-1 max-w-prose text-sm text-slate-400">{v.body}</p>
      {thirsty && (
        <p className="mt-2 text-sm text-amber-200">
          💧 {(waterMl / 1000).toFixed(1)}L of {(targets.water_ml / 1000).toFixed(1)}L — worth catching up on.
        </p>
      )}
    </div>
  );
}

/** ["height","age","sex"] -> "height, age and sex" */
function listWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function avgDailyMinutes(rows: Pick<TrainingLog, "total_minutes">[]): number {
  if (!rows.length) return 0;
  const total = rows.reduce((s, r) => s + (r.total_minutes ?? 0), 0);
  return Math.round(total / 14); // spread across the 14-day window
}

/**
 * Two different visits, split in two. "What have I eaten today" and "plan next
 * week's shop" were stacked on one page — the tracker, the check-in card, the
 * macro form AND the whole meal planner with its week accordion and shopping
 * list. Nobody needs both at once, and together they made the page endless.
 */
const NUTRITION_TABS = [
  { id: "today" as const, label: "Today", icon: "🍽️" },
  { id: "plan" as const, label: "Meal plan", icon: "🛒" },
];

function NutritionTabs({ userId, today, log, targets, stats, prefs, dietNotes, mealSeed, sport }: {
  userId: string; today: string; log: any; targets: NutritionTargets | null;
  stats: Partial<BodyStats> | null; prefs: Partial<MealPrefs> | null; dietNotes: string | null;
  mealSeed: number | null; sport: SportProfile;
}) {
  const [tab, setTab] = useState<"today" | "plan">("today");
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Header />
      {/* Above the tabs, so the answer is there whichever half you're looking at. */}
      <FuelVerdict
        targets={targets}
        eaten={log?.calories_eaten ?? null}
        waterMl={log?.daily_water_intake_ml ?? null}
        sport={sport}
      />
      <Tabs tabs={NUTRITION_TABS} active={tab} onChange={setTab} label="Nutrition sections" />
      {tab === "today" ? (
        <NutritionTracker
          userId={userId}
          today={today}
          initial={log}
          targets={targets}
          stats={stats}
          prefs={prefs}
          dietNotes={dietNotes}
          onAddStats={() => setTab("plan")}
        />
      ) : (
        <MealPlanner userId={userId} initial={stats} initialPrefs={prefs} initialNotes={dietNotes} initialSeed={mealSeed} />
      )}
    </div>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Nutrition</h1>
        <p className="mt-1 text-sm text-slate-400">What to eat today, worked out from your body and how much you are training.</p>
      </div>
      <Link href="/dashboard" className="text-sm text-slate-400 hover:text-pitch-400">← Back</Link>
    </header>
  );
}

function NutritionTracker({ userId, today, initial, targets, stats, prefs, dietNotes, onAddStats }: {
  userId: string; today: string; initial: any; targets: NutritionTargets | null;
  stats: Partial<BodyStats> | null; prefs: Partial<MealPrefs> | null; dietNotes: string | null;
  /** Sends them to the tab that collects height/age/sex, so the estimate sharpens. */
  onAddStats: () => void;
}) {
  // Automatic unless they've already set one. "Coach targets" sat next to an
  // empty target box with a button to copy one into the other, which meant the
  // number we'd worked out did nothing until you noticed the button.
  const [calories, setCalories] = useState<string>(
    initial?.daily_calorie_target?.toString() ?? (targets ? String(targets.calories) : "")
  );
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

  /**
   * Fold a logged meal into today's running totals. Negative values arrive when
   * a ticked meal is un-ticked, so everything clamps at zero rather than going
   * negative on a double-tap.
   */
  function addEaten(m: { kcal: number; protein: number; carbs: number; fats: number }) {
    setEaten((n) => Math.max(0, n + m.kcal));
    setMacros((prev) => ({
      protein: String(Math.max(0, (Number(prev.protein) || 0) + m.protein)),
      carbs: String(Math.max(0, (Number(prev.carbs) || 0) + m.carbs)),
      fats: String(Math.max(0, (Number(prev.fats) || 0) + m.fats)),
    }));
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
    // Header and width live on the tab shell now, so they don't render twice.
    <div className="animate-fade-up space-y-5">
      <MealCheckIn stats={stats} prefs={prefs} dietNotes={dietNotes} onAdd={addEaten} />

      {/* No weight, no targets — say so instead of hiding the card silently. */}
      {!targets && (
        <div className="card p-5">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-pitch-400">
            <span className="h-1.5 w-1.5 rounded-full bg-pitch-400" /> Coach targets
          </h2>
          <p className="mt-2 text-xs text-slate-400">
            Log your weight in the daily check-in and we&apos;ll work out your calories, macros
            and hydration for you.
          </p>
          <Link href="/home" className="btn-ghost mt-3 inline-flex w-auto px-4 py-2 text-sm">Daily check-in →</Link>
        </div>
      )}

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

          {/* The working, when we have enough to show it. */}
          {targets.bmr != null && targets.tdee != null && (
            <p className="mt-1 text-[11px] text-slate-500">
              Resting {targets.bmr.toLocaleString()} kcal · with training {targets.tdee.toLocaleString()} kcal
            </p>
          )}

          {/* A floor moved the number — say which, rather than showing a figure
              that doesn't match the maths above it. */}
          {targets.guard && (
            <p className="mt-2 rounded-xl bg-pitch-400/10 px-3 py-2 text-[11px] text-pitch-400">{targets.guard}</p>
          )}

          {/* Ask for what's missing, once, where the imprecision actually shows. */}
          {targets.basis === "estimated" && targets.missing.length > 0 && (
            <button
              onClick={onAddStats}
              className="mt-2 w-full rounded-xl bg-white/[0.04] px-3 py-2 text-left text-[11px] text-slate-400 transition hover:bg-white/[0.07] hover:text-slate-200"
            >
              Add your {listWords(targets.missing)} to swap this estimate for a proper
              metabolic calculation →
            </button>
          )}
          {/* Two up on a phone — four across 375px clips the numbers. */}
          <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
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
          <span className="text-sm font-bold text-sky-300">{(water / 1000).toFixed(2)} L / {(waterGoal / 1000).toFixed(1)} L</span>
        </div>
        {targets && (
          <p className="-mt-1 mb-1 text-[11px] text-slate-500">
            Set from your body weight plus sweat loss for the training you&apos;ve logged.
          </p>
        )}
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
