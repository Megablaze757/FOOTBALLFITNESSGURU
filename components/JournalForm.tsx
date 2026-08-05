"use client";

import { invalidate } from "@/lib/use-async";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sportTerms } from "@/lib/sport-terms";
import { SPORTS, type SportId } from "@/lib/exercises";
import { assessReadiness } from "@/lib/readiness";
import { computeACWR } from "@/lib/load";
import { BodyMap } from "@/components/BodyMap";
import { AppleHealthPill } from "@/components/AppleHealthPill";
import { ReadinessGauge } from "@/components/ReadinessGauge";
import { TrainingLogInput, type TrainingState } from "@/components/TrainingLogInput";
import { enqueue, browserStore, queueCount } from "@/lib/offline-queue";
import { track } from "@/lib/funnel";
import { useCurrentUser } from "@/lib/auth";
import { saveDraft, loadDraft, clearDraft, draftAge, describeAge } from "@/lib/drafts";

/** What a half-finished check-in looks like on disk. */
interface DraftShape {
  painMap: PainMap;
  fatigue: number;
  sleep: number;
  nutrition: number;
  weight: string;
  isMatchDay: boolean;
  minutes: string;
  training: TrainingState;
}
import type { CheckInInput, PainMap, ReadinessResult, TrainingDrill, TrainingLog } from "@/lib/types";
import { daysAgoLocal, todayLocal } from "@/lib/day";

/**
 * Is this failure "no signal" rather than "the server said no"?
 *
 * Only connectivity failures are safe to queue and retry. A policy or
 * validation rejection would fail the same way on every replay, so queueing it
 * would replace a visible error with a sync that silently never completes.
 */
function isOffline(err: { message?: string; code?: string } | null): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("failed to fetch") || m.includes("networkerror") ||
         m.includes("network request failed") || m.includes("load failed");
}

export function JournalForm({ initial, initialTraining, sport, planned = [] }: { initial?: Partial<CheckInInput>; initialTraining?: TrainingState; sport?: string; planned?: TrainingDrill[] }) {
  // A basketball player being asked "Match today?" is the tell that a product
  // wasn't built for them. The column is still is_match_day — only the wording
  // changes, so no data migration is involved.
  const terms = sportTerms(sport);
  const router = useRouter();

  const [painMap, setPainMap] = useState<PainMap>(initial?.pain_map ?? {});
  const [fatigue, setFatigue] = useState(initial?.fatigue_score ?? 5);
  const [sleep, setSleep] = useState(initial?.sleep_quality ?? 7);
  const [nutrition, setNutrition] = useState(initial?.nutrition_quality ?? 6);
  const [weight, setWeight] = useState<string>(initial?.weight_kg?.toString() ?? "");
  const [isMatchDay, setIsMatchDay] = useState(initial?.is_match_day ?? false);
  const [minutes, setMinutes] = useState<string>(initial?.match_minutes_played?.toString() ?? "0");
  const [training, setTraining] = useState<TrainingState>(initialTraining ?? { drills: [], total_minutes: null, intensity: null });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReadinessResult | null>(null);
  const [queued, setQueued] = useState(false);
  const [restored, setRestored] = useState<string | null>(null);

  /**
   * QUICK vs FULL.
   *
   * The check-in was a body map, three sliders, a weight field, a match toggle
   * and a whole training log — a dozen interactions, every day, before the app
   * tells you anything. That is a fine ask of a full-time athlete with a sports
   * scientist. It is far too much for a 15-year-old or someone fitting training
   * around a job, and a daily habit that takes two minutes is a daily habit
   * that gets dropped by Wednesday.
   *
   * Quick asks the three things that actually move the readiness score — sleep,
   * how the body feels, and whether anything hurts — as taps, not sliders. It's
   * three touches and about ten seconds. The body map only appears if you say
   * something hurts, because most days nothing does.
   *
   * Nothing is lost: everything else stays one tap away, and someone who wants
   * to log every set still can.
   *
   * QUICK IS ALWAYS THE DEFAULT, AND THE CHOICE IS NOT REMEMBERED.
   *
   * It used to be: tapping the full-mode button wrote `pa:checkin-mode: "full"`
   * to localStorage, and every check-in after that opened in full — sliders
   * instead of tap scales, the body map open every morning. So one athlete
   * wanting to record a match day, once, silently converted their daily
   * ten-second habit into the dozen-interaction form quick mode exists to
   * replace. Nothing told them it had happened and the only way back was
   * spotting a small "Use the quick check-in" link.
   *
   * A per-day action is not a preference. "I need the match-day fields today"
   * says nothing about tomorrow, and the cost of guessing wrong is the thing
   * most likely to make someone stop checking in at all.
   *
   * Full is still one tap away, every day, for anyone who wants it — it just
   * has to be asked for each time. That is the right trade when one direction
   * costs a tap and the other costs the habit.
   *
   * RE-OPENING TODAY'S ENTRY DOES NOT FORCE FULL EITHER. It used to: `initial`
   * is populated whenever a check-in exists for today, so checking in once and
   * then glancing at the page again — the same day, the same entry — handed
   * back sliders and an open body map. The justification was "they came back
   * for a reason", which is a guess, and the common reason is looking at what
   * you already put in.
   *
   * Quick covers everything they are likely to change: sleep, how the body
   * feels, soreness, weight, training. Match day and the nutrition slider are
   * the only full-only fields, and wanting those is one tap. `sore` is seeded
   * from the saved pain map below, so an existing entry opens with its marks
   * visible rather than looking like nothing was ever recorded.
   */
  const [detailed, setDetailed] = useState(false);
  const [modeLoaded, setModeLoaded] = useState(false);
  useEffect(() => {
    setModeLoaded(true);

    // Clear the old preference so anyone already stuck in full mode is let out
    // on their next visit. Without this the key sits there forever, read by
    // nothing, and the athlete it trapped would never know why.
    try { localStorage.removeItem("pa:checkin-mode"); } catch { /* ignore */ }
  }, []);

  function chooseMode(full: boolean) {
    setDetailed(full);
  }

  // Only meaningful in quick mode, where the body map is hidden until asked for.
  //
  // Seeded from the saved entry: re-opening a check-in that recorded a sore
  // knee must show that knee. Starting at null would render "Anything hurting?"
  // unanswered over a pain map that has marks in it — the form contradicting
  // its own data.
  const [sore, setSore] = useState<boolean | null>(
    initial?.pain_map && Object.keys(initial.pain_map).length > 0 ? true : null
  );
  // Has the weight pill been opened? Separate from `weight` so an entry that
  // already has one opens expanded, and clearing the box doesn't snap it shut
  // under the cursor mid-edit.
  const [weighing, setWeighing] = useState(false);
  // Quick mode: is the training log open? Starts open when there is already
  // something logged, so a restored draft doesn't hide the drills in it.
  const [logTraining, setLogTraining] = useState(
    (initialTraining?.drills.length ?? 0) > 0 || initialTraining?.total_minutes != null
  );

  /**
   * Offline state, said BEFORE they fill the form in.
   *
   * Check-ins have always survived no signal — they queue on the device and
   * upload when it returns — and nothing anywhere said so. The reassurance only
   * appeared AFTER submitting, which is the one moment it isn't needed: by then
   * you've either seen it work or you haven't. Someone in a basement gym with no
   * bars reasonably assumes there's no point filling anything in, closes the app,
   * and the streak they were told not to worry about breaks anyway.
   *
   * A trust feature nobody knows about earns no trust.
   */
  const [offline, setOffline] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  useEffect(() => {
    const sync = () => {
      setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
      try { setQueuedCount(queueCount(browserStore())); } catch { /* no storage */ }
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const today = todayLocal();
  const userId = useCurrentUser().id;

  /**
   * Acute:chronic ratio, loaded up front so the result screen agrees with Home.
   *
   * The screen shown the instant you submit is where most people read their
   * readiness, and it was computed without load — so it could say "you're well
   * recovered, good day for a higher-intensity session" and then Home, a tap
   * later, would say Yellow because of a load spike. Same engine, same day, two
   * answers.
   *
   * Fetched on mount rather than at submit so the verdict is instant and an
   * offline submit still uses whatever we already had.
   */
  const [acwr, setAcwr] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const since = daysAgoLocal(28);
      const { data } = await createClient()
        .from("training_logs")
        .select("log_date, total_minutes, intensity, drills")
        .eq("user_id", userId)
        .gte("log_date", since);
      if (cancelled) return;
      setAcwr(computeACWR((data ?? []) as unknown as TrainingLog[]).ratio);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Restore anything unsaved from earlier. Only when the form is otherwise
  // untouched — `initial` means they already checked in today and are editing,
  // and a draft must never quietly overwrite what's actually stored.
  useEffect(() => {
    if (initial) return;
    const draft = loadDraft<DraftShape>("checkin", userId, today);
    if (!draft) return;
    setPainMap(draft.painMap ?? {});
    setFatigue(draft.fatigue ?? 5);
    setSleep(draft.sleep ?? 7);
    setNutrition(draft.nutrition ?? 6);
    setWeight(draft.weight ?? "");
    setIsMatchDay(draft.isMatchDay ?? false);
    setMinutes(draft.minutes ?? "0");
    if (draft.training) setTraining(draft.training);
    const age = draftAge("checkin", userId, today);
    setRestored(age === null ? "earlier" : describeAge(age));
  }, [initial, userId, today]);

  // Save as they go. Debounced because a slider drag fires continuously and
  // there's no reason to serialise the whole form on every pixel.
  useEffect(() => {
    if (result) return; // already submitted — nothing in progress to keep
    const t = setTimeout(() => {
      saveDraft<DraftShape>("checkin", userId, {
        painMap, fatigue, sleep, nutrition, weight, isMatchDay, minutes, training,
      }, today);
    }, 400);
    return () => clearTimeout(t);
  }, [painMap, fatigue, sleep, nutrition, weight, isMatchDay, minutes, training, result, userId, today]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Not signed in.");
      setSaving(false);
      return;
    }

    const input: CheckInInput = {
      pain_map: painMap,
      fatigue_score: fatigue,
      sleep_quality: sleep,
      nutrition_quality: nutrition,
      weight_kg: weight ? Number(weight) : null,
      is_match_day: isMatchDay,
      match_minutes_played: isMatchDay ? Number(minutes) || 0 : 0,
    };

    const cleanDrills = training.drills.filter((d) => d.name.trim());
    // distance and contact count as "something was logged" in their own right —
    // a runner who enters 8km and nothing else has told us about a session, and
    // dropping it because there were no drills or minutes would lose the entry.
    // A run type on its own is a logged session too — someone who picks
    // "Recovery run" and nothing else has told us what they did, and the 80/20
    // report needs that row to exist.
    const trainingRow = (cleanDrills.length || training.total_minutes || training.intensity ||
                         training.distance_km || training.contact_minutes || training.run_type)
      ? {
          drills: cleanDrills,
          total_minutes: training.total_minutes,
          intensity: training.intensity,
          distance_km: training.distance_km ?? null,
          contact_minutes: training.contact_minutes ?? null,
          run_type: training.run_type ?? null,
          zone: training.zone ?? null,
          avg_hr: training.avg_hr ?? null,
        }
      : null;

    const { error: dbError } = await supabase
      .from("daily_check_ins")
      .upsert(
        { user_id: user.id, check_in_date: today, ...input },
        { onConflict: "user_id,check_in_date" }
      );

    if (dbError) {
      // A gym in a basement has no signal, and losing the entry is the worst
      // possible outcome on a product built around a daily streak. Keep it on
      // the device and sync when the signal returns.
      //
      // Only for connectivity failures: a rejected row (RLS, bad data) would
      // fail identically on every retry, so queueing it would just hide a real
      // error behind a promise to sync that never resolves.
      if (isOffline(dbError)) {
        enqueue(browserStore(), {
          kind: "check_in", date: today, userId: user.id,
          payload: input as unknown as Record<string, unknown>,
          training: trainingRow,
          queuedAt: new Date().toISOString(),
        });
        setQueued(true);
        // Readiness is computed on-device from the pure engine, so they still
        // get their score now — the only thing waiting is the upload.
        setResult(assessReadiness(input, { acwr }));
        setSaving(false);
        return;
      }
      setError(dbError.message);
      setSaving(false);
      return;
    }

    // Persist today's training (drills/volume) for history + AI progression.
    if (trainingRow) {
      await supabase.from("training_logs").upsert(
        { user_id: user.id, log_date: today, ...trainingRow },
        { onConflict: "user_id,log_date" }
      );
    }

    // Activation. Fired on every check-in rather than only the first, because
    // the client can't cheaply know which is which — funnel_summary counts
    // DISTINCT users, so "how many people activated" is still right, and the
    // occurrence count doubles as a usage signal.
    track("first_check_in", { matchDay: isMatchDay });

    // It's in the database now, so the local copy has done its job. Left
    // behind, it would be restored over their saved entry next time.
    clearDraft("checkin", userId, today);

    // A check-in changes readiness on Home, Stats and Coach — drop the cached
    // page data so they refetch fresh rather than showing pre-check-in values.
    invalidate();
    // Readiness is computed client-side from the pure engine (also feeds Home).
    setResult(assessReadiness(input, { acwr }));
    setSaving(false);
  }

  if (result) {
    return (
      <div className="card animate-scale-in space-y-5 p-6 text-center">
        <h2 className="text-sm font-bold uppercase tracking-wider text-pitch-400">Today&apos;s readiness</h2>
        <ReadinessGauge score={result.score} status={result.status} />
        {queued && (
          <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-xs text-slate-400">
            📡 You&apos;re offline — this check-in is saved on your phone and will upload
            automatically when you&apos;re back on signal. Your streak is safe.
          </p>
        )}
        <p className="rounded-2xl bg-white/[0.04] p-4 text-left text-sm text-slate-200">{result.advice}</p>
        <button onClick={() => router.push("/home")} className="btn-primary">Back to home</button>
        <button onClick={() => setResult(null)} className="text-sm text-slate-400 hover:text-pitch-400">
          Edit today&apos;s entry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Told up front, not after submitting — see the note on `offline` above. */}
      {offline && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
          <span className="font-semibold text-slate-100">📡 You&apos;re offline — fill it in anyway.</span>{" "}
          It saves on your phone and uploads by itself when you&apos;re back on signal. You&apos;ll still
          get your readiness score now.
        </div>
      )}
      {!offline && queuedCount > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-400">
          📡 {queuedCount} earlier check-in{queuedCount === 1 ? "" : "s"} still uploading — nothing
          is lost, it happens in the background.
        </div>
      )}

      {restored && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
          <span>📝 Picked up where you left off — saved {restored}.</span>
          <button
            type="button"
            onClick={() => {
              // Start clean. Someone who says "no, start again" must not have
              // the draft re-saved from the state that's still on screen.
              clearDraft("checkin", userId, today);
              setPainMap({}); setFatigue(5); setSleep(7); setNutrition(6);
              setWeight(""); setIsMatchDay(false); setMinutes("0");
              setTraining({ drills: [], total_minutes: null, intensity: null });
              setRestored(null);
            }}
            className="tap-target shrink-0 text-xs font-semibold text-slate-400 hover:text-pitch-400"
          >
            Start fresh
          </button>
        </div>
      )}

      {!modeLoaded ? null : !detailed ? (
        <>
          <section className="card flex flex-col space-y-5 p-5">
            {/* iOS only — renders nothing on the web. It sits above the sleep
                question because it answers it, and a watch remembers last night
                better than anyone does at 6am. */}
            <AppleHealthPill onSleep={setSleep} />
            <TapScale
              label="How did you sleep?"
              value={sleep}
              onChange={setSleep}
              options={[
                { emoji: "😵", label: "Barely", value: 2 },
                { emoji: "😴", label: "Poorly", value: 4 },
                { emoji: "😐", label: "OK", value: 6 },
                { emoji: "🙂", label: "Well", value: 8 },
                { emoji: "🤩", label: "Great", value: 10 },
              ]}
            />
            <TapScale
              label="How does the body feel?"
              value={fatigue}
              onChange={setFatigue}
              options={[
                { emoji: "⚡", label: "Fresh", value: 2 },
                { emoji: "💪", label: "Good", value: 4 },
                { emoji: "😐", label: "OK", value: 6 },
                { emoji: "🥱", label: "Heavy", value: 8 },
                { emoji: "🪫", label: "Wrecked", value: 10 },
              ]}
            />

            <div>
              <span className="field-label">Anything hurting?</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setSore(false); setPainMap({}); }}
                  className={`flex-1 rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
                    sore === false ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-400" : "border-white/10 bg-white/[0.03] text-slate-300"
                  }`}
                >
                  No, all good
                </button>
                <button
                  type="button"
                  onClick={() => setSore(true)}
                  className={`flex-1 rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
                    sore === true ? "border-amber-400/50 bg-amber-400/10 text-amber-300" : "border-white/10 bg-white/[0.03] text-slate-300"
                  }`}
                >
                  Yes — show me
                </button>
              </div>
              {/* Only once they've said yes. Most days nothing hurts, and a body
                  map on screen every morning invites made-up numbers. */}
              {sore === true && (
                <div className="mt-4">
                  <BodyMap value={painMap} onChange={setPainMap} />
                </div>
              )}
            </div>

            {/* WEIGHT, WITHOUT COSTING THE QUICK CHECK-IN ITS POINT.
                It belongs here: full mode is the one almost nobody picks, so for
                most accounts the app never got a weight after sign-up — and
                weight is what the calorie targets, macro split, meal plan and
                shopping list are all computed from. Without one they run on a
                75kg default.

                But my first version of this was a field-label, a full-width
                input with a long placeholder and a helper sentence — three rows
                of form on a screen whose entire selling point is three taps and
                ten seconds. A daily habit dies of exactly that.

                So it's a pill until you want it. Closed it costs one short row;
                open it's a small inline number. Skipping stays free — no
                validation, no nag, and no evidence on screen that you skipped. */}
            {weight === "" && !weighing ? (
              <button
                type="button"
                onClick={() => setWeighing(true)}
                className="tap-target self-start rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-semibold text-slate-400 transition hover:border-pitch-400/40 hover:text-pitch-400"
              >
                + Weight today
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">Weight</span>
                <div className="relative w-28">
                  <input
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    autoFocus={weighing && weight === ""}
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="field !py-2 pr-8 text-center"
                    aria-label="Weight today in kilograms"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">kg</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setWeight(""); setWeighing(false); }}
                  className="tap-target text-xs text-slate-500 hover:text-slate-300"
                >
                  Skip
                </button>
              </div>
            )}
          </section>

          {/* LOGGING YOUR SESSION IS A THING YOU DO, NOT A MODE YOU SWITCH TO.
              The only route to it from here was a button that flipped the whole
              form to full — trading the tap scales for sliders and opening the
              body map — to reach one section at the bottom. So the athlete who
              just trained, which is most athletes opening this, had to change
              how the entire page works to say so. Plenty never found it.

              It opens in place now, with its own card and its own heading, and
              the quick check-in stays quick for anyone who doesn't want it. */}
          {!logTraining ? (
            <button
              type="button"
              onClick={() => setLogTraining(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-pitch-400/40"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-pitch-400/10 text-lg" aria-hidden>🏋️</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-100">Trained today?</span>
                <span className="block text-xs text-slate-500">Log the session — it feeds your training load and progress.</span>
              </span>
              {/* Was a lone "+" in 14px gold at the far edge of a card that
                  otherwise looks exactly like the read-only info panels
                  elsewhere in the app. Nothing about it said "this whole row is
                  a button", which matters because logging a session is the
                  thing this screen was specifically asked to make findable. A
                  worded action reads as an action; a punctuation mark doesn't. */}
              <span className="shrink-0 whitespace-nowrap text-xs font-bold text-pitch-400">
                Log it <span aria-hidden>→</span>
              </span>
            </button>
          ) : (
            <section className="card p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="field-label !mb-0">Today&apos;s training</h2>
                <button
                  type="button"
                  onClick={() => { setLogTraining(false); setTraining({ drills: [], total_minutes: null, intensity: null }); }}
                  className="tap-target shrink-0 text-xs text-slate-500 hover:text-slate-300"
                >
                  Didn&apos;t train
                </button>
              </div>
              <TrainingLogInput
                value={training}
                onChange={setTraining}
                planned={planned}
                sport={(SPORTS.some((sp) => sp.id === sport) ? sport : "all") as SportId | "all"}
              />
            </section>
          )}

          {/* Full mode is now only about the things quick genuinely omits. */}
          <button
            type="button"
            onClick={() => chooseMode(true)}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-pitch-400/40 hover:text-pitch-400"
          >
            + {terms.eventToday.replace(/\?$/, "")}, pain detail and sliders
          </button>
        </>
      ) : (
      <>
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="field-label !mb-0">Where does it hurt?</h2>
          <button
            type="button"
            onClick={() => chooseMode(false)}
            className="tap-target shrink-0 text-xs font-semibold text-slate-400 hover:text-pitch-400"
          >
            Use the quick check-in
          </button>
        </div>
        <BodyMap value={painMap} onChange={setPainMap} />
      </section>

      <div className="card space-y-5 p-5">
        <MetricSlider label="Fatigue" hint="1 fresh · 10 spent" value={fatigue} onChange={setFatigue} />
        <MetricSlider label="Sleep quality" hint="1 poor · 10 great" value={sleep} onChange={setSleep} />
        <MetricSlider label="Nutrition" hint="1 poor · 10 great" value={nutrition} onChange={setNutrition} />

        <label className="block">
          <span className="field-label">Weight (kg)</span>
          <input type="number" step="0.1" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="optional" className="field" />
        </label>

        <div className="rounded-2xl bg-white/[0.03] p-4">
          <label className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200">{terms.eventToday}</span>
            <input type="checkbox" checked={isMatchDay} onChange={(e) => setIsMatchDay(e.target.checked)} className="h-5 w-5 accent-pitch-500" />
          </label>
          {isMatchDay && (
            <label className="mt-3 block">
              <span className="field-label">{terms.minutes}</span>
              <input type="number" min={0} max={120} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="field" />
            </label>
          )}
        </div>
      </div>

      <section className="card p-5">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="field-label !mb-0">Today&apos;s training</h2>
          <span className="chip text-pitch-400">drills logged to history</span>
        </div>
        <TrainingLogInput
          value={training}
          onChange={setTraining}
          planned={planned}
          sport={(SPORTS.some((s) => s.id === sport) ? sport : "all") as SportId | "all"}
        />
      </section>
      </>
      )}

      {error && <p className="text-sm text-readiness-red">{error}</p>}

      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? "Saving…" : "Submit check-in"}
      </button>
    </form>
  );
}

/**
 * Five taps instead of a slider.
 *
 * A 1-10 range input is a poor fit for a thumb on a phone, and the precision is
 * false anyway — nobody can tell their sleep was a 6 rather than a 7. Five
 * labelled options are quicker, more honest, and hit the same score bands.
 */
function TapScale({ label, value, onChange, options }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  options: { emoji: string; label: string; value: number }[];
}) {
  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="grid grid-cols-5 gap-1.5">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.value)}
              className={`flex flex-col items-center gap-1 rounded-2xl border px-1 py-2.5 transition ${
                active
                  ? "border-pitch-400/50 bg-pitch-400/10"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20"
              }`}
            >
              <span className="text-xl leading-none">{o.emoji}</span>
              <span className={`text-[10px] font-medium leading-tight ${active ? "text-pitch-400" : "text-slate-400"}`}>
                {o.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MetricSlider({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <span className="text-xs text-slate-500">{hint}</span>
      </div>
      <div className="flex items-center gap-3">
        <input type="range" min={1} max={10} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
        <span className="w-7 rounded-lg bg-white/[0.06] py-1 text-center text-sm font-bold tabular-nums text-pitch-400">{value}</span>
      </div>
    </label>
  );
}
