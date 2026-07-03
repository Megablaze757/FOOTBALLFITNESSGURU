"use client";

import { useState } from "react";
import type { DrillItem } from "@/lib/types";

// Drill program with local completion state + progress bar. (Persisting
// completion is a later enhancement — kept client-side for now.)
export function DrillChecklist({ drills }: { drills: DrillItem[] }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const completed = drills.filter((d) => done[d.id]).length;
  const pct = drills.length ? Math.round((completed / drills.length) * 100) : 0;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="field-label">Today&apos;s program</h2>
        <span className="text-xs text-slate-400">{completed}/{drills.length} done</span>
      </div>
      <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-pitch-400 to-pitch-600 transition-all" style={{ width: `${pct}%` }} />
      </div>

      <ul className="space-y-2">
        {drills.map((d) => (
          <li key={d.id}>
            <label className={`card flex cursor-pointer items-center gap-3 p-4 transition ${done[d.id] ? "opacity-50" : ""}`}>
              <input type="checkbox" checked={!!done[d.id]} onChange={(e) => setDone((p) => ({ ...p, [d.id]: e.target.checked }))} className="h-5 w-5 accent-pitch-500" />
              <div className="flex-1">
                <div className={`text-sm font-medium text-slate-100 ${done[d.id] ? "line-through" : ""}`}>{d.name}</div>
                <div className="text-xs text-slate-500">{d.sets} × {d.reps} · {d.targets}</div>
              </div>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
