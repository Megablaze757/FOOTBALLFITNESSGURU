"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { assessReadiness } from "@/lib/readiness";
import { computeACWR, type LoadZone } from "@/lib/load";
import { ReadinessGauge } from "@/components/ReadinessGauge";
import { MessageThread } from "@/components/MessageThread";
import type { DailyCheckIn, Program, TrainingLog } from "@/lib/types";
import { daysAgoLocal, todayLocal } from "@/lib/day";

const ZONE: Record<LoadZone, { label: string; color: string }> = {
  building: { label: "Building", color: "#94a3b8" },
  detraining: { label: "Detraining", color: "#38bdf8" },
  optimal: { label: "Sweet spot", color: "#34d399" },
  caution: { label: "Climbing", color: "#fbbf24" },
  danger: { label: "Spike — risk", color: "#fb5d6b" },
};

export default function SquadAthletePage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const user = useCurrentUser();
  const athleteId = useSearchParams().get("id") ?? "";
  const today = todayLocal();

  const { data, loading } = useAsync(async () => {
    const supabase = createClient(); // coach-read RLS scopes these to the coach's athletes
    const since = daysAgoLocal(28);
    const [{ data: profile }, { data: checkIn }, { data: program }, { data: training }] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", athleteId).maybeSingle(),
      supabase.from("daily_check_ins").select("*").eq("user_id", athleteId).eq("check_in_date", today).maybeSingle(),
      supabase.from("programs").select("*").eq("user_id", athleteId).eq("status", "active").maybeSingle(),
      supabase.from("training_logs").select("*").eq("user_id", athleteId).gte("log_date", since),
    ]);
    return {
      name: profile?.full_name ?? "Athlete",
      checkIn: (checkIn ?? null) as DailyCheckIn | null,
      program: (program ?? null) as Program | null,
      training: (training ?? []) as TrainingLog[],
    };
  }, [athleteId]);

  if (loading) return <div className="card mt-6 h-64 animate-pulse" />;
  if (!data) return <p className="card px-4 py-8 text-center text-sm text-slate-400">Athlete not found.</p>;

  const acwr = computeACWR(data.training);
  const zone = ZONE[acwr.zone];
  // Load goes IN to the verdict. Without it this page showed a coach a green
  // readiness gauge directly above a red training-load card and left them to
  // reconcile the two — the same contradiction that was fixed on Home and the
  // plan page, still live on the one screen where someone else's health is the
  // decision being made.
  const readiness = data.checkIn ? assessReadiness({
    pain_map: data.checkIn.pain_map ?? {}, fatigue_score: data.checkIn.fatigue_score, sleep_quality: data.checkIn.sleep_quality,
    nutrition_quality: data.checkIn.nutrition_quality, weight_kg: data.checkIn.weight_kg, is_match_day: data.checkIn.is_match_day, match_minutes_played: data.checkIn.match_minutes_played,
  }, { acwr: acwr.ratio }) : null;
  const prog = data.program;
  const total = prog ? prog.plan.weeks.reduce((n, w) => n + w.sessions.length, 0) : 0;

  return (
    <div className="animate-fade-up mx-auto max-w-3xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{data.name}</h1>
          <p className="text-sm text-slate-400">Coach view · read-only</p>
        </div>
        <Link href="/squad" className="text-sm text-slate-400 hover:text-pitch-400">← Squad</Link>
      </header>

      {/* What a coach should actually do about this athlete, before the numbers
          they'd have to interpret themselves. A squad of twenty is twenty of
          these pages, and nobody reads twenty gauges. */}
      <CoachVerdict readiness={readiness} acwr={acwr} name={data.name.split(" ")[0]} />

      {readiness ? (
        <div className="card p-6 pt-8"><ReadinessGauge score={readiness.score} status={readiness.status} /></div>
      ) : (
        <div className="card px-4 py-6 text-center text-sm text-slate-500">No check-in today.</div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="stat-label">Training load</div>
          <div className="mt-1 text-2xl font-extrabold" style={{ color: zone.color }}>{acwr.ratio ?? "—"}</div>
          <div className="text-xs" style={{ color: zone.color }}>{zone.label}</div>
        </div>
        <div className="card p-4">
          <div className="stat-label">Program</div>
          <div className="mt-1 text-sm font-bold capitalize text-slate-100">{prog?.goal_type ?? "none"}</div>
          {prog && <div className="text-xs text-slate-400">{prog.completed_sessions.length}/{total} sessions · Block {prog.block}</div>}
        </div>
      </div>

      {readiness && (
        <div className="card p-5">
          <h2 className="field-label">Today&apos;s guidance</h2>
          <p className="text-sm text-slate-200">{readiness.advice}</p>
          {readiness.focus_body_part && <div className="chip mt-2 text-readiness-red">⚠️ Watch zone: {readiness.focus_body_part}</div>}
        </div>
      )}

      <MessageThread coachId={user.id} athleteId={athleteId} meId={user.id} otherName={data.name.split(" ")[0]} />
    </div>
  );
}

/**
 * One line telling the coach what to do, in priority order.
 *
 * Deliberately advisory, never diagnostic — a coach is not their athlete's
 * physio, and "hold them out" is a decision for the athlete and whoever is
 * treating them. So this reports what the data says and suggests a
 * conversation, rather than issuing a clearance.
 */
function CoachVerdict({ readiness, acwr, name }: {
  readiness: { status: string; focus_body_part: string | null } | null;
  acwr: { zone: string; ratio: number | null };
  name: string;
}) {
  const v = !readiness
    ? {
        tone: "#94a3b8",
        eyebrow: "No data today",
        text: `${name} hasn't checked in today, so there's nothing current to go on. Everything below is from their last entry.`,
      }
    : acwr.zone === "danger" && acwr.ratio != null
      ? {
          tone: "#fb5d6b",
          eyebrow: "Load spike",
          text: `${name}'s week is ${Math.round((acwr.ratio - 1) * 100)}% above their four-week average. Worth easing their volume off before it becomes an injury.`,
        }
      : readiness.status === "Red"
        ? {
            tone: "#fb5d6b",
            eyebrow: "Flagging",
            text: readiness.focus_body_part
              ? `${name} has reported their ${readiness.focus_body_part} as a problem. Worth a conversation before the next session.`
              : `${name} is reporting poor recovery. Worth a conversation before the next session.`,
          }
        : readiness.status === "Yellow"
          ? {
              tone: "#fbbf24",
              eyebrow: "Manage today",
              text: `${name} is partly recovered. Their session has already been eased automatically — no action needed unless they say otherwise.`,
            }
          : {
              tone: "#34d399",
              eyebrow: "Good to go",
              text: `${name} is recovered and their load is where it should be. Nothing needs doing.`,
            };

  return (
    <div className="card border-l-4 p-4" style={{ borderLeftColor: v.tone }}>
      <span className="eyebrow" style={{ color: v.tone }}>{v.eyebrow}</span>
      <p className="mt-1 max-w-prose text-sm text-slate-200">{v.text}</p>
    </div>
  );
}
