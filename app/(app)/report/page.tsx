"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { assessReadiness } from "@/lib/readiness";
import { summarizeTrends } from "@/lib/trends";
import { computeACWR, weeklyReport, checkInStreak } from "@/lib/load";
import type { CheckInInput, DailyCheckIn, NutritionLog, Program, TrainingLog } from "@/lib/types";

export default function ReportPage() {
  const user = useCurrentUser();

  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const since = new Date(Date.now() - 28 * 86400_000).toISOString().slice(0, 10);
    const week = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const [{ data: profile }, { data: checks }, { data: training }, { data: nutrition }, { data: prog }] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      supabase.from("daily_check_ins").select("*").eq("user_id", user.id).gte("check_in_date", since).order("check_in_date", { ascending: true }),
      supabase.from("training_logs").select("*").eq("user_id", user.id).gte("log_date", since),
      supabase.from("nutrition_logs").select("*").eq("user_id", user.id).gte("log_date", since),
      supabase.from("programs").select("*").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const checkIns = (checks ?? []) as DailyCheckIn[];
    const weekChecks = checkIns.filter((c) => c.check_in_date >= week);
    return {
      name: (profile?.full_name as string | undefined)?.split(" ")[0] ?? "Athlete",
      checkIns, weekChecks,
      training: (training ?? []) as TrainingLog[],
      nutrition: (nutrition ?? []) as NutritionLog[],
      program: (prog ?? null) as Program | null,
    };
  }, [user.id]);

  if (loading) return <div className="card h-96 animate-pulse" />;
  if (!data || !data.checkIns.length) {
    return <p className="card px-4 py-10 text-center text-sm text-slate-400">Not enough data for a report yet — log a few check-ins first.</p>;
  }

  const { name, checkIns, weekChecks, training, nutrition, program } = data;
  const summary = summarizeTrends(checkIns);
  const report = weeklyReport(weekChecks, training, nutrition);
  const acwr = computeACWR(training);
  const streak = checkInStreak(checkIns.map((c) => c.check_in_date));

  const readinessScores = weekChecks.map((c) => assessReadiness(toInput(c)).score);
  const readinessAvg = readinessScores.length ? Math.round(readinessScores.reduce((a, b) => a + b, 0) / readinessScores.length) : 0;

  const adherence = program
    ? (() => {
        const total = program.plan.weeks.reduce((n, w) => n + w.sessions.length, 0);
        return total ? Math.round((program.completed_sessions.length / total) * 100) : 0;
      })()
    : null;

  const today = new Date();
  const start = new Date(Date.now() - 6 * 86400_000);
  const range = `${start.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${today.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="animate-fade-up space-y-5">
      <header className="no-print flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-slate-400 hover:text-pitch-400">← Back</Link>
        <button onClick={() => window.print()} className="btn-primary w-auto px-5">Save as PDF</button>
      </header>

      {/* The report sheet */}
      <div className="card-premium space-y-6 p-6 sm:p-8">
        <div className="flex items-start justify-between border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-pitch-400 to-pitch-600 text-sm font-black text-ink-900">A</span>
              <span className="text-lg font-extrabold">Fitness Guru</span>
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight">Weekly performance report</h1>
            <p className="text-sm text-slate-400">{name} · {range}</p>
          </div>
          <div className="text-right">
            <div className="gold-text text-4xl font-extrabold">{readinessAvg}</div>
            <div className="stat-label">Avg readiness</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Sessions" value={`${report.sessions}`} />
          <Kpi label="Check-ins" value={`${report.checkIns}/7`} />
          <Kpi label="Load (ACWR)" value={acwr.ratio != null ? `${acwr.ratio}` : "—"} />
          <Kpi label="Streak" value={`${streak}🔥`} />
          <Kpi label="Avg sleep" value={summary.avgSleep != null ? `${summary.avgSleep}/10` : "—"} />
          <Kpi label="Weight Δ" value={summary.weightDeltaKg == null ? "—" : `${summary.weightDeltaKg > 0 ? "+" : ""}${summary.weightDeltaKg}kg`} />
          {adherence != null && <Kpi label="Program" value={`${adherence}%`} />}
          <Kpi label="Load trend" value={report.loadTrend === "up" ? "↗ up" : report.loadTrend === "down" ? "↘ down" : "→ flat"} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-readiness-green/20 bg-readiness-green/[0.06] p-4">
            <div className="stat-label text-readiness-green">🏆 Top win</div>
            <p className="mt-1 text-sm text-slate-200">{report.topWin}</p>
          </div>
          <div className="rounded-2xl border border-pitch-400/20 bg-pitch-400/[0.06] p-4">
            <div className="stat-label text-pitch-400">🎯 Focus next week</div>
            <p className="mt-1 text-sm text-slate-200">{report.focus}</p>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Generated by Fitness Guru from {checkIns.length} check-ins and {training.length} logged sessions over the last 4 weeks.
          Load status: {acwr.message}
        </p>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-4 text-center">
      <div className="text-2xl font-extrabold text-slate-100">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function toInput(c: DailyCheckIn): CheckInInput {
  return {
    pain_map: c.pain_map ?? {},
    fatigue_score: c.fatigue_score,
    sleep_quality: c.sleep_quality,
    nutrition_quality: c.nutrition_quality,
    weight_kg: c.weight_kg,
    is_match_day: c.is_match_day,
    match_minutes_played: c.match_minutes_played,
  };
}
