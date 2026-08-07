"use client";

import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { can } from "@/lib/subscription";
import { FeatureLock } from "@/components/FeatureLock";
import { MealPlanner } from "@/components/MealPlanner";
import { MealCheckIn } from "@/components/MealCheckIn";
import { Tabs, TabPanel } from "@/components/Tabs";
import { FuelRings } from "@/components/FuelRings";
import { nutritionTargets, type NutritionTargets, type TargetContext } from "@/lib/nutrition";
import { sportProfile, type SportProfile } from "@/lib/sport-profile";
import type { BodyStats, MealPrefs } from "@/lib/meal-plan";
import type { GoalType } from "@/lib/coach";
import type { Subscription, Tier, TrainingLog } from "@/lib/types";
import { daysAgoLocal, todayLocal } from "@/lib/day";

// Same colours as the rings, in the same order — see RING_COLOURS in
// components/FuelRings.tsx. They disagreed before: protein was gold here and
// sky in the rings, carbs sky here and green there — the same macro in two
// colours on one screen, which is worse than no colour coding at all. Gold
// belongs to the calorie ring alone.
const MACROS = [
  { key: "protein", label: "Protein", color: "#38bdf8", kcal: 4 },
  { key: "carbs", label: "Carbs", color: "#4ade80", kcal: 4 },
  { key: "fats", label: "Fats", color: "#c084fc", kcal: 9 },
] as const;

export default function NutritionPage() {
  const user = useCurrentUser();
  const today = todayLocal();

  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const since = daysAgoLocal(14);
    const [{ data: sub }, { data: log }, { data: weightRow }, { data: program }, { data: training }, { data: profile }] = await Promise.all([
      supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("nutrition_logs").select("*").eq("user_id", user.id).eq("log_date", today).maybeSingle(),
      supabase.from("daily_check_ins").select("weight_kg").eq("user_id", user.id).not("weight_kg", "is", null).order("check_in_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("programs").select("goal_type").eq("user_id", user.id).eq("status", "active").maybeSingle(),
      supabase.from("training_logs").select("log_date, total_minutes").eq("user_id", user.id).gte("log_date", since),
      supabase.from("profiles").select("height_cm, birth_year, sex, activity_level, diet_goal, diet_pattern, diet_avoid, meals_per_day, diet_notes, meal_plan_seed, meal_plan_swaps, meal_plan_recent, sport").eq("id", user.id).maybeSingle(),
    ]);
    const pr = profile as {
      height_cm?: number; birth_year?: number; sex?: string;
      activity_level?: string; diet_goal?: string;
      diet_pattern?: string; diet_avoid?: string[]; meals_per_day?: number; diet_notes?: string;
      meal_plan_seed?: number | null; meal_plan_swaps?: Record<string, string> | null;
      meal_plan_recent?: string[] | null; sport?: string;
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
      // Hand-picked meals, applied on top of the seed. An older database
      // without the column simply yields no swaps rather than failing.
      mealSwaps: pr?.meal_plan_swaps ?? {},
      // What the previous plan served, so a regenerate moves on rather than
      // handing back the same week. Absent on an older database, which just
      // means the first regenerate after deploying has nothing to move on from.
      mealRecent: pr?.meal_plan_recent ?? [],
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
        <div className="flex gap-2">
          <div className="h-9 w-28 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="h-9 w-28 animate-pulse rounded-full bg-white/[0.04]" />
        </div>
        {/* The hero: rings, then the legend beside them on a wide screen. */}
        <div className="card p-5">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
            <div className="h-[208px] w-[208px] shrink-0 animate-pulse rounded-full bg-white/[0.06]" />
            <div className="w-full space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-3 animate-pulse rounded bg-white/[0.06]" />
              ))}
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-9 flex-1 animate-pulse rounded-xl bg-white/[0.04]" />
            ))}
          </div>
        </div>
        <div className="card h-56 animate-pulse" />
        <div className="card h-14 animate-pulse" />
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
      mealSwaps={data?.mealSwaps ?? {}}
      mealRecent={data?.mealRecent ?? []}
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
 * Whether today is going well, in one sentence.
 *
 * This was a card of its own — an eyebrow, a headline, a ring and a paragraph —
 * sitting directly above a second card carrying the same total with a bar under
 * it. Two bordered rectangles, one number, different words. That duplication is
 * most of why the page read as a form to fill in.
 *
 * The rings answer "am I on track" without anyone reading a word, so the only
 * job left for prose is the part a ring can't do: what to do about the gap, in
 * this sport's terms. One line, inside the same card.
 *
 * Returns null when there is nothing honest to say. An empty log is not "you're
 * 2,600 under" — that would be alarming and wrong first thing in the morning.
 */
function fuelVerdict(
  targets: NutritionTargets | null,
  eaten: number,
  waterMl: number,
  sport: SportProfile
): { tone: string; headline: string; body: string } | null {
  if (!targets || !eaten) return null;

  const diff = eaten - targets.calories;
  // A calorie target is an estimate, so treating a 100 kcal miss as a failure
  // would be false precision. 250 is roughly a snack — the point at which the
  // gap is worth doing something about.
  const TOLERANCE = 250;
  const short = -diff;

  const priority = sport.id === "weightlifting" || sport.id === "gym"
    ? `Protein is the one to protect — aim for the ${targets.protein}g.`
    : sport.id === "running"
      ? `Carbs are what you run on — the ${targets.carbs}g matters more than the total.`
      : `Get the ${targets.protein}g protein in and the rest looks after itself.`;

  // The water bar shows the shortfall; this says it's worth acting on. Only
  // when they're properly behind, so it isn't a permanent scold.
  const water = waterMl < targets.water_ml * 0.6
    ? ` Water's behind too — ${(waterMl / 1000).toFixed(1)}L of ${(targets.water_ml / 1000).toFixed(1)}L.`
    : "";

  if (short > TOLERANCE) {
    return {
      tone: "#fbbf24",
      headline: `${short.toLocaleString()} kcal short`,
      body: `Under-eating on training days is how people stall and get injured, not how they get lean. ${priority}${water}`,
    };
  }
  if (diff > TOLERANCE) {
    return {
      tone: "#38bdf8",
      headline: `${diff.toLocaleString()} kcal over`,
      body: `One day doesn't undo a week — it's the pattern that counts. ${priority}${water}`,
    };
  }
  return {
    tone: sport.accent,
    headline: "On target",
    body: `Within range for today. ${priority}${water}`,
  };
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

function NutritionTabs({ userId, today, log, targets, stats, prefs, dietNotes, mealSeed, mealSwaps, mealRecent, sport, context }: {
  userId: string; today: string; log: any; targets: NutritionTargets | null;
  stats: Partial<BodyStats> | null; prefs: Partial<MealPrefs> | null; dietNotes: string | null;
  mealSeed: number | null; mealSwaps: Record<string, string>; mealRecent: string[];
  sport: SportProfile; context: TargetContext;
}) {
  const [tab, setTab] = useState<"today" | "plan">("today");
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Header />
      {/* The verdict used to sit here, above the tabs, "so the answer is there
          whichever half you're looking at". It moved inside the Today card with
          the rings: the two halves ask different questions, and "you're 600
          short today" is noise on the tab about next week's shop. */}
      <Tabs tabs={NUTRITION_TABS} active={tab} onChange={setTab} label="Nutrition sections" />
      <TabPanel id={tab}>
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
          mealSwaps={mealSwaps}
          mealRecent={mealRecent}
          sport={sport}
          context={context}
          onAddStats={() => setTab("plan")}
        />
      ) : (
        <MealPlanner userId={userId} initial={stats} initialPrefs={prefs} initialNotes={dietNotes} initialSeed={mealSeed} initialSwaps={mealSwaps} initialRecent={mealRecent} context={context} />
      )}
      </TabPanel>
    </div>
  );
}

function Header() {
  return (
    <header className="flex flex-col">
        <BackLink href="/dashboard" label="Progress" />
        <h1 className="text-3xl font-extrabold tracking-tight">Nutrition</h1>
        <p className="mt-1 text-sm text-slate-400">What to eat today, worked out from your body and how much you are training.</p>
      </header>
  );
}

function NutritionTracker({ userId, today, initial, targets, stats, prefs, dietNotes, mealSeed, mealSwaps, mealRecent, sport, context, onAddStats }: {
  userId: string; today: string; initial: any; targets: NutritionTargets | null;
  stats: Partial<BodyStats> | null; prefs: Partial<MealPrefs> | null; dietNotes: string | null;
  /** Shared with the planner so today?s tick-list matches the plan exactly. */
  context: TargetContext;
  /** Which plan they're on, so today's tick-list is THAT plan and not another. */
  mealSeed: number | null; mealSwaps: Record<string, string>; mealRecent: string[];
  /** Colours the rings and frames the verdict in this sport's terms. */
  sport: SportProfile;
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

  /**
   * The target the athlete is actually being measured against.
   *
   * Their own number wins. My first pass at the new card read `targets.calories`
   * directly, which quietly ignored the manual override — someone could set
   * 2,400 in the box and watch the bar keep filling towards the computed 2,900.
   */
  const targetKcal = Number(calories) || targets?.calories || 0;

  const verdict = fuelVerdict(targets, eaten, water, sport);

  /**
   * Adopt the computed calorie target as your own.
   *
   * It used to write the target MACROS into `macros` as well — and `macros` is
   * what addEaten accumulates INTAKE into. One field, two meanings, depending
   * on which control you last touched. It was survivable while macros were a
   * row of input boxes; as progress bars it is not, because tapping this filled
   * all three to 100% and told the athlete they had eaten a day's food they
   * hadn't touched. `macros` means eaten, and only eaten.
   */
  function applyTargets() {
    if (!targets) return;
    setCalories(String(targets.calories));
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
      {/* ONE HERO, NOT A STACK OF BOXES.
          Even after collapsing five cards into two, the two that were left both
          reported the same number in different words — a verdict card with a
          ring, and a "Today so far" card with the same total and a bar under
          it. Every element was a bordered rectangle of equal weight, which is
          what made it read as a form rather than something to look at.

          Four rings say "am I on track" in one glance and no reading, in a
          shape this audience already knows from their watch. Everything else on
          the card is an action, not another readout.

          It leads now. It used to open below the meal tick-list, so the first
          thing on the page was a list of things to do and the answer to "where
          am I" was a scroll away. Look, then act. */}
      <div className="card p-5">
        {/* THE RINGS ONLY EXIST IF THERE IS SOMETHING TO FILL.
            A ring shows progress towards a target. With no weight logged there
            is no target, so all four render as empty grey circles with a 0 in
            the middle and four rows of "0g —" beneath — about seven hundred
            pixels, the whole first screen, saying nothing. And the prompt that
            would fix it sat underneath all of it.

            That is the hierarchy exactly inverted: the biggest, most colourful
            thing on the page was the part with no information, and the one
            instruction that matters was below the fold. In this state the
            prompt IS the hero. The rings come back the moment they can say
            something. */}
        {targets ? (
          <FuelRings
            eaten={eaten}
            targetKcal={targetKcal}
            macros={{
              protein: Number(macros.protein) || 0,
              carbs: Number(macros.carbs) || 0,
              fats: Number(macros.fats) || 0,
            }}
            targets={targets}
          />
        ) : null}

        {/* The one thing the rings can't say: what to do about the gap. A line,
            not a card — this used to be its own bordered panel above the tabs
            repeating the same total in words. */}
        {verdict ? (
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            <span className="font-bold" style={{ color: verdict.tone }}>{verdict.headline}.</span>{" "}
            {verdict.body}
          </p>
        ) : targets ? (
          <p className="mt-4 text-sm text-slate-500">
            Nothing logged yet. Tick off a meal below, photograph your plate, or tap a number.
          </p>
        ) : (
          /* NO WEIGHT LOGGED — so every ring above is empty and every number on
             this page is zero. This is the state a new athlete actually opens
             the page in, and it was a grey sentence with an inline text link
             underneath a large dead graphic. Two things were wrong with it:

             The link went to /home, not to the check-in. So the app's single
             most important unlock — one number that turns on calories, macros,
             hydration and the whole meal planner — cost an extra hop and a hunt.

             And it was styled as small print. The rings above are 208px of gold
             and colour saying nothing; the one instruction that makes them mean
             something was the quietest thing on the card. Now it is the loudest
             thing in this state, and it is a button. */
          <div className="rounded-2xl border border-pitch-400/25 bg-pitch-400/[0.06] p-4">
            <p className="text-sm font-bold text-slate-100">Add your weight to get your targets</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              Log your weight and your calories, macros and hydration targets work themselves
              out — from your height, age, sport and how much you&apos;re training.
            </p>
            <Link href="/journal" className="btn-primary mt-3 w-auto px-5">
              Log my weight →
            </Link>
          </div>
        )}

        {/* Quick-add: the fastest way to log a coffee and a banana without
            describing them to anything.

            Hidden until there are targets. These are calorie buttons whose only
            label was the ring above them saying "kcal eaten" — with the ring
            suppressed they became three bare numbers and an "edit" box floating
            under a prompt about weight. They are also pointless in that state:
            adding 200 towards a target that doesn't exist yet moves a bar that
            isn't there. Water stays, because it carries its own label and its
            own goal, neither of which depends on a weight. */}
        <div className={`mt-5 flex-wrap items-center gap-2 ${targets ? "flex" : "hidden"}`}>
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

        {/* Water rides along the bottom as a slim bar. It is one number and two
            buttons and never justified a panel of its own. */}
        <div className="mt-4 border-t border-white/[0.06] pt-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">💧 Water</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <span
                className="block h-full rounded-full bg-sky-400 transition-all"
                style={{ width: `${Math.min(100, (water / waterGoal) * 100)}%` }}
              />
            </span>
            <span className="shrink-0 text-xs tabular-nums text-sky-300">
              {(water / 1000).toFixed(1)}<span className="text-slate-600">/{(waterGoal / 1000).toFixed(1)}L</span>
            </span>
            {[250, 500].map((ml) => (
              <button
                key={ml}
                onClick={() => setWater((w) => w + ml)}
                className="chip shrink-0 text-sky-300 hover:bg-white/[0.08]"
              >
                +{ml}
              </button>
            ))}
          </div>
        </div>
      </div>

      <MealCheckIn stats={stats} prefs={prefs} dietNotes={dietNotes} seed={mealSeed} swaps={mealSwaps} recent={mealRecent} context={context} onAdd={addEaten} />

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
              <button onClick={applyTargets} className="tap-target mt-3 text-xs font-semibold text-pitch-400 hover:underline">
                Reset my numbers to these
              </button>
            </div>
          )}

          <div className="space-y-3">
            <label className="block">
              <span className="field-label">Daily calorie target</span>
              <input type="number" inputMode="numeric" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="e.g. 2800" className="field" />
            </label>
            {/* These are what you ATE, not what you are aiming for — the
                targets are computed above. Logging a meal fills them in; this
                is for correcting the number by hand. The old label just said
                "Protein (g)" under a heading about targets, which is how the
                same field came to mean two things. */}
            <span className="field-label !mb-1">Macros eaten today (g)</span>
            <div className="grid grid-cols-3 gap-3">
              {MACROS.map((m) => (
                <label key={m.key} className="block">
                  <span className="text-[11px] font-semibold" style={{ color: m.color }}>{m.label}</span>
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
