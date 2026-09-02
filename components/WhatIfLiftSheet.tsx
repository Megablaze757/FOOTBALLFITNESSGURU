"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet, ExerciseModal } from "@/components/ExerciseDetail";
import { NumberInput } from "@/components/NumberInput";
import { getExerciseByName, getExercisesForSport, type Exercise } from "@/lib/exercises";
import { estimate1RM } from "@/lib/exercise-stats";
import { rankLift, resolveLift, type Sex } from "@/lib/strength-standards";
import { createClient } from "@/lib/supabase/client";

/** Ephemeral lift preview. Nothing in this component writes to Supabase. */
export function WhatIfLiftSheet({ initialExercise = "", onClose }: {
  initialExercise?: string;
  onClose: () => void;
}) {
  const [exercise, setExercise] = useState(initialExercise);
  const [query, setQuery] = useState(initialExercise);
  const [weight, setWeight] = useState<number | null>(null);
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [reps, setReps] = useState<number | null>(null);
  const [athlete, setAthlete] = useState<{ kg: number | null; sex: Sex }>({ kg: null, sex: "male" });
  const [detail, setDetail] = useState<Exercise | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const [{ data: profile }, { data: check }, { data: body }] = await Promise.all([
        supabase.from("profiles").select("sex").eq("id", data.user.id).maybeSingle(),
        supabase.from("daily_check_ins").select("weight_kg").eq("user_id", data.user.id)
          .not("weight_kg", "is", null).order("check_in_date", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("body_logs").select("weight_kg").eq("user_id", data.user.id)
          .not("weight_kg", "is", null).order("log_date", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (!active) return;
      setAthlete({
        kg: Number(check?.weight_kg ?? body?.weight_kg) || null,
        sex: profile?.sex === "female" ? "female" : "male",
      });
    });
    return () => { active = false; };
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return getExercisesForSport("all")
      .filter((ex) => ex.name.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name))
      .slice(0, 7);
  }, [query]);

  const weightKg = weight ? (unit === "kg" ? weight : weight / 2.2046226218) : null;
  const estimate = weightKg && reps ? estimate1RM(weightKg, reps) : null;
  const resolved = exercise ? resolveLift(exercise) : null;
  const converted = estimate && resolved ? resolved.convert(estimate) : null;
  const rank = converted && resolved && athlete.kg ? rankLift(resolved.lift, converted, athlete.kg, athlete.sex) : null;
  const selected = exercise ? getExerciseByName(exercise) : null;

  return (
    <>
      <Sheet label="What-if lift check" onClose={onClose}>
        <div className="space-y-4">
          <div>
            <div className="stat-label">What-if lift check</div>
            <h2 className="mt-1 text-2xl font-extrabold text-slate-100">Rate a set without logging it</h2>
            <p className="mt-1 text-sm text-slate-400">This preview never changes your workout, history or personal bests.</p>
          </div>

          <div>
            <span className="field-label">Exercise</span>
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); if (e.target.value !== exercise) setExercise(""); }}
              placeholder="Search the exercise library…"
              className="field"
              autoFocus
            />
            {!exercise && results.length > 0 && (
              <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.02] p-1">
                {results.map((ex) => (
                  <li key={ex.id}>
                    <button
                      type="button"
                      onClick={() => { setExercise(ex.name); setQuery(ex.name); }}
                      className="tap-target w-full rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/[0.06]"
                    >
                      {ex.name}<span className="ml-2 text-xs text-slate-500">{ex.muscles[0] ?? ex.category}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="field-label flex items-center justify-between gap-2">
                <span>Weight ({unit})</span>
                <span className="unit-toggle">
                  {(["kg", "lb"] as const).map((next) => (
                    <button
                      key={next}
                      type="button"
                      aria-pressed={unit === next}
                      onClick={() => {
                        if (next === unit) return;
                        setWeight((current) => current == null ? null : Math.round((next === "lb" ? current * 2.2046226218 : current / 2.2046226218) * 10) / 10);
                        setUnit(next);
                      }}
                    >
                      {next}
                    </button>
                  ))}
                </span>
              </span>
              <NumberInput decimal min={0} value={weight} onChange={setWeight} placeholder="e.g. 80" className="field" />
            </label>
            <label>
              <span className="field-label">Reps</span>
              <NumberInput min={1} max={100} value={reps} onChange={setReps} placeholder="e.g. 5" className="field" />
            </label>
          </div>

          <div className="rounded-2xl border border-pitch-400/20 bg-pitch-400/[0.06] p-4">
            <div className="stat-label">Preview</div>
            {estimate ? (
              <div className="mt-1">
                <div className="text-3xl font-extrabold tabular-nums text-accent-400">
                  {unit === "kg" ? `${estimate}kg` : `${Math.round(estimate * 2.2046226218)}lb`}
                  <span className="text-sm text-slate-400"> estimated 1RM</span>
                </div>
                {rank ? (
                  <p className="mt-1 text-sm text-slate-200">
                    Strength rating: <b style={{ color: rank.tier.color }}>{rank.tier.name}</b>
                    {rank.nextTier && rank.toNextKg != null ? ` · about ${rank.toNextKg}kg to ${rank.nextTier.name}` : " · top tier"}
                  </p>
                ) : resolved ? (
                  <p className="mt-1 text-xs text-slate-400">Add a bodyweight in today&apos;s log or Body to see the bodyweight-relative strength rating.</p>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">This movement has no published strength standard, so the honest result is the estimated 1RM only.</p>
                )}
              </div>
            ) : (
              <p className="mt-1 text-sm text-slate-400">Choose an exercise, weight and rep count.</p>
            )}
          </div>

          {selected && (
            <button type="button" onClick={() => setDetail(selected)} className="btn-ghost">
              View {selected.name} technique
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-primary">Close</button>
        </div>
      </Sheet>
      {detail && <ExerciseModal ex={detail} onClose={() => setDetail(null)} />}
    </>
  );
}
