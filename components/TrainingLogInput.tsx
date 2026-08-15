"use client";

import type { TrainingDrill } from "@/lib/types";
import { NumberInput } from "@/components/NumberInput";
import type { SportId } from "@/lib/exercises";
import { DrillPicker } from "@/components/DrillPicker";
import {
  RUN_TYPES, ZONE_LIST, ZONES, runType, describeShape, shapeMidpoint, intervalEffort,
  type RunTypeId, type ZoneId,
} from "@/lib/running";
import { useRef } from "react";
import { describeSets, drillTonnage, hasSetDetail, lastSetsFor, setsOf, totalReps, withSets } from "@/lib/training-sets";

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
  /** How the session was built — see migration 0084 and `intervalEffort`. */
  intervals?: number | null;
  interval_seconds?: number | null;
  recovery_seconds?: number | null;
}

export function TrainingLogInput({ value, onChange, planned = [], sport = "all", history = [] }: {
  value: TrainingState;
  onChange: (v: TrainingState) => void;
  /** Today's scheduled drills, so they can be logged with one tap. */
  planned?: TrainingDrill[];
  /** Passed to the picker so search stays inside the athlete's own sport. */
  sport?: SportId | "all";
  /**
   * Recent sessions. Already loaded by the page for the ACWR calculation, so
   * pre-filling a drill from the last time it was done costs no extra query —
   * and it is the difference between typing six numbers and checking three.
   */
  history?: { log_date?: string; drills?: TrainingDrill[] | null }[];
}) {
  /**
   * INTENSITY IS DERIVED UNTIL THE ATHLETE OVERRIDES IT.
   *
   * The slider asks "how hard was that session" about a session with two
   * intensities in it, and people answer with how hard the REPS felt — so a
   * 50-minute session with 12 minutes of efforts got rated a 9 and outscored a
   * 90-minute long run. Once the efforts are logged, that number is arithmetic
   * (see `intervalEffort`), so the form fills it in.
   *
   * But the athlete's own rating wins the moment they give one. They are the
   * only input that knows they were ill, or that the hill was steeper than
   * usual, and a form that keeps overwriting a deliberate answer is a form
   * people stop trusting. A ref rather than state: this decides what a later
   * edit does, and it should never itself cause a render.
   */
  const ratedItThemselves = useRef(false);

  const update = (patch: Partial<TrainingState>) => onChange({ ...value, ...patch });

  /**
   * Change something the derivation reads, and let the intensity follow.
   *
   * Every input `intervalEffort` looks at goes through here — the efforts, the
   * duration and the zone — because an intensity that only refreshed on two of
   * the three would be silently stale after editing the third.
   */
  const updateDerived = (patch: Partial<TrainingState>) => {
    const next = { ...value, ...patch };
    const e = intervalEffort({
      intervals: next.intervals,
      effortSeconds: next.interval_seconds,
      recoverySeconds: next.recovery_seconds,
      totalMinutes: next.total_minutes,
      zone: next.zone,
      type: next.run_type,
    });
    onChange(e && !ratedItThemselves.current ? { ...next, intensity: e.intensity } : next);
  };

  const shape = value.run_type ? runType(value.run_type)?.interval ?? null : null;
  const shapeFill = shape
    ? (() => {
        const m = shapeMidpoint(shape);
        return { intervals: m.intervals, interval_seconds: m.effortSeconds, recovery_seconds: m.recoverySeconds };
      })()
    : { intervals: 0, interval_seconds: 0, recovery_seconds: null as number | null };

  const effort = intervalEffort({
    intervals: value.intervals,
    effortSeconds: value.interval_seconds,
    recoverySeconds: value.recovery_seconds,
    totalMinutes: value.total_minutes,
    zone: value.zone,
    type: value.run_type,
  });

  const setDrill = (i: number, patch: Partial<TrainingDrill>) =>
    update({ drills: value.drills.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) });

  const addDrill = (name = "") =>
    update({ drills: [...value.drills, { name, sets: 3, reps: 10, load_kg: null }] });

  const removeDrill = (i: number) => update({ drills: value.drills.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4">
      {value.drills.length > 0 && (
        <ul className="space-y-2">
          {value.drills.map((d, i) => {
            // Last time's sets, read once per drill. Used three ways below: the
            // hint, the seed when switching to per-set rows, and the greyed
            // placeholder in each load box.
            const prev = lastSetsFor(history, d.name);
            return (
            <li key={i} className="rounded-2xl bg-white/[0.03] p-3">
              <div className="flex items-center gap-2">
                <input
                  value={d.name}
                  onChange={(e) => setDrill(i, { name: e.target.value })}
                  placeholder="Drill name"
                  className="field min-h-[44px] flex-1 py-2"
                />
                <button type="button" onClick={() => removeDrill(i)} className="tap-target px-2 text-slate-500 hover:text-readiness-red" aria-label="Remove">✕</button>
              </div>
              {/* WHERE THE NUMBERS CAME FROM.
                  Pre-filling silently is worse than not pre-filling: an athlete
                  who does not know why 12/10/8 is in the boxes cannot tell a
                  helpful default from last week's data they forgot to change.
                  Saying it out loud makes the default checkable, and doubles as
                  the thing they are trying to beat. */}
              {prev && (
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Last time: <span className="tabular-nums text-slate-400">
                    {describeSets({ sets: prev.length, reps: prev[0]?.reps ?? 0, sets_detail: prev })}
                  </span>
                </p>
              )}

              {/* THE FAST PATH STAYS FAST.
                  Most sets are three of ten at one weight, and making everyone
                  type three rows to say that would be a worse form for the
                  common case. Sets/Reps/kg stays the default; per-set rows are
                  one tap away and only for the sessions that need them. */}
              {!hasSetDetail(d) ? (
                <>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <NumField label="Sets" value={d.sets} onChange={(v) => setDrill(i, { sets: v || 0 })} />
                    <NumField label="Reps" value={d.reps} onChange={(v) => setDrill(i, { reps: v || 0 })} />
                    <NumField label="kg" value={d.load_kg ?? ""} onChange={(v) => setDrill(i, { load_kg: v === "" ? null : v })} optional />
                  </div>
                  <button
                    type="button"
                    /* Seeded from what they already typed rather than starting
                       empty — someone who put 3 × 10 @ 40 and then wants to fix
                       the last set should not retype the first two. */
                    /* REPS CARRY OVER, LOAD DOES NOT.
                       A pre-filled box has to be CLEARED before you can type —
                       NumberInput has no select-on-focus, so on a phone that is
                       a long-press or a run of backspaces. An empty box costs
                       one tap. Pre-filling therefore only pays when it is
                       usually right, and the two halves differ: rep schemes
                       repeat week to week, while load is the thing progressive
                       overload exists to change. Filling the weight made the
                       most-edited field the most expensive one to edit. It
                       shows as a placeholder instead — visible, not in the way. */
                    onClick={() => setDrill(i, withSets(d, prev
                      ? prev.map((st) => ({ reps: st.reps, load_kg: null }))
                      : setsOf(d)))}
                    className="tap-target mt-1 text-xs font-semibold text-pitch-400"
                  >
                    Log each set separately
                  </button>
                </>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {/* COLUMN HEADERS ONCE, not on every row. Four repetitions of
                      REPS and KG down a phone screen is noise, and the guide's
                      bar for anything added here is whether it removes work. The
                      inputs keep an aria-label each, so dropping the visible
                      label per row costs nothing to a screen reader. */}
                  <div className="flex items-center gap-2">
                    <span className="w-11 shrink-0" aria-hidden="true" />
                    <div className="grid flex-1 grid-cols-2 gap-2 text-center text-[10px] uppercase tracking-wider text-slate-500">
                      <span>Reps</span>
                      <span>kg</span>
                    </div>
                    <span className="w-9 shrink-0" aria-hidden="true" />
                  </div>

                  {(d.sets_detail ?? []).map((st, si) => (
                    <div key={si} className="flex items-center gap-2">
                      <span className="w-11 shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Set {si + 1}
                      </span>
                      <div className="grid flex-1 grid-cols-2 gap-2">
                        <NumberInput
                          aria-label={`Set ${si + 1} reps`}
                          value={st.reps || null}
                          min={0}
                          onChange={(v) => setDrill(i, withSets(d, (d.sets_detail ?? []).map((x, xi) =>
                            xi === si ? { ...x, reps: v ?? 0 } : x)))}
                          className="field min-h-[44px] py-1.5 text-center"
                        />
                        <NumberInput
                          aria-label={`Set ${si + 1} weight in kilograms`}
                          value={st.load_kg ?? null}
                          min={0}
                          decimal
                          placeholder={prev?.[si]?.load_kg != null ? String(prev[si].load_kg) : "–"}
                          onChange={(v) => setDrill(i, withSets(d, (d.sets_detail ?? []).map((x, xi) =>
                            xi === si ? { ...x, load_kg: v } : x)))}
                          className="field min-h-[44px] py-1.5 text-center"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setDrill(i, withSets(d, (d.sets_detail ?? []).filter((_, xi) => xi !== si)))}
                        className="tap-target w-9 shrink-0 text-slate-600 hover:text-readiness-red"
                        aria-label={`Remove set ${si + 1}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                    <button
                      type="button"
                      /* Copies the last set, because the next one is usually the
                         same weight and near the same reps. Starting blank makes
                         every set a fresh two-field typing job on a phone. */
                      onClick={() => {
                        const cur = d.sets_detail ?? [];
                        const last = cur[cur.length - 1] ?? { reps: 10, load_kg: d.load_kg ?? null };
                        setDrill(i, withSets(d, [...cur, { ...last }]));
                      }}
                      className="tap-target text-xs font-semibold text-pitch-400"
                    >
                      + Add set
                    </button>
                    {/* One tap for the common case where nothing changed. The
                        placeholders already show what it would fill in, so this
                        is a confirmation rather than a surprise. Hidden once
                        every box has a weight, when it would do nothing. */}
                    {prev?.some((st) => st.load_kg != null) &&
                      (d.sets_detail ?? []).some((st) => st.load_kg == null) && (
                      <button
                        type="button"
                        onClick={() => setDrill(i, withSets(d, (d.sets_detail ?? []).map((st, xi) => ({
                          ...st, load_kg: st.load_kg ?? prev[xi]?.load_kg ?? null,
                        }))))}
                        className="tap-target text-xs font-semibold text-pitch-400"
                      >
                        Same weight as last time
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDrill(i, { ...d, sets_detail: undefined })}
                      className="tap-target text-xs text-slate-500 hover:text-slate-300"
                    >
                      Back to sets × reps
                    </button>
                    {/* WHAT IT ADDS UP TO. Both halves are already recorded, so
                        this asks nothing — and total reps and tonnage are the
                        numbers that make a session feel like it counted. Reading
                        them back also catches a mistyped set without re-checking
                        every box. */}
                    <span className="ml-auto text-right text-xs tabular-nums text-slate-400">
                      {totalReps(d)} reps
                      {drillTonnage(d) > 0 && (
                        <span className="text-slate-500"> · {Math.round(drillTonnage(d)).toLocaleString()} kg</span>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </li>
            );
          })}
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
          <NumberInput
            value={value.total_minutes ?? null}
            onChange={(v) => updateDerived({ total_minutes: v })}
            min={0} placeholder="e.g. 75" className="field"
          />
        </label>
        <label className="block">
          <span className="field-label">
            Intensity {value.intensity ?? "–"}
            {/* Where the number came from. A slider that moved on its own with
                no explanation reads as a bug, and the athlete needs to know it
                is theirs to change. */}
            {effort && !ratedItThemselves.current && (
              <span className="ml-1 font-normal text-pitch-400">· from your intervals</span>
            )}
          </span>
          <input
            type="range" min={1} max={10}
            value={value.intensity ?? 5}
            onChange={(e) => {
              ratedItThemselves.current = true;
              update({ intensity: Number(e.target.value) });
            }}
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
            // Changing the run type clears the structure with it. Switching
            // from hill repeats to an easy run and leaving "8 × 90s" behind
            // would save efforts against a session that has none, and the
            // fields are hidden by then so nobody could see it happen.
            if (!id || !runType(id)?.interval) {
              update({ run_type: id, zone: id ? runType(id)?.primaryZone ?? null : null,
                       intervals: null, interval_seconds: null, recovery_seconds: null });
              return;
            }
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
              <NumberInput
                decimal min={0} max={500}
                value={value.distance_km ?? null}
                onChange={(v) => update({ distance_km: v })}
                placeholder="e.g. 8.5" className="field"
              />
            </label>
            <label className="block">
              <span className="field-label">Avg HR (optional)</span>
              <NumberInput
                min={30} max={250}
                value={value.avg_hr ?? null}
                onChange={(v) => update({ avg_hr: v })}
                placeholder="off your watch" className="field"
              />
            </label>
          </div>

          {/* HOW THE SESSION WAS BUILT.
              Only for the runs that HAVE a structure — an easy run has no reps
              and asking for them is two empty boxes on every log. */}
          {shape && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="field-label !mb-0">How was it broken up?</span>
                <button
                  type="button"
                  onClick={() => updateDerived(shapeFill)}
                  className="chip shrink-0 text-pitch-400 hover:bg-white/[0.08]"
                >
                  Use {describeShape(shape)}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="field-label">Efforts</span>
                  <NumberInput
                    min={1} max={100}
                    value={value.intervals ?? null}
                    onChange={(v) => updateDerived({ intervals: v })}
                    placeholder={String(shapeFill.intervals)} className="field"
                  />
                </label>
                <label className="block">
                  <span className="field-label">Each (sec)</span>
                  <NumberInput
                    min={1} max={7200}
                    value={value.interval_seconds ?? null}
                    onChange={(v) => updateDerived({ interval_seconds: v })}
                    placeholder={String(shapeFill.interval_seconds)} className="field"
                  />
                </label>
                <label className="block">
                  <span className="field-label">Jog (sec)</span>
                  <NumberInput
                    min={0} max={7200}
                    value={value.recovery_seconds ?? null}
                    onChange={(v) => updateDerived({ recovery_seconds: v })}
                    placeholder={shapeFill.recovery_seconds == null ? "–" : String(shapeFill.recovery_seconds)}
                    className="field"
                  />
                </label>
              </div>

              {/* WHAT IT BOUGHT THEM, IMMEDIATELY.
                  Two numbers going in and a changed intensity coming out is the
                  whole feature, and it is invisible unless the form says so. */}
              {effort ? (
                <p className="mt-2 text-xs text-slate-400">
                  {effort.note}{" "}
                  <span className="text-slate-300">
                    Intensity {effort.intensity}/10, worked out from that rather than guessed.
                  </span>
                  {effort.incompleteRecovery && (
                    <span className="mt-1 block text-slate-500">
                      Rests shorter than the efforts — you never fully recovered between them, so this
                      counted harder than the clock alone would say.
                    </span>
                  )}
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  How many, and how long each one was. Two numbers and the app works out the intensity
                  itself — {describeShape(shape)} is the usual shape of this session.
                </p>
              )}
            </div>
          )}

          <div>
            <span className="field-label">Which zone was it really?</span>
            <div className="flex flex-wrap gap-2">
              {ZONE_LIST.map((z) => {
                const active = value.zone === z.id;
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => updateDerived({ zone: z.id })}
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
          <NumberInput
            decimal min={0} max={500}
            value={value.distance_km ?? null}
            onChange={(v) => update({ distance_km: v })}
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
          <NumberInput
            min={0} max={400}
            value={value.contact_minutes ?? null}
            onChange={(v) => update({ contact_minutes: v })}
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
      {/* Sets, Reps and kg. This was bound straight to the number, so clearing
          the box emitted "" and the Sets/Reps callers turned that into 0 with
          `v || 0` — the field snapped back to "0" the instant you pressed
          backspace and could not be emptied. Typing 12 meant overtyping a
          selected 0, which on a phone is a long-press. See NumberInput. */}
      <NumberInput
        value={value === "" || value == null ? null : Number(value)}
        onChange={(n) => onChange(n == null ? "" : n)}
        min={0}
        placeholder={optional ? "–" : ""}
        className="field min-h-[44px] py-1.5 text-center"
      />
    </label>
  );
}
