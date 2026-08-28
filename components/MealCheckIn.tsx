"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { invokeAI, estimateFood, backendCapabilities } from "@/lib/api";
import { useJobs } from "@/lib/jobs";
import {
  planTargets, planWithinBudget, mealMacros, effectiveMealPrefs, DEFAULT_PREFS, mergePrefs,
  type BodyStats, type MealPrefs, type PlannedMeal,
} from "@/lib/meal-plan";
import { parseSchedule } from "@/lib/meal-schedule";
import { todayLocal } from "@/lib/day";
import { Recipe } from "@/components/Recipe";
import { NumberInput } from "@/components/NumberInput";
import { Portal } from "@/components/Portal";
import {
  estimateMeal, fromAiItems, roundMacros, fitDimensions, scaleItem, totalOf,
  PHOTO_MAX_EDGE, PHOTO_QUALITY, type FoodEstimate, type EstimatedItem,
} from "@/lib/food-estimate";
import type { Macros, MealSwaps } from "@/lib/meal-plan";
import type { TargetContext } from "@/lib/nutrition";
import type { StoreId } from "@/lib/food-db";

interface Props {
  /**
   * Which supermarket prices are quoted in — from the profile.
   *
   * Needed here only because a stated budget changes which meals the planner
   * picks, and store prices differ by a flat index per shop. Without it this
   * screen would rebuild a different week from the same seed.
   */
  store?: StoreId | null;
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
  /**
   * The other two things the plan is rebuilt from.
   *
   * Same bug as the seed above, one layer along. This component reproduced the
   * week from the seed ALONE, so a dinner the athlete had swapped by hand on
   * the Meal plan tab still showed the meal it replaced here — and once the
   * planner started varying week on week, the whole day would have drifted.
   * `buildWeek` is only pure with respect to all of its inputs; passing three
   * of five and calling it reproducible is how this went wrong the first time.
   */
  swaps: MealSwaps;
  recent: string[];
  /**
   * Dishes they starred — the last input this component was missing.
   *
   * A star is worth a £30 bonus in the planner and exempts a dish from the
   * had-it-last-week rule, so leaving it out did not nudge the week, it
   * rebuilt a different one. The Meal plan tab and this list showed different
   * food for the same day the moment anybody starred anything.
   */
  starred: string[];
  /** The same sport goal and logged-training figures the daily card used. */
  context: TargetContext;
  /** Whose ticks these are — see tickKey. */
  userId: string;
  /**
   * Log something eaten. Carries a LABEL and, for a planned meal, a ref.
   *
   * It used to pass bare macros, which is why nothing could be edited later:
   * the day was a running total with no record of what went into it. Un-ticking
   * had to post the same numbers back as negatives — arithmetic standing in for
   * a delete, and wrong the moment a rounded macro did not cancel exactly.
   */
  onAdd: (e: { label: string; macros: Macros; source: "plan" | "estimate"; ref?: string }) => void;
  /** Un-tick: drop the entry this planned meal created. */
  onRemoveRef: (ref: string) => void;
}

const DAY_INDEX = () => (new Date().getDay() + 6) % 7; // JS weeks start Sunday; ours start Monday

/**
 * Read a camera file, scale its longest edge to PHOTO_MAX_EDGE and re-encode as
 * JPEG. Returns a data: URL.
 *
 * createImageBitmap rather than an <img> with an object URL: it decodes off the
 * main thread, so a 12-megapixel photo doesn't freeze the page mid-tap, and it
 * honours EXIF orientation so a portrait shot doesn't arrive on its side.
 * The sizing maths is in lib/food-estimate.ts, where it can be tested without a
 * DOM.
 */
async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width, height } = fitDimensions(bitmap.width, bitmap.height, PHOTO_MAX_EDGE);
    if (!width || !height) throw new Error("That file didn't look like a photo.");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser wouldn't let us read that photo.");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", PHOTO_QUALITY);
  } finally {
    // Frees the decoded pixels immediately rather than at the next GC. These
    // are tens of megabytes on a phone that may not have them spare.
    bitmap.close();
  }
}

/**
 * Three ways to log what you actually ate:
 *   1. Tick meals off today's plan — exact, since every gram is known.
 *   2. Photograph the plate — estimated by a vision model. Best at portions,
 *      which is the part a typed sentence is worst at.
 *   3. Describe it — estimated, via the AI endpoint with an on-device fallback.
 *
 * All three feed the same daily totals, which the tracker above then saves.
 */
export function MealCheckIn({ stats, prefs, dietNotes, seed, swaps, recent, starred, context, onAdd, onRemoveRef, userId, store }: Props) {
  /**
   * WHICH MEALS ARE TICKED, KEPT ACROSS NAVIGATION.
   *
   * This was plain component state, so leaving the tab and coming back cleared
   * every tick. On its own that was merely annoying. Once the day's calories
   * started persisting on tap it became actively wrong: the ring showed the
   * food while the list showed nothing ticked, and ticking a meal again added
   * it a SECOND time. The two have to survive together or not at all.
   *
   * localStorage keyed by athlete and day, matching how the shopping list keeps
   * its ticks. Not a database column: this is a per-device checklist for one
   * day, the calories it produces are already in `nutrition_logs`, and a
   * migration to sync a set of checkboxes across devices is not worth it. The
   * key includes the date, so tomorrow starts clean without anything to expire.
   */
  const tickKey = `pa:meals-ticked:${userId}:${todayLocal()}`;
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [ticksLoaded, setTicksLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(tickKey);
      if (raw) setTicked(new Set(JSON.parse(raw) as string[]));
    } catch { /* private mode, or someone edited it — start empty */ }
    setTicksLoaded(true);
  }, [tickKey]);

  useEffect(() => {
    // Not before the read above has run, or the first render writes an empty
    // set over the ticks it is about to load.
    if (!ticksLoaded) return;
    try { localStorage.setItem(tickKey, JSON.stringify([...ticked])); } catch { /* ignore */ }
  }, [ticked, tickKey, ticksLoaded]);
  const [text, setText] = useState("");
  const [estimate, setEstimate] = useState<FoodEstimate | null>(null);
  const [source, setSource] = useState<"local" | "ai">("local");
  /** Why the AI estimate didn't happen. Null when it did, or wasn't asked for. */
  const [aiError, setAiError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  /** The downscaled data: URL being shown back to them. Null = no photo. */
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /**
   * A SECOND INPUT, BECAUSE `capture` IS NOT A HINT.
   *
   * One input with capture="environment" does not offer the camera FIRST — it
   * removes the photo library from the sheet entirely. So anybody who had
   * already photographed their lunch, or who wanted a picture of a menu or a
   * packet, had no way to use it: the only route the app offered was to
   * photograph the food again, which by then is eaten.
   *
   * Two explicit buttons rather than dropping `capture` and letting the OS ask.
   * Snapping the plate in front of you is the common case and deserves to stay
   * one tap; the library is a second, obvious button rather than an extra sheet
   * in front of the common case every time.
   */
  const libraryRef = useRef<HTMLInputElement>(null);
  /**
   * Whether the backend can actually read a photo.
   *
   * `null` until the probe answers, and the camera stays fully offered in that
   * window — a capability check that briefly hides a working feature is a worse
   * bug than the one it fixes.
   */
  const [visionOk, setVisionOk] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    backendCapabilities().then((c) => { if (live) setVisionOk(c.vision); });
    return () => { live = false; };
  }, []);

  /**
   * Estimating runs above the router so it outlives this component.
   *
   * A vision call on a gym's signal is ten to twenty seconds. Held in local
   * state it died the moment you switched tabs, so logging a sandwich meant
   * standing still watching a spinner. The tray reports it either way now.
   */
  const { start: startJob, latest } = useJobs();
  const job = latest("meal-estimate");
  const busy = job?.status === "running";
  /** So a finished job is applied once, not on every re-render. */
  const applied = useRef<string | null>(null);

  useEffect(() => {
    if (!job || job.status === "running" || applied.current === job.id) return;
    applied.current = job.id;
    if (job.status === "done") {
      setEstimate(job.result as FoodEstimate);
      setSource("ai");
      return;
    }
    // A photo has no on-device fallback — nothing in a browser can look at a
    // picture and name the food — so it says so plainly. Typed text does have
    // one, and falls back to it while naming why the AI answer didn't arrive.
    if (photo) {
      /**
       * "Try a clearer shot" is only fair advice if a clearer shot could help.
       *
       * When the backend has no vision model, no photo works — and telling
       * someone to retake it sends them round a loop that cannot end. The probe
       * knows which situation this is, so the message can too.
       *
       * Whether it has one CHANGES: production ran text-only for a while and
       * later gained two vision models, with no deploy on this side. That is
       * why this is a live probe and not a constant.
       */
      setPhotoError(
        visionOk === false
          ? "The server can't read meal photos at the moment — describe the meal below instead and it'll work."
          : `${job.error ?? "That didn't work."} — try a clearer shot, or describe the meal below.`
      );
    } else {
      setEstimate(estimateMeal(text));
      setSource("local");
      setAiError(job.error ?? "The AI estimate didn't come back.");
    }
  }, [job, photo, text, visionOk]);

  /**
   * Today's row of THEIR plan — same seed, same targets, same preferences as the
   * Meal plan tab, so the two agree.
   *
   * buildWeek is pure, so given the stored seed it reproduces the exact week they
   * generated. That's the whole mechanism: the plan isn't stored meal by meal,
   * it's stored as one number and rebuilt. Which is fine, and was being fed the
   * wrong number here.
   *
   * Targets used to stay on a SECOND, simpler calculation here, deliberately,
   * because that was what MealPlanner fed buildWeek — so at least the plan and
   * the tick-list agreed with each other while both disagreed with the number
   * on the card above them. planTargets is now a thin adapter over the same
   * nutritionTargets the card uses, and `context` carries the sport goal and
   * logged training the card was computed from, so all three agree by
   * construction. The fallback defaults below stay identical to MealPlanner's.
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
    // planWithinBudget, not buildWeek: a stated budget makes the planner lean
    // harder on price, so a screen that called the plain builder would show a
    // different Tuesday from the one on the Meal plan tab — the same seed, two
    // sets of dinners. Priced by store only, for the same reason there.
    const week = planWithinBudget(
      planTargets(body, context), seed,
      // The SAME derivation MealPlanner uses, not a re-implementation of it.
      effectiveMealPrefs(mergePrefs(DEFAULT_PREFS, prefs), dietNotes, starred),
      parseSchedule(dietNotes), swaps, recent, { store: store ?? undefined },
    ).days;
    return week[DAY_INDEX()]?.meals ?? [];
  }, [stats, prefs, dietNotes, seed, swaps, recent, starred, context, store]);

  /**
   * The meal whose recipe is open, if any.
   *
   * A sheet rather than the Meal plan tab's inline `<details>`: this list is a
   * tick-list you work down, and expanding a row in place shoves the rest of it
   * under your thumb mid-tap.
   */
  const [recipe, setRecipe] = useState<PlannedMeal | null>(null);
  useEffect(() => {
    if (!recipe) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setRecipe(null);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [recipe]);

  // Instant on-device preview as they type; the AI call refines it on request.
  const preview = useMemo(() => estimateMeal(text), [text]);
  const shown = estimate ?? (text.trim().length > 2 ? preview : null);

  /**
   * Shrink the photo before it leaves the phone, then estimate from it.
   *
   * The downscale is not a nicety — it is most of why this feels quick. A
   * modern camera hands us 3–5MB at 4000px across; on a gym's signal the
   * upload alone is the bulk of the wait, and image tokens are charged by area
   * so the full-resolution version costs several times as much to read a plate
   * no better. 768px JPEG is typically 60–90KB.
   *
   * There is no on-device fallback here, unlike the text path: nothing in the
   * browser can look at a picture and name the food. So a failure says so
   * plainly and leaves the typing box, rather than silently showing a guess
   * that had nothing to do with the photo.
   */
  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Both, so the same file re-triggers whichever route it came from.
    if (fileRef.current) fileRef.current.value = "";
    if (libraryRef.current) libraryRef.current.value = "";
    if (!file) return;

    setPhotoError(null);
    setAiError(null);

    // Shrink FIRST, on the main thread, so the preview appears immediately and
    // the job carries a payload that is already small.
    let dataUrl: string;
    try {
      dataUrl = await shrinkImage(file);
      setPhoto(dataUrl);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : String(err));
      return;
    }

    /**
     * The estimate itself runs as a BACKGROUND JOB.
     *
     * A vision call on a gym's signal is ten to twenty seconds, and it used to
     * live in this component's state — so switching to the Meal plan tab, or
     * anywhere else, unmounted the component and threw the work away. You had
     * to stand still and watch a spinner to log a sandwich.
     *
     * useJobs runs it above the router, so it survives navigation and the tray
     * says when it lands. Same mechanism the program builder uses.
     */
    startJob("meal-estimate", "Working out your meal", async () => {
      // estimateFood, not invokeAI: it picks whichever backend can actually
      // see, which is not a fixed answer. The Worker went from a text-only
      // chain to carrying two vision models without this app changing, so the
      // routing asks rather than assumes.
      const res = await estimateFood<{ items?: Parameters<typeof fromAiItems>[0] }>({
        image: dataUrl,
        // Anything already typed is context, not a separate meal — "with olive
        // oil" is exactly the sort of thing a photo can't show.
        text: text.trim() || undefined,
      });
      const parsed = fromAiItems(res?.items ?? []);
      if (parsed.items.length === 0) throw new Error("I couldn't identify any food in that photo.");
      return parsed;
    });
  }

  function clearPhoto() {
    setPhoto(null);
    setPhotoError(null);
    setEstimate(null);
  }

  function toggle(pm: PlannedMeal) {
    const key = pm.meal.id;
    const next = new Set(ticked);
    const macros = roundMacros(mealMacros(pm.meal, pm.scale));
    if (next.has(key)) {
      next.delete(key);
      // Removes the entry rather than posting negative macros over the top of
      // the total. Subtraction only cancelled exactly while nothing rounded.
      onRemoveRef(key);
    } else {
      next.add(key);
      onAdd({ label: pm.meal.name, macros, source: "plan", ref: key });
    }
    setTicked(next);
  }

  // Success and the fall back to the local guess are both handled where the job
  // lands, so both paths behave the same whether or not you stayed on the page.
  function askAi() {
    if (text.trim().length < 3) return;
    setAiError(null);
    startJob("meal-estimate", "Working out your meal", async () => {
      const res = await invokeAI<{ items?: Parameters<typeof fromAiItems>[0] }>("estimate-food", { text: text.trim() });
      const parsed = fromAiItems(res?.items ?? []);
      // An AI answer with nothing usable in it is worse than the local guess.
      if (parsed.items.length === 0) throw new Error("The AI didn't recognise any food in that.");
      return parsed;
    });
  }

  /**
   * Edit one row of the estimate.
   *
   * Writes into `estimate` even when what's on screen came from the on-device
   * preview, because the preview is derived from `text` and would be recomputed
   * — throwing the correction away the moment they touched anything else.
   * Promoting it to a held estimate is what makes the edit stick.
   */
  function reviseItems(next: EstimatedItem[]) {
    setEstimate({ items: next, total: totalOf(next), unmatched: shown?.unmatched ?? [] });
  }

  /**
   * WHY THE QUANTITY FIELD NEEDS A DRAFT, AND WHY 0 IS REFUSED.
   *
   * It was `value={it.qty}` with `Number(e.target.value)`. Two faults, and the
   * second is caused by the first:
   *
   *   1. Clearing the box gave `Number("") === 0`, which re-rendered the field
   *      as "0" instantly. You could never empty it to type a new number — the
   *      zero came straight back and you ended up typing around it.
   *
   *   2. That 0 reached scaleItem, which scales RELATIVE to the current qty. It
   *      multiplied every macro by zero and destroyed the reference the next
   *      edit scales from, so typing 150 afterwards gave 150 x 0 = 0. The item
   *      was stuck at zero calories with no way back. That is the "it breaks".
   *
   * So the text being typed is held as a string — "" is a legal thing to be
   * part-way through — and only a positive number is ever committed. Emptying
   * the box and clicking away restores the previous quantity rather than
   * zeroing the item; removing an item is what the ✕ is for.
   */
  const [qtyDraft, setQtyDraft] = useState<Record<number, string>>({});

  function editQty(index: number, raw: string) {
    setQtyDraft((d) => ({ ...d, [index]: raw }));
    const n = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(n) && n > 0) setQty(index, n);
  }

  /** Blur with nothing usable in the box puts the old number back. */
  function commitQty(index: number, fallback: number) {
    setQtyDraft((d) => {
      const raw = d[index];
      const n = Number(raw);
      if (raw !== undefined && (raw.trim() === "" || !Number.isFinite(n) || n <= 0)) {
        setQty(index, fallback);
      }
      const next = { ...d };
      delete next[index];
      return next;
    });
  }

  function setQty(index: number, qty: number) {
    if (!shown) return;
    // Second line of defence. scaleItem works from the item's CURRENT quantity,
    // so a zero here is not "no food" — it permanently wipes the macros that
    // every later edit is scaled from. Callers are careful; this makes it
    // impossible rather than merely unlikely.
    if (!Number.isFinite(qty) || qty <= 0) return;
    reviseItems(shown.items.map((it, i) => (i === index ? scaleItem(it, qty) : it)));
  }

  function removeItem(index: number) {
    if (!shown) return;
    reviseItems(shown.items.filter((_, i) => i !== index));
  }

  /**
   * OVERRIDE ONE MACRO OUTRIGHT.
   *
   * The quantity field is the better primitive — say it was 90g of rice and
   * every macro follows correctly — and it cannot express "the model got the
   * protein wrong". Somebody reading a label knows their shake is 25g of
   * protein whatever the estimator thinks, and until now the only way to say so
   * was to bin the estimate and type four numbers by hand.
   *
   * Held beside the items rather than folded into them: an override is a fact
   * about the MEAL, and pushing it back into one arbitrary item would then be
   * rescaled the next time that item's quantity changed.
   */
  const [override, setOverride] = useState<Partial<Macros>>({});
  const [overrideOpen, setOverrideOpen] = useState(false);

  /** What will actually be logged: the estimate, with any override on top. */
  const finalMacros: Macros | null = shown
    ? { ...shown.total, ...Object.fromEntries(Object.entries(override).filter(([, v]) => v != null)) } as Macros
    : null;

  function addEstimate() {
    if (!shown || shown.items.length === 0) return;
    // shown.total, not a fresh sum: the two are kept equal by reviseItems, and
    // adding a number the athlete never saw is how a tracker loses trust.
    const macros = finalMacros ?? shown.total;
    onAdd({
      // Name it after what was actually estimated, so the row in Today's food
      // says "Chicken, rice, broccoli" rather than an anonymous calorie figure.
      label: shown.items.map((i) => i.name).slice(0, 3).join(", ") || "Logged food",
      macros,
      source: "estimate",
    });
    setAdded(`Added ${macros.kcal} kcal`);
    setText("");
    setEstimate(null);
    setOverride({});
    setOverrideOpen(false);
    setPhoto(null);
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
                  {/* TWO ACTIONS, TWO TARGETS.
                      The whole row used to be one button that ticked the meal
                      off, so there was no way to read the recipe from here at
                      all — you had to remember the dish, leave, and find it
                      again on the Meal plan tab. Ticking is the frequent action
                      so it keeps the big target; the name opens the recipe. */}
                  <div
                    className={`flex w-full items-center gap-1 rounded-xl border transition ${
                      on ? "border-pitch-400/40 bg-pitch-400/[0.07]" : "border-white/10 bg-white/[0.02]"
                    }`}
                  >
                    <button
                      onClick={() => toggle(pm)}
                      aria-pressed={on}
                      aria-label={`${on ? "Un-tick" : "Tick off"} ${pm.meal.name}`}
                      className="tap-target grid shrink-0 place-items-center pl-3 pr-1"
                    >
                      <span className={`grid h-5 w-5 place-items-center rounded-md border text-[11px] ${on ? "border-pitch-400 bg-pitch-400 text-ink-900" : "border-white/25 text-transparent"}`}>✓</span>
                    </button>

                    <button
                      onClick={() => setRecipe(pm)}
                      className="tap-target flex min-w-0 flex-1 items-center gap-3 py-2 pr-3 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] uppercase tracking-wide text-slate-500">{pm.meal.slot}</span>
                        <span className="block truncate text-sm font-semibold text-slate-100">{pm.meal.name}</span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-400">{m.kcal} kcal</span>
                      {/* Says the name is tappable. Without it the second target
                          is invisible and nobody finds the recipe. */}
                      <span className="shrink-0 text-slate-600" aria-hidden>›</span>
                      <span className="sr-only">View recipe</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 2. A photo of the plate.
          Faster than typing and better at portions than a sentence is — "rice"
          could be 60g or 200g, and a picture of it isn't ambiguous in the same
          way. Offered ABOVE the text box because on a phone it's one tap to the
          camera, and the typing is the fallback rather than the other way round. */}
      <div className="mb-4">
        {/* WHEN THE BACKEND CANNOT SEE, SAY SO — do not offer the camera.
            For a period production ran a text-only chain, so every photo went
            to something that could not look at it and the app answered "I
            couldn't identify any food in that photo" — blaming the photo for a
            server with no vision model, and inviting another one that also
            could not work.

            IT IS NOT A PERMANENT STATE. The Worker later gained two vision
            models and photos began working with no change on this side, which
            is exactly what this branch is built for: it reads the backend's
            actual capability every time rather than encoding a belief about
            it. Do not replace this with a constant. */}
        {visionOk === false ? (
          <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3">
            <p className="text-xs font-bold text-amber-300">Photos are off right now</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              The server isn&apos;t set up to read meal photos at the moment — no photo would
              work, so we&apos;re not going to waste your time. <b className="text-slate-200">Type
              what you ate below instead</b>; it reads &ldquo;chicken, rice and broccoli&rdquo;
              just as well.
            </p>
          </div>
        ) : (
        <>
        <span className="mb-2 block text-xs text-slate-500">Snap the plate, or pick one you already took</span>
        <div className="flex flex-wrap items-center gap-2">
          <label className="btn-ghost w-auto cursor-pointer px-4 py-2 text-sm">
            {busy ? "Reading the photo…" : "📷 Take a photo"}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              // Straight to the camera. Note this REMOVES the library from the
              // sheet rather than merely preferring the camera, which is why
              // there is a second input below rather than only this one.
              capture="environment"
              onChange={onPhoto}
              disabled={busy}
              className="hidden"
            />
          </label>
          <label className="btn-ghost w-auto cursor-pointer px-4 py-2 text-sm">
            🖼 From your photos
            <input
              ref={libraryRef}
              type="file"
              accept="image/*"
              // No `capture`, so this is the camera roll and Files — a lunch
              // photographed an hour ago, a menu, a packet.
              onChange={onPhoto}
              disabled={busy}
              className="hidden"
            />
          </label>
          {photo && !busy && (
            <button onClick={clearPhoto} className="chip text-slate-400 hover:text-slate-200">Remove</button>
          )}
        </div>

        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="Your meal" className="mt-3 max-h-48 rounded-2xl border border-white/10 object-cover" />
        )}
        {photoError && <p className="mt-2 text-xs text-amber-300">{photoError}</p>}
        </>
        )}
      </div>

      {/* 3. Free text */}
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
              {/* ALL FOUR. The estimator has returned protein, carbs and fat
                  since it was built — the prompt asks for them and the reader
                  checks them against the calorie figure — and this line showed
                  two of them, so as far as anybody using it was concerned the
                  AI only estimated calories. */}
              <span className="text-xs font-semibold text-slate-300">
                ~{finalMacros?.kcal ?? shown.total.kcal} kcal
                <span className="ml-2 font-normal text-slate-400">
                  P {finalMacros?.protein ?? shown.total.protein}g · C {finalMacros?.carbs ?? shown.total.carbs}g · F {finalMacros?.fats ?? shown.total.fats}g
                </span>
              </span>
              <span className="chip text-slate-400">{source === "ai" ? "AI estimate" : "On-device estimate"}</span>
              {aiError && (
                <span className="mt-1 block break-words text-[11px] text-amber-300">
                  AI estimate unavailable — {aiError} Showing the on-device guess instead.
                </span>
              )}
            </div>

            {/* EDITABLE, because the portion is the guess.
                Identifying the food is the part a model is good at; deciding
                whether that was 200g of rice or 90g is the part it isn't, and
                portions are most of the error in a calorie count. Accept-all
                or discard-all is the worst affordance for something the
                athlete can see is nearly right — so each row's quantity is a
                field, and anything misidentified can be dropped. */}
            <ul className="space-y-1.5 text-xs text-slate-400">
              {shown.items.map((it, i) => (
                <li key={`${it.name}-${i}`} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {it.name}
                    {!it.explicit && <span className="text-slate-600"> (assumed)</span>}
                  </span>
                  {/* See qtyDraft: the field has to be allowed to be EMPTY
                      while you retype it, and a quantity of 0 must never reach
                      scaleItem. */}
                  <input
                    type="number" inputMode="numeric" min={1}
                    value={qtyDraft[i] ?? String(it.qty)}
                    onChange={(e) => editQty(i, e.target.value)}
                    onBlur={() => commitQty(i, it.qty)}
                    aria-label={`${it.name} quantity`}
                    className="field w-16 shrink-0 px-2 py-1 text-center text-xs tabular-nums"
                  />
                  <span className="w-6 shrink-0 text-slate-600">{it.unit === "each" ? "×" : it.unit}</span>
                  <span className="w-12 shrink-0 text-right tabular-nums text-slate-300">{it.macros.kcal}</span>
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    aria-label={`Remove ${it.name}`}
                    className="tap-target shrink-0 px-1 text-slate-600 hover:text-readiness-red"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>

            {shown.unmatched.length > 0 && (
              <p className="mt-2 text-xs text-amber-300">
                Not recognised: {shown.unmatched.join(", ")} — try &ldquo;Estimate with AI&rdquo;, or add the calories by hand below.
              </p>
            )}

            {/* THE OVERRIDE. Folded away, because the quantity fields above are
                the right tool nine times in ten — correct the portion and every
                macro follows. This is for the tenth: a label in your hand that
                says 25g of protein, whatever the estimate thinks. */}
            <button
              type="button"
              onClick={() => setOverrideOpen((open) => !open)}
              className="tap-target mt-2 text-xs font-semibold text-slate-500 hover:text-sky-300"
            >
              {overrideOpen ? "Hide macros" : "Set the macros myself"}
            </button>
            {overrideOpen && (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {(["kcal", "protein", "carbs", "fats"] as const).map((key) => (
                  <label key={key} className="block">
                    <span className="field-label">{key === "kcal" ? "kcal" : key === "fats" ? "Fat" : key}</span>
                    <NumberInput
                      value={override[key] ?? null}
                      onChange={(next) => setOverride((o) => ({ ...o, [key]: next }))}
                      min={0} max={key === "kcal" ? 5000 : 500}
                      placeholder={String(shown.total[key])}
                      className="field px-2 py-1 text-center text-xs tabular-nums"
                      aria-label={`Override ${key}`}
                    />
                  </label>
                ))}
              </div>
            )}
            {overrideOpen && (
              <p className="mt-1 text-[10px] text-slate-500">
                Blank means &ldquo;use the estimate&rdquo;. Anything you type here is what gets logged.
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={addEstimate} disabled={shown.items.length === 0} className="btn-primary w-auto px-4 py-2 text-sm disabled:opacity-40">
                Add to today
              </button>
              {text.trim().length > 2 && (
                <button onClick={askAi} disabled={busy} className="btn-ghost w-auto px-4 py-2 text-sm">
                  {busy ? "Working it out…" : "Estimate with AI"}
                </button>
              )}
            </div>
          </div>
        )}

        {added && <p className="mt-2 text-sm text-pitch-400">{added} ✓ — remember to save below.</p>}
        <p className="mt-2 text-xs text-slate-500">
          Estimates, not measurements — portions vary. Adjust the numbers below if you know better.
        </p>
      </div>

      {recipe && (
        <Portal>
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={() => setRecipe(null)}
          >
            <div
              // pb-28 clears the floating mobile tab bar, which otherwise sits
              // on top of the last of the method steps.
              className="animate-scale-in max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-ink-800 p-6 pb-28 shadow-card sm:rounded-3xl sm:pb-6"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={recipe.meal.name}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <h3 className="text-lg font-extrabold text-slate-100">{recipe.meal.name}</h3>
                <button
                  onClick={() => setRecipe(null)}
                  className="tap-target shrink-0 text-slate-400 hover:text-slate-100"
                  aria-label="Close recipe"
                >
                  ✕
                </button>
              </div>
              <Recipe meal={recipe.meal} scale={recipe.scale} macros={recipe.macros} />
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
