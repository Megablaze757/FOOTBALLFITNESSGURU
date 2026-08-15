"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { checkInStreak } from "@/lib/load";
import {
  computeXp, levelFor, rankFor, evaluateAchievements, dailyQuests, activitySpans,
  type ActivityStats, type DailyState, EMPTY_STATS } from "@/lib/gamification";
import type { WeekActivity } from "@/lib/challenges";
import { strengthStats, testedMaxesFrom } from "@/lib/strength-standards";
import { latestBodyweight } from "@/lib/bodyweight";
import { StrengthSummary } from "@/components/StrengthSummary";
import type { TrainingLog } from "@/lib/types";
import { Confetti } from "@/components/Confetti";
import { LevelUpModal } from "@/components/LevelUpModal";
import { WeeklyChallenges } from "@/components/WeeklyChallenges";
import { boardsFor } from "@/lib/challenge-pool";
import { completionsFrom, recordCompletions, fetchChallengeXp } from "@/lib/challenge-xp";
import { Leaderboards } from "@/components/Leaderboards";
import { RankLadder } from "@/components/RankLadder";
import { RankBadge } from "@/components/RankBadge";
import { Icon } from "@/components/Icon";
import { AchievementDetail } from "@/components/AchievementDetail";
import {
  recordUnlocks, fetchRarity, MIN_SAMPLE, type RarityMap,
} from "@/lib/achievement-rarity";
import type { Achievement } from "@/lib/gamification";
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
    const [checks, training, programs, benchC, videoC, nutrition, checkC, trainC, nutriC,
           benchRows, videoRows, profile, activeProgram, allDrills,
           weighCheck, weighBody, testedRows] = await Promise.all([
      supabase.from("daily_check_ins").select("check_in_date").eq("user_id", user.id).gte("check_in_date", since60),
      // rpe comes along for the ride — same rows, one more column — so an
      // "easy session" challenge can be counted rather than guessed at.
      supabase.from("training_logs").select("log_date, rpe").eq("user_id", user.id).gte("log_date", since60),
      supabase.from("programs").select("completed_sessions, status").eq("user_id", user.id),
      supabase.from("strength_benchmarks").select("id", head).eq("user_id", user.id),
      supabase.from("ai_plans").select("id", head).eq("user_id", user.id),
      // Likewise: the target and what was eaten are on the row already, so
      // "days on your calorie target" costs nothing beyond two column names.
      supabase.from("nutrition_logs").select("log_date, calories_eaten, daily_calorie_target").eq("user_id", user.id).gte("log_date", since60),
      supabase.from("daily_check_ins").select("id", head).eq("user_id", user.id),
      supabase.from("training_logs").select("id", head).eq("user_id", user.id),
      supabase.from("nutrition_logs").select("id", head).eq("user_id", user.id),
      /**
       * The same two things again, but as DATES rather than a total.
       *
       * These have to be separate from the lifetime counts above, because the
       * two numbers answer different questions and both are wanted on this
       * page: an ACHIEVEMENT asks "have you ever" and a CHALLENGE asks "have
       * you this week". Feeding the lifetime count to the week was the bug —
       * "one benchmark test this week" read as already complete for anyone who
       * had ever recorded one, forever.
       *
       * Dates rather than a windowed count because the board has two windows.
       * A count answers one of them; the dates answer both.
       */
      supabase.from("strength_benchmarks").select("test_date").eq("user_id", user.id).gte("test_date", since60),
      supabase.from("ai_plans").select("created_at").eq("user_id", user.id).gte("created_at", since60),
      // Who they are, so challenges can be picked for a prop rather than for
      // "a rugby player". Two small rows against nine existing queries.
      supabase.from("profiles").select("sport, position, positions, training_focus, weight_kg, sex").eq("id", user.id).maybeSingle(),
      supabase.from("programs").select("goal_type").eq("user_id", user.id).eq("status", "active").maybeSingle(),
      /**
       * Every logged drill, NOT the 60-day window everything else here uses.
       *
       * Strength ranks are best-ever by design — a bad Tuesday must not cost
       * you one — and XP in this app is monotonic, which is a rule it already
       * learned the hard way with streaks. Window this and a personal best
       * ageing out of the window would DELETE the XP it earned and could drop
       * somebody a level, which is the single most demotivating thing a
       * progression system can do.
       *
       * Only two columns, and only rows that have drills on them, so a rest day
       * costs nothing. If this ever gets heavy the answer is to persist the
       * best lift per athlete server-side rather than to narrow the window.
       */
      supabase.from("training_logs").select("log_date, drills").eq("user_id", user.id).not("drills", "is", null),
      /**
       * BODYWEIGHT, FROM WHEREVER THE ATHLETE ACTUALLY PUT IT.
       *
       * This page used to read profiles.weight_kg, which no screen in the app
       * writes, and then default it to 0 — so every lift was a multiple of zero
       * bodyweight and no strength badge could ever be earned. See
       * lib/bodyweight.ts for the three-tables-one-number problem.
       *
       * Deliberately NOT windowed to since60 like the rest of this page. The
       * ranks these feed are best-ever, and a weight ageing out of a window
       * would silently un-earn badges — the same monotonicity rule that governs
       * streaks and strength XP here.
       */
      supabase.from("daily_check_ins").select("check_in_date, weight_kg").eq("user_id", user.id)
        .not("weight_kg", "is", null).order("check_in_date", { ascending: false }).limit(1),
      supabase.from("body_logs").select("log_date, weight_kg").eq("user_id", user.id)
        .not("weight_kg", "is", null).order("log_date", { ascending: false }).limit(1),
      // Tested maxes, so a badge and the Progress card cannot rank the same
      // squat differently. Same query, same resolver, same answer.
      supabase.from("strength_benchmarks").select("test_date, metrics").eq("user_id", user.id),
    ]);

    // One number, one definition, every reader — see lib/bodyweight.ts.
    const bodyweight = latestBodyweight({
      checkIns: (weighCheck.data ?? []).map((r) => ({ date: r.check_in_date as string, kg: r.weight_kg as number })),
      weighIns: (weighBody.data ?? []).map((r) => ({ date: r.log_date as string, kg: r.weight_kg as number })),
      profileKg: (profile.data as { weight_kg?: number | null } | null)?.weight_kg ?? null,
    });

    const checkDates = (checks.data ?? []).map((r) => r.check_in_date as string);
    const trainDates = (training.data ?? []).map((r) => r.log_date as string);
    const nutriDates = (nutrition.data ?? []).map((r) => r.log_date as string);
    const progs = (programs.data ?? []) as { completed_sessions: string[] | null; status: string }[];

    const stats: ActivityStats = {
      // Spread first so a new stat added to ActivityStats defaults sensibly
      // here instead of breaking every call site that builds one by hand.
      ...EMPTY_STATS,
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
      // Read across the same three date lists rather than counting rows. No
      // extra query — all three are already loaded above.
      ...activitySpans(checkDates, trainDates, nutriDates),
      /**
       * Strength tiers earned across the body — see lib/strength-standards.ts.
       *
       * Ranks are multiples of bodyweight, so with no weight recorded anywhere
       * there is no ratio to compute and this is honestly zero rather than
       * guessed from an average body. `?? 0` used to sit here on a column
       * nothing writes, which made that the answer for EVERY athlete.
       */
      ...strengthStats(
        (allDrills.data ?? []) as TrainingLog[],
        bodyweight?.kg ?? 0,
        (profile.data as { sex?: string | null } | null)?.sex === "female" ? "female" : "male",
        testedMaxesFrom(testedRows.data ?? []),
      ),
    };
    const state: DailyState = {
      checkedInToday: checkDates.includes(today),
      trainedToday: trainDates.includes(today),
      nutritionToday: nutriDates.includes(today),
    };
    /**
     * The last 7 days, which is the window every weekly challenge is scored on.
     *
     * The four extra counters are what let a DAILY challenge say anything a
     * quest does not already say: over one day the cumulative metrics all
     * collapse to "do the thing once", which is exactly the three fixed quests.
     * All four are derived from rows this page already loads.
     */
    const trainRowsRecent = (training.data ?? []) as { log_date: string; rpe: number | null }[];
    const nutriRows = (nutrition.data ?? []) as {
      log_date: string; calories_eaten: number | null; daily_calorie_target: number | null;
    }[];
    // Inside 10% of the target counts. A calorie goal is an estimate, so
    // demanding the exact number would be false precision — and unwinnable.
    const CALORIE_TOLERANCE = 0.1;
    const onTargetDays = nutriRows.filter((r) => {
      const target = Number(r.daily_calorie_target) || 0;
      const eaten = Number(r.calories_eaten) || 0;
      if (target <= 0 || eaten <= 0) return false;
      return Math.abs(eaten - target) <= target * CALORIE_TOLERANCE;
    }).map((r) => r.log_date);
    const benchDates = (benchRows.data ?? []).map((r) => String(r.test_date).slice(0, 10));
    const videoDates = (videoRows.data ?? []).map((r) => String(r.created_at).slice(0, 10));
    const easyDates = trainRowsRecent.filter((r) => (r.rpe ?? 99) <= 6).map((r) => r.log_date);
    const restDates = checkDates.filter((d) => !trainDates.includes(d));
    const perfectDates = checkDates.filter((d) => trainDates.includes(d) && nutriDates.includes(d));

    /**
     * The same counters over two windows, because the board asks two questions.
     *
     * Both boards were being scored against the week, which is wrong in the
     * direction that makes a daily challenge worthless: "take the rest day"
     * read 4/1 and complete on a Tuesday morning, because four rest days had
     * happened at some point in the previous seven. A daily card that is
     * already ticked before you get up is not a challenge, it is a receipt.
     */
    const inWindow = (dates: string[], from: string) => dates.filter((d) => d >= from).length;
    const onDay = (dates: string[], day: string) => dates.filter((d) => d === day).length;
    const activity = (count: (dates: string[]) => number): WeekActivity => ({
      check_ins: count(checkDates),
      training_sessions: count(trainDates),
      nutrition_logs: count(nutriDates),
      rest_days: count(restDates),
      perfect_days: count(perfectDates),
      calorie_goal_days: count(onTargetDays),
      easy_sessions: count(easyDates),
      // Windowed, NOT stats.benchmarks / stats.videos — those are lifetime.
      benchmarks: count(benchDates),
      videos: count(videoDates),
      // The exception, and deliberately so: a streak is a running total by
      // definition, and "push the streak to 14" is a real target precisely
      // because it counts the days before this one. It means the same thing in
      // both windows, so it is not narrowed for the daily board.
      streak: stats.streak,
    });
    const week = activity((dates) => inWindow(dates, since7));
    const todayActivity = activity((dates) => onDay(dates, today));
    const pr = profile.data as {
      sport?: string; position?: string; positions?: string[]; training_focus?: string;
    } | null;
    const ctx = {
      sport: (pr?.sport ?? null) as never,
      position: pr?.positions?.length ? pr.positions : (pr?.position ?? null),
      focus: (pr?.training_focus ?? null) as never,
      goal: ((activeProgram.data as { goal_type?: string } | null)?.goal_type ?? null) as never,
    };
    const boards = boardsFor({ who: ctx, week, today: todayActivity, todayIso: today });

    /**
     * PAY FOR WHAT THE CARDS PROMISE.
     *
     * Every challenge has advertised "+45 XP" since the feature shipped and
     * nothing ever added it — `challengeXp` was exported and called by nobody.
     * It cannot simply be summed on the fly either: the boards rotate, so a
     * total computed from "currently complete" would fall at midnight, and XP
     * going down is the exact regression computeXp was fixed for.
     *
     * So completions are recorded, then the total is read back. Recording
     * first means what was finished today counts on this very render rather
     * than on the next visit. Both calls degrade to nothing on a database
     * without 0075.
     */
    await recordCompletions(supabase, user.id, completionsFrom([boards.daily, boards.weekly]));
    const earnedFromChallenges = await fetchChallengeXp(supabase, user.id);

    return {
      stats, state, boards, ctx,
      xp: computeXp(stats) + earnedFromChallenges,
    };
  }, [user.id], `rewards:${user.id}`);

  /**
   * Rarity, and the write that makes it possible.
   *
   * Achievements are derived in the browser, so an unlock exists nowhere until
   * something records it. This posts the WHOLE unlocked set rather than just
   * what changed: when this shipped every athlete already had badges that had
   * never been written down, and a record-on-transition hook would only ever
   * have caught their next one. The upsert ignores duplicates, so after the
   * first visit it is a no-op.
   *
   * Fire-and-forget on both halves. A rewards page that fails to render because
   * a decorative statistic could not be fetched would be a far worse bug than
   * the missing statistic — so `rarity` simply stays empty and the card says
   * there isn't enough data yet.
   */
  const [rarity, setRarity] = useState<RarityMap>({});
  const [sampleSize, setSampleSize] = useState(0);
  const [openBadge, setOpenBadge] = useState<Achievement | null>(null);
  useEffect(() => {
    if (!data) return;
    let live = true;
    const supabase = createClient();
    const ids = evaluateAchievements(data.stats, levelFor(data.xp).level)
      .unlocked.map((a) => a.id);
    void recordUnlocks(supabase, user.id, ids)
      .then(() => fetchRarity(supabase))
      .then((map) => {
        if (!live) return;
        setRarity(map);
        // The denominator the RPC divided by, recovered from the widest badge:
        // holders / (pct/100). "First step" is unlocked by everyone who has
        // anything, so the maximum is the population.
        const n = Math.max(0, ...Object.values(map).map((r) => (r.pct > 0 ? Math.round(r.holders / (r.pct / 100)) : 0)));
        setSampleSize(n);
      });
    return () => { live = false; };
  }, [data, user.id]);

  // Detect crossing a level threshold since the last visit → celebrate.
  const [leveledUpTo, setLeveledUpTo] = useState<number | null>(null);
  useEffect(() => {
    if (!data) return;
    const lvl = levelFor(data.xp).level;
    const key = `apex-level-${user.id}`;
    const prev = Number(localStorage.getItem(key) || "0");
    if (prev && lvl > prev) setLeveledUpTo(lvl);
    localStorage.setItem(key, String(lvl));
  }, [data, user.id]);

  if (loading || !data) return <div className="card mx-auto max-w-2xl h-96 animate-pulse" />;

  const xp = data.xp;
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

      {/* HOW STRONG, not just how consistent.
          Every other card here counts turning up — days, sessions, quests. This
          is the one that says whether any of it worked, and the page about
          progression was the last place in the app not to mention it. */}
      <StrengthSummary stats={data.stats} />

      <WeeklyChallenges boards={data.boards} />

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
              /* A BUTTON, because it does something now. The tile carried a
                 name and one line and nothing else — a locked badge said what
                 to do but never how far off you were, and an unlocked one was
                 a tile that had changed colour. Opening it says whether it is
                 yours and how many other people managed it. */
              <button
                key={a.id}
                type="button"
                onClick={() => setOpenBadge(a)}
                aria-label={`${a.name} — ${got ? "unlocked" : "locked"}. ${a.desc}. See details`}
                className="card flex items-center gap-3 p-3 text-left transition hover:bg-white/[0.05]"
              >
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
              </button>
            );
          })}
        </div>
      </div>

      {openBadge && (
        <AchievementDetail
          achievement={openBadge}
          unlocked={unlocked.includes(openBadge)}
          rarity={rarity[openBadge.id]}
          sampled={sampleSize >= MIN_SAMPLE}
          onClose={() => setOpenBadge(null)}
        />
      )}
    </div>
  );
}
