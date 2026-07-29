"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Tabs } from "@/components/Tabs";
import { ProgressPanel } from "@/components/ProgressPanel";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { summarizeTrends, type Trend } from "@/lib/trends";
import { resolveInsight, actionLabel } from "@/lib/insights";
import { computeACWR, weeklyReport, type LoadZone } from "@/lib/load";
import { sportProfile, type SportProfile } from "@/lib/sport-profile";
import { TrendChart } from "@/components/TrendChart";
import type { DailyCheckIn, DailyInsight, NutritionLog, TrainingLog } from "@/lib/types";

const ZONE_META: Record<LoadZone, { label: string; color: string }> = {
  building: { label: "Building baseline", color: "#94a3b8" },
  detraining: { label: "Detraining", color: "#38bdf8" },
  optimal: { label: "Sweet spot", color: "#34d399" },
  caution: { label: "Climbing", color: "#fbbf24" },
  danger: { label: "Spike — risk", color: "#fb5d6b" },
};

const TREND_META: Record<Trend, { label: string; icon: string; color: string }> = {
  improving: { label: "Improving", icon: "↗", color: "#34d399" },
  stable: { label: "Stable", icon: "→", color: "#94a3b8" },
  declining: { label: "Declining", icon: "↘", color: "#fb5d6b" },
};

function riskColor(risk: number): string {
  if (risk < 0.3) return "#34d399";
  if (risk < 0.55) return "#fbbf24";
  return "#fb5d6b";
}

/**
 * The one thing to take away, above the twelve cards that support it.
 *
 * This page showed an injury-risk percentage, a fatigue trend, average sleep,
 * weight change, an acute:chronic ratio with a band chart, a 14-day trend
 * chart, a weekly report and four links — all the same size, with no primary
 * action anywhere. Every number was real and the page still didn't answer the
 * question people open it with, which is "so what do I do?".
 *
 * Ordered by what actually matters, and it is a strict order: a load spike
 * outranks a sore knee outranks a nice trend, because that's the sequence in
 * which these things injure you. Only one shows at a time — a "most important
 * thing" section with three entries is just the old page again.
 */
function Verdict({ acwr, riskScore, focusBodyPart, topWin, sport }: {
  acwr: { zone: LoadZone; ratio: number | null };
  riskScore: number;
  focusBodyPart: string | null;
  topWin: string;
  sport: SportProfile;
}) {
  // Sport-specific words for the same instruction. "Cut your mileage back" is
  // advice; "reduce volume" is a textbook.
  const easeOff = sport.id === "running"
    ? "Cut this week's mileage by about a fifth and keep the easy runs easy."
    : sport.id === "weightlifting"
      ? "Hold the weight where it is and drop a set or two per session."
      : "Keep the intensity and take a set or two off each session.";

  const verdict =
    acwr.zone === "danger" && acwr.ratio != null
      ? {
          tone: "#fb5d6b",
          eyebrow: "Worth acting on",
          headline: `You've trained ${Math.round((acwr.ratio - 1) * 100)}% more than your four-week average`,
          body: `That jump is the single biggest injury predictor here, and it doesn't feel like anything until it does. ${easeOff}`,
        }
      : riskScore >= 0.55
        ? {
            tone: "#fbbf24",
            eyebrow: "Keep an eye on this",
            headline: focusBodyPart ? `Your ${focusBodyPart} is the weak link` : "Injury risk is elevated",
            body: "Built from your own sleep, soreness and load over the last two weeks — not a generic table. Warm it up properly and stop if it talks back.",
          }
        : acwr.zone === "detraining"
          ? {
              tone: "#38bdf8",
              eyebrow: "Room to push",
              headline: "You're training less than you were",
              body: "Fitness follows load, and yours has dropped off. Add work back gradually rather than in one big week.",
            }
          : {
              tone: sport.accent,
              eyebrow: "You're on track",
              headline: topWin,
              body: "Load is where it should be and nothing is flagging. This is the state you want to stay in — the detail below is just the evidence.",
            };

  return (
    <div className="card border-l-4 p-5" style={{ borderLeftColor: verdict.tone }}>
      <span className="eyebrow" style={{ color: verdict.tone }}>{verdict.eyebrow}</span>
      <h2 className="mt-1 text-lg font-extrabold leading-tight sm:text-xl">{verdict.headline}</h2>
      <p className="mt-2 max-w-prose text-sm text-slate-400">{verdict.body}</p>
    </div>
  );
}

const TABS = [
  { id: "recovery" as const, label: "Recovery", icon: "🧠" },
  { id: "progress" as const, label: "Progress", icon: "📈" },
];

/**
 * One answer to "how am I doing".
 *
 * This was two pages. Stats held recovery, risk and training load; Progress
 * held volume, per-lift charts and nutrition — and Stats carried a link to
 * Progress, which is a page with a door in it rather than two destinations.
 * Both are now tabs, because they're two halves of the same question and
 * nobody could reasonably guess which page held which half.
 */
export default function DashboardPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<"recovery" | "progress">("recovery");

  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const since = new Date(Date.now() - 28 * 86400_000).toISOString().slice(0, 10);
    const [{ data: rows }, { data: insightRow }, { data: training }, { data: nutrition }, { data: weekCheck }, { data: prof }] = await Promise.all([
      supabase.from("daily_check_ins").select("*").eq("user_id", user.id).order("check_in_date", { ascending: false }).limit(14),
      supabase.from("daily_insights").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("training_logs").select("*").eq("user_id", user.id).gte("log_date", since),
      supabase.from("nutrition_logs").select("*").eq("user_id", user.id).gte("log_date", since),
      supabase.from("daily_check_ins").select("*").eq("user_id", user.id).gte("check_in_date", since),
      // Their sport decides how the verdict is worded — a runner is told to cut
      // mileage, a lifter to drop a set.
      supabase.from("profiles").select("sport").eq("id", user.id).maybeSingle(),
    ]);
    return {
      checkIns: (rows ?? []) as DailyCheckIn[],
      insight: (insightRow ?? null) as DailyInsight | null,
      training: (training ?? []) as TrainingLog[],
      nutrition: (nutrition ?? []) as NutritionLog[],
      weekCheck: (weekCheck ?? []) as DailyCheckIn[],
      sport: sportProfile((prof as { sport?: string } | null)?.sport),
    };
  }, [user.id], `dashboard:${user.id}`);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-9 w-40 animate-pulse rounded-lg bg-white/5" />
        <div className="grid grid-cols-2 gap-3"><div className="card h-28 animate-pulse" /><div className="card h-28 animate-pulse" /></div>
        <div className="card h-56 animate-pulse" />
      </div>
    );
  }

  const checkIns = data?.checkIns ?? [];

  // No check-ins blocks the RECOVERY half only. Training and nutrition history
  // are independent of it, so the Progress tab still has to be reachable —
  // otherwise someone who trains but doesn't check in sees an empty page and
  // concludes the app has lost their work.
  if (!checkIns.length) {
    return (
      <div className="animate-fade-up space-y-5">
        <Header />
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        {tab === "recovery" ? (
          <>
            <div className="card p-8 text-center text-sm text-slate-400">
              No check-ins yet. Log a few days to unlock recovery trends and injury risk.
            </div>
            <BenchmarksLink />
          </>
        ) : (
          <ProgressPanel userId={user.id} />
        )}
      </div>
    );
  }

  const summary = summarizeTrends(checkIns);
  const resolved = resolveInsight(data!.insight, summary);
  const trend = TREND_META[resolved.fatigueTrend];
  const riskPct = Math.round(resolved.riskScore * 100);
  const acwr = computeACWR(data!.training);
  const report = weeklyReport(data!.weekCheck, data!.training, data!.nutrition);
  const zone = ZONE_META[acwr.zone];
  const sport = data!.sport;

  return (
    <div className="animate-fade-up space-y-5">
      <Header source={resolved.source} />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "progress" && <ProgressPanel userId={user.id} />}

      {tab === "recovery" && <>
      <Verdict
        acwr={acwr}
        riskScore={resolved.riskScore}
        focusBodyPart={resolved.focusBodyPart}
        topWin={report.topWin}
        sport={sport}
      />
      {resolved.source === "ai" && resolved.summaryText && (
        <div className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-pitch-400">
              <span className="h-1.5 w-1.5 rounded-full bg-pitch-400" /> AI Coach
            </span>
            {actionLabel(resolved.recommendedAction) && <span className="chip text-pitch-400">{actionLabel(resolved.recommendedAction)}</span>}
          </div>
          <p className="text-sm leading-relaxed text-slate-200">{resolved.summaryText}</p>
        </div>
      )}

      {resolved.focusBodyPart && (
        <div className="card flex items-center gap-2 px-4 py-3 text-sm text-readiness-red">
          ⚠️ <span className="font-medium text-slate-200">Risk zone:</span> {resolved.focusBodyPart}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <div className="stat-label">Injury risk</div>
          <div className="mt-1 text-3xl font-extrabold" style={{ color: riskColor(resolved.riskScore) }}>{riskPct}%</div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-all" style={{ width: `${riskPct}%`, background: riskColor(resolved.riskScore) }} />
          </div>
        </div>
        <div className="card p-4">
          <div className="stat-label">Fatigue trend</div>
          <div className="mt-1 flex items-baseline gap-2 text-xl font-extrabold" style={{ color: trend.color }}>
            <span>{trend.icon}</span><span>{trend.label}</span>
          </div>
        </div>
        <StatCard label="Avg sleep" value={summary.avgSleep != null ? `${summary.avgSleep}/10` : "–"} />
        <StatCard label="Weight change" value={summary.weightDeltaKg == null ? "–" : `${summary.weightDeltaKg > 0 ? "+" : ""}${summary.weightDeltaKg} kg`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          {/* Training-load management (ACWR) */}
          <div className="card p-5">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="field-label !mb-0">Training load</h2>
              <span className="chip" style={{ color: zone.color }}>{zone.label}</span>
            </div>
            <div className="flex items-end gap-4">
              <div>
                <div className="text-3xl font-extrabold" style={{ color: zone.color }}>{acwr.ratio ?? "—"}</div>
                <div className="stat-label">acute : chronic</div>
              </div>
              {acwr.ratio != null && (
                <div className="flex-1 pb-1">
                  {/* sweet-spot band 0.8–1.5 with a marker */}
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="absolute inset-y-0 rounded-full bg-readiness-green/30" style={{ left: "40%", width: "35%" }} />
                    <div className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full ring-2 ring-ink-900" style={{ left: `calc(${Math.min(100, Math.max(0, acwr.ratio * 50))}% - 6px)`, background: zone.color }} />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>detrain</span><span>sweet spot</span><span>spike</span></div>
                </div>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-400">{acwr.message}</p>
          </div>

          <div className="card p-4">
            <h2 className="field-label mb-2">Last {checkIns.length} days</h2>
            <TrendChart series={summary.series} />
          </div>
        </div>

        <div className="space-y-5">
          {/* Weekly report */}
          <div className="card p-5">
            <h2 className="field-label">This week</h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Wk label="Sessions" value={`${report.sessions}`} />
              <Wk label="Check-ins" value={`${report.checkIns}/7`} />
              <Wk label="Load" value={report.loadTrend === "up" ? "↗" : report.loadTrend === "down" ? "↘" : "→"} />
            </div>
            <p className="mt-3 text-sm text-slate-200">🏆 {report.topWin}</p>
            <p className="mt-1 text-sm text-pitch-400">🎯 {report.focus}</p>
            <Link href="/report" className="btn-ghost mt-4">📄 Weekly report (PDF)</Link>
          </div>

          {/* The link to /history used to sit here. It's the Progress tab now. */}
          <div className="grid grid-cols-2 gap-3">
            <BenchmarksLink />
            <Link href="/nutrition" className="btn-ghost">🥗 Nutrition</Link>
          </div>
        </div>
      </div>
      </>}
    </div>
  );
}

function Header({ source }: { source?: "ai" | "local" }) {
  return (
    <header className="flex items-start justify-between">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Progress</h1>
        <p className="mt-1 text-sm text-slate-400">Whether your training load is safe, and what has actually improved.</p>
      </div>
      {source && (
        <span
          className={`mt-1 rounded-full px-2.5 py-1 text-xs font-semibold ${source === "ai" ? "bg-pitch-400/15 text-pitch-400" : "bg-white/10 text-slate-400"}`}
          title={source === "ai" ? "Powered by the AI worker" : "Local estimate — AI worker not connected"}
        >
          {source === "ai" ? "AI" : "Estimate"}
        </span>
      )}
    </header>
  );
}

function Wk({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3">
      <div className="text-2xl font-extrabold text-slate-100">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="stat-label">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-slate-100">{value}</div>
    </div>
  );
}

function BenchmarksLink() {
  return <Link href="/benchmarks" className="btn-ghost">💪 Benchmarks</Link>;
}
