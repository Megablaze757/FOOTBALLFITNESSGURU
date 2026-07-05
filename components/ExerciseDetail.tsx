"use client";

import { useEffect } from "react";
import { demoImplement, type Exercise } from "@/lib/exercises";
import { ExerciseDemo } from "@/components/ExerciseDemo";

// The coached content for one exercise: demo + how-to + cues + tempo + muscles.
export function ExerciseDetailCard({ ex, sets, reps }: { ex: Exercise; sets?: number; reps?: number }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="grid h-40 w-full shrink-0 place-items-center rounded-2xl border border-white/10 bg-black/40 sm:w-40">
          {ex.video_url ? (
            <video src={ex.video_url} autoPlay muted loop playsInline className="h-full w-full rounded-2xl object-cover" />
          ) : (
            <ExerciseDemo pattern={ex.demo} implement={demoImplement(ex)} className="h-36 w-28" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span className="chip text-pitch-400">{ex.category}</span>
          <h3 className="mt-2 text-xl font-extrabold text-slate-100">{ex.name}</h3>
          <p className="mt-1 text-sm text-slate-400">{ex.why}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {(sets && reps) ? <Tag label={`${sets} × ${reps}`} /> : null}
            <Tag label={ex.tempo} />
            <Tag label={ex.equipment} />
          </div>
        </div>
      </div>

      {ex.description && (
        <div>
          <div className="stat-label mb-1.5">How to perform it</div>
          <p className="text-sm leading-relaxed text-slate-300">{ex.description}</p>
        </div>
      )}

      <div>
        <div className="stat-label mb-2">Coaching cues</div>
        <ul className="space-y-2">
          {ex.cues.map((c) => (
            <li key={c} className="flex gap-2 text-sm text-slate-200">
              <span className="text-pitch-400">›</span>{c}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="stat-label mb-1.5">Targets</div>
        <div className="flex flex-wrap gap-2">
          {ex.muscles.map((m) => (
            <span key={m} className="rounded-full bg-white/[0.05] px-3 py-1 text-xs text-slate-300">{m}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Tag({ label }: { label: string }) {
  return <span className="rounded-lg bg-white/[0.05] px-2.5 py-1 font-medium text-slate-300">{label}</span>;
}

export function ExerciseModal({ ex, sets, reps, onClose }: { ex: Exercise; sets?: number; reps?: number; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="animate-scale-in max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-ink-800 p-6 shadow-card sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex justify-end">
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-slate-300 transition hover:bg-white/10" aria-label="Close">✕</button>
        </div>
        <ExerciseDetailCard ex={ex} sets={sets} reps={reps} />
      </div>
    </div>
  );
}
