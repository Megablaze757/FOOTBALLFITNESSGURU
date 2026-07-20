"use client";

import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { JournalForm } from "@/components/JournalForm";
import { WearableImport } from "@/components/WearableImport";
import type { TrainingState } from "@/components/TrainingLogInput";
import type { Biometric } from "@/lib/biometrics";
import type { CheckInInput, TrainingLog } from "@/lib/types";

export default function JournalPage() {
  const user = useCurrentUser();
  const today = new Date().toISOString().slice(0, 10);

  const { data, loading, reload } = useAsync(async () => {
    const supabase = createClient();
    const [{ data: existing }, { data: training }, { data: bio }] = await Promise.all([
      supabase.from("daily_check_ins").select("*").eq("user_id", user.id).eq("check_in_date", today).maybeSingle(),
      supabase.from("training_logs").select("*").eq("user_id", user.id).eq("log_date", today).maybeSingle(),
      supabase.from("biometrics").select("*").eq("user_id", user.id).eq("metric_date", today).maybeSingle(),
    ]);
    return { existing, training: (training ?? null) as TrainingLog | null, bio: (bio ?? null) as Biometric | null };
  }, [user.id], `journal:${user.id}`);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-white/5" />
        <div className="card h-96 animate-pulse" />
      </div>
    );
  }

  const checkIn = data?.existing;
  const initial: Partial<CheckInInput> | undefined = checkIn
    ? {
        pain_map: checkIn.pain_map ?? {},
        fatigue_score: checkIn.fatigue_score,
        sleep_quality: checkIn.sleep_quality,
        nutrition_quality: checkIn.nutrition_quality,
        weight_kg: checkIn.weight_kg,
        is_match_day: checkIn.is_match_day,
        match_minutes_played: checkIn.match_minutes_played,
      }
    : undefined;

  const initialTraining: TrainingState | undefined = data?.training
    ? { drills: data.training.drills ?? [], total_minutes: data.training.total_minutes, intensity: data.training.intensity }
    : undefined;

  return (
    <div className="animate-fade-up mx-auto max-w-2xl">
      <header className="mb-5">
        <h1 className="text-3xl font-extrabold tracking-tight">Daily check-in</h1>
        <p className="mt-1 text-sm text-slate-400">
          {checkIn ? "Already logged today — edit and resubmit anytime." : "Log how your body feels today."}
        </p>
      </header>
      <JournalForm initial={initial} initialTraining={initialTraining} />

      <div className="mt-5">
        <WearableImport
          userId={user.id}
          today={today}
          initial={data?.bio ? { hrv_ms: data.bio.hrv_ms, resting_hr: data.bio.resting_hr, sleep_hours: data.bio.sleep_hours } : undefined}
          onSaved={reload}
        />
      </div>
    </div>
  );
}
