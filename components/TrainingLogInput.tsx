"use client";

import type { TrainingDrill } from "@/lib/types";

export interface TrainingState {
  drills: TrainingDrill[];
  total_minutes: number | null;
  intensity: number | null;
}

const QUICK = ["Sprints", "Single-leg RDL", "Box jumps", "Band walks", "Passing drill", "Finishing"];

export function TrainingLogInput({ value, onChange }: { value: TrainingState; onChange: (v: TrainingState) => void }) {
  const update = (patch: Partial<TrainingState>) => onChange({ ...value, ...patch });

  const setDrill = (i: number, patch: Partial<TrainingDrill>) =>
    update({ drills: value.drills.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) });

  const addDrill = (name = "") =>
    update({ drills: [...value.drills, { name, sets: 3, reps: 10, load_kg: null }] });

  const removeDrill = (i: number) => update({ drills: value.drills.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4">
      {value.drills.length > 0 && (
        <ul className="space-y-2">
          {value.drills.map((d, i) => (
            <li key={i} className="rounded-2xl bg-white/[0.03] p-3">
              <div className="flex items-center gap-2">
                <input
                  value={d.name}
                  onChange={(e) => setDrill(i, { name: e.target.value })}
                  placeholder="Drill name"
                  className="field flex-1 py-2"
                />
                <button type="button" onClick={() => removeDrill(i)} className="px-2 text-slate-500 hover:text-readiness-red" aria-label="Remove">✕</button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <NumField label="Sets" value={d.sets} onChange={(v) => setDrill(i, { sets: v || 0 })} />
                <NumField label="Reps" value={d.reps} onChange={(v) => setDrill(i, { reps: v || 0 })} />
                <NumField label="kg" value={d.load_kg ?? ""} onChange={(v) => setDrill(i, { load_kg: v === "" ? null : v })} optional />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {QUICK.filter((q) => !value.drills.some((d) => d.name === q)).slice(0, 4).map((q) => (
          <button key={q} type="button" onClick={() => addDrill(q)} className="chip text-slate-300 hover:border-pitch-400/50 hover:text-pitch-400">
            + {q}
          </button>
        ))}
        <button type="button" onClick={() => addDrill()} className="chip text-pitch-400">+ Custom</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="field-label">Duration (min)</span>
          <input
            type="number" inputMode="numeric"
            value={value.total_minutes ?? ""}
            onChange={(e) => update({ total_minutes: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="e.g. 75" className="field"
          />
        </label>
        <label className="block">
          <span className="field-label">Intensity {value.intensity ?? "–"}</span>
          <input
            type="range" min={1} max={10}
            value={value.intensity ?? 5}
            onChange={(e) => update({ intensity: Number(e.target.value) })}
            className="mt-3 w-full"
          />
        </label>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, optional }: { label: string; value: number | string; onChange: (v: number | "") => void; optional?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-center text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type="number" inputMode="numeric" min={0}
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        placeholder={optional ? "–" : ""}
        className="field py-1.5 text-center"
      />
    </label>
  );
}
