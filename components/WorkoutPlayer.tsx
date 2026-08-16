"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { howToFor, type HowTo } from "@/lib/how-to";
import { ExerciseSteps } from "@/components/ExerciseDemo";
import { Confetti } from "@/components/Confetti";

interface Drill {
  name: string;
  sets: number;
  reps: number;
  // --- from the engine. Optional: programs built before it have none. ---
  /** Prescribed rest in seconds. Varies enormously by movement. */
  rest?: number;
  /** "RPE 8" — how hard this set should feel. */
  intensity?: string;
  tempo?: string;
  /** "4 × 20m", "3 × 30s each side" — when reps alone can't say it. */
  prescription?: string;
  /** Warm-up template item: complete it with one tap; no load/reps entry. */
  completionOnly?: boolean;
}

interface Step { drill: Drill; setNum: number; totalSets: number; drillIndex: number }

/**
 * Whether the how-to has anything the athlete hasn't already read.
 *
 * The first cue is printed above the panel, and the demo is already on screen —
 * so an entry with one cue and no written method would open a box repeating the
 * line directly above it. A disclosure that discloses nothing is worse than no
 * disclosure.
 */
function showable(how: HowTo): boolean {
  return how.steps.length > 0 || how.cues.length > 1 || !!how.setup || !!how.watch;
}

/**
 * Fallback rest, for programs built before the engine prescribed it per
 * movement. It used to be the ONLY rest: every set of every exercise got 75
 * seconds, so a heavy deadlift and a calf raise were treated identically. Rest
 * is not padding between sets — 45 seconds on a max-effort sprint turns speed
 * work into conditioning, and 3 minutes on an accessory wastes the session.
 */
const DEFAULT_REST_SECONDS = 75;

/**
 * What actually happened, handed back so nothing has to be retyped.
 *
 * The player already knew all of this and threw it away: onComplete took no
 * arguments, so the caller logged a flat 45 minutes and the PRESCRIBED reps
 * regardless of how long the session took or what was actually completed. An app
 * that watched you train and then asks you to tell it what you did is a second
 * job. Now it reports back.
 */
export interface SessionResult {
  /** Real elapsed minutes, wall clock, rounded up to at least 1. */
  minutes: number;
  /** Reps actually completed per drill, keyed by drill name. */
  repsByDrill: Record<string, number>;
  intensity?: number | null;
  notes?: string | null;
  sessionType?: "workout" | "active_rest";
}

// Full-screen guided session: steps through every set with rest timers, then
// calls onComplete with what was actually done (which logs it + marks it done).
export function WorkoutPlayer({ title, drills, activeRest, onComplete, onClose }: {
  title: string;
  drills: Drill[];
  activeRest?: { durationMinutes?: number | null; rpe?: number | null; notes?: string | null } | null;
  onComplete: (result: SessionResult) => void;
  onClose: () => void;
}) {
  const steps = useMemo<Step[]>(
    () => drills.flatMap((d, di) => Array.from({ length: d.completionOnly ? 1 : Math.max(1, d.sets) }, (_, si) => ({
      drill: d, setNum: si + 1, totalSets: d.completionOnly ? 1 : Math.max(1, d.sets), drillIndex: di,
    }))),
    [drills]
  );

  const [i, setI] = useState(0);
  const [resting, setResting] = useState(false);
  const [rest, setRest] = useState(DEFAULT_REST_SECONDS);
  /** What the rest was prescribed as, so the countdown can show progress against it. */
  const [restTarget, setRestTarget] = useState(DEFAULT_REST_SECONDS);
  const [done, setDone] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [actual, setActual] = useState(0);   // reps actually completed this set
  const [guidance, setGuidance] = useState<string | null>(null);
  const [activeMinutes, setActiveMinutes] = useState(activeRest?.durationMinutes ?? 30);
  const [activeRpe, setActiveRpe] = useState(activeRest?.rpe ?? 3);
  const [activeNotes, setActiveNotes] = useState(activeRest?.notes ?? "");

  /**
   * Real elapsed time and real reps, accumulated as they go.
   *
   * Refs rather than state: nothing renders from these, and a re-render per rep
   * on a phone mid-set is waste. `startedAt` is set once on mount and never
   * reset, so pausing to catch your breath still counts as time training —
   * which it is.
   */
  const startedAt = useRef(Date.now());
  const repsDone = useRef<Record<string, number>>({});

  function summarise(): SessionResult {
    return {
      // Elapsed wall clock, floored to whole minutes but never zero — a session
      // did happen, and logging 0 minutes would score it as no load at all.
      minutes: Math.max(1, Math.round((Date.now() - startedAt.current) / 60_000)),
      repsByDrill: { ...repsDone.current },
    };
  }

  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Escape closes it. Standard for anything that covers the screen, and the only
  // exit before this was hunting for the ✕ in the corner.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Rest countdown.
  useEffect(() => {
    if (!resting) return;
    if (rest <= 0) { setResting(false); setI((n) => n + 1); return; }
    const t = setTimeout(() => setRest((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [resting, rest]);

  const step = steps[i];
  const progress = steps.length ? Math.round((i / steps.length) * 100) : 0;

  // Reset the rep counter to the target whenever a new set starts.
  useEffect(() => {
    if (step) setActual(step.drill.completionOnly ? step.drill.reps * Math.max(1, step.drill.sets) : step.drill.reps);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  function guidanceFor(reps: number, target: number): string {
    if (reps <= 0) return "😴 Skipped — rest and come back to it fresh.";
    if (reps >= target) return "💪 All reps clean — hold the load or nudge it up.";
    if (reps >= target - 2) return "👍 So close — keep this weight and chase all reps.";
    return "🔻 That was tough — drop the load ~10% next set to keep quality.";
  }

  function completeSet() {
    if (step) {
      setGuidance(step.drill.completionOnly ? "✓ Warm-up complete — you are ready for the working block." : guidanceFor(actual, step.drill.reps));
      // Sum across sets, so three sets of 8 records 24 rather than the last 8.
      const name = step.drill.name;
      repsDone.current[name] = (repsDone.current[name] ?? 0) + actual;
    }
    if (i >= steps.length - 1) {
      setDone(true);
      onComplete(summarise());
      return;
    }
    // Rest belongs to the movement you're about to do, not the one just
    // finished — you rest long before a heavy set, not after a light one.
    const next = steps[i + 1]?.drill.rest;
    const secs = typeof next === "number" && next > 0 ? next : DEFAULT_REST_SECONDS;
    setRestTarget(secs);
    setRest(secs);
    setResting(true);
  }

  function completeActiveRest() {
    const result: SessionResult = {
      minutes: Math.max(1, Math.round(activeMinutes || 1)),
      repsByDrill: {},
      intensity: Math.max(1, Math.min(10, Math.round(activeRpe || 1))),
      notes: activeNotes.trim() || null,
      sessionType: "active_rest",
    };
    setDone(true);
    onComplete(result);
  }

  /**
   * THE COACHING FOR WHATEVER THIS IS.
   *
   * Was `getExerciseByName`, which only knows the gym catalogue — so a
   * footballer stepping through their session hit "Tight cone weave · 8 runs"
   * with no figure, no cue and no how-to, because the setup and the three steps
   * for that drill live in lib/skills.ts and nothing here had ever asked. Runs
   * were the same. Across six generated programs that is 13% of all prescribed
   * work, and a much larger share of the ball-heavy days. See lib/how-to.ts.
   */
  const how = step ? howToFor(step.drill.name) : null;

  if (!mounted) return null;

  return createPortal(
    /*
     * A full-screen overlay that covers the whole app, and it was announcing as
     * a plain div — so assistive tech was never told the rest of the page had
     * gone away, and Escape did nothing. The only way out was finding the ✕.
     */
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-ink-900/95 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-title"
    >
      {done && <Confetti count={60} />}
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5">
        <div className="min-w-0">
          <div className="stat-label">Guided session</div>
          <div id="player-title" className="truncate text-sm font-bold text-slate-100">{title}</div>
        </div>
        <button onClick={onClose} className="tap-target grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] text-slate-300 hover:bg-white/10" aria-label="Close">✕</button>
      </div>
      <div className="mx-5 mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-pitch-400 to-pitch-600 transition-all" style={{ width: `${done ? 100 : progress}%` }} />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        {done ? (
          <div className="animate-scale-in">
            <div className="text-6xl">🏆</div>
            <h2 className="mt-4 text-3xl font-extrabold">Session complete!</h2>
            <p className="mt-2 text-slate-400">Logged to your training. Nice work.</p>
            <button onClick={onClose} className="btn-primary mx-auto mt-8 max-w-[14rem]">Done</button>
          </div>
        ) : activeRest ? (
          <div className="animate-fade-up w-full max-w-sm text-left">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-pitch-400/10 text-pitch-400">
              <span className="text-3xl" aria-hidden>↻</span>
            </div>
            <div className="mt-5 text-center">
              <div className="stat-label">Active rest</div>
              <h2 className="mt-1 text-2xl font-extrabold">Move easy. Finish fresher.</h2>
              <p className="mt-1 text-sm text-slate-400">This counts toward consistency, never strength volume.</p>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <label>
                <span className="field-label">Duration (min)</span>
                <input type="number" inputMode="numeric" min={1} max={300} value={activeMinutes} onChange={(e) => setActiveMinutes(Number(e.target.value) || 0)} className="field" />
              </label>
              <label>
                <span className="field-label">RPE {activeRpe}</span>
                <input type="range" min={1} max={10} value={activeRpe} onChange={(e) => setActiveRpe(Number(e.target.value))} className="mt-3 w-full" />
              </label>
            </div>
            <label className="mt-4 block">
              <span className="field-label">What did you do?</span>
              <textarea value={activeNotes} onChange={(e) => setActiveNotes(e.target.value)} rows={3} className="field resize-none" placeholder="Light jog, mobility, rehab…" />
            </label>
            <button onClick={completeActiveRest} className="btn-primary mt-6">Save active rest ✓</button>
          </div>
        ) : resting ? (
          <div className="animate-fade-up">
            {guidance && (
              <div className="mx-auto mb-6 max-w-xs rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm text-slate-200">{guidance}</div>
            )}
            <div className="stat-label">Rest</div>
            <div className="my-4 text-7xl font-extrabold tabular-nums text-pitch-400">{rest}s</div>
            {/* A bar, so a 3-minute rest before a heavy pull doesn't read as
                the timer having stalled. */}
            <div className="mx-auto h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-pitch-400 transition-all duration-1000 ease-linear"
                style={{ width: `${Math.max(0, Math.min(100, ((restTarget - rest) / Math.max(1, restTarget)) * 100))}%` }}
              />
            </div>
            <p className="mt-4 text-slate-400">Next: <b className="text-slate-200">{steps[i + 1]?.drill.name}</b> · set {steps[i + 1]?.setNum}/{steps[i + 1]?.totalSets}</p>
            {steps[i + 1]?.drill.intensity && (
              <p className="mt-1 text-xs text-slate-500">Take it at {steps[i + 1]?.drill.intensity}</p>
            )}
            <div className="mt-8 flex justify-center gap-3">
              <button onClick={() => setRest((r) => r + 15)} className="btn-ghost w-auto px-5">+15s</button>
              <button onClick={() => { setResting(false); setI((n) => n + 1); }} className="btn-primary w-auto px-6">Skip rest →</button>
            </div>
          </div>
        ) : step ? (
          <div className="animate-fade-up w-full max-w-sm">
            {how && (
              <div className="mx-auto mb-5 grid h-40 w-full max-w-[15rem] place-items-center overflow-hidden rounded-3xl border border-white/10 bg-black/40 p-2">
                <ExerciseSteps pattern={how.demo} implement={how.implement} className="h-full w-full" />
              </div>
            )}
            <div className="chip mx-auto text-pitch-400">
              {step.drill.completionOnly ? "Warm-up" : `Set ${step.setNum} of ${step.totalSets}`}
            </div>
            <h2 className="mt-3 break-words text-2xl font-extrabold sm:text-3xl">{step.drill.name}</h2>
            {/* "Target 20 reps" is wrong for a 20-metre sprint or a 30-second
                hold. Where the engine wrote a real prescription, show that. */}
            <p className="mt-1 text-sm text-slate-400">
              {step.drill.prescription ?? `${step.drill.sets} × ${step.drill.reps}`}
              {step.drill.completionOnly ? " · tap when complete" : " · log what you actually got"}
            </p>
            {/* Effort and tempo belong here, while the bar is in your hands —
                not only on the plan you read this morning. */}
            {(step.drill.intensity || step.drill.tempo) && (
              <p className="mt-1 text-xs font-semibold text-pitch-400">
                {[step.drill.intensity, step.drill.tempo].filter(Boolean).join(" · ")}
              </p>
            )}

            {/* Reps stepper — record the reps you completed (fewer is fine) */}
            {!step.drill.completionOnly && (
              <div className="mt-4 flex items-center justify-center gap-4">
                <button onClick={() => setActual((r) => Math.max(0, r - 1))} className="grid h-11 w-11 place-items-center rounded-full border border-white/15 text-xl text-slate-200 hover:bg-white/5" aria-label="one fewer rep">−</button>
                <div className="w-20">
                  <div className="text-5xl font-extrabold tabular-nums">{actual}</div>
                  <div className="stat-label">reps</div>
                </div>
                <button onClick={() => setActual((r) => r + 1)} className="grid h-11 w-11 place-items-center rounded-full border border-white/15 text-xl text-slate-200 hover:bg-white/5" aria-label="one more rep">+</button>
              </div>
            )}

            {how && how.cues.length > 0 && (
              <p className="mx-auto mt-4 max-w-xs text-xs text-slate-500">{how.cues[0]}</p>
            )}

            {/* HOW TO DO IT, WHERE YOU ARE ABOUT TO DO IT.
                The player showed the demo animation and a single cue. Everything
                else the catalogues know — the full step-by-step, the rest of the
                cues, what you need laid out, the common error — was on a screen
                you had to leave the session to reach. The one moment an athlete
                most needs to be told how to perform a movement is while standing
                in front of it, and that was the one place the app would not tell
                them.

                OPEN ON THE FIRST SET, folded away after that. It was collapsed
                on every set, so the answer to "how do I do this" was a small
                link you had to know to look for — which is why it read as
                missing entirely. Set one is exactly when you have not started
                and want reading; by set four you want it out of the way. The
                `key` matters: <details> keeps its own open state, so without it
                the element is reused across steps and stays however the athlete
                last left it. */}
            {how && showable(how) && (
              <details
                key={`${step.drillIndex}-${step.setNum === 1}`}
                open={step.setNum === 1}
                className="mx-auto mt-4 max-w-sm text-left"
              >
                <summary className="tap-target cursor-pointer list-none text-center text-xs font-semibold text-pitch-400">
                  How to do it
                </summary>
                <div className="mt-2 space-y-3 rounded-2xl bg-white/[0.04] p-3">
                  {/* Kit and space first — finding out you needed six cones
                      after reading the method is finding out too late. */}
                  {how.setup && (
                    <p className="text-xs leading-relaxed text-slate-400">
                      <span className="font-semibold text-slate-300">You need: </span>{how.setup}
                    </p>
                  )}
                  {how.steps.length === 1 ? (
                    <p className="text-xs leading-relaxed text-slate-300">{how.steps[0]}</p>
                  ) : how.steps.length > 1 ? (
                    <ol className="space-y-1.5">
                      {how.steps.map((s, n) => (
                        <li key={s} className="flex gap-2 text-xs text-slate-300">
                          <span className="shrink-0 font-bold text-pitch-400">{n + 1}</span>{s}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {how.cues.length > 1 && (
                    <ul className="space-y-1.5">
                      {how.cues.map((c) => (
                        <li key={c} className="flex gap-2 text-xs text-slate-300">
                          <span className="text-pitch-400">›</span>{c}
                        </li>
                      ))}
                    </ul>
                  )}
                  {how.watch && (
                    <p className="text-xs leading-relaxed text-amber-300/90">{how.watch}</p>
                  )}
                </div>
              </details>
            )}
            <button onClick={completeSet} className="btn-primary mx-auto mt-6 max-w-[16rem]">
              {i >= steps.length - 1 ? "Finish session ✓" : step.drill.completionOnly ? "Mark complete ✓" : "Log set ✓"}
            </button>
            <div className="mt-3 text-xs text-slate-500">Exercise {step.drillIndex + 1} of {drills.length}</div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
