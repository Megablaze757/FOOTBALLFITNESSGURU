"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { invalidate } from "@/lib/use-async";
import {
  planTargets, buildWeek, shoppingList, unmetSlots, dislikedFoodIds, favouriteFoodIds,
  swapKey, slotTargetKcal, type MealSwaps,
  ACTIVITY_LEVELS, DIET_GOALS, DIET_PATTERNS, AVOIDANCES, DEFAULT_PREFS,
  type BodyStats, type Sex, type ActivityLevel, type DietGoal, type PlannedDay,
  type MealPrefs, type DietPattern, type Avoidance,
} from "@/lib/meal-plan";
import { parseSchedule } from "@/lib/meal-schedule";
import type { TargetContext } from "@/lib/nutrition";
import { Recipe } from "@/components/Recipe";
import { MealSwap, type SwapTarget } from "@/components/MealSwap";
import { FOOD_BY_ID as FOOD_LOOKUP } from "@/lib/food-db";
import { ShoppingList } from "@/components/ShoppingList";

interface Props {
  userId: string;
  initial?: Partial<BodyStats> | null;
  initialPrefs?: Partial<MealPrefs> | null;
  initialNotes?: string | null;
  /** Seed of the plan they're already on. Null means they've never generated one. */
  initialSeed?: number | null;
  /**
   * The sport goal and logged training the daily card was computed from.
   *
   * Without this the planner reached the same function by a different route —
   * no sport goal, no measured training — and produced a different calorie
   * target from the one shown at the top of the page. Same function, same
   * inputs, or they disagree again.
   */
  context?: TargetContext;
  /** Hand-picked meals saved against the current plan. */
  initialSwaps?: MealSwaps;
  /** Meals the PREVIOUS plan served, so this one can move on from them. */
  initialRecent?: string[] | null;
  /** Dishes they've starred, which the planner favours heavily. */
  initialStarred?: string[] | null;
}

export function MealPlanner({ userId, initial, initialPrefs, initialNotes, initialSeed, initialSwaps, initialRecent, initialStarred, context }: Props) {
  const [sex, setSex] = useState<Sex>(initial?.sex ?? "male");
  const [age, setAge] = useState(String(initial?.age ?? 20));
  const [heightCm, setHeightCm] = useState(String(initial?.heightCm ?? 178));
  const [weightKg, setWeightKg] = useState(String(initial?.weightKg ?? 75));
  const [activity, setActivity] = useState<ActivityLevel>(initial?.activity ?? "moderate");
  const [goal, setGoal] = useState<DietGoal>(initial?.goal ?? "maintain");
  const [week, setWeek] = useState<PlannedDay[] | null>(null);
  const [seed, setSeed] = useState<number | null>(initialSeed ?? null);
  const [openDay, setOpenDay] = useState(0);
  /**
   * Meals chosen by hand, on top of whatever the seed produced.
   *
   * Held here and persisted to the profile rather than recomputed, because the
   * week is rebuilt from the seed on every visit — a swap that lived only in
   * component state lasted until the next page load, which is worse than not
   * offering one.
   */
  const [swaps, setSwaps] = useState<MealSwaps>(initialSwaps ?? {});
  /**
   * What the plan BEFORE this one served.
   *
   * Persisted for the same reason the seed is: the week is rebuilt from scratch
   * on every visit, so anything that shaped it has to survive a reload or the
   * rebuild silently produces a different plan from the one on screen.
   */
  const [recent, setRecent] = useState<string[]>(initialRecent ?? []);
  /**
   * Dishes they've starred.
   *
   * Unlike swaps, these SURVIVE a regenerate: a swap is positional and means
   * nothing in a new plan, while a star is about the dish itself and should
   * follow them until they take it off.
   */
  const [starred, setStarred] = useState<string[]>(initialStarred ?? []);
  const [swapping, setSwapping] = useState<SwapTarget | null>(null);
  const [saved, setSaved] = useState(false);
  const [prefs, setPrefs] = useState<MealPrefs>({ ...DEFAULT_PREFS, ...(initialPrefs ?? {}) });
  const [notes, setNotes] = useState(initialNotes ?? "");
  const noteDislikes = useMemo(() => dislikedFoodIds(notes), [notes]);
  // "my favourite food is egg" used to do nothing at all. Now it biases the week.
  const noteFavourites = useMemo(() => favouriteFoodIds(notes), [notes]);
  // The same note also says WHEN they eat — "I eat out on Tuesdays" has to stop
  // us planning (and shopping for) a Tuesday dinner.
  const schedule = useMemo(() => parseSchedule(notes), [notes]);

  /**
   * WHICH OF THESE FOUR ARE ACTUALLY THEIRS.
   *
   * Height, age, weight and sex are the parameters the whole plan is computed
   * from, and each falls back to a hard-coded default when the profile hasn't
   * got it — 178cm, 20 years, 75kg, male. That was survivable while they sat in
   * an open form where you could see what they were set to. It stopped being
   * survivable when the form moved behind "Adjust" and I put a summary line on
   * the front reading "From 20 yrs · 178cm · 75kg", which states invented
   * numbers as though the athlete had given them.
   *
   * A field counts as theirs once it arrives from the profile OR they type into
   * it here. Anything else is named as an assumption.
   */
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [adjustOpen, setAdjustOpen] = useState(false);
  function touch(field: string) {
    setTouched((t) => (t[field] ? t : { ...t, [field]: true }));
  }
  const assumed = [
    initial?.weightKg == null && !touched.weight ? "weight" : null,
    initial?.heightCm == null && !touched.height ? "height" : null,
    initial?.age == null && !touched.age ? "age" : null,
    initial?.sex == null && !touched.sex ? "sex" : null,
  ].filter((x): x is string => x !== null);

  // Memoised so it has a stable identity, which is what lets `targets` below
  // depend on the object rather than re-listing its six inputs. The old version
  // rebuilt `stats` every render and then enumerated its parts in the targets
  // deps array — correct, but only by hand, and the linter could not verify it.
  // Two lists of the same six fields is one edit away from disagreeing.
  const stats: BodyStats = useMemo(() => ({
    sex, goal, activity,
    age: Number(age) || 20,
    heightCm: Number(heightCm) || 178,
    weightKg: Number(weightKg) || 75,
  }), [sex, goal, activity, age, heightCm, weightKg]);

  const targets = useMemo(() => planTargets(stats, context ?? {}), [stats, context]);
  const list = useMemo(() => (week ? shoppingList(week) : null), [week]);
  // If someone excludes enough, a meal slot can end up with nothing in it —
  // better to say so than to quietly hand back a short day.
  // Foods named in the notes are excluded on top of the tapped preferences.
  const effectivePrefs = useMemo(
    () => ({ ...prefs, dislikes: [...prefs.dislikes, ...noteDislikes], starred }),
    [prefs, noteDislikes, starred]
  );
  const gaps = useMemo(() => unmetSlots(effectivePrefs), [effectivePrefs]);

  // Rebuild the plan they were already on. buildWeek is pure, so the same seed
  // and the same saved inputs give back the identical week — which is the point:
  // regenerating with a fresh random seed would hand them a different plan from
  // the shopping list they'd already started buying against.
  useEffect(() => {
    if (seed === null || week) return;
    setWeek(buildWeek(targets, seed, effectivePrefs, schedule, swaps, recent));
    // Only on mount, and only to restore. Changing stats afterwards should not
    // silently rewrite the plan under them — that's what Generate is for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Apply a hand-picked meal and remember it.
   *
   * Rebuilds the whole week rather than patching the one day, because the
   * shopping list, the repeat counter and the basket costing all depend on what
   * else is in the week — swapping Thursday's dinner changes what Friday's is
   * scored against, and a patched day would leave the list disagreeing with the
   * plan.
   */
  async function applySwap(mealId: string) {
    if (!swapping || seed === null) return;
    const next = { ...swaps, [swapKey(swapping.dayIndex, swapping.slot, swapping.nth)]: mealId };
    setSwaps(next);
    setWeek(buildWeek(targets, seed, effectivePrefs, schedule, next, recent));
    setSwapping(null);
    // Best effort: the swap is already on screen, and an older database without
    // the column must not make the feature look broken.
    try {
      await createClient().from("profiles").update({ meal_plan_swaps: next }).eq("id", userId);
    } catch { /* ignore */ }
  }

  /**
   * Star or unstar a dish.
   *
   * Deliberately does NOT rebuild the week. A star says "more of this in
   * future", and rewriting the plan under someone the instant they tap a star
   * would move meals they were reading and invalidate a shopping list they may
   * already be buying against. It takes effect on the next regenerate, which
   * is when they have asked for a new plan.
   */
  async function toggleStar(mealId: string) {
    const next = starred.includes(mealId)
      ? starred.filter((id) => id !== mealId)
      : [...starred, mealId];
    setStarred(next);
    // Best effort, same as swaps: the star is already lit on screen, and an
    // older database without the column must not make the button look broken.
    try {
      await createClient().from("profiles").update({ meal_plan_starred: next }).eq("id", userId);
    } catch { /* ignore */ }
  }

  async function clearSwaps() {
    if (seed === null) return;
    setSwaps({});
    setWeek(buildWeek(targets, seed, effectivePrefs, schedule, {}, recent));
    try {
      await createClient().from("profiles").update({ meal_plan_swaps: {} }).eq("id", userId);
    } catch { /* ignore */ }
  }

  async function generate() {
    /**
     * REGENERATION DIDN'T REGENERATE. AT ALL.
     *
     * It was `Math.random() * 3` once, so the app could produce three weeks
     * ever and the button had a one-in-three chance of returning the identical
     * plan. Widening that to 997 was supposed to fix it. It did nothing, and
     * the reason is worse than the original bug: `seed` fed a tie-break worth a
     * tenth of a penny against scoring terms weighted 4, 8 and 35, so it never
     * changed a single choice. Measured across three athletes and three diet
     * patterns, every seed from 0 to 5 produced the byte-identical week.
     * "Regenerate week" had never worked.
     *
     * The seed still exists — the plan is rebuilt from it on every visit, so it
     * has to. What actually varies the week is `recent`: the meals the last
     * plan served, which arrive already carrying repeat cost so the new plan
     * reaches past them. That took average week-on-week change from 0% to 55%.
     */
    let next = seed;
    for (let i = 0; i < 20 && next === seed; i++) next = Math.floor(Math.random() * 997);
    setSeed(next);
    // What they've just been eating, so the new plan moves on from it. Captured
    // BEFORE the state is replaced, obviously, and from the week on screen
    // rather than from `recent` — that one is now two plans old.
    const justServed = (week ?? []).flatMap((d) => d.meals.map((m) => m.meal.id));
    setRecent(justServed);
    // A new seed is a new plan, so the old positions mean nothing — keeping the
    // swaps would move someone's Thursday dinner onto an unrelated slot.
    setSwaps({});
    setWeek(buildWeek(targets, next!, effectivePrefs, schedule, {}, justServed));
    setOpenDay(0);
    // Remember the stats AND which plan it was, so neither has to be redone.
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({
      height_cm: stats.heightCm,
      birth_year: new Date().getFullYear() - stats.age,
      sex, activity_level: activity, diet_goal: goal,
      diet_pattern: prefs.pattern,
      diet_avoid: prefs.avoid,
      meals_per_day: prefs.mealsPerDay,
      diet_notes: notes.trim() || null,
      meal_plan_seed: next!,
      meal_plan_swaps: {},
      meal_plan_recent: justServed,
      // Stars are about the dishes, not this plan, so they carry over.
      meal_plan_starred: starred,
    }).eq("id", userId);
    if (!error) {
      // The nutrition page caches its loader; without this the restored plan
      // would be the old seed until the cache expired.
      invalidate(`nutrition:${userId}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  /**
   * When the built week can't reach the target, say so.
   *
   * A 115kg forward building on 4,370 kcal was handed 3,010 across three meals
   * — 69% — and nothing on screen said a word about it. Portions cap at 1.6x on
   * purpose (past that you get servings nobody would put on a plate), so above
   * a certain target the only honest answers are "eat more often" or "this is
   * as far as the recipe list goes". Silently under-feeding the one athlete
   * whose goal is to gain is the worst of the three.
   *
   * 8% is the tolerance: a calorie target is an estimate, and flagging a 3%
   * miss would be false precision on top of it.
   */
  const weekAvgKcal = week && week.length
    ? week.reduce((s, d) => s + d.macros.kcal, 0) / week.length
    : null;
  const shortBy = weekAvgKcal != null && targets.calories > 0 && weekAvgKcal < targets.calories * 0.92
    ? Math.round(targets.calories - weekAvgKcal)
    : null;

  const activityLabel = ACTIVITY_LEVELS.find((a) => a.id === activity)?.label ?? activity;
  const goalLabel = DIET_GOALS.find((g) => g.id === goal)?.label ?? goal;
  const patternLabel = DIET_PATTERNS.find((d) => d.id === prefs.pattern)?.label;

  return (
    <section className="space-y-4">
      {/* ONE BUTTON, NOT NINE QUESTIONS.
          This screen opened on eight stacked controls — age, height, weight,
          sex, training load, goal, diet pattern, avoidances, meals a day, a
          budget tick and a notes box — and the button that actually does
          something was below all of it. On the tab you opened to see a meal
          plan.

          Nearly every one of those answers is already in the profile: the
          nutrition page loads them, and passes them in here as `initial`. So
          the form was mostly asking the athlete to retype what the app had
          just read. It says what it's using instead, and the controls are one
          tap away for when it's wrong.

          Same fix as the programme builder on /coach, which had the same shape
          and the same problem. */}
      <div className="card-premium p-6">
        <h2 className="text-xl font-extrabold">Your meal week</h2>
        <p className="mt-1 text-sm text-slate-400">
          Seven days of meals built to your calories, and a shop that covers them.
        </p>

        {/* THE GOAL BELONGS ON THE FRONT, NOT IN A DRAWER.
            It moves the calorie target by ~1,100 kcal between lean down and
            build — more than any other control here — and burying it in
            "Adjust" with the stats made the one choice an athlete actually
            wants to make the hardest to find. Everything else in there is a
            detail; this is the question. */}
        <div className="mt-4">
          <span className="field-label">What are you doing?</span>
          <div className="grid grid-cols-3 gap-2">
            {DIET_GOALS.map((g) => (
              <button
                key={g.id}
                onClick={() => setGoal(g.id)}
                aria-pressed={goal === g.id}
                className={`rounded-2xl border p-3 text-left transition ${
                  goal === g.id
                    ? "border-pitch-400/60 bg-pitch-400/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20"
                }`}
              >
                <span className={`block text-sm font-bold ${goal === g.id ? "text-pitch-400" : "text-slate-200"}`}>
                  {g.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{g.blurb}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-pitch-400/25 bg-pitch-400/[0.05] p-4">
          {/* Four macro tiles across a 375px phone leaves ~80px each, which
              wraps "Protein" onto two lines and clips the numbers. */}
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <Metric label="kcal" value={targets.calories} accent />
            <Metric label="Protein" value={`${targets.protein}g`} />
            <Metric label="Carbs" value={`${targets.carbs}g`} />
            <Metric label="Fats" value={`${targets.fats}g`} />
          </div>
          <p className="mt-3 text-xs text-slate-400">{targets.rationale}</p>
        </div>

        {/* What it's working from, in one line. Someone whose weight is stale
            can see that at a glance rather than by opening a form to check. */}
        <p className="mt-3 text-xs text-slate-500">
          From {age} yrs · {heightCm}cm · {weightKg}kg · {activityLabel.toLowerCase()} training · {goalLabel.toLowerCase()}
          {patternLabel && patternLabel.toLowerCase() !== "anything" ? ` · ${patternLabel.toLowerCase()}` : ""}
          {prefs.avoid.length > 0 ? ` · avoiding ${prefs.avoid.length}` : ""}
        </p>

        {/* Say which of those numbers we made up. Every calorie on this screen,
            the macro split, the week and the shopping bill all come off these
            four, and a plan built on a default 75kg is wrong in a way nothing
            else on the page would reveal. */}
        {assumed.length > 0 ? (
          <button
            onClick={() => setAdjustOpen(true)}
            className="mt-2 w-full rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-left text-xs text-amber-200 transition hover:bg-amber-400/[0.1]"
          >
            We&apos;ve assumed your {listWords(assumed)} — everything here is built on{" "}
            {assumed.length > 1 ? "those" : "that"}. Set {assumed.length > 1 ? "them" : "it"} →
          </button>
        ) : (
          <button
            onClick={() => setAdjustOpen((o) => !o)}
            className="mt-1 text-xs font-semibold text-slate-400 hover:text-pitch-400"
          >
            Change any of this →
          </button>
        )}

        {gaps.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-sm text-amber-200">
            Nothing left for {gaps.join(" or ").toLowerCase()} with those rules — we&apos;ll build the rest of the
            day and skip {gaps.length > 1 ? "those meals" : "that meal"}. Try lifting one restriction.
          </div>
        )}

        {shortBy != null && (
          <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-sm text-amber-200">
            This week averages about {shortBy.toLocaleString()} kcal a day under your{" "}
            {targets.calories.toLocaleString()} target — portions are capped so you don&apos;t get
            servings nobody could eat.
            {prefs.mealsPerDay < 5 ? (
              <>
                {" "}
                <button
                  onClick={() => { setPrefs((p) => ({ ...p, mealsPerDay: 5 })); setAdjustOpen(true); }}
                  className="font-semibold underline underline-offset-2 hover:text-amber-100"
                >
                  Spread it over 5 meals
                </button>{" "}
                and rebuild — that&apos;s how anyone eats this much anyway.
              </>
            ) : (
              " Add a shake or a second helping on top; at this size the recipe list is the limit."
            )}
          </div>
        )}

        <button onClick={generate} className="btn-primary mt-4">
          {week ? "Regenerate week" : "Build my week"}
        </button>
        {saved && <p className="mt-2 text-xs text-readiness-green">✓ Stats saved to your profile.</p>}
      </div>

      <details
        open={adjustOpen}
        onToggle={(e) => setAdjustOpen((e.currentTarget as HTMLDetailsElement).open)}
        className="group card overflow-hidden"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-semibold text-slate-200">
          <span>
            Adjust
            <span className="ml-2 text-xs font-normal text-slate-500">
              your stats, how you eat, anything to avoid
            </span>
          </span>
          <span className="text-xs text-slate-500 transition group-open:rotate-180">▾</span>
        </summary>

        <div className="space-y-4 border-t border-white/[0.08] p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Age" value={age} onChange={(v) => { touch("age"); setAge(v); }} suffix="yrs" />
          <Field label="Height" value={heightCm} onChange={(v) => { touch("height"); setHeightCm(v); }} suffix="cm" />
          <Field label="Weight" value={weightKg} onChange={(v) => { touch("weight"); setWeightKg(v); }} suffix="kg" />
          <label className="block">
            <span className="field-label">Sex</span>
            <select value={sex} onChange={(e) => { touch("sex"); setSex(e.target.value as Sex); }} className="field [color-scheme:dark]">
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
          <span className="field-label">How you eat</span>
          <div className="flex flex-wrap gap-2">
            {DIET_PATTERNS.map((d) => (
              <button
                key={d.id}
                onClick={() => setPrefs((p) => ({ ...p, pattern: d.id }))}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  prefs.pattern === d.id
                    ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-400"
                    : "border-white/10 bg-white/[0.03] text-slate-300"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="field-label">Anything to avoid</span>
          <div className="flex flex-wrap gap-2">
            {AVOIDANCES.map((a) => {
              const on = prefs.avoid.includes(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => setPrefs((p) => ({
                    ...p,
                    avoid: p.avoid.includes(a.id)
                      ? p.avoid.filter((x) => x !== a.id)
                      : [...p.avoid, a.id],
                  }))}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    on ? "border-readiness-red/50 bg-readiness-red/10 text-readiness-red"
                       : "border-white/10 bg-white/[0.03] text-slate-300"
                  }`}
                >
                  {on ? "✕ " : ""}{a.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="field-label">Meals a day</span>
            <select
              value={prefs.mealsPerDay}
              onChange={(e) => setPrefs((p) => ({ ...p, mealsPerDay: Number(e.target.value) as 3 | 4 | 5 }))}
              className="field [color-scheme:dark]"
            >
              <option value={3}>3 — no snacks</option>
              <option value={4}>4 — one snack</option>
              <option value={5}>5 — two snacks</option>
            </select>
          </label>
          <label className="flex items-end gap-2 pb-3">
            <input
              type="checkbox"
              checked={prefs.budget}
              onChange={(e) => setPrefs((p) => ({ ...p, budget: e.target.checked }))}
              className="h-5 w-5 accent-pitch-500"
            />
            <span className="text-sm text-slate-300">Keep it cheap</span>
          </label>
        </div>

        <label className="block">
          <span className="field-label">Notes — anything else?</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. I train Monday, Wednesday and Friday, I don't like yoghurt, no fish, I eat out on Tuesdays"
            className="field resize-none"
          />
          {noteDislikes.length > 0 && (
            <p className="mt-1 text-xs text-pitch-400">
              Leaving out: {noteDislikes.map((id) => FOOD_LOOKUP[id]?.name ?? id).join(", ")}.
            </p>
          )}
          {/* Echo the schedule back as it's typed, so a note that wasn't
              understood is obvious before the week is built. */}
          {schedule.summary.map((s) => (
            <p key={s} className="mt-1 text-xs text-pitch-400">{s}</p>
          ))}
        </label>

        </div>
      </details>

      {week && (
        <>
          <div className="card overflow-hidden">
            {/* The day strip carries each day's calories. It was seven identical
                three-letter pills, so the only way to find the big day before
                a match was to tap through all seven. */}
            <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-white/[0.08] p-4">
              {week.map((d, i) => {
                const on = i === openDay;
                return (
                  <button
                    key={d.day}
                    onClick={() => setOpenDay(i)}
                    aria-pressed={on}
                    className={`shrink-0 rounded-2xl border px-3.5 py-2 text-center transition ${
                      on
                        ? "border-pitch-400/50 bg-pitch-400/10"
                        : "border-white/10 bg-white/[0.02] hover:border-white/20"
                    }`}
                  >
                    <span className={`block text-sm font-bold ${on ? "text-pitch-400" : "text-slate-300"}`}>
                      {d.day.slice(0, 3)}
                    </span>
                    <span className={`block text-[11px] tabular-nums ${on ? "text-pitch-400/70" : "text-slate-600"}`}>
                      {Math.round(d.macros.kcal)}
                    </span>
                    {d.load !== "even" && (
                      <span className="block text-[10px] leading-none" aria-label={d.load === "training" ? "Training day" : "Rest day"}>
                        {d.load === "training" ? "🔥" : "🌙"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="p-5">

            {Object.keys(swaps).length > 0 && (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-pitch-400/20 bg-pitch-400/[0.05] px-3 py-2">
                <span className="text-xs text-slate-300">
                  {Object.keys(swaps).length} meal{Object.keys(swaps).length === 1 ? "" : "s"} swapped this week
                </span>
                {/* An undo, not a regenerate. Regenerating rerolls all 28 meals
                    and is a much bigger thing to do by accident. */}
                <button onClick={clearSwaps} className="tap-target shrink-0 px-2 text-xs font-semibold text-slate-400 hover:text-pitch-400">
                  Undo all
                </button>
              </div>
            )}
            <div className="space-y-3">
              {/* Meals we're deliberately not planning. Shown rather than
                  silently missing, so the day doesn't just look incomplete. */}
              {week[openDay].skipped.map((s) => (
                <div key={s.slot} className="rounded-xl border border-dashed border-white/15 bg-white/[0.01] p-3">
                  <span className="block text-[11px] uppercase tracking-wide text-slate-500">{s.slot}</span>
                  <span className="block text-sm font-semibold text-slate-400">{s.reason} — nothing to cook or buy</span>
                </div>
              ))}
              {week[openDay].meals.map((pm, mi) => {
                // Which occurrence of this slot today — a 5-meal day has two
                // snacks, and they must swap independently.
                const nth = week[openDay].meals.slice(0, mi).filter((x) => x.meal.slot === pm.meal.slot).length;
                const swapped = !!swaps[swapKey(openDay, pm.meal.slot, nth)];
                return (
                <details key={`${pm.meal.slot}-${nth}-${pm.meal.id}`} className="group/meal rounded-2xl border border-white/[0.08] bg-white/[0.02] transition open:bg-white/[0.04]">
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
                        {pm.meal.slot}
                        {/* Says the plan is theirs now. Without it a swapped
                            meal is indistinguishable from one the app chose,
                            and "did that save?" is the first thing anyone
                            wonders after changing something. */}
                        {swapped && <span className="rounded bg-pitch-400/15 px-1 text-[10px] font-bold normal-case text-pitch-400">your pick</span>}
                        {/* A marker, not a control. The row is already one tap
                            target that opens the recipe, and a second one on it
                            makes a one-handed tap a gamble — the same reason the
                            swap button lives inside the card. This just lets you
                            see which dishes are starred while scanning the week. */}
                        {starred.includes(pm.meal.id) && (
                          <span className="text-amber-400" title="Starred — the planner picks this more often" aria-label="Starred">★</span>
                        )}
                      </span>
                      <span className="block text-sm font-bold text-slate-100">{pm.meal.name}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-bold tabular-nums text-slate-300">{Math.round(pm.macros.kcal)}</span>
                      {/* slate-500, not 600. At 10px the 600 measured 4.37:1
                          against this card — under the 4.5 AA floor for small
                          text. Invisible to the UI audit, which never opens a
                          meal row, and it is the unit label on the only number
                          in the row. */}
                      <span className="block text-[10px] uppercase tracking-wide text-slate-500">kcal</span>
                    </span>
                    {/* There was no affordance at all — a summary with no marker
                        and no chevron, so nothing said these opened. */}
                    <span className="shrink-0 text-xs text-slate-600 transition group-open/meal:rotate-180">▾</span>
                  </summary>

                  <div className="border-t border-white/[0.06] p-3.5">
                    <Recipe meal={pm.meal} scale={pm.scale} macros={pm.macros} />
                    {/* Inside the open card, not on the closed row. The row is
                        already a tap target that opens the recipe, and a second
                        control on it would make a one-handed tap a gamble
                        between reading and replacing. Someone swapping has
                        looked at the meal first. */}
                    <div className="mt-4 flex gap-2">
                      {/* The two answers to "what do I think of this meal",
                          side by side: more of it, or not this one. */}
                      <button
                        onClick={() => toggleStar(pm.meal.id)}
                        aria-pressed={starred.includes(pm.meal.id)}
                        className="chip-option chip-option-sm flex-1 justify-center"
                      >
                        <span aria-hidden className={starred.includes(pm.meal.id) ? "text-amber-400" : ""}>
                          {starred.includes(pm.meal.id) ? "★" : "☆"}
                        </span>
                        {starred.includes(pm.meal.id) ? "Starred" : "Star this"}
                      </button>
                      <button
                        onClick={() => setSwapping({
                          dayIndex: openDay,
                          dayName: week[openDay].day,
                          slot: pm.meal.slot,
                          nth,
                          current: pm.meal,
                          slotKcal: slotTargetKcal(targets, effectivePrefs, pm.meal.slot),
                        })}
                        className="chip-option chip-option-sm flex-1 justify-center"
                      >
                        <span aria-hidden>⇄</span> Swap this
                      </button>
                    </div>
                    {starred.includes(pm.meal.id) && (
                      <p className="mt-2 text-center text-[11px] text-slate-500">
                        Starred dishes come round more often from your next plan on.
                      </p>
                    )}
                  </div>
                </details>
                );
              })}
            </div>

            {/* A day carrying 600 calories more than yesterday reads as a bug
                unless the plan says why. Only shown when the athlete has
                actually told us which days they train — otherwise every day is
                the same size and there is nothing to explain. */}
            {week[openDay].load !== "even" && (
              <p className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                <span aria-hidden>{week[openDay].load === "training" ? "🔥" : "🌙"}</span>
                {week[openDay].load === "training"
                  ? `Training day — fed ${Math.round(week[openDay].targetKcal - targets.calories)} kcal above your weekly average, mostly as carbs.`
                  : `Rest day — ${Math.round(targets.calories - week[openDay].targetKcal)} kcal below your weekly average. Protein stays the same.`}
              </p>
            )}

            {/* The day's total against the target, as two bars rather than a
                sentence with the target in brackets. Whether a day lands is the
                question the whole screen exists to answer. */}
            <div className="mt-4 space-y-2.5 rounded-2xl bg-white/[0.03] p-3.5">
              <DayBar label="Calories" value={week[openDay].macros.kcal} target={week[openDay].targetKcal || targets.calories} colour="#e3b53f" unit="" />
              <DayBar label="Protein" value={week[openDay].macros.protein} target={targets.protein} colour="#38bdf8" unit="g" />
            </div>

            {/* Plant-based days in particular tend to land on calories but fall
                short on protein. Saying so beats quietly missing the target. */}
            {week[openDay].macros.protein < targets.protein * 0.85 && (
              <div className="mt-2 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-sm text-amber-200">
                This day is about {Math.round(targets.protein - week[openDay].macros.protein)}g short on protein.
                Add a shake or an extra portion of your main protein — hitting calories but missing protein is the
                one thing that will hold your results back.
              </div>
            )}
            </div>
          </div>

          {list && <ShoppingList list={list} seed={seed} />}
        </>
      )}

      {/* Last in the tree so it stacks above the plan, and mounted only when
          asked for — a dialog kept mounted and hidden still traps focus in
          some browsers. */}
      {swapping && (
        <MealSwap
          starred={starred}
          target={swapping}
          prefs={effectivePrefs}
          onPick={applySwap}
          onClose={() => setSwapping(null)}
        />
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

/** ["height","age","sex"] -> "height, age and sex" */
function listWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** One day's total against its target, as a bar you can read without arithmetic. */
function DayBar({ label, value, target, colour, unit }: {
  label: string; value: number; target: number; colour: string; unit: string;
}) {
  const v = Math.round(value);
  // Capped at the full width — a bar overflowing its track reads as broken, and
  // the number beside it already says how far over the day went.
  const pct = target > 0 ? Math.min(100, (v / target) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="tabular-nums text-slate-300">
          <span className="font-bold">{v.toLocaleString()}{unit}</span>
          {/* Same reason: 4.49:1 at 12px, a hair under AA, and it is the half
              of "2,340 / 3,100" that says what you are aiming at. */}
          <span className="text-slate-500"> / {target.toLocaleString()}{unit}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: colour }} />
      </div>
    </div>
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
