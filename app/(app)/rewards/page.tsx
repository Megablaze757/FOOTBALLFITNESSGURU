"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { checkInStreak } from "@/lib/load";
import {
  computeXp, levelFor, rankFor, evaluateAchievements, dailyQuests,
  type ActivityStats, type DailyState,
} from "@/lib/gamification";
import type { WeekActivity } from "@/lib/challenges";
import { Confetti } from "@/components/Confetti";
import { LevelUpModal } from "@/components/LevelUpModal";
import { WeeklyChallenges } from "@/components/WeeklyChallenges";
import { Leaderboards } from "@/components/Leaderboards";
import { RankLadder } from "@/components/RankLadder";
import { RankBadge } from "@/components/RankBadge";
import { Icon } from "@/components/Icon";
import { daysAgoLocal, todayLocal } from "@/lib/day";

export default function RewardsPage() {
  const user = useCurrentUser();
  const today = todayLocal();
  const since7 = daysAgoLocal(6);

  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const head = { count: "exact" as const, head: true };
    /**
     * Counts are counted, not downloaded.
     *
     * This pulled every check-in, every training log and every nutrition log the
     * athlete had ever written — to produce three integers, a streak and a
     * seven-day tally. The XP number at the top of this page was costing a full
     * table scan of three tables on every visit.
     *
     * The streak and "did I do it today" both need real dates, but only recent
     * ones: a streak is broken by the first missing day, so 60 days is far more
     * than any streak this app can display, and today's activity is in there by
     * definition.
     */
    const since60 = daysAgoLocal(59);
    const [checks, training, programs, benchC, videoC, nutrition, checkC, trainC, nutriC] = await Promise.all([
      supabase.from("daily_check_ins").select("check_in_date").eq("user_id", user.id).gte("check_in_date", since60),
      supabase.from("training_logs").select("log_date").eq("user_id", user.id).gte("log_date", since60),
      supabase.from("programs").select("completed_sessions, status").eq("user_id", user.id),
      supabase.from("strength_benchmarks").select("id", head).eq("user_id", user.id),
      supabase.from("ai_plans").select("id", head).eq("user_id", user.id),
      supabase.from("nutrition_logs").select("log_date").eq("user_id", user.id).gte("log_date", since60),
      supabase.from("daily_check_ins").select("id", head).eq("user_id", user.id),
      supabase.from("training_logs").select("id", head).eq("user_id", user.id),
      supabase.from("nutrition_logs").select("id", head).eq("user_id", user.id),
    ]);

    const checkDates = (checks.data ?? []).map((r) => r.check_in_date as string);
    const trainDates = (training.data ?? []).map((r) => r.log_date as string);
    const nutriDates = (nutrition.data ?? []).map((r) => r.log_date as string);
    const progs = (programs.data ?? []) as { completed_sessions: string[] | null; status: string }[];

    const stats: ActivityStats = {
      checkIns: checkC.count ?? 0,
      streak: checkInStreak(checkDates),
      trainingSessions: trainC.count ?? 0,
      completedSessions: progs.reduce((n, p) => n + (p.completed_sessions?.length ?? 0), 0),
      completedBlocks: progs.filter((p) => p.status === "archived").length,
      benchmarks: benchC.count ?? 0,
      videos: videoC.count ?? 0,
      nutritionLogs: nutriC.count ?? 0,
      checkInsLast7: checkDates.filter((d) => d >= since7).length,
      // A rest day is one you checked in on and did not train. Both lists are
      // already here, so this costs no extra query — see ActivityStats.
      restDaysLogged: checkDates.filter((d) => !trainDates.includes(d)).length,
    };
    const state: DailyState = {
      checkedInToday: checkDates.includes(today),
      trainedToday: trainDates.includes(today),
      nutritionToday: nutriDates.includes(today),
    };
    // The last 7 days, which is the window every weekly challenge is scored on.
    const week: WeekActivity = {
      check_ins: checkDates.filter((d) => d >= since7).length,
      training_sessions: trainDates.filter((d) => d >= since7).length,
      program_sessions: stats.completedSessions,
      nutrition_logs: nutriDates.filter((d) => d >= since7).length,
      benchmarks: stats.benchmarks,
      videos: stats.videos,
      streak: stats.streak,
    };
    return { stats, state, week };
  }, [user.id], `rewards:${user.id}`);

  // Detect crossing a level threshold since the last visit → celebrate.
  const [leveledUpTo, setLeveledUpTo] = useState<number | null>(null);
  useEffect(() => {
    if (!data) return;
    const lvl = levelFor(computeXp(data.stats)).level;
    const key = `apex-level-${user.id}`;
    const prev = Number(localStorage.getItem(key) || "0");
    if (prev && lvl > prev) setLeveledUpTo(lvl);
    localStorage.setItem(key, String(lvl));
  }, [data, user.id]);

  if (loading || !data) return <div className="card mx-auto max-w-2xl h-96 animate-pulse" />;

  const xp = computeXp(data.stats);
  const level = levelFor(xp);
  const { unlocked, locked } = evaluateAchievements(data.stats, level.level);
  const quests = dailyQuests(data.state);
  const questsDone = quests.filter((q) => q.done).length;
  const allDone = questsDone === quests.length;

  return (
    <div className="animate-fade-up mx-auto max-w-3xl space-y-5">
      {leveledUpTo && (
        <LevelUpModal
          level={leveledUpTo}
          rank={rankFor(leveledUpTo).rank}
          emoji={rankFor(leveledUpTo).emoji}
          color={rankFor(leveledUpTo).color}
          onClose={() => setLeveledUpTo(null)}
        />
      )}
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Rewards</h1>
        <p className="mt-1 text-sm text-slate-400">XP builds up from things you were doing anyway. Nothing here needs chasing.</p>
      </header>

      {/* Level card */}
      <div className="card-premium relative overflow-hidden p-6">
        <div className="flex items-center gap-4">
          {/* The badge takes the tier's own colour — the point of a ladder is
              that Emerald looks different from Bronze at a glance. */}
          {/* The insignia carries the tier colour itself now, so the tile behind
              it is a faint wash rather than a solid block — a badge drawn in the
              tier colour on a fill of the same colour is invisible. */}
          <div
            className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl shadow-glow"
            style={{ background: `linear-gradient(135deg, ${level.color}33, ${level.color}11)` }}
          >
            <RankBadge tier={level.tier} division={level.division} color={level.color} size={46} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold" style={{ color: level.color }}>{level.rank}</span>
              <span className="chip text-slate-300">Level {level.level}</span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.round(level.progress * 100)}%`, background: `linear-gradient(90deg, ${level.color}, ${level.color}aa)` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-xs text-slate-400">
              <span>{level.xp.toLocaleString()} XP</span>
              <span>{level.xpForNext - level.xpIntoLevel} XP to level {level.level + 1}</span>
            </div>
          </div>
        </div>
      </div>

      <RankLadder level={level} />

      <WeeklyChallenges userId={user.id} stats={data.stats} week={data.week} />

      <Leaderboards userId={user.id} />

      {/* Daily quests */}
      <div className="card relative overflow-hidden p-5">
        {allDone && <Confetti />}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="field-label !mb-0">If you fancy it today</h2>
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
              /* Locked badges were the whole card at `opacity-45`, which took
                 the name to 4.21:1 and the description to 2.10:1 — both under
                 AA, and axe found twenty of them. The palette in
                 tailwind.config is calibrated so every muted tier passes on
                 this surface; a blanket opacity multiplies straight through
                 that work and undoes it.

                 So the dimming moved off the text and onto the parts that
                 aren't text: a greyscale icon on a flatter tile. The name and
                 description step down a tier instead — slate-400 (7.7:1) and
                 slate-500 (6.2:1) — which still reads as "not yours yet" and
                 stays legible in daylight. These are the badges telling a new
                 athlete what to aim for, so they are the ones most worth being
                 able to read. */
              <div key={a.id} className="card flex items-center gap-3 p-3">
                {/* `grayscale` went with the emoji it existed for — a filter is
                    the only way to mute a full-colour glyph, and it is the wrong
                    tool for an SVG that already takes the colour it is given. */}
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${got ? "bg-pitch-400/15 text-pitch-400" : "bg-white/[0.03] text-slate-500 opacity-60"}`}
                >
                  <Icon name={a.icon} size={20} />
                </span>
                <div className="min-w-0">
                  <div className={`truncate text-sm font-bold ${got ? "text-slate-100" : "text-slate-400"}`}>
                    {a.name}
                    {/* Colour and grey are the only things separating these two
                        states; neither survives a screen reader. */}
                    <span className="sr-only">{got ? " — unlocked" : " — locked"}</span>
                  </div>
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
