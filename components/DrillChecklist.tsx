"use client";

import { useState } from "react";
import type { DrillItem } from "@/lib/types";
import { getExercise, demoImplement } from "@/lib/exercises";
import { ExerciseModal } from "@/components/ExerciseDetail";
import { ExerciseDemo } from "@/components/ExerciseDemo";
import { exerciseMuscles } from "@/lib/muscle-volume";

// Drill program with local completion state + progress bar. Each drill opens its
// coached exercise detail (animated demo + cues) when tapped.
export function DrillChecklist({ drills }: { drills: DrillItem[] }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const completed = drills.filter((d) => done[d.id]).length;
  const pct = drills.length ? Math.round((completed / drills.length) * 100) : 0;

  const openDrill = drills.find((d) => d.id === openId);
  const openEx = openId ? getExercise(openId) : null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        {/* Was "Today's program", which is a different thing that lives on My
            plan. These are the corrective drills THIS clip's analysis suggested —
            calling them your program implies they replace it, and puts a third
            name on a screen that already has "Today's session" and "Today's
            training" elsewhere in the app. */}
        <h2 className="field-label">Drills to fix this</h2>
        <span className="text-xs text-slate-400">{completed}/{drills.length} done</span>
      </div>
      <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-pitch-400 to-pitch-600 transition-all" style={{ width: `${pct}%` }} />
      </div>

      <ul className="space-y-2">
        {drills.map((d) => {
          const ex = getExercise(d.id);
          const target = ex ? exerciseMuscles(ex.name, ex.muscles) : null;
          const muscles = target ? [target.primary, ...target.secondary].filter((muscle): muscle is string => !!muscle) : [];
          return (
            <li key={d.id} className={`card flex items-center gap-3 p-4 transition ${done[d.id] ? "opacity-50" : ""}`}>
              <input
                type="checkbox"
                checked={!!done[d.id]}
                onChange={(e) => setDone((p) => ({ ...p, [d.id]: e.target.checked }))}
                className="h-5 w-5 shrink-0 accent-pitch-500"
                aria-label={`Mark ${d.name} done`}
              />
              <button
                type="button"
                onClick={() => ex && setOpenId(d.id)}
                className="min-h-[44px] flex flex-1 items-center gap-3 text-left disabled:cursor-default"
                disabled={!ex}
              >
                {ex && (
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/40">
                    <ExerciseDemo pattern={ex.demo} implement={demoImplement(ex)} muscles={muscles} name={ex.name} className="h-9 w-7" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-medium text-slate-100 ${done[d.id] ? "line-through" : ""}`}>{d.name}</span>
                  <span className="block text-xs text-slate-500">{d.sets} × {d.reps} · {d.targets}</span>
                </span>
                {ex && <span className="shrink-0 text-xs font-semibold text-pitch-400">View ›</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {openEx && openDrill && (
        <ExerciseModal ex={openEx} sets={openDrill.sets} reps={openDrill.reps} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}
