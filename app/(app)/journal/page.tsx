"use client";

import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { JournalForm } from "@/components/JournalForm";
import { nextSession } from "@/lib/next-session";
import type { ProgramPlan } from "@/lib/coach";
import { WearableImport } from "@/components/WearableImport";
import { WearableConnect } from "@/components/WearableConnect";
import type { TrainingState } from "@/components/TrainingLogInput";
import type { Biometric } from "@/lib/biometrics";
import type { CheckInInput, TrainingLog } from "@/lib/types";
import { todayLocal } from "@/lib/day";

export default function JournalPage() {
  const user = useCurrentUser();
  const today = todayLocal();

  const { data, loading, reload } = useAsync(async () => {
    const supabase = createClient();
    const [{ data: existing }, { data: training }, { data: bio }, { data: profile }, { data: program }] = await Promise.all([
      supabase.from("daily_check_ins").select("*").eq("user_id", user.id).eq("check_in_date", today).maybeSingle(),
      supabase.from("training_logs").select("*").eq("user_id", user.id).eq("log_date", today).maybeSingle(),
      supabase.from("biometrics").select("*").eq("user_id", user.id).eq("metric_date", today).maybeSingle(),
      supabase.from("profiles").select("sport").eq("id", user.id).maybeSingle(),
      supabase.from("programs").select("plan, completed_sessions").eq("user_id", user.id).eq("status", "active").maybeSingle(),
    ]);
    return {
      existing,
      training: (training ?? null) as TrainingLog | null,
      bio: (bio ?? null) as Biometric | null,
      sport: (profile as { sport?: string } | null)?.sport ?? "football",
      // Today's scheduled drills, so logging is a tap rather than retyping
      // names the program already knows.
      planned: nextSession(
        (program as { plan?: ProgramPlan } | null)?.plan ?? null,
        (program as { completed_sessions?: string[] } | null)?.completed_sessions ?? []
      )?.drills ?? [],
    };
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

  // Did anything actually arrive from a watch today? Decides whether the row
  // below offers to set one up or confirms it already worked.
  const hasBio = !!(data?.bio && (data.bio.hrv_ms != null || data.bio.resting_hr != null || data.bio.sleep_hours != null));

  return (
    <div className="animate-fade-up mx-auto max-w-2xl">
      <header className="mb-5">
        <h1 className="text-3xl font-extrabold tracking-tight">Check in</h1>
        <p className="mt-1 text-sm text-slate-400">
          {checkIn ? "Already logged today — edit and resubmit anytime." : "Log how your body feels today."}
        </p>
      </header>
      <JournalForm initial={initial} initialTraining={initialTraining} sport={data?.sport} planned={data?.planned ?? []} />

      {/* WHY THIS IS BEHIND A DISCLOSURE NOW.
       *
       * Both wearable blocks used to sit open under the form, and together they
       * were about sixty percent of the page — on the one screen an athlete
       * opens every single morning. Worse, the manual entry card carries its own
       * full-width gold "Save today" button, so the daily screen had TWO primary
       * actions of identical weight, the second one *below* the real one. The
       * eye reads the last big button as the finish line, which is exactly the
       * wrong thing here.
       *
       * Connecting a watch is a thing you do once. Typing HRV in by hand is a
       * thing you do only if you have no watch. Neither is the daily job, so
       * neither gets daily-job real estate. One row, one tap, and the check-in
       * now ends where the check-in ends.
       *
       * The summary says whether anything arrived, so a connected athlete can
       * confirm last night synced without opening it. */}
      <details className="card group mt-5 overflow-hidden">
        <summary className="tap-target flex w-full cursor-pointer list-none items-center gap-3 p-4 text-left">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-lg" aria-hidden>⌚</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-100">Sleep &amp; HRV from a watch</span>
            <span className="block text-xs text-slate-500">
              {hasBio
                ? "Synced for today — tap to check or change it."
                : "Connect Oura, Whoop, Garmin or Apple Health, or type it in."}
            </span>
          </span>
          <span className="shrink-0 text-xs text-slate-500 transition group-open:rotate-180" aria-hidden>▾</span>
        </summary>
        {/* Connecting comes FIRST, then the manual fallback. Someone typing HRV
            into a box every morning is the person most worth showing that they
            don't have to. */}
        <div className="space-y-5 border-t border-white/[0.08] p-4">
          <WearableConnect userId={user.id} />
          <WearableImport
            userId={user.id}
            today={today}
            initial={data?.bio ? { hrv_ms: data.bio.hrv_ms, resting_hr: data.bio.resting_hr, sleep_hours: data.bio.sleep_hours } : undefined}
            onSaved={reload}
          />
        </div>
      </details>
    </div>
  );
}
