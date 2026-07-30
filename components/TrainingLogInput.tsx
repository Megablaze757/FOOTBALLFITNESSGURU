"use client";

import type { TrainingDrill } from "@/lib/types";
import type { SportId } from "@/lib/exercises";
import { DrillPicker } from "@/components/DrillPicker";

export interface TrainingState {
  drills: TrainingDrill[];
  total_minutes: number | null;
  intensity: number | null;
  /** Runners only — see migration 0062. */
  distance_km?: number | null;
  /** Rugby only. Weighted above ordinary minutes in sessionLoad. */
  contact_minutes?: number | null;
}

export function TrainingLogInput({ value, onChange, planned = [], sport = "all" }: {
  value: TrainingState;
  onChange: (v: TrainingState) => void;
  /** Today's scheduled drills, so they can be logged with one tap. */
  planned?: TrainingDrill[];
  /** Passed to the picker so search stays inside the athlete's own sport. */
  sport?: SportId | "all";
}) {
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
                <button type="button" onClick={() => removeDrill(i)} className="tap-target px-2 text-slate-500 hover:text-readiness-red" aria-label="Remove">✕</button>
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

      <DrillPicker
        planned={planned}
        chosen={value.drills.map((d) => d.name)}
        onAdd={(d) => update({ drills: [...value.drills, d] })}
        sport={sport}
      />

      <button type="button" onClick={() => addDrill()} className="chip text-pitch-400">
        + Add something not in the library
      </button>

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

      {/* SPORT-SPECIFIC LOAD INPUTS.
          Shown only where they change the maths, because an extra field nobody
          needs is the thing this whole pass has been removing. Rugby's contact
          minutes are weighted above running minutes in sessionLoad (collisions
          are the injury driver, not volume); a runner's distance becomes their
          headline weekly figure instead of a session count. */}
      {sport === "running" && (
        <label className="block">
          <span className="field-label">Distance (km)</span>
          <input
            type="number" inputMode="decimal" step="0.1" min={0} max={500}
            value={value.distance_km ?? ""}
            onChange={(e) => update({ distance_km: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="e.g. 8.5" className="field"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Your weekly mileage is built from this — it&apos;s what Progress leads with.
          </span>
        </label>
      )}

      {sport === "rugby" && (
        <label className="block">
          <span className="field-label">Of that, contact minutes</span>
          <input
            type="number" inputMode="numeric" min={0} max={400}
            value={value.contact_minutes ?? ""}
            onChange={(e) => update({ contact_minutes: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="e.g. 20" className="field"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Contact counts double toward your load. Scrums, mauls, tackle work — not the running.
          </span>
        </label>
      )}
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
