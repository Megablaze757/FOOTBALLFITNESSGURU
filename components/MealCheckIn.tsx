"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { invokeAI, backendCapabilities } from "@/lib/api";
import { useJobs } from "@/lib/jobs";
import {
  planTargets, buildWeek, mealMacros, DEFAULT_PREFS,
  type BodyStats, type MealPrefs, type PlannedMeal,
} from "@/lib/meal-plan";
import { parseSchedule } from "@/lib/meal-schedule";
import {
  estimateMeal, fromAiItems, roundMacros, fitDimensions, scaleItem, totalOf,
  PHOTO_MAX_EDGE, PHOTO_QUALITY, type FoodEstimate, type EstimatedItem,
} from "@/lib/food-estimate";
import type { Macros } from "@/lib/meal-plan";
import type { TargetContext } from "@/lib/nutrition";

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
  /** The same sport goal and logged-training figures the daily card used. */
  context: TargetContext;
  /** Adds the eaten macros into the day's running totals. */
  onAdd: (m: Macros) => void;
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
export function MealCheckIn({ stats, prefs, dietNotes, seed, context, onAdd }: Props) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
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
    const week = buildWeek(planTargets(body, context), seed, { ...DEFAULT_PREFS, ...(prefs ?? {}) }, parseSchedule(dietNotes));
    return week[DAY_INDEX()]?.meals ?? [];
  }, [stats, prefs, dietNotes, seed, context]);

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
    if (fileRef.current) fileRef.current.value = ""; // so the same file re-triggers
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
      const res = await invokeAI<{ items?: Parameters<typeof fromAiItems>[0] }>("estimate-food", {
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
      onAdd({ kcal: -macros.kcal, protein: -macros.protein, carbs: -macros.carbs, fats: -macros.fats });
    } else {
      next.add(key);
      onAdd(macros);
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

  function setQty(index: number, qty: number) {
    if (!shown) return;
    reviseItems(shown.items.map((it, i) => (i === index ? scaleItem(it, qty) : it)));
  }

  function removeItem(index: number) {
    if (!shown) return;
    reviseItems(shown.items.filter((_, i) => i !== index));
  }

  function addEstimate() {
    if (!shown || shown.items.length === 0) return;
    // shown.total, not a fresh sum: the two are kept equal by reviseItems, and
    // adding a number the athlete never saw is how a tracker loses trust.
    onAdd(shown.total);
    setAdded(`Added ${shown.total.kcal} kcal`);
    setText("");
    setEstimate(null);
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

      {/* 2. A photo of the plate.
          Faster than typing and better at portions than a sentence is — "rice"
          could be 60g or 200g, and a picture of it isn't ambiguous in the same
          way. Offered ABOVE the text box because on a phone it's one tap to the
          camera, and the typing is the fallback rather than the other way round. */}
      <div className="mb-4">
        {/* WHEN THE BACKEND CANNOT SEE, SAY SO — do not offer the camera.
            Production has run a text-only model chain, so every photo was sent
            to something that could not look at it and the app answered "I
            couldn't identify any food in that photo". That blames the photo for
            a server with no vision model, and invites the athlete to take
            another one that also cannot work. Typing a meal in still works
            perfectly, so it says that and points at the box below. */}
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
        <span className="mb-2 block text-xs text-slate-500">Snap the plate and I&apos;ll work it out</span>
        <div className="flex flex-wrap items-center gap-2">
          <label className="btn-ghost w-auto cursor-pointer px-4 py-2 text-sm">
            {busy ? "Reading the photo…" : photo ? "Use a different photo" : "📷 Photo of your meal"}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              // Opens the camera directly on a phone rather than the photo
              // library — this is nearly always a meal in front of you.
              capture="environment"
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
                  <input
                    type="number" inputMode="numeric" min={0}
                    value={it.qty}
                    onChange={(e) => setQty(i, Number(e.target.value))}
                    aria-label={`${it.name} quantity`}
                    className="field w-16 shrink-0 px-2 py-1 text-center text-xs tabular-nums"
                  />
                  <span className="w-6 shrink-0 text-slate-600">{it.unit === "each" ? "×" : it.unit}</span>
                  <span className="w-12 shrink-0 text-right tabular-nums text-slate-300">{it.macros.kcal}</span>
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    aria-label={`Remove ${it.name}`}
                    className="shrink-0 px-1 text-slate-600 hover:text-readiness-red"
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
    </div>
  );
}
