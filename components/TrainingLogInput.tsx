"use client";

import { loadUnitLabel, handsFor } from "@/lib/dumbbell";
import type { TrainingDrill } from "@/lib/types";
import { NumberInput } from "@/components/NumberInput";
import type { SportId } from "@/lib/exercises";
import { DrillPicker } from "@/components/DrillPicker";
import { Icon } from "@/components/Icon";
import { DrillModal } from "@/components/DrillDetail";
import { WhatIfLiftSheet } from "@/components/WhatIfLiftSheet";
import {
  RUN_TYPES, ZONE_LIST, ZONES, runType, describeShape, shapeMidpoint, intervalEffort,
  formatPace, runPace,
  type RunTypeId, type ZoneId,
} from "@/lib/running";
import { useRef, useState, type ReactNode } from "react";
import {
  describeSets, drillTonnage, hasSetDetail, lastSetsFor, setsOf, totalReps,
  warmupSetsOf, workingSetsOf, withSets, type DrillSet,
} from "@/lib/training-sets";
import { durationPerSet, exerciseMeasure, formatMeasuredDose } from "@/lib/exercise-measure";

export interface TrainingState {
  drills: TrainingDrill[];
  total_minutes: number | null;
  /** Exact elapsed SESSION time, so a 27:43 session is not rewritten as 28 minutes. */
  duration_seconds?: number | null;
  /**
   * Time spent running, which is only the same as the session for a runner.
   * Pace comes from this and the distance — see migration 0094.
   */
  run_seconds?: number | null;
  session_type?: "workout" | "active_rest" | "rest_day";
  notes?: string | null;
  intensity: number | null;
  /** Distance covered — see migration 0062. */
  distance_km?: number | null;
  distance_value?: number | null;
  distance_unit?: "km" | "mi" | null;
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

function lastDrill(history: { log_date?: string; drills?: TrainingDrill[] | null }[], name: string): TrainingDrill | null {
  const key = name.trim().toLowerCase();
  let latest: { date: string; drill: TrainingDrill } | null = null;
  for (const log of history) {
    const found = (log.drills ?? []).find((drill) => drill.name.trim().toLowerCase() === key);
    const date = log.log_date ?? "";
    if (found && (!latest || date > latest.date)) latest = { date, drill: found };
  }
  return latest?.drill ?? null;
}

export function TrainingLogInput({ value, onChange, planned = [], sport = "all", history = [], distanceUnit = "km", onDistanceUnitChange }: {
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
  distanceUnit?: "km" | "mi";
  onDistanceUnitChange?: (unit: "km" | "mi") => void;
}) {
  const [warmupsOpen, setWarmupsOpen] = useState<Set<number>>(new Set());
  const [whatIf, setWhatIf] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
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

  const chooseRunType = (id: RunTypeId | null) => {
    // Changing the run type clears structure that no longer belongs to it.
    // Otherwise switching from hill repeats to an easy run can silently leave
    // "8 × 90s" attached to a session whose interval fields are now hidden.
    if (!id || !runType(id)?.interval) {
      update({
        run_type: id,
        zone: id ? runType(id)?.primaryZone ?? null : null,
        intervals: null,
        interval_seconds: null,
        recovery_seconds: null,
      });
      return;
    }
    update({ run_type: id, zone: runType(id)?.primaryZone ?? null });
  };

  const unit = value.distance_unit ?? distanceUnit;
  const shownDistance = value.distance_value != null && value.distance_unit === unit
    ? value.distance_value
    : value.distance_km == null
      ? null
      : unit === "mi" ? +(value.distance_km / 1.609344).toFixed(3) : value.distance_km;

  const setDistance = (next: number | null) => {
    const km = next == null ? null : unit === "mi" ? next * 1.609344 : next;
    update({
      distance_value: next,
      distance_unit: unit,
      distance_km: km == null ? null : +km.toFixed(3),
    });
  };

  const setUnit = (next: "km" | "mi") => {
    const converted = value.distance_km == null
      ? null
      : next === "mi" ? +(value.distance_km / 1.609344).toFixed(3) : +value.distance_km.toFixed(3);
    update({ distance_unit: next, distance_value: converted });
    onDistanceUnitChange?.(next);
  };

  /**
   * How long the run took. Falls back to the session for rows written before
   * the two were told apart — for those, a run WAS the session as far as the
   * app could tell, so that is the honest reading of them.
   */
  const runSeconds = value.run_seconds ?? (value.run_type ? value.duration_seconds ?? ((value.total_minutes ?? 0) * 60) : 0);

  /**
   * The run's own clock.
   *
   * SEPARATE FROM THE SESSION, and that is the whole point. A footballer's
   * Tuesday is a 90-minute session with a 20-minute run inside it; pace worked
   * out from the session reads 4:30/km as 20:00/km, which is not a rounding
   * error but a different sport. For a runner the two ARE the same thing, so
   * the fast path writes both and the session box stays out of the way.
   */
  const setRunPart = (part: "minutes" | "seconds", next: number | null) => {
    const current = runSeconds;
    const minutes = part === "minutes" ? (next ?? 0) : Math.floor(current / 60);
    const seconds = part === "seconds" ? (next ?? 0) : current % 60;
    const run = Math.max(0, minutes * 60 + seconds) || null;
    updateDerived(sport === "running"
      // A runner's run is their session. Writing only run_seconds would leave
      // their session duration blank and take their training load with it.
      ? { run_seconds: run, duration_seconds: run, total_minutes: run ? Math.round(run / 60) : null }
      : { run_seconds: run });
  };

  const setSessionMinutes = (next: number | null) =>
    updateDerived({ total_minutes: next, duration_seconds: next == null ? null : next * 60 });

  const setDrill = (i: number, patch: Partial<TrainingDrill>) =>
    update({ drills: value.drills.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) });

  const removeDrill = (i: number) => update({ drills: value.drills.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4">
      {/* RUNNER FAST PATH.
          Performance can only be useful if the check-in makes its inputs
          obvious. These five fields directly power mileage, pace, Zone 2
          progress, intensity distribution and heart-rate trends. They used to
          be split above and below the strength drill picker, with "Did you
          run?" appearing after sets/reps/kg on a runner's own form. */}
      {sport === "running" && (
        <section className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.045] p-4">
          <div className="mb-3">
            <span className="eyebrow text-sky-400">Run summary</span>
            <h3 className="mt-0.5 text-base font-extrabold text-slate-100">What did you run?</h3>
            <p className="mt-1 text-xs text-slate-500">The essentials first. Watch data stays optional.</p>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="field-label">Run type</span>
              <select
                value={value.run_type ?? ""}
                onChange={(e) => chooseRunType((e.target.value || null) as RunTypeId | null)}
                className="field"
              >
                <option value="">Choose the closest type</option>
                {RUN_TYPES.map((run) => <option key={run.id} value={run.id}>{run.label}</option>)}
              </select>
              {value.run_type && <span className="mt-1 block text-xs text-slate-500">{runType(value.run_type)?.purpose}</span>}
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="block">
                <span className="field-label flex items-center justify-between gap-2">
                  Distance
                  <UnitToggle unit={unit} onChange={setUnit} />
                </span>
                <NumberInput
                  decimal min={0} max={unit === "mi" ? 310 : 500} step="0.001"
                  value={shownDistance}
                  onChange={setDistance}
                  placeholder="e.g. 5.66" className="field"
                  aria-label={`Distance in ${unit === "mi" ? "miles" : "kilometres"}`}
                />
              </div>
              <RunTime seconds={runSeconds} onPart={setRunPart} />
            </div>

            <PaceLine km={value.distance_km} seconds={runSeconds} unit={unit} />

            <div>
              <span className="field-label">Actual zone</span>
              <div className="grid grid-cols-5 gap-1.5">
                {ZONE_LIST.map((zone) => {
                  const active = value.zone === zone.id;
                  return (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => updateDerived({ zone: zone.id })}
                      className={`tap-target min-w-0 rounded-xl border px-1 text-xs font-bold transition ${active ? "text-ink-900" : "border-white/10 bg-white/[0.03] text-slate-400"}`}
                      style={active ? { background: zone.colour, borderColor: zone.colour } : undefined}
                      aria-label={`Zone ${zone.id}: ${zone.name}`}
                    >
                      Z{zone.id}
                    </button>
                  );
                })}
              </div>
              <span className="mt-1.5 block text-xs text-slate-500">
                {value.zone ? `${ZONES[value.zone].name} · ${ZONES[value.zone].feel}` : "Pick how it actually felt, not only what the plan called it."}
              </span>
            </div>

            <label className="block">
              <span className="field-label">Average heart rate <span className="normal-case tracking-normal text-slate-600">(optional)</span></span>
              <NumberInput
                min={30} max={250}
                value={value.avg_hr ?? null}
                onChange={(next) => update({ avg_hr: next })}
                placeholder="From your watch, e.g. 146" className="field"
              />
            </label>

            {shape && (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="field-label !mb-0">Intervals</span>
                  <button type="button" onClick={() => updateDerived(shapeFill)} className="chip shrink-0 text-sky-400">
                    Use {describeShape(shape)}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="block">
                    <span className="field-label">Efforts</span>
                    <NumberInput min={1} max={100} value={value.intervals ?? null} onChange={(next) => updateDerived({ intervals: next })} placeholder={String(shapeFill.intervals)} className="field" />
                  </label>
                  <label className="block">
                    <span className="field-label">Each (sec)</span>
                    <NumberInput min={1} max={7200} value={value.interval_seconds ?? null} onChange={(next) => updateDerived({ interval_seconds: next })} placeholder={String(shapeFill.interval_seconds)} className="field" />
                  </label>
                  <label className="block">
                    <span className="field-label">Jog (sec)</span>
                    <NumberInput min={0} max={7200} value={value.recovery_seconds ?? null} onChange={(next) => updateDerived({ recovery_seconds: next })} placeholder={shapeFill.recovery_seconds == null ? "–" : String(shapeFill.recovery_seconds)} className="field" />
                  </label>
                </div>
                {effort && <p className="mt-2 text-xs text-slate-400">{effort.note}</p>}
              </div>
            )}

            <label className="block">
              <span className="field-label">How hard overall? <span className="text-slate-400">{value.intensity ?? 5}/10</span></span>
              <input
                type="range" min={1} max={10}
                value={value.intensity ?? 5}
                onChange={(event) => {
                  ratedItThemselves.current = true;
                  update({ intensity: Number(event.target.value) });
                }}
                className="mt-2 w-full"
              />
            </label>

            <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] text-slate-400">
              <span className="chip">Distance → mileage</span>
              <span className="chip">Time → pace</span>
              <span className="chip">Zone → aerobic progress</span>
              <span className="chip">HR → effort trend</span>
            </div>
          </div>
        </section>
      )}

      {value.drills.length > 0 && (
        <ul className="space-y-2">
          {value.drills.map((d, i) => {
            // Last time's sets, read once per drill. Used three ways below: the
            // hint, the seed when switching to per-set rows, and the greyed
            // placeholder in each load box.
            const prev = lastSetsFor(history, d.name);
            const previousDrill = lastDrill(history, d.name);
            const measure = exerciseMeasure(d.name, d.prescription);
            const timed = measure === "seconds" || measure === "minutes";
            const secondsPerSet = durationPerSet(d) ?? 0;
            const warmups = warmupSetsOf(d);
            const working = workingSetsOf(d);
            const warmupOpen = warmupsOpen.has(i);
            const replaceSets = (nextWorking: DrillSet[], nextWarmups = warmups) =>
              setDrill(i, withSets(d, [
                ...nextWarmups.map((s) => ({ ...s, isWarmup: true })),
                ...nextWorking.map((s) => ({ ...s, isWarmup: false })),
              ]));
            return (
            <li key={i} className="rounded-2xl bg-white/[0.03] p-3">
              <div className="flex items-center gap-2">
                <input
                  value={d.name}
                  onChange={(e) => setDrill(i, { name: e.target.value })}
                  placeholder="Drill name"
                  className="field min-h-[44px] flex-1 py-2"
                />
                {d.name.trim() && (
                  <button type="button" onClick={() => setDetail(d.name)} className="tap-target grid h-9 w-9 place-items-center text-slate-500 hover:text-pitch-400" aria-label={`View ${d.name} technique`}>
                    <Icon name="book" size={17} />
                  </button>
                )}
                <button type="button" onClick={() => removeDrill(i)} className="tap-target px-2 text-slate-500 hover:text-readiness-red" aria-label="Remove">✕</button>
              </div>
              {/* WHERE THE NUMBERS CAME FROM.
                  Pre-filling silently is worse than not pre-filling: an athlete
                  who does not know why 12/10/8 is in the boxes cannot tell a
                  helpful default from last week's data they forgot to change.
                  Saying it out loud makes the default checkable, and doubles as
                  the thing they are trying to beat. */}
              {(timed ? previousDrill : prev) && (
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Last time: <span className="tabular-nums text-slate-400">
                    {timed && previousDrill
                      ? formatMeasuredDose(previousDrill)
                      : describeSets({ sets: prev!.length, reps: prev![0]?.reps ?? 0, sets_detail: prev! })}
                  </span>
                </p>
              )}

              {/* THE FAST PATH STAYS FAST.
                  Most sets are three of ten at one weight, and making everyone
                  type three rows to say that would be a worse form for the
                  common case. Sets/Reps/kg stays the default; per-set rows are
                  one tap away and only for the sessions that need them. */}
              {timed ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <NumField label="Sets" value={d.sets} onChange={(v) => setDrill(i, { sets: v || 0 })} />
                  <NumField
                    label={measure === "minutes" ? "Minutes / set" : "Seconds / set"}
                    value={measure === "minutes" ? +(secondsPerSet / 60).toFixed(1) : secondsPerSet}
                    onChange={(v) => {
                      const amount = Number(v) || 0;
                      setDrill(i, {
                        measure,
                        duration_seconds: amount * (measure === "minutes" ? 60 : 1),
                        // Zero means downstream strength charts never call a
                        // 45-second plank "45 reps". The real dose is above.
                        reps: 0,
                        load_kg: null,
                        sets_detail: undefined,
                      });
                    }}
                  />
                </div>
              ) : !hasSetDetail(d) ? (
                <>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <NumField label="Sets" value={d.sets} onChange={(v) => setDrill(i, { sets: v || 0 })} />
                    <NumField label="Reps" value={d.reps} onChange={(v) => setDrill(i, { reps: v || 0 })} />
                    {/* "kg each" on a two-dumbbell lift. The app was taking a
                        dumbbell weight as the total and recording half the
                        work, and the field that caused it said nothing about
                        which number it wanted — see lib/dumbbell.ts. */}
                    <NumField
                      label={loadUnitLabel(d.name ?? "")}
                      decimal
                      value={d.load_kg ?? ""}
                      onChange={(v) => setDrill(i, { load_kg: v === "" ? null : v })}
                      optional
                      action={<button type="button" onClick={() => setWhatIf(d.name)} className="tap-pad relative grid h-6 w-6 place-items-center text-pitch-400" aria-label={`What-if lift check for ${d.name || "this exercise"}`}><Icon name="calculator" size={14} /></button>}
                    />
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
                      <span className="flex items-center justify-center gap-1">
                        {/* "kg each" on a two-dumbbell lift — see lib/dumbbell.ts. */}
                        {loadUnitLabel(d.name ?? "")}
                        <button type="button" onClick={() => setWhatIf(d.name)} className="tap-pad relative grid h-6 w-6 place-items-center text-pitch-400" aria-label={`What-if lift check for ${d.name || "this exercise"}`}><Icon name="calculator" size={14} /></button>
                      </span>
                    </div>
                    <span className="w-9 shrink-0" aria-hidden="true" />
                  </div>

                  {working.map((st, si) => (
                    <div key={si} className="flex items-center gap-2">
                      <span className="w-11 shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Set {si + 1}
                      </span>
                      <div className="grid flex-1 grid-cols-2 gap-2">
                        <NumberInput
                          aria-label={`Set ${si + 1} reps`}
                          value={st.reps || null}
                          min={0}
                          onChange={(v) => replaceSets(working.map((x, xi) =>
                            xi === si ? { ...x, reps: v ?? 0 } : x))}
                          className="field min-h-[44px] py-1.5 text-center"
                        />
                        <NumberInput
                          aria-label={`Set ${si + 1} weight in kilograms${handsFor(d.name ?? "") === 2 ? ", per dumbbell" : ""}`}
                          value={st.load_kg ?? null}
                          min={0}
                          decimal
                          placeholder={prev?.[si]?.load_kg != null ? String(prev[si].load_kg) : "–"}
                          onChange={(v) => replaceSets(working.map((x, xi) =>
                            xi === si ? { ...x, load_kg: v } : x))}
                          className="field min-h-[44px] py-1.5 text-center"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => replaceSets(working.filter((_, xi) => xi !== si))}
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
                        const cur = working;
                        const last = cur[cur.length - 1] ?? { reps: 10, load_kg: d.load_kg ?? null };
                        replaceSets([...cur, { ...last }]);
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
                      working.some((st) => st.load_kg == null) && (
                      <button
                        type="button"
                        onClick={() => replaceSets(working.map((st, xi) => ({
                          ...st, load_kg: st.load_kg ?? prev[xi]?.load_kg ?? null,
                        })))}
                        className="tap-target text-xs font-semibold text-pitch-400"
                      >
                        Same weight as last time
                      </button>
                    )}
                    {warmups.length === 0 && <button
                      type="button"
                      onClick={() => setDrill(i, { ...d, sets_detail: undefined })}
                      className="tap-target text-xs text-slate-500 hover:text-slate-300"
                    >
                      Back to sets × reps
                    </button>}
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

              {/* Optional prep sets live beside the lift they prepare. They are
                  persisted in sets_detail, but every performance reader filters
                  them through workingSetsOf before doing arithmetic. */}
              {!timed && <div className="mt-3 border-t border-white/[0.06] pt-2">
                <button
                  type="button"
                  onClick={() => setWarmupsOpen((current) => {
                    const next = new Set(current);
                    next.has(i) ? next.delete(i) : next.add(i);
                    return next;
                  })}
                  aria-expanded={warmupOpen}
                  className="tap-target flex w-full items-center justify-between text-left text-xs font-semibold text-slate-400"
                >
                  <span>+ Warm-up sets{warmups.length ? ` (${warmups.length})` : ""}</span>
                  <span className={`transition-transform duration-200 ${warmupOpen ? "rotate-180" : ""}`} aria-hidden>▾</span>
                </button>
                {warmupOpen && (
                  <div className="mt-2 space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5">
                    {warmups.map((set, wi) => (
                      <div key={wi} className="flex items-center gap-2">
                        <span className="w-14 shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500">Warm {wi + 1}</span>
                        <div className="grid flex-1 grid-cols-2 gap-2">
                          <NumberInput
                            aria-label={`Warm-up set ${wi + 1} reps`}
                            value={set.reps || null}
                            min={0}
                            onChange={(v) => replaceSets(working, warmups.map((x, xi) => xi === wi ? { ...x, reps: v ?? 0 } : x))}
                            placeholder="reps"
                            className="field min-h-[44px] py-1.5 text-center"
                          />
                          <NumberInput
                            aria-label={`Warm-up set ${wi + 1} weight in kilograms`}
                            value={set.load_kg ?? null}
                            min={0}
                            decimal
                            onChange={(v) => replaceSets(working, warmups.map((x, xi) => xi === wi ? { ...x, load_kg: v } : x))}
                            placeholder="kg"
                            className="field min-h-[44px] py-1.5 text-center"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => replaceSets(working, warmups.filter((_, xi) => xi !== wi))}
                          className="tap-target w-8 shrink-0 text-slate-600 hover:text-readiness-red"
                          aria-label={`Remove warm-up set ${wi + 1}`}
                        >✕</button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const baseWorking = hasSetDetail(d) ? working : setsOf(d);
                        replaceSets(baseWorking, [...warmups, { reps: 8, load_kg: null, isWarmup: true }]);
                      }}
                      className="tap-target text-xs font-semibold text-pitch-400"
                    >
                      + Add warm-up set
                    </button>
                    <p className="text-[10px] leading-relaxed text-slate-500">Warm-up sets stay in history but do not count toward PRs, 1RM, strength ratings or working volume.</p>
                  </div>
                )}
              </div>}
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

      {whatIf !== null && <WhatIfLiftSheet initialExercise={whatIf} onClose={() => setWhatIf(null)} />}
      {detail && <DrillModal name={detail} onClose={() => setDetail(null)} />}

      {/* THE WHOLE SESSION, WHICH IS NOT THE RUN.
          These were briefly one field, and one field cannot answer both
          questions: a footballer's Tuesday is a 90-minute session with a
          20-minute run inside it, and pace worked out from the session reads
          4:30/km as 20:00/km. Whole minutes are right here — session length
          drives training load, and load has never needed the seconds. The run's
          own clock is in the run block below, in mm:ss, because six seconds a
          kilometre is the difference between Zone 2 and a tempo. */}
      {sport !== "running" && <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="field-label">Session length (min)</span>
          <NumberInput
            value={value.total_minutes ?? null}
            onChange={setSessionMinutes}
            min={0} placeholder="e.g. 75" className="field"
          />
          {value.run_type && (
            <span className="mt-1 block text-[11px] text-slate-500">Everything, warm-up to shower. The run&apos;s own time is below.</span>
          )}
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
      </div>}

      {/* DID YOU RUN?
          Offered to every sport, not just runners — the program now prescribes
          easy and recovery runs in all six, so a footballer's Tuesday can be a
          30-minute Zone 2 run and there was nowhere to say so.

          Collapsed to one select until they say yes. The zone and heart-rate
          fields only matter once there IS a run, and three empty boxes on a
          lifter's check-in is the clutter this form keeps having to shed. */}
      {sport !== "running" && <label className="block">
        <span className="field-label">Did you run?</span>
        <select
          value={value.run_type ?? ""}
          onChange={(e) => chooseRunType((e.target.value || null) as RunTypeId | null)}
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
      </label>}

      {sport !== "running" && value.run_type && (
        <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="block">
              <span className="field-label flex items-center justify-between gap-2">
                Distance
                <UnitToggle unit={unit} onChange={setUnit} />
              </span>
              <NumberInput
                decimal min={0} max={unit === "mi" ? 310 : 500} step="0.001"
                value={shownDistance}
                onChange={setDistance}
                placeholder="e.g. 8.5" className="field"
                aria-label={`Distance in ${unit === "mi" ? "miles" : "kilometres"}`}
              />
            </div>
            {/* THE FIELD EVERY SPORT BUT ONE WAS MISSING. Runners have had
                mm:ss and a live pace since the fast path was built; a
                footballer logging Tuesday's easy run had a whole-minute
                duration box three sections up and no pace anywhere. The app
                prescribes runs in all six sports — it has to be able to
                receive one back. */}
            <RunTime seconds={runSeconds} onPart={setRunPart} />
          </div>

          <PaceLine km={value.distance_km} seconds={runSeconds} unit={unit} />

          <label className="block">
            <span className="field-label">Avg HR <span className="normal-case tracking-normal text-slate-600">(optional)</span></span>
            <NumberInput
              min={30} max={250}
              value={value.avg_hr ?? null}
              onChange={(v) => update({ avg_hr: v })}
              placeholder="off your watch" className="field"
            />
          </label>

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

/**
 * A run's time, to the second.
 *
 * Two boxes rather than one "seconds" field, because nobody reads their watch
 * in seconds — it says 27:34 and this asks for 27 and 34.
 */
function RunTime({ seconds, onPart }: {
  seconds: number;
  onPart: (part: "minutes" | "seconds", next: number | null) => void;
}) {
  return (
    <fieldset>
      <legend className="field-label">Time (mm:ss)</legend>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <NumberInput min={0} max={2880}
          value={seconds ? Math.floor(seconds / 60) : null}
          onChange={(next) => onPart("minutes", next)} placeholder="mm" className="field text-center" aria-label="Run minutes" />
        <span className="font-bold text-slate-500">:</span>
        <NumberInput min={0} max={59}
          value={seconds ? seconds % 60 : null}
          onChange={(next) => onPart("seconds", next)} placeholder="ss" className="field text-center" aria-label="Run seconds" />
      </div>
    </fieldset>
  );
}

/**
 * The number the athlete actually wanted, worked out from the two they gave.
 *
 * Shown in the unit they are typing in — a miles runner does not want km/h, and
 * being handed the wrong unit is how a good number becomes noise.
 */
function PaceLine({ km, seconds, unit }: { km: number | null | undefined; seconds: number; unit: "km" | "mi" }) {
  // The same function the save writes with. Two copies of one formula is how
  // the check-in came to show a pace the saved row disagreed with.
  const pace = runPace(km, seconds);
  return (
    <div className={`rounded-xl px-3 py-2 text-xs ${pace ? "bg-sky-400/10 text-sky-300" : "bg-white/[0.03] text-slate-500"}`}>
      {pace
        ? <>Average pace <strong className="tabular-nums text-slate-100">
            {formatPace(unit === "mi" ? Math.round(pace.secondsPerKm * 1.609344) : pace.secondsPerKm)}/{unit}
          </strong> · {(unit === "mi" ? pace.kmh / 1.609344 : pace.kmh).toFixed(2)} {unit === "mi" ? "mph" : "km/h"}</>
        : "Add distance and time and your average pace appears here automatically."}
    </div>
  );
}

/** km or miles, in the athlete's hands rather than buried in settings. */
function UnitToggle({ unit, onChange }: { unit: "km" | "mi"; onChange: (next: "km" | "mi") => void }) {
  return (
    <span className="unit-toggle unit-toggle-sky">
      {(["km", "mi"] as const).map((u) => (
        <button key={u} type="button" onClick={() => onChange(u)}
          aria-label={u === "km" ? "Use kilometres" : "Use miles"}
          aria-pressed={u === unit}>{u}</button>
      ))}
    </span>
  );
}

function NumField({ label, value, onChange, optional, action, decimal }: { label: string; value: number | string; onChange: (v: number | "") => void; optional?: boolean; action?: ReactNode; decimal?: boolean }) {
  return (
    <div className="block">
      <span className="mb-1 flex min-h-6 items-center justify-center gap-1 text-center text-[10px] uppercase tracking-wider text-slate-500">{label}{action}</span>
      {/* Sets, Reps and kg. This was bound straight to the number, so clearing
          the box emitted "" and the Sets/Reps callers turned that into 0 with
          `v || 0` — the field snapped back to "0" the instant you pressed
          backspace and could not be emptied. Typing 12 meant overtyping a
          selected 0, which on a phone is a long-press. See NumberInput. */}
      {/* A WHOLE-NUMBER FIELD CANNOT TAKE 12.5kg, and that is the complaint.
          NumberInput truncates unless it is told otherwise — `Math.trunc(12.5)`
          — and it also puts a keypad on screen with no decimal point on it. The
          set-detail rows have asked for the decimal keypad since they were
          built; this, the simple three-box row most people actually log in,
          never did. Sets and reps stay whole, because 2.5 reps is not a thing. */}
      <NumberInput
        aria-label={label === "kg" ? "Weight in kilograms" : label}
        value={value === "" || value == null ? null : Number(value)}
        onChange={(n) => onChange(n == null ? "" : n)}
        min={0}
        decimal={decimal}
        placeholder={optional ? "–" : ""}
        className="field min-h-[44px] py-1.5 text-center"
      />
    </div>
  );
}
