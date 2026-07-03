"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { assessReadiness } from "@/lib/readiness";
import { actionLabel } from "@/lib/insights";
import { checkInStreak } from "@/lib/load";
import { ReadinessGauge } from "@/components/ReadinessGauge";
import type { CheckInInput, DailyInsight } from "@/lib/types";

export default function HomePage() {
  const user = useCurrentUser();
  const today = new Date().toISOString().slice(0, 10);

  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const since = new Date(Date.now() - 40 * 86400_000).toISOString().slice(0, 10);
    const [{ data: profile }, { data: checkIn }, { data: streakRows }] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      supabase.from("daily_check_ins").select("*").eq("user_id", user.id).eq("check_in_date", today).maybeSingle(),
      supabase.from("daily_check_ins").select("check_in_date").eq("user_id", user.id).gte("check_in_date", since),
    ]);
    let insight: DailyInsight | null = null;
    if (checkIn) {
      const { data: ins } = await supabase
        .from("daily_insights").select("*").eq("user_id", user.id).eq("check_in_id", checkIn.id).maybeSingle();
      insight = (ins ?? null) as DailyInsight | null;
    }
    const streak = checkInStreak((streakRows ?? []).map((r) => r.check_in_date));
    return { profile, checkIn, insight, streak };
  }, [user.id]);

  const firstName = data?.profile?.full_name?.split(" ")[0] ?? "athlete";
  const streak = data?.streak ?? 0;

  if (loading) return <Skeleton />;

  if (!data?.checkIn) {
    return (
      <div className="animate-fade-up">
        <Greeting name={firstName} sub="Let's see how you're recovering." />
        <div className="card mt-6 flex flex-col items-center p-8 text-center">
          <div className="text-5xl">🌅</div>
          <p className="mt-3 max-w-xs text-sm text-slate-400">No check-in yet today. Log how you feel to get your readiness score.</p>
          <Link href="/journal" className="btn-primary mt-6 max-w-[16rem]">Start today&apos;s check-in</Link>
        </div>
      </div>
    );
  }

  const input: CheckInInput = {
    pain_map: data.checkIn.pain_map ?? {},
    fatigue_score: data.checkIn.fatigue_score,
    sleep_quality: data.checkIn.sleep_quality,
    nutrition_quality: data.checkIn.nutrition_quality,
    weight_kg: data.checkIn.weight_kg,
    is_match_day: data.checkIn.is_match_day,
    match_minutes_played: data.checkIn.match_minutes_played,
  };
  const readiness = assessReadiness(input);
  const coachText = data.insight?.ai_summary_text ?? readiness.advice;
  const watchZone = data.insight?.focus_body_part ?? readiness.focus_body_part;
  const actionTag = actionLabel(data.insight?.recommended_action ?? null);

  return (
    <div className="animate-fade-up space-y-6">
      <Greeting name={firstName} sub="Here's your readiness for today." streak={streak} />

      <div className="card p-6 pt-8">
        <ReadinessGauge score={readiness.score} status={readiness.status} />
      </div>

      <Link href="/coach" className="card card-hover flex items-center justify-between p-4">
        <div>
          <div className="stat-label">AI Coach</div>
          <div className="mt-0.5 text-sm font-bold text-slate-100">See today&apos;s session &amp; your program</div>
        </div>
        <span className="text-pitch-400">→</span>
      </Link>

      <div className="card overflow-hidden p-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-pitch-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pitch-400" /> AI Coach
          </span>
          {actionTag && <span className="chip text-pitch-400">{actionTag}</span>}
        </div>
        <p className="text-sm leading-relaxed text-slate-200">{coachText}</p>
        {watchZone && <div className="chip mt-3 text-readiness-red">⚠️ Watch zone: {watchZone}</div>}
      </div>

      <Link href="/journal" className="btn-ghost">Edit today&apos;s check-in</Link>
    </div>
  );
}

function Greeting({ name, sub, streak = 0 }: { name: string; sub: string; streak?: number }) {
  return (
    <header className="flex items-start justify-between">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Hi {name} <span className="inline-block">👋</span>
        </h1>
        <p className="mt-1 text-sm text-slate-400">{sub}</p>
      </div>
      {streak > 0 && (
        <span className="chip text-pitch-400" title="Consecutive check-in days">🔥 {streak}-day streak</span>
      )}
    </header>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="h-9 w-40 animate-pulse rounded-lg bg-white/5" />
      <div className="card h-64 animate-pulse" />
      <div className="card h-28 animate-pulse" />
    </div>
  );
}
