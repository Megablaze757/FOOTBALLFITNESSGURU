"use client";

import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { type IconName } from "@/components/Icon";
import { useCurrentUser } from "@/lib/auth";
import { useAsync, invalidate } from "@/lib/use-async";
import { can } from "@/lib/subscription";
import { FeatureLock } from "@/components/FeatureLock";
import { MealPlanner } from "@/components/MealPlanner";
import { MealCheckIn } from "@/components/MealCheckIn";
import { TodayFood } from "@/components/TodayFood";
import { QuickCalories } from "@/components/QuickCalories";
import { WaterRow } from "@/components/WaterRow";
import { addEntry, addQuickCalories, entriesForDay, logTotals, removeByRef, type FoodEntry } from "@/lib/food-log";
import type { Macros } from "@/lib/meal-plan";
import { Tabs, TabPanel } from "@/components/Tabs";
import { FuelRings } from "@/components/FuelRings";
import { clampWaterMl, nutritionTargets, type NutritionTargets, type TargetContext } from "@/lib/nutrition";
import { sportProfile, type SportProfile } from "@/lib/sport-profile";
import type { BodyStats, MealPrefs } from "@/lib/meal-plan";
import type { GoalType } from "@/lib/coach";
import type { Subscription, Tier, TrainingLog } from "@/lib/types";
import { daysAgoLocal, todayLocal } from "@/lib/day";
import { selectProfile } from "@/lib/profile-columns";
import { latestBodyweight } from "@/lib/bodyweight";
import { currentPain } from "@/lib/pain";

/** Exactly the shape written to `nutrition_logs`, so what we save and what we
 *  hand back to the page cannot describe the row differently. */
interface NutritionRow {
  user_id: string;
  log_date: string;
  daily_calorie_target: number | null;
  calories_eaten: number | null;
  macros: { protein: number; carbs: number; fats: number };
  daily_water_intake_ml: number;
  entries: FoodEntry[];
}

export default function NutritionPage() {
  const user = useCurrentUser();
  const today = todayLocal();

  const { data, loading, mutate } = useAsync(async () => {
    const supabase = createClient();
    const since = daysAgoLocal(14);
    const [{ data: sub }, { data: log }, { data: weightRow }, { data: latestCheck }, { data: program }, { data: training }, { data: profile }, { data: weighBody }] = await Promise.all([
      supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("nutrition_logs").select("*").eq("user_id", user.id).eq("log_date", today).maybeSingle(),
      // Both weight tables, not just the check-in. Weighing in on /body and
      // then finding your calorie target unchanged is the same one-fact-two-
      // homes problem that made the Progress ranks invisible — lib/bodyweight.ts.
      supabase.from("daily_check_ins").select("check_in_date, weight_kg").eq("user_id", user.id).not("weight_kg", "is", null).order("check_in_date", { ascending: false }).limit(1),
      // The latest check-in whatever it holds, for the pain map. Separate from
      // the weight query above, which filters to rows that HAVE a weight — an
      // athlete who reported a sore knee without weighing in still counts.
      supabase.from("daily_check_ins").select("check_in_date, pain_map").eq("user_id", user.id).order("check_in_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("programs").select("goal_type").eq("user_id", user.id).eq("status", "active").maybeSingle(),
      supabase.from("training_logs").select("log_date, total_minutes").eq("user_id", user.id).gte("log_date", since),
      // Split into stable and recently-added columns. Naming a column the
      // database hasn't got yet makes PostgREST reject the WHOLE row, and this
      // page then renders an athlete with no height, no weight and no plan —
      // which is exactly what happened when 0066-0069 hadn't been applied.
      selectProfile(supabase, user.id,
        "height_cm, birth_year, sex, activity_level, diet_goal, diet_pattern, diet_avoid, meals_per_day, diet_notes, meal_plan_seed, sport",
        ["meal_plan_swaps", "meal_plan_recent", "meal_plan_starred"]),
      supabase.from("body_logs").select("log_date, weight_kg").eq("user_id", user.id)
        .not("weight_kg", "is", null).order("log_date", { ascending: false }).limit(1),
    ]);
    /**
     * INJURED, from the same aged pain map the training engine uses.
     *
     * Healing soft tissue raises protein need whatever the programme is called.
     * `injury_recovery` already carried the top rate, but most injured athletes
     * are not on a rehab block — they tore something on Saturday and the block
     * still says "strength". Aged via lib/pain.ts so a knee reported in March
     * does not keep somebody on recovery macros for the rest of the year.
     */
    const lc = latestCheck as { check_in_date?: string; pain_map?: Record<string, number> } | null;
    const sore = currentPain(lc?.pain_map, lc?.check_in_date, today);
    const injured = Object.values(sore).some((v) => (Number(v) || 0) >= 4);

    const bodyweight = latestBodyweight({
      checkIns: (weightRow ?? []).map((r) => ({ date: r.check_in_date as string, kg: r.weight_kg as number })),
      weighIns: (weighBody ?? []).map((r) => ({ date: r.log_date as string, kg: r.weight_kg as number })),
    });
    const pr = profile as {
      height_cm?: number; birth_year?: number; sex?: string;
      activity_level?: string; diet_goal?: string;
      diet_pattern?: string; diet_avoid?: string[]; meals_per_day?: number; diet_notes?: string;
      meal_plan_seed?: number | null; meal_plan_swaps?: Record<string, string> | null;
      meal_plan_recent?: string[] | null; meal_plan_starred?: string[] | null; sport?: string;
    } | null;
    return {
      sub: (sub ?? null) as Subscription | null,
      log,
      weightKg: bodyweight?.kg ?? null,
      goal: (program?.goal_type ?? null) as GoalType | null,
      avgMinutes: avgDailyMinutes((training ?? []) as Pick<TrainingLog, "total_minutes">[]),
      // How much of the window is actually backed by a log. Below a handful of
      // days we trust what they told us about their week over what we measured,
      // so a quiet fortnight doesn't quietly cut their calories.
      trainingDays: (training ?? []).length,
      injured,
      // Seed the planner from the profile so stats survive between visits.
      stats: {
        heightCm: pr?.height_cm ?? undefined,
        age: pr?.birth_year ? new Date().getFullYear() - pr.birth_year : undefined,
        sex: (pr?.sex as "male" | "female" | undefined) ?? undefined,
        activity: (pr?.activity_level as never) ?? undefined,
        goal: (pr?.diet_goal as never) ?? undefined,
        weightKg: bodyweight?.kg ?? undefined,
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
      // Dishes they starred. Unlike swaps these outlive the plan they were set
      // on, because a star is about the dish, not about Thursday.
      mealStarred: pr?.meal_plan_starred ?? [],
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
    injured: data?.injured ?? false,
  });
  return (
    <NutritionTabs
      userId={user.id}
      // Fold the saved row straight into the loaded data. The tracker is
      // unmounted and remounted every time the tabs switch, and it rebuilds its
      // state from `log` — so this has to be current, and it is the only reason
      // the page ever refetched after a save.
      onSaved={(row) => mutate((d) => ({ ...d, log: { ...(d.log ?? {}), ...row } }))}
      today={today}
      log={data?.log}
      targets={targets}
      stats={data?.stats ?? null}
      prefs={data?.prefs ?? null}
      dietNotes={data?.dietNotes ?? null}
      mealSeed={data?.mealSeed ?? null}
      mealSwaps={data?.mealSwaps ?? {}}
      mealRecent={data?.mealRecent ?? []}
      mealStarred={data?.mealStarred ?? []}
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
  { id: "today" as const, label: "Today", icon: "plate" as IconName },
  { id: "plan" as const, label: "Meal plan", icon: "clipboard" as IconName },
];

function NutritionTabs({ userId, today, log, targets, stats, prefs, dietNotes, mealSeed, mealSwaps, mealRecent, mealStarred, sport, context, onSaved }: {
  userId: string; today: string; log: any; targets: NutritionTargets | null;
  onSaved: (row: NutritionRow) => void;
  stats: Partial<BodyStats> | null; prefs: Partial<MealPrefs> | null; dietNotes: string | null;
  mealSeed: number | null; mealSwaps: Record<string, string>; mealRecent: string[]; mealStarred: string[];
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
          mealStarred={mealStarred}
          sport={sport}
          context={context}
          onAddStats={() => setTab("plan")}
          onSaved={onSaved}
        />
      ) : (
        <MealPlanner userId={userId} initial={stats} initialPrefs={prefs} initialNotes={dietNotes} initialSeed={mealSeed} initialSwaps={mealSwaps} initialRecent={mealRecent} initialStarred={mealStarred} context={context} />
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

function NutritionTracker({ userId, today, initial, targets, stats, prefs, dietNotes, mealSeed, mealSwaps, mealRecent, mealStarred, sport, context, onAddStats, onSaved }: {
  userId: string; today: string; initial: any; targets: NutritionTargets | null;
  /** Takes the row we just wrote, so a remount reads it without a refetch. */
  onSaved: (row: NutritionRow) => void;
  stats: Partial<BodyStats> | null; prefs: Partial<MealPrefs> | null; dietNotes: string | null;
  /** Shared with the planner so today?s tick-list matches the plan exactly. */
  context: TargetContext;
  /** Which plan they're on, so today's tick-list is THAT plan and not another. */
  mealSeed: number | null; mealSwaps: Record<string, string>; mealRecent: string[]; mealStarred: string[];
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
  const [water, setWater] = useState<number>(initial?.daily_water_intake_ml ?? 0);
  /**
   * Today's food, itemised — and the ONLY record of what was eaten.
   *
   * A day written before 0072 added this column, or by the old quick-add
   * buttons, carries totals and no list; entriesForDay brings those forward as
   * one entry so the list is the truth from the first render rather than from
   * the first tick.
   */
  const [entries, setEntries] = useState<FoodEntry[]>(() =>
    entriesForDay((initial as { entries?: unknown } | null)?.entries, {
      kcal: initial?.calories_eaten ?? 0,
      protein: initial?.macros?.protein ?? 0,
      carbs: initial?.macros?.carbs ?? 0,
      fats: initial?.macros?.fats ?? 0,
    })
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * DERIVED, NOT STORED. `eaten` and `macros` used to be state of their own,
   * set both by summing the list and by controls that wrote them directly — so
   * the page held two answers to "what have you eaten today" and no rule for
   * which won. Tapping +200 moved one of them; the next meal ticked recomputed
   * from the other and the 200 vanished.
   *
   * Computing them here makes that disagreement unrepresentable. Every control
   * on the page now changes the list, and the total follows.
   */
  const totals = logTotals(entries);
  const eaten = totals.kcal;

  useEffect(() => { setSaved(false); }, [calories, water, entries]);

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
  /**
   * A TICK IS A COMMIT, SO IT HAS TO REACH THE DATABASE.
   *
   * This only ever moved React state. Nothing persisted until you scrolled past
   * the whole page and pressed "Save today's nutrition" — so ticking your meals,
   * watching the ring fill, and then tapping Progress silently threw the lot
   * away. Coming back re-read the row that was never written and the counter was
   * back to zero. Reported as "when I clicked progress the calories reset", and
   * that is exactly what happened.
   *
   * Nothing about ticking a meal says "this is a draft". The number goes up, the
   * ring moves, the item strikes through — every signal says committed. A save
   * button somewhere below the fold is not consent, it is a trap.
   *
   * Only the TAPPED fields autosave. The calorie target and the macro boxes are
   * typed, and writing those on each keystroke would persist "2" on the way to
   * "2500". Those keep the explicit button.
   */
  /**
   * THE LIST IS THE TRUTH; THE TOTALS ARE DERIVED FROM IT.
   *
   * This used to add macros onto a running total and nothing else, which is why
   * nothing could be corrected afterwards: the day dissolved into two numbers
   * with no record of what made them. Now every log appends an entry and the
   * totals are recomputed by summing — so editing a portion or removing a meal
   * is just a change to the list, and the two can never disagree.
   */
  function addFood(e: { label: string; macros: Macros; source: "plan" | "estimate"; ref?: string }) {
    applyEntries(addEntry(entries, { ...e.macros, label: e.label, source: e.source, ref: e.ref }));
  }

  /**
   * Move today's water and commit it, for the same reason a meal tick commits:
   * a glass you logged and then navigated away from was never logged at all.
   *
   * Every route in — the +250 chips, the typed amount, remove, clear — goes
   * through here, so the floor at zero and the rounding are applied once rather
   * than at four call sites, one of which would eventually forget.
   */
  function changeWater(next: number) {
    const ml = clampWaterMl(next);
    setWater(ml);
    void persist({ water: ml });
  }

  /** Every change to today's food goes through here: set it, then save it. */
  function applyEntries(next: FoodEntry[]) {
    setEntries(next);
    void persist({ entries: next });
  }

  /**
   * Write today's row. Takes overrides because React state is not yet updated
   * when a tap handler wants to persist what it just computed — reading
   * `entries` here would save the list from before the tap, which is the
   * off-by-one-tap bug that makes autosave worse than no autosave.
   *
   * The stored totals are summed from the list on the way out rather than
   * passed in beside it. They are a convenience for the pages that read this row
   * without wanting the itemisation (Home, Progress); making them a second
   * parameter is what let a row be written claiming 1,338 calories against an
   * empty list.
   */
  async function persist(over?: { water?: number; entries?: FoodEntry[] }) {
    setSaving(true);
    setError(null);
    const w_ = over?.water ?? water;
    const en_ = over?.entries ?? entries;
    const t = logTotals(en_);
    const row = {
      user_id: userId,
      log_date: today,
      daily_calorie_target: calories ? Number(calories) : null,
      calories_eaten: t.kcal || null,
      macros: { protein: t.protein, carbs: t.carbs, fats: t.fats },
      daily_water_intake_ml: w_,
      entries: en_,
    };
    const supabase = createClient();
    const { error: e } = await supabase.from("nutrition_logs").upsert(row, { onConflict: "user_id,log_date" });
    if (e) setError(e.message);
    else {
      setSaved(true);
      // Home reads this day from its own query and its own cache key, and it is
      // not on screen — dropping it is the whole fix there.
      invalidate(`home:${userId}`);
      /**
       * HAND THE PAGE THE ROW WE JUST WROTE, rather than making it go and read
       * it back.
       *
       * This used to invalidate the nutrition cache and call reload(). That
       * fixed a real bug — switching to the Meal plan tab UNMOUNTS this
       * component (the tabs are a ternary), so coming back re-reads `initial`,
       * and `initial` was the row as it looked when the PAGE loaded. Tap
       * +500ml, switch tab, switch back, and the bar was empty again; worse,
       * the remount reset `entries` to that stale list and the next save wrote
       * the empty list back over the real one.
       *
       * But refetching to fix it is a sledgehammer. reload() drops the cache,
       * which sends useAsync's `loading` back to true, which returns the page's
       * SKELETON — so every meal tick and every water tap blanked the whole
       * screen for six queries and then rebuilt it. It also threw away state
       * that hadn't been persisted yet: tap +200 kcal, tick a meal, and the 200
       * disappeared with the unmount.
       *
       * We already know what the row says: we just wrote it. onSaved() folds it
       * into the loaded data in place, so a remount still reads the truth and
       * nothing flashes. Same guarantee, no network, no skeleton.
       */
      onSaved(row);
    }
    setSaving(false);
  }

  const save = () => persist();

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
            macros={{ protein: totals.protein, carbs: totals.carbs, fats: totals.fats }}
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

        {/* Quick-add, hidden until there are targets. These are calorie buttons
            whose only label is the ring above them saying "kcal eaten" — with
            the ring suppressed they read as three bare numbers under a prompt
            about weight, and they are pointless in that state anyway: adding
            200 towards a target that doesn't exist yet moves a bar that isn't
            there. Water stays, because it carries its own label and its own
            goal, neither of which depends on a weight. */}
        <QuickCalories
          hidden={!targets}
          onAdd={(kc) => applyEntries(addQuickCalories(entries, kc))}
        />

        {/* Water rides along the bottom as a slim bar. It is one number and two
            buttons and never justified a panel of its own. */}
        <WaterRow ml={water} goalMl={waterGoal} onChange={changeWater} />
      </div>

      {/* What you have eaten, before the ways to add more. Once anything is
          logged, "what did I put in?" is the question this page is open for —
          and it had no answer at all, only a total. */}
      {entries.length > 0 && (
        <div className="card p-5">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="field-label !mb-0">Today&apos;s food</h2>
            <span className="text-xs text-slate-500">tap a row to fix the amount</span>
          </div>
          <TodayFood entries={entries} onChange={applyEntries} />
        </div>
      )}

      <MealCheckIn
        userId={userId} stats={stats} prefs={prefs} dietNotes={dietNotes} seed={mealSeed}
        swaps={mealSwaps} recent={mealRecent} starred={mealStarred} context={context}
        onAdd={addFood}
        onRemoveRef={(ref) => applyEntries(removeByRef(entries, ref))}
      />

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
            {/* THE "MACROS EATEN TODAY" BOXES ARE GONE, and their absence is
                the point. Three number inputs sat here for correcting the day
                by hand, which existed only because the day had no itemised
                list — so a correction meant working out new totals yourself and
                retyping them. Worse, once you had used both the tick-list and
                the boxes they disagreed about the same day with no way to tell
                which was right.
                Today's food (above) is editable per item now, and the totals
                are summed from it. One place to change a number, and it cannot
                contradict itself. */}
          </div>
        </div>
      </details>

      {error && <p className="text-sm text-readiness-red">{error}</p>}
      <button onClick={save} disabled={saving} className="btn-primary">{saving ? "Saving…" : saved ? "Saved ✓" : "Save today's nutrition"}</button>
    </div>
  );
}
