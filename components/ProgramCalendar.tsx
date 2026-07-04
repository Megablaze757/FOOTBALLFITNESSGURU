"use client";

import { useState } from "react";
import type { ProgramWeek } from "@/lib/coach";
import { getExerciseByName, type Exercise } from "@/lib/exercises";
import { ExerciseModal } from "@/components/ExerciseDetail";

// Week-by-week program calendar you tick through. Each session is a tile;
// completing one calls onToggle (which also logs it to training).
export function ProgramCalendar({
  weeks, completed, onToggle,
}: {
  weeks: ProgramWeek[];
  completed: string[];
  onToggle: (sid: string) => void;
}) {
  const [open, setOpen] = useState<Exercise | null>(null);

  return (
    <section className="space-y-4">
      <h2 className="field-label">Your {weeks.length}-week program</h2>

      {weeks.map((w) => {
        const wDone = w.sessions.filter((s) => completed.includes(`w${w.week}d${s.day}`)).length;
        return (
          <div key={w.week} className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-100">Week {w.week} · {w.theme}</div>
                <div className="text-xs text-slate-400">{w.intensity} intensity</div>
              </div>
              <span className="text-xs text-slate-400">{wDone}/{w.sessions.length}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {w.sessions.map((s) => {
                const sid = `w${w.week}d${s.day}`;
                const done = completed.includes(sid);
                return (
                  <div
                    key={sid}
                    className={`rounded-2xl border p-3 transition ${
                      done ? "border-pitch-400/30 bg-pitch-400/[0.06]" : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Day {s.day}</div>
                        <div className="truncate text-sm font-semibold text-slate-100">{s.title.replace(/^.*· /, "")}</div>
                      </div>
                      <button
                        onClick={() => onToggle(sid)}
                        aria-label={done ? "Mark session not done" : "Mark session done"}
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs transition ${
                          done ? "border-pitch-400 bg-pitch-400 text-ink-900" : "border-white/20 text-transparent hover:border-pitch-400/60"
                        }`}
                      >
                        ✓
                      </button>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {s.drills.map((d, k) => {
                        const ex = getExerciseByName(d.name);
                        return (
                          <li key={k}>
                            <button
                              onClick={() => ex && setOpen(ex)}
                              disabled={!ex}
                              className="flex w-full items-center justify-between gap-2 text-left text-xs disabled:cursor-default"
                            >
                              <span className="truncate text-slate-300">{d.name}</span>
                              <span className="shrink-0 text-slate-500">{d.sets}×{d.reps}{ex ? " ›" : ""}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {open && <ExerciseModal ex={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
