"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { checkInStreak } from "@/lib/load";
import {
  computeXp, levelFor, evaluateAchievements, dailyQuests,
  type ActivityStats, type DailyState,
} from "@/lib/gamification";
import { Confetti } from "@/components/Confetti";

export default function RewardsPage() {
  const user = useCurrentUser();
  const today = new Date().toISOString().slice(0, 10);
  const since7 = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);

  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const head = { count: "exact" as const, head: true };
    const [checks, training, programs, benchC, videoC, nutrition] = await Promise.all([
      supabase.from("daily_check_ins").select("check_in_date").eq("user_id", user.id),
      supabase.from("training_logs").select("log_date").eq("user_id", user.id),
      supabase.from("programs").select("completed_sessions, status").eq("user_id", user.id),
      supabase.from("strength_benchmarks").select("id", head).eq("user_id", user.id),
      supabase.from("ai_plans").select("id", head).eq("user_id", user.id),
      supabase.from("nutrition_logs").select("log_date").eq("user_id", user.id),
    ]);

    const checkDates = (checks.data ?? []).map((r) => r.check_in_date as string);
    const trainDates = (training.data ?? []).map((r) => r.log_date as string);
    const nutriDates = (nutrition.data ?? []).map((r) => r.log_date as string);
    const progs = (programs.data ?? []) as { completed_sessions: string[] | null; status: string }[];

    const stats: ActivityStats = {
      checkIns: checkDates.length,
      streak: checkInStreak(checkDates),
      trainingSessions: trainDates.length,
      completedSessions: progs.reduce((n, p) => n + (p.completed_sessions?.length ?? 0), 0),
      completedBlocks: progs.filter((p) => p.status === "archived").length,
      benchmarks: benchC.count ?? 0,
      videos: videoC.count ?? 0,
      nutritionLogs: nutriDates.length,
      checkInsLast7: checkDates.filter((d) => d >= since7).length,
    };
    const state: DailyState = {
      checkedInToday: checkDates.includes(today),
      trainedToday: trainDates.includes(today),
      nutritionToday: nutriDates.includes(today),
    };
    return { stats, state };
  }, [user.id]);

  if (loading || !data) return <div className="card mx-auto max-w-2xl h-96 animate-pulse" />;

  const xp = computeXp(data.stats);
  const level = levelFor(xp);
  const { unlocked, locked } = evaluateAchievements(data.stats, level.level);
  const quests = dailyQuests(data.state);
  const questsDone = quests.filter((q) => q.done).length;
  const allDone = questsDone === quests.length;

  return (
    <div className="animate-fade-up mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Rewards</h1>
        <p className="mt-1 text-sm text-slate-400">Earn XP for everything you do. Level up, unlock badges, keep the streak alive.</p>
      </header>

      {/* Level card */}
      <div className="card-premium relative overflow-hidden p-6">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-pitch-400 to-pitch-600 text-3xl shadow-glow">{level.emoji}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold">Level {level.level}</span>
              <span className="chip text-pitch-400">{level.rank}</span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-pitch-400 to-pitch-600 transition-all" style={{ width: `${Math.round(level.progress * 100)}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-xs text-slate-400">
              <span>{level.xp.toLocaleString()} XP</span>
              <span>{level.xpForNext - level.xpIntoLevel} XP to level {level.level + 1}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Daily quests */}
      <div className="card relative overflow-hidden p-5">
        {allDone && <Confetti />}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="field-label !mb-0">Today&apos;s quests</h2>
          <span className="text-xs text-slate-400">{questsDone}/{quests.length}</span>
        </div>
        <ul className="space-y-2">
          {quests.map((q) => (
            <li key={q.id}>
              <Link href={q.href} className={`flex items-center gap-3 rounded-2xl border p-3 transition ${q.done ? "border-pitch-400/30 bg-pitch-400/[0.06]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs ${q.done ? "border-pitch-400 bg-pitch-400 text-ink-900" : "border-white/20 text-transparent"}`}>✓</span>
                <span className={`flex-1 text-sm ${q.done ? "text-slate-400 line-through" : "text-slate-100"}`}>{q.label}</span>
                <span className="chip text-pitch-400">+{q.xp} XP</span>
              </Link>
            </li>
          ))}
        </ul>
        {allDone && <p className="mt-3 text-center text-sm font-semibold text-pitch-400">🎉 All quests done — see you tomorrow!</p>}
      </div>

      {/* Achievements */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="field-label !mb-0">Badges</h2>
          <span className="text-xs text-slate-400">{unlocked.length}/{unlocked.length + locked.length}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[...unlocked, ...locked].map((a) => {
            const got = unlocked.includes(a);
            return (
              <div key={a.id} className={`card flex items-center gap-3 p-3 ${got ? "" : "opacity-45"}`}>
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl ${got ? "bg-pitch-400/15" : "bg-white/[0.04] grayscale"}`}>{a.icon}</span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-100">{a.name}</div>
                  <div className="truncate text-xs text-slate-500">{a.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
