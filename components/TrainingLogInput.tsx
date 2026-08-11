"use client";

import type { TrainingDrill } from "@/lib/types";
import type { SportId } from "@/lib/exercises";
import { DrillPicker } from "@/components/DrillPicker";
import { RUN_TYPES, ZONE_LIST, ZONES, runType, type RunTypeId, type ZoneId } from "@/lib/running";

export interface TrainingState {
  drills: TrainingDrill[];
  total_minutes: number | null;
  intensity: number | null;
  /** Distance covered — see migration 0062. */
  distance_km?: number | null;
  /** Rugby only. Weighted above ordinary minutes in sessionLoad. */
  contact_minutes?: number | null;
  // --- Runs. See migration 0064. -------------------------------------------
  /** Which of the fourteen run types this was. Null = wasn't a run. */
  run_type?: RunTypeId | null;
  /** The zone actually run, which is not always the one the type prescribes. */
  zone?: ZoneId | null;
  /** Average heart rate off a watch, if they have one. */
  avg_hr?: number | null;
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

      {/* DID YOU RUN?
          Offered to every sport, not just runners — the program now prescribes
          easy and recovery runs in all six, so a footballer's Tuesday can be a
          30-minute Zone 2 run and there was nowhere to say so.

          Collapsed to one select until they say yes. The zone and heart-rate
          fields only matter once there IS a run, and three empty boxes on a
          lifter's check-in is the clutter this form keeps having to shed. */}
      <label className="block">
        <span className="field-label">Did you run?</span>
        <select
          value={value.run_type ?? ""}
          onChange={(e) => {
            const id = (e.target.value || null) as RunTypeId | null;
            // Default the zone to the one the run type prescribes. It's the
            // right answer most of the time and they can override it — which
            // is the interesting case, because an easy run logged at Zone 3 is
            // the most common training error there is.
            update({ run_type: id, zone: id ? runType(id)?.primaryZone ?? null : null });
          }}
          className="field"
        >
          <option value="">No — this wasn&apos;t a run</option>
          {RUN_TYPES.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
        {value.run_type && (
          <span className="mt-1 block text-xs text-slate-500">{runType(value.run_type)?.purpose}</span>
        )}
      </label>

      {value.run_type && (
        <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label">Distance (km)</span>
              <input
                type="number" inputMode="decimal" step="0.1" min={0} max={500}
                value={value.distance_km ?? ""}
                onChange={(e) => update({ distance_km: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="e.g. 8.5" className="field"
              />
            </label>
            <label className="block">
              <span className="field-label">Avg HR (optional)</span>
              <input
                type="number" inputMode="numeric" min={30} max={250}
                value={value.avg_hr ?? ""}
                onChange={(e) => update({ avg_hr: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="off your watch" className="field"
              />
            </label>
          </div>

          <div>
            <span className="field-label">Which zone was it really?</span>
            <div className="flex flex-wrap gap-2">
              {ZONE_LIST.map((z) => {
                const active = value.zone === z.id;
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => update({ zone: z.id })}
                    className={`tap-target rounded-full border px-3 text-xs font-semibold transition ${
                      active ? "text-ink-900" : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]"
                    }`}
                    style={active ? { background: z.colour, borderColor: z.colour } : undefined}
                  >
                    {z.id} · {z.name}
                  </button>
                );
              })}
            </div>
            <span className="mt-1.5 block text-xs text-slate-500">
              {value.zone ? ZONES[value.zone].feel : "Pick the effort it actually was, not the one you meant it to be."}
            </span>
          </div>
        </div>
      )}

      {/* Distance still stands alone for runners, so someone logging a plain
          10km without picking a type doesn't lose it. */}
      {sport === "running" && !value.run_type && (
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
