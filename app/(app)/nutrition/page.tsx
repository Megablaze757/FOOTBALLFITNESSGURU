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
import { RingProgress } from "@/components/RingProgress";
import { nutritionTargets, type NutritionTargets, type TargetContext } from "@/lib/nutrition";
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
  // A skeleton shaped like the page, not one grey slab.
  //
  // The single h-80 box was the same height as nothing in particular, so when
  // the data landed the verdict card, the tabs and the tracker all appeared at
  // once and pushed each other around. Matching the real layout means the only
  // thing that changes on load is the content of the boxes.
  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Header />
        <div className="card flex items-center gap-4 border-l-4 border-l-white/10 p-4">
          <div className="h-[78px] w-[78px] shrink-0 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-2.5 w-16 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-5 w-44 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-3 w-52 animate-pulse rounded bg-white/[0.06]" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="h-9 w-28 animate-pulse rounded-full bg-white/[0.04]" />
        </div>
        <div className="card h-56 animate-pulse" />
        <div className="card h-40 animate-pulse" />
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
      // The SAME inputs the card above was computed from. Both the planner and
      // the meal check-in recompute with these, so all three agree by
      // construction rather than by anyone remembering to keep them in step.
      context={{
        goal: data?.goal ?? null,
        avgTrainingMinutes: data?.avgMinutes ?? 0,
        trainingDaysLogged: data?.trainingDays ?? 0,
      }}
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
      <div className="flex items-center gap-4">
        {/* The ring is the point of the card. "You're 600 under" is the answer,
            but a number on its own doesn't show how far through the day you
            are — and that is the thing people actually glance for. */}
        <RingProgress
          pct={(eaten / targets.calories) * 100}
          color={v.tone}
          size={78}
          stroke={7}
          label={`${Math.round((eaten / targets.calories) * 100)}%`}
          sub="of target"
        />
        <div className="min-w-0 flex-1">
          <span className="eyebrow" style={{ color: v.tone }}>{v.eyebrow}</span>
          <h2 className="mt-0.5 text-lg font-extrabold leading-tight">{v.headline}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {targets.protein}g protein · {targets.carbs}g carbs · {targets.fats}g fat
          </p>
        </div>
      </div>
      <p className="mt-3 max-w-prose text-sm text-slate-400">{v.body}</p>
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

function NutritionTabs({ userId, today, log, targets, stats, prefs, dietNotes, mealSeed, sport, context }: {
  userId: string; today: string; log: any; targets: NutritionTargets | null;
  stats: Partial<BodyStats> | null; prefs: Partial<MealPrefs> | null; dietNotes: string | null;
  mealSeed: number | null; sport: SportProfile; context: TargetContext;
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
          mealSeed={mealSeed}
          context={context}
          onAddStats={() => setTab("plan")}
        />
      ) : (
        <MealPlanner userId={userId} initial={stats} initialPrefs={prefs} initialNotes={dietNotes} initialSeed={mealSeed} context={context} />
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

function NutritionTracker({ userId, today, initial, targets, stats, prefs, dietNotes, mealSeed, context, onAddStats }: {
  userId: string; today: string; initial: any; targets: NutritionTargets | null;
  stats: Partial<BodyStats> | null; prefs: Partial<MealPrefs> | null; dietNotes: string | null;
  /** Shared with the planner so today?s tick-list matches the plan exactly. */
  context: TargetContext;
  /** Which plan they're on, so today's tick-list is THAT plan and not another. */
  mealSeed: number | null;
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

  // macroKcal used to be here, feeding a second 4xl headline number that
  // competed with the calorie one. Both claimed to be "today", and they
  // disagreed whenever someone logged with both. Macros are progress rows now.
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
      <MealCheckIn stats={stats} prefs={prefs} dietNotes={dietNotes} seed={mealSeed} context={context} onAdd={addEaten} />

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

      {/* TODAY, IN ONE CARD.
          This was five: a targets card, a big "calories eaten" number, a second
          equally big "or track by macros" number, a manual inputs card and a
          water card. The calorie figure appeared FOUR times on one screen
          counting the verdict above, twice at 4xl, and the two headline numbers
          disagreed with each other whenever someone used both. A busy athlete
          opening this after training has one question — am I on track — and had
          to assemble the answer from four places that each claimed to be it. */}
      <div className="card space-y-4 p-5">
        <div className="flex items-baseline justify-between">
          <span className="field-label !mb-0">Today so far</span>
          {targets && (
            <span className="text-xs text-slate-400">
              {Math.max(0, targets.calories - eaten).toLocaleString()} kcal left
            </span>
          )}
        </div>

        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold text-pitch-400">{eaten.toLocaleString()}</span>
            <span className="text-sm text-slate-500">
              / {targets ? targets.calories.toLocaleString() : (calories || "—")} kcal
            </span>
          </div>
          {targets && (
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-pitch-400 to-pitch-600 transition-all"
                style={{ width: `${Math.min(100, (eaten / targets.calories) * 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Quick-add stays: it is the fastest way to log a coffee and a banana
            without describing them to anything. */}
        <div className="flex flex-wrap gap-2">
          {[200, 400, 600].map((kc) => (
            <button key={kc} onClick={() => setEaten((c) => c + kc)} className="btn-ghost flex-1 py-2 text-sm">+{kc}</button>
          ))}
          <input
            type="number" inputMode="numeric" value={eaten || ""}
            onChange={(e) => setEaten(Number(e.target.value) || 0)}
            className="field w-20 text-center" placeholder="edit"
            aria-label="Calories eaten today"
          />
          <button onClick={() => setEaten(0)} className="btn-ghost w-auto px-3 py-2 text-sm text-slate-400">Reset</button>
        </div>

        {/* Macros as three progress rows rather than a second headline number
            competing with the first. Same information, no rival answer. */}
        {targets && (
          <div className="space-y-2">
            {MACROS.map((m) => {
              const logged = Number(macros[m.key]) || 0;
              const target = m.key === "protein" ? targets.protein : m.key === "carbs" ? targets.carbs : targets.fats;
              return (
                <div key={m.key}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-slate-400">{m.label}</span>
                    <span className="tabular-nums text-slate-300">{logged}g <span className="text-slate-600">/ {target}g</span></span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (logged / target) * 100)}%`, background: m.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Water, same card. It is one number and a button; it never needed its
            own panel. */}
        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-slate-400">Water</span>
            <span className="tabular-nums text-sky-300">{(water / 1000).toFixed(1)}L <span className="text-slate-600">/ {(waterGoal / 1000).toFixed(1)}L</span></span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-sky-400 transition-all" style={{ width: `${Math.min(100, (water / waterGoal) * 100)}%` }} />
          </div>
          <div className="mt-2 flex gap-2">
            {[250, 500].map((ml) => (
              <button key={ml} onClick={() => setWater((w) => w + ml)} className="btn-ghost flex-1 py-1.5 text-xs">+{ml}ml</button>
            ))}
            <button onClick={() => setWater(0)} className="btn-ghost w-auto px-3 py-1.5 text-xs text-slate-400">Reset</button>
          </div>
        </div>
      </div>

      {/* EVERYTHING THAT ISN'T THE DAILY JOB, folded away.
          The rationale, the resting-rate working and the manual overrides are
          all worth having and none of them is why someone opened this page
          after training. Closed by default; one tap when they want it. */}
      <details className="group card overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-semibold text-slate-200">
          <span>
            Targets
            <span className="ml-2 text-xs font-normal text-slate-500">
              {targets ? "how these were worked out, and how to change them" : "set your own"}
            </span>
          </span>
          <span className="text-xs text-slate-500 transition group-open:rotate-180">▾</span>
        </summary>

        <div className="space-y-4 border-t border-white/[0.08] p-4">
          {targets && (
            <div>
              <p className="text-xs text-slate-400">{targets.rationale}</p>
              {targets.bmr != null && targets.tdee != null && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Resting {targets.bmr.toLocaleString()} kcal · with training {targets.tdee.toLocaleString()} kcal
                </p>
              )}
              {/* A floor moved the number — say which, rather than showing a
                  figure that doesn't match the maths above it. */}
              {targets.guard && (
                <p className="mt-2 rounded-xl bg-pitch-400/10 px-3 py-2 text-[11px] text-pitch-400">{targets.guard}</p>
              )}
              {/* Ask for what's missing, once, where the imprecision shows. */}
              {targets.basis === "estimated" && targets.missing.length > 0 && (
                <button
                  onClick={onAddStats}
                  className="mt-2 w-full rounded-xl bg-white/[0.04] px-3 py-2 text-left text-[11px] text-slate-400 transition hover:bg-white/[0.07] hover:text-slate-200"
                >
                  Add your {listWords(targets.missing)} to swap this estimate for a proper
                  metabolic calculation →
                </button>
              )}
              <button onClick={applyTargets} className="mt-3 text-xs font-semibold text-pitch-400 hover:underline">
                Reset my numbers to these
              </button>
            </div>
          )}

          <div className="space-y-3">
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
        </div>
      </details>

      {error && <p className="text-sm text-readiness-red">{error}</p>}
      <button onClick={save} disabled={saving} className="btn-primary">{saving ? "Saving…" : saved ? "Saved ✓" : "Save today's nutrition"}</button>
    </div>
  );
}
