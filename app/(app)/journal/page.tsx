"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { JournalForm } from "@/components/JournalForm";
import { CheckInDone } from "@/components/CheckInDone";
import { checkInStreak, computeACWR } from "@/lib/load";
import { readinessFor } from "@/lib/readiness";
import { adjustForReadiness, type ReadinessStatus } from "@/lib/engine";
import { applySwaps, type SwapMap } from "@/lib/exercise-match";
import { nextSession } from "@/lib/next-session";
import { applyRehabToSession, parseDose, type RehabPlanRow } from "@/lib/rehab-plan";
import type { ProgramPlan } from "@/lib/coach";
import { WearableImport } from "@/components/WearableImport";
import { WearableConnect } from "@/components/WearableConnect";
import type { TrainingState } from "@/components/TrainingLogInput";
import type { Biometric } from "@/lib/biometrics";
import type { CheckInInput, TrainingDrill, TrainingLog } from "@/lib/types";
import { todayLocal, daysAgoLocal } from "@/lib/day";
import { measuredTrainingFields } from "@/lib/exercise-measure";

export default function JournalPage() {
  const user = useCurrentUser();
  // todayLocal(), not toISOString() — see lib/day.ts. My version of this line
  // was the UTC form their change exists to remove.
  const today = todayLocal();
  const [editing, setEditing] = useState(false);

  const { data, loading, reload } = useAsync(async () => {
    const supabase = createClient();
    // 60 days is far more than any streak this app displays, and today's
    // check-in is in the window by definition — so the streak costs one extra
    // parallel query returning dates only, not a scan of the whole table.
    const since60 = daysAgoLocal(59);
    const since28 = daysAgoLocal(27);
    const [{ data: existing }, { data: training }, { data: bio }, { data: profile }, { data: program }, { data: recent }, { data: recentTraining }, { data: rehab }] = await Promise.all([
      supabase.from("daily_check_ins").select("*").eq("user_id", user.id).eq("check_in_date", today).maybeSingle(),
      supabase.from("training_logs").select("*").eq("user_id", user.id).eq("log_date", today).maybeSingle(),
      supabase.from("biometrics").select("*").eq("user_id", user.id).eq("metric_date", today).maybeSingle(),
      supabase.from("profiles").select("sport, distance_unit").eq("id", user.id).maybeSingle(),
      supabase.from("programs").select("plan, completed_sessions, swaps").eq("user_id", user.id).eq("status", "active").maybeSingle(),
      supabase.from("daily_check_ins").select("check_in_date").eq("user_id", user.id).gte("check_in_date", since60),
      /**
       * The SAME query Home runs for ACWR, on purpose.
       *
       * assessReadiness takes training load as context because a score built
       * from sleep and soreness alone will call you Green on the back of a load
       * spike you can't feel. Scoring today here WITHOUT that context would put
       * a different number on this page than Home shows for the identical day —
       * the app contradicting itself, which is the specific complaint
       * LoadContext was added to fix. Keep these two queries in step.
       */
      supabase.from("training_logs").select("log_date, total_minutes, duration_seconds, intensity, drills, contact_minutes, distance_km, session_type")
        .eq("user_id", user.id).gte("log_date", since28),
      /**
       * THE REHAB PLAN THEY ARE ON.
       *
       * A generated plan used to live only on the injury page, so an athlete
       * three weeks into a hamstring protocol was still handed sprint work to
       * log and had to remember their rehab exercises separately. See
       * lib/rehab-plan.ts — it both adds the stage's work and removes what the
       * stage says to avoid.
       */
      supabase.from("rehab_plans").select("*").eq("user_id", user.id).eq("active", true)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    /**
     * TODAY'S SESSION AS /COACH ACTUALLY PRESCRIBED IT.
     *
     * This read the raw plan, and /coach reads the plan with three corrections
     * applied — readiness easing, the athlete's swaps, and the rehab stage. So
     * the two pages disagreed about the same session on the same morning: the
     * plan page showed a Yellow day eased to 3 sets and the check-in offered
     * the original 4 to log. Whichever number you trusted, the app was
     * contradicting itself, and the set count you were handed to log was one
     * you had been told not to do.
     *
     * Same order as /coach — swaps first, rehab last — because the reasoning
     * is the same reasoning. See the note there.
     */
    const session = nextSession(
      (program as { plan?: ProgramPlan } | null)?.plan ?? null,
      (program as { completed_sessions?: string[] } | null)?.completed_sessions ?? []
    );
    const readiness = readinessFor(
      existing as { pain_map?: Record<string, number> | null } | null,
      computeACWR((recentTraining ?? []) as unknown as TrainingLog[]).ratio,
    );
    const eased = session
      ? adjustForReadiness(session.session, (readiness?.status as ReadinessStatus) ?? "Green")
      : null;
    // Flattened back to the log shape AFTER the corrections, so the sets on
    // offer are the sets that were actually prescribed today.
    const planned = applySwaps(
      (eased?.drills ?? []).map((d) => ({
        name: d.name, sets: d.sets, load_kg: null,
        ...measuredTrainingFields(d.name, d.reps, d.prescription),
      })) as TrainingDrill[],
      ((program as { swaps?: SwapMap } | null)?.swaps ?? {}) as SwapMap,
    );
    const rehabbed = applyRehabToSession<TrainingDrill>(
      planned,
      rehab as RehabPlanRow | null,
      (e) => {
        const parsed = parseDose(e.dose);
        return { name: e.name, sets: parsed.sets, load_kg: null, ...measuredTrainingFields(e.name, parsed.reps, e.dose) };
      },
    );
    return {
      existing,
      streak: checkInStreak(((recent ?? []) as { check_in_date: string }[]).map((r) => r.check_in_date)),
      acwr: computeACWR((recentTraining ?? []) as unknown as TrainingLog[]).ratio,
      // The same 28 days the ACWR is built from, handed on so the form can
      // pre-fill a drill with what it actually was last time. No extra query —
      // this data was already on the page and only being counted.
      recentTraining: (recentTraining ?? []) as unknown as TrainingLog[],
      training: (training ?? null) as TrainingLog | null,
      bio: (bio ?? null) as Biometric | null,
      sport: (profile as { sport?: string } | null)?.sport ?? "football",
      distanceUnit: ((profile as { distance_unit?: string } | null)?.distance_unit === "mi" ? "mi" : "km") as "km" | "mi",
      // Today's scheduled drills, so logging is a tap rather than retyping
      // names the program already knows — with the rehab plan already applied.
      planned: rehabbed.drills,
      rehabNote: rehabbed.note,
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
    ? {
        drills: data.training.drills ?? [], total_minutes: data.training.total_minutes, intensity: data.training.intensity,
        duration_seconds: data.training.duration_seconds,
        distance_km: data.training.distance_km, distance_value: data.training.distance_value,
        distance_unit: data.training.distance_unit, contact_minutes: data.training.contact_minutes,
        run_type: data.training.run_type, zone: data.training.zone, avg_hr: data.training.avg_hr,
        intervals: data.training.intervals, interval_seconds: data.training.interval_seconds,
        recovery_seconds: data.training.recovery_seconds,
        session_type: data.training.session_type ?? "workout", notes: data.training.notes,
      }
    : undefined;

  const done = !!checkIn;
  // Did anything actually arrive from a watch today? Decides whether the row
  // below offers to set one up or confirms it already worked.
  const hasBio = !!(data?.bio && (data.bio.hrv_ms != null || data.bio.resting_hr != null || data.bio.sleep_hours != null));

  return (
    <div className="animate-fade-up mx-auto max-w-2xl">
      <header className="mb-5">
        {/* Heading stays "Check in" even when done — it must match the nav
            label that leads here, which a test enforces. The done state is
            carried by the card below, not by renaming the page out from under
            the person who just tapped "Check in" to find it. */}
        <h1 className="text-3xl font-extrabold tracking-tight">Check in</h1>
        <p className="mt-1 text-sm text-slate-400">
          {done ? "You're done for today — here's what it means." : "Log how your body feels today."}
        </p>
      </header>

      {done && initial && (
        <CheckInDone
          checkIn={initial}
          training={data?.training ?? null}
          streak={data?.streak ?? 0}
          acwr={data?.acwr ?? null}
          editing={editing}
          onEdit={() => setEditing((v) => !v)}
          onAddTraining={() => {
            setEditing(true);
            // The form mounts in the same tick, so the scroll has to wait for
            // it to exist. Without the deferral this silently does nothing.
            requestAnimationFrame(() =>
              document.getElementById("training")?.scrollIntoView({ behavior: "smooth", block: "start" })
            );
          }}
        />
      )}

      {/* Once checked in, the form is opt-in. It stays MOUNTED-on-demand rather
          than hidden with CSS so the draft-restore effect inside it doesn't run
          and overwrite what was just saved. */}
      {(!done || editing) && (
        <div className={done ? "mt-5" : undefined}>
          {/* WHY TODAY'S SESSION LOOKS DIFFERENT.
              A session that quietly gains three band exercises and loses its
              sprints is indistinguishable from a bug. Naming what changed and
              what changed it is the difference between the app looking broken
              and the app looking like it was paying attention. */}
          {data?.rehabNote && (
            <p className="mb-3 rounded-2xl border border-pitch-400/25 bg-pitch-400/[0.06] px-4 py-3 text-sm text-slate-200">
              🩹 {data.rehabNote}
            </p>
          )}
          <JournalForm initial={initial} initialTraining={initialTraining} sport={data?.sport} distanceUnit={data?.distanceUnit ?? "km"} planned={data?.planned ?? []} history={data?.recentTraining ?? []} />
        </div>
      )}

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
