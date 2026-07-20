"use client";

import { invalidate } from "@/lib/use-async";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { assessReadiness } from "@/lib/readiness";
import { BodyMap } from "@/components/BodyMap";
import { ReadinessGauge } from "@/components/ReadinessGauge";
import { TrainingLogInput, type TrainingState } from "@/components/TrainingLogInput";
import type { CheckInInput, PainMap, ReadinessResult } from "@/lib/types";

export function JournalForm({ initial, initialTraining }: { initial?: Partial<CheckInInput>; initialTraining?: TrainingState }) {
  const router = useRouter();

  const [painMap, setPainMap] = useState<PainMap>(initial?.pain_map ?? {});
  const [fatigue, setFatigue] = useState(initial?.fatigue_score ?? 5);
  const [sleep, setSleep] = useState(initial?.sleep_quality ?? 7);
  const [nutrition, setNutrition] = useState(initial?.nutrition_quality ?? 6);
  const [weight, setWeight] = useState<string>(initial?.weight_kg?.toString() ?? "");
  const [isMatchDay, setIsMatchDay] = useState(initial?.is_match_day ?? false);
  const [minutes, setMinutes] = useState<string>(initial?.match_minutes_played?.toString() ?? "0");
  const [training, setTraining] = useState<TrainingState>(initialTraining ?? { drills: [], total_minutes: null, intensity: null });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReadinessResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Not signed in.");
      setSaving(false);
      return;
    }

    const input: CheckInInput = {
      pain_map: painMap,
      fatigue_score: fatigue,
      sleep_quality: sleep,
      nutrition_quality: nutrition,
      weight_kg: weight ? Number(weight) : null,
      is_match_day: isMatchDay,
      match_minutes_played: isMatchDay ? Number(minutes) || 0 : 0,
    };

    const { error: dbError } = await supabase
      .from("daily_check_ins")
      .upsert(
        { user_id: user.id, check_in_date: new Date().toISOString().slice(0, 10), ...input },
        { onConflict: "user_id,check_in_date" }
      );

    if (dbError) {
      setError(dbError.message);
      setSaving(false);
      return;
    }

    // Persist today's training (drills/volume) for history + AI progression.
    const cleanDrills = training.drills.filter((d) => d.name.trim());
    if (cleanDrills.length || training.total_minutes || training.intensity) {
      await supabase.from("training_logs").upsert(
        {
          user_id: user.id,
          log_date: new Date().toISOString().slice(0, 10),
          drills: cleanDrills,
          total_minutes: training.total_minutes,
          intensity: training.intensity,
        },
        { onConflict: "user_id,log_date" }
      );
    }

    // A check-in changes readiness on Home, Stats and Coach — drop the cached
    // page data so they refetch fresh rather than showing pre-check-in values.
    invalidate();
    // Readiness is computed client-side from the pure engine (also feeds Home).
    setResult(assessReadiness(input));
    setSaving(false);
  }

  if (result) {
    return (
      <div className="card animate-scale-in space-y-5 p-6 text-center">
        <h2 className="text-sm font-bold uppercase tracking-wider text-pitch-400">Today&apos;s readiness</h2>
        <ReadinessGauge score={result.score} status={result.status} />
        <p className="rounded-2xl bg-white/[0.04] p-4 text-left text-sm text-slate-200">{result.advice}</p>
        <button onClick={() => router.push("/home")} className="btn-primary">Go to dashboard</button>
        <button onClick={() => setResult(null)} className="text-sm text-slate-400 hover:text-pitch-400">
          Edit today&apos;s entry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="card p-5">
        <h2 className="field-label">Where does it hurt?</h2>
        <BodyMap value={painMap} onChange={setPainMap} />
      </section>

      <div className="card space-y-5 p-5">
        <MetricSlider label="Fatigue" hint="1 fresh · 10 spent" value={fatigue} onChange={setFatigue} />
        <MetricSlider label="Sleep quality" hint="1 poor · 10 great" value={sleep} onChange={setSleep} />
        <MetricSlider label="Nutrition" hint="1 poor · 10 great" value={nutrition} onChange={setNutrition} />

        <label className="block">
          <span className="field-label">Weight (kg)</span>
          <input type="number" step="0.1" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="optional" className="field" />
        </label>

        <div className="rounded-2xl bg-white/[0.03] p-4">
          <label className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200">Match today?</span>
            <input type="checkbox" checked={isMatchDay} onChange={(e) => setIsMatchDay(e.target.checked)} className="h-5 w-5 accent-pitch-500" />
          </label>
          {isMatchDay && (
            <label className="mt-3 block">
              <span className="field-label">Minutes played</span>
              <input type="number" min={0} max={120} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="field" />
            </label>
          )}
        </div>
      </div>

      <section className="card p-5">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="field-label !mb-0">Today&apos;s training</h2>
          <span className="chip text-pitch-400">drills logged to history</span>
        </div>
        <TrainingLogInput value={training} onChange={setTraining} />
      </section>

      {error && <p className="text-sm text-readiness-red">{error}</p>}

      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? "Saving…" : "Submit check-in"}
      </button>
    </form>
  );
}

function MetricSlider({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <span className="text-xs text-slate-500">{hint}</span>
      </div>
      <div className="flex items-center gap-3">
        <input type="range" min={1} max={10} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
        <span className="w-7 rounded-lg bg-white/[0.06] py-1 text-center text-sm font-bold tabular-nums text-pitch-400">{value}</span>
      </div>
    </label>
  );
}
