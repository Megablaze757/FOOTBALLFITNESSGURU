"use client";

import { BackLink } from "@/components/BackLink";
import { EmptyState } from "@/components/EmptyState";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { Logo } from "@/components/Logo";
import { assessReadiness } from "@/lib/readiness";
import { summarizeTrends } from "@/lib/trends";
import { computeACWR, weeklyReport, checkInStreak, type LoadZone } from "@/lib/load";

import type { CheckInInput, DailyCheckIn, NutritionLog, Program, TrainingLog } from "@/lib/types";
import { daysAgoLocal } from "@/lib/day";
import { isActivity } from "@/lib/training-duration";

/**
 * Plain words for the load zones, matching Progress exactly.
 *
 * Duplicated deliberately rather than exported from the dashboard page: a page
 * component is not a module to import from, and the alternative — a raw ratio
 * labelled with an acronym — is what this replaces.
 */
const ZONE_LABEL: Record<LoadZone, string> = {
  building: "Building baseline",
  detraining: "Detraining",
  optimal: "Sweet spot",
  caution: "Climbing",
  danger: "Spike — risk",
};


export default function ReportPage() {
  const user = useCurrentUser();

  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const since = daysAgoLocal(28);
    const week = daysAgoLocal(7);
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
  }, [user.id], `report:${user.id}`);

  if (loading) return <div className="card h-96 animate-pulse" />;
  /* This branch used to be one grey sentence in a card — and because the only
     <h1> on this page lives inside the report sheet, a new athlete got a page
     with no heading at all: nothing named it in the tab, nothing for a screen
     reader to land on, and no way to reach the thing that would fill it. */
  if (!data || !data.checkIns.length) {
    return (
      <div className="animate-fade-up space-y-5">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-extrabold tracking-tight">Weekly report</h1>
          <BackLink href="/dashboard" label="Progress" />
        </header>
        <div className="card">
          <EmptyState
            icon="📄"
            title="Not enough logged for a report yet"
            body="The report is built entirely from your check-ins — nothing on it is estimated. A few days of them and there's a one-page summary here to show a coach, physio or parent."
            action={{ label: "Check in now", href: "/journal" }}
          />
        </div>
      </div>
    );
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
        <BackLink href="/dashboard" label="Progress" />
        <button onClick={() => window.print()} className="btn-primary w-auto px-5">Save as PDF</button>
      </header>

      {/* Says what the sheet is for. The page opened with a back link and a print
          button and left you to work out why you'd want either — and the only
          heading was inside the printable area, so nothing on screen explained
          the page itself. Hidden from the print, which speaks for itself. */}
      <p className="no-print max-w-prose text-sm text-slate-400">
        A one-page summary to show a coach, a physio or a parent. Everything on it comes from what
        you logged this week — nothing is estimated or filled in.
      </p>

      {/* The report sheet */}
      <div className="card-premium space-y-6 p-6 sm:p-8">
        <div className="flex items-start justify-between border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <Logo size={32} />
              <span className="text-lg font-extrabold">PocketAthlete</span>
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
          {/* The ratio on its own is a number nobody can act on, and the
              acronym is worse. The zone is the answer — the same wording
              Progress uses, so the two pages don't describe the same figure in
              two different vocabularies. */}
          <Kpi label="Training load" value={acwr.ratio != null ? ZONE_LABEL[acwr.zone] : "—"} />
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
          Generated by PocketAthlete from {checkIns.length} check-ins and {training.filter(isActivity).length} logged sessions over the last 4 weeks.
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
