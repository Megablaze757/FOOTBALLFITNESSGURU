"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getExerciseByName, demoImplement } from "@/lib/exercises";
import { ExerciseDemo } from "@/components/ExerciseDemo";
import { Confetti } from "@/components/Confetti";

interface Drill { name: string; sets: number; reps: number }

interface Step { drill: Drill; setNum: number; totalSets: number; drillIndex: number }

const REST_SECONDS = 75;

// Full-screen guided session: steps through every set with rest timers, then
// calls onComplete (which logs the session + marks it done).
export function WorkoutPlayer({ title, drills, onComplete, onClose }: {
  title: string;
  drills: Drill[];
  onComplete: () => void;
  onClose: () => void;
}) {
  const steps = useMemo<Step[]>(
    () => drills.flatMap((d, di) => Array.from({ length: Math.max(1, d.sets) }, (_, si) => ({
      drill: d, setNum: si + 1, totalSets: Math.max(1, d.sets), drillIndex: di,
    }))),
    [drills]
  );

  const [i, setI] = useState(0);
  const [resting, setResting] = useState(false);
  const [rest, setRest] = useState(REST_SECONDS);
  const [done, setDone] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Rest countdown.
  useEffect(() => {
    if (!resting) return;
    if (rest <= 0) { setResting(false); setI((n) => n + 1); return; }
    const t = setTimeout(() => setRest((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [resting, rest]);

  const step = steps[i];
  const progress = steps.length ? Math.round((i / steps.length) * 100) : 0;

  function completeSet() {
    if (i >= steps.length - 1) {
      setDone(true);
      onComplete();
      return;
    }
    setRest(REST_SECONDS);
    setResting(true);
  }

  const ex = step ? getExerciseByName(step.drill.name) : null;

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-ink-900/95 backdrop-blur-md">
      {done && <Confetti count={60} />}
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5">
        <div className="min-w-0">
          <div className="stat-label">Guided session</div>
          <div className="truncate text-sm font-bold text-slate-100">{title}</div>
        </div>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] text-slate-300 hover:bg-white/10" aria-label="Close">✕</button>
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
        ) : resting ? (
          <div className="animate-fade-up">
            <div className="stat-label">Rest</div>
            <div className="my-4 text-7xl font-extrabold tabular-nums text-pitch-400">{rest}s</div>
            <p className="text-slate-400">Next: <b className="text-slate-200">{steps[i + 1]?.drill.name}</b> · set {steps[i + 1]?.setNum}/{steps[i + 1]?.totalSets}</p>
            <div className="mt-8 flex justify-center gap-3">
              <button onClick={() => setRest((r) => r + 15)} className="btn-ghost w-auto px-5">+15s</button>
              <button onClick={() => { setResting(false); setI((n) => n + 1); }} className="btn-primary w-auto px-6">Skip rest →</button>
            </div>
          </div>
        ) : step ? (
          <div className="animate-fade-up w-full max-w-sm">
            {ex && (
              <div className="mx-auto mb-5 grid h-40 w-32 place-items-center rounded-3xl border border-white/10 bg-black/40">
                <ExerciseDemo pattern={ex.demo} implement={demoImplement(ex)} className="h-36 w-28" />
              </div>
            )}
            <div className="chip mx-auto text-pitch-400">Set {step.setNum} of {step.totalSets}</div>
            <h2 className="mt-3 text-3xl font-extrabold">{step.drill.name}</h2>
            <p className="mt-1 text-lg text-slate-300">{step.drill.reps} reps</p>
            {ex && <p className="mx-auto mt-3 max-w-xs text-xs text-slate-500">{ex.cues[0]}</p>}
            <button onClick={completeSet} className="btn-primary mx-auto mt-8 max-w-[16rem]">
              {i >= steps.length - 1 ? "Finish session ✓" : "Set done ✓"}
            </button>
            <div className="mt-3 text-xs text-slate-500">Exercise {step.drillIndex + 1} of {drills.length}</div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
