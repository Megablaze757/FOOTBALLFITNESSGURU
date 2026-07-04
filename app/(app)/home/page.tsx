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
        <div className="mx-auto mt-6 flex max-w-xl flex-col items-center rounded-3xl border border-white/10 bg-white/[0.04] p-10 text-center shadow-card backdrop-blur-xl sm:p-14">
          <div className="text-6xl">🌅</div>
          <h2 className="mt-4 text-xl font-extrabold">Start your day with a check-in</h2>
          <p className="mt-2 max-w-sm text-sm text-slate-400">Log how you slept and feel — Apex computes your readiness and today&apos;s session in under a minute.</p>
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

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card flex items-center justify-center p-6 pt-8 lg:col-span-1">
          <ReadinessGauge score={readiness.score} status={readiness.status} />
        </div>

        <div className="space-y-5 lg:col-span-2">
          <div className="card overflow-hidden p-5 sm:p-6">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-pitch-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pitch-400" /> AI Coach
              </span>
              {actionTag && <span className="chip text-pitch-400">{actionTag}</span>}
            </div>
            <p className="text-sm leading-relaxed text-slate-200 sm:text-base">{coachText}</p>
            {watchZone && <div className="chip mt-3 text-readiness-red">⚠️ Watch zone: {watchZone}</div>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <QuickLink href="/coach" title="Today's session" sub="Your program & drills" icon="🏋️" />
            <QuickLink href="/train" title="Video analysis" sub="Upload & break down a clip" icon="🎥" />
            <QuickLink href="/nutrition" title="Fuelling" sub="Targets for today's load" icon="🍽️" />
            <QuickLink href="/journal" title="Edit check-in" sub="Update how you feel" icon="📝" />
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ href, title, sub, icon }: { href: string; title: string; sub: string; icon: string }) {
  return (
    <Link href={href} className="card card-hover flex items-center gap-3 p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/[0.04] text-xl">{icon}</span>
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-slate-100">{title}</div>
        <div className="truncate text-xs text-slate-400">{sub}</div>
      </div>
    </Link>
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
