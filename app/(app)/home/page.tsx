"use client";

import { useEffect, useState } from "react";
import { ShareMomentCard } from "@/components/ShareMomentCard";
import { useMemo } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { assessReadiness } from "@/lib/readiness";
import { actionLabel } from "@/lib/insights";
import { streakState, computeACWR } from "@/lib/load";
import { dailyQuests, rotatingQuest } from "@/lib/gamification";
import { biometricSignal, type Biometric } from "@/lib/biometrics";
import { sportProfile } from "@/lib/sport-profile";
import { athleteShareLink } from "@/lib/share-card";
import { ReadinessGauge } from "@/components/ReadinessGauge";
import { TodayCard } from "@/components/TodayCard";
import { HomeStats } from "@/components/HomeStats";
import { WeekStrip } from "@/components/WeekStrip";
import { Notifications } from "@/components/Notifications";
import type { CheckInInput, DailyInsight, TrainingLog } from "@/lib/types";
import type { ProgramPlan } from "@/lib/engine";
import { daysAgoLocal, todayLocal, lastNDaysLocal } from "@/lib/day";
import { durationMinutes } from "@/lib/training-duration";
import { homeStats } from "@/lib/home-stats";

export default function HomePage() {
  const user = useCurrentUser();
  const router = useRouter();
  const today = todayLocal();

  const { data, loading, revalidating } = useAsync(async () => {
    const supabase = createClient();
    const since = daysAgoLocal(40);
    /**
     * ONE ROUND TRIP FOR EVERYTHING THAT DOESN'T DEPEND ON ANYTHING.
     *
     * This was FIVE sequential awaits — a batch, then biometrics, then insights,
     * then another batch, then another. Each one waits for the last, so on a
     * phone on 4G the page cost five times the latency before it could render,
     * and only two of the five had a real dependency.
     *
     * It also ran five queries with no date filter and no limit: every check-in,
     * every training log, every nutrition log and every program this user has
     * ever created, transferred in full — to produce four integers and a 7-day
     * window. Fine at 22 accounts and a fortnight of data. A user two seasons in
     * would be downloading a thousand rows to render a homepage.
     *
     * Counts are now head-counts (no rows cross the wire at all), and the only
     * rows fetched are the 28 days ACWR actually needs.
     */
    const head = { count: "exact" as const, head: true };
    const since28 = daysAgoLocal(27);
    const [
      { data: profile }, { data: checkIn }, { data: streakRows },
      { data: trainToday }, { data: nutriToday }, { data: bio },
      { data: activeProgram },
      { data: recentTraining },
      { count: videoCount }, { count: checkInCount }, { count: nutritionCount },
    ] = await Promise.all([
      // username and public_profile ride along on a query that already runs:
      // they decide what address goes on a shared card, and a second round
      // trip for two columns on the first screen of the app would be a
      // strange thing to spend.
      supabase.from("profiles").select("full_name, onboarded, sport, username, public_profile").eq("id", user.id).maybeSingle(),
      supabase.from("daily_check_ins").select("*").eq("user_id", user.id).eq("check_in_date", today).maybeSingle(),
      // 40 days covers the streak; the 7-day count is taken from the same rows
      // rather than a second full scan.
      supabase.from("daily_check_ins").select("check_in_date").eq("user_id", user.id).gte("check_in_date", since),
      supabase.from("training_logs").select("log_date, session_type").eq("user_id", user.id).eq("log_date", today).maybeSingle(),
      // Widened from select("log_date"). The row was already being fetched and
      // only its EXISTENCE used, to tick a quest — so Home knew whether you had
      // eaten and threw away what you had eaten. The fuel card below costs no
      // extra round trip because of that.
      supabase.from("nutrition_logs").select("log_date, calories_eaten, daily_calorie_target").eq("user_id", user.id).eq("log_date", today).maybeSingle(),
      supabase.from("biometrics").select("*").eq("user_id", user.id)
        .gte("metric_date", since28).order("metric_date", { ascending: true }),
      supabase.from("programs").select("plan, completed_sessions").eq("user_id", user.id)
        .eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      // intensity and drills come along so the readiness verdict can account for
      // training load — without them sessionLoad has nothing to work with and
      // ACWR silently reads as "building" forever. 28 days is exactly ACWR's
      // chronic window, so pulling more was never useful.
      // run_seconds and run_type come along for HomeStats: pace worked out from
      // the SESSION reads a footballer's 5k inside a 90-minute session as
      // 18:00/km, which is not a rounding error but a different sport.
      supabase.from("training_logs").select("log_date, total_minutes, duration_seconds, intensity, drills, contact_minutes, distance_km, run_seconds, run_type, session_type")
        .eq("user_id", user.id).gte("log_date", since28),
      // Three head-counts, not six. The benchmark, AI-plan and training totals
      // fed only the XP level this page no longer shows; these three are what
      // the "getting started" checklist asks about.
      supabase.from("videos").select("id", head).eq("user_id", user.id),
      supabase.from("daily_check_ins").select("id", head).eq("user_id", user.id),
      supabase.from("nutrition_logs").select("id", head).eq("user_id", user.id),
    ]);

    const bioHistory = (bio ?? []) as Biometric[];
    const bioSignal = biometricSignal(bioHistory.find((b) => b.metric_date === today) ?? null, bioHistory);

    // The one genuine dependency: the insight is keyed on the check-in's id, so
    // it can't be fetched until we have it. Skipped entirely when there's no
    // check-in, which is the common case first thing in the morning.
    let insight: DailyInsight | null = null;
    if (checkIn) {
      const { data: ins } = await supabase
        .from("daily_insights").select("*").eq("user_id", user.id).eq("check_in_id", checkIn.id).maybeSingle();
      insight = (ins ?? null) as DailyInsight | null;
    }
    const programCount = activeProgram ? 1 : 0;

    // First session in the block that isn't ticked off. Walked in order because
    // the program is periodised — week 3 is not interchangeable with week 1.
    const prog = activeProgram as { plan: ProgramPlan | null; completed_sessions: string[] | null } | null;
    let nextSession: { title: string; week: number; drills: number } | null = null;
    outer: for (const w of prog?.plan?.weeks ?? []) {
      for (const s of w.sessions) {
        if (!(prog?.completed_sessions ?? []).includes(`w${w.week}d${s.day}`)) {
          nextSession = { title: s.title, week: w.week, drills: s.drills.length };
          break outer;
        }
      }
    }
    const streakNow = streakState((streakRows ?? []).map((r) => r.check_in_date));
    const streak = streakNow.streak;
    const trainedToday = !!trainToday && trainToday.session_type !== "rest_day";
    const quests = dailyQuests({ checkedInToday: !!checkIn, trainedToday, nutritionToday: !!nutriToday });

    // Rank + week-at-a-glance. Home used to show none of this, so an athlete
    // who hadn't checked in yet landed on a single empty-state card with
    // nothing to look at and no reason to stay.
    const since7 = daysAgoLocal(6);
    const checkDates = (streakRows ?? []).map((r) => r.check_in_date as string);
    const trainRows = ((recentTraining ?? []) as { log_date: string; total_minutes: number | null; duration_seconds?: number | null; session_type?: string | null }[])
      .filter((row) => row.session_type !== "rest_day");
    /**
     * HOME NO LONGER COMPUTES AN XP TOTAL, so the twelve-field ActivityStats it
     * used to assemble is down to the one number the week strip reads.
     *
     * Everything else in that object existed to feed `computeXp` — lifetime
     * counts of benchmarks, videos, nutrition logs, completed blocks, the
     * longest streaks — and the level it produced is gone from this page. The
     * two head-counts that fed only those are gone with it. Rewards still
     * builds the full set, from the same helpers, and is the one place that
     * needs to.
     */
    const checkInsLast7 = checkDates.filter((d) => d >= since7).length;
    /**
     * The last seven days, day by day.
     *
     * `week` was already being computed here and rendered nowhere — three
     * numbers derived from rows the page had already paid to fetch, thrown
     * away. Home is thin once the day's three quests are ticked, which is
     * exactly the moment an athlete has earned something to look at, so it
     * gets shown now (see WeekStrip).
     *
     * Per-day rather than three totals: "4 sessions this week" is a fact, and
     * seven dots you can see a gap in is a habit.
     */
    const checkSet = new Set(checkDates);
    const trainSet = new Set(trainRows.map((r) => r.log_date));
    /**
     * lastNDaysLocal, not `Date.now() - n * 86400_000` + toISOString.
     *
     * That combination keyed each dot on the UTC day while labelling it with
     * the LOCAL weekday, so the strip looked up the wrong dates and marked the
     * wrong cell as today for anyone whose local date differs from UTC's. See
     * lib/day.ts, which exists for precisely this and now owns the arithmetic.
     */
    const days = lastNDaysLocal(7).map(({ iso, date }) => ({
      iso,
      // Single letter, in the athlete's own locale rather than a hard-coded
      // English array — and off the same local date the dot is keyed on.
      letter: date.toLocaleDateString(undefined, { weekday: "narrow" }),
      checkedIn: checkSet.has(iso),
      trained: trainSet.has(iso),
    }));
    /**
     * The three numbers Home leads with, chosen from what this athlete does.
     *
     * Off the 28 days already in hand for the acute:chronic ratio, so it costs
     * no extra query. `recentTraining` — not `trainRows` — because a rest day
     * is a fact about the week and home-stats filters them itself.
     */
    const since14 = daysAgoLocal(13);
    const logs = (recentTraining ?? []) as unknown as TrainingLog[];
    const thisWeek = logs.filter((r) => r.log_date >= since7);
    const lastWeek = logs.filter((r) => r.log_date >= since14 && r.log_date < since7);
    const activity = homeStats((profile as { sport?: string } | null)?.sport, thisWeek, lastWeek);

    const week = {
      sessions: trainRows.filter((r) => r.log_date >= since7).length,
      minutes: Math.round(trainRows.filter((r) => r.log_date >= since7).reduce((n, r) => n + durationMinutes(r), 0)),
      checkIns: checkInsLast7,
      days,
    };
    /**
     * The fourth line, and the only one that can be different tomorrow.
     *
     * Computed here rather than beside the other three because it needs the
     * week totals, which are worked out above — and a quest the app cannot
     * tick is worse than no quest at all.
     */
    const extra = rotatingQuest({
      dayOfYear: Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000),
      sessionsThisWeek: week.sessions,
      minutesThisWeek: week.minutes,
      streak,
      weighedToday: (checkIn as { weight_kg?: number | null } | null)?.weight_kg != null,
      hasProgram: programCount > 0,
    });

    // "Getting started" asks whether they've EVER done each thing. It used to
    // ask whether they'd checked in TODAY, so the onboarding checklist rose from
    // the dead every morning they hadn't — a first-run card nagging month-old
    // users, which is precisely the tone this app was accused of.
    const setup = {
      checkedIn: (checkInCount ?? 0) > 0,
      hasProgram: programCount > 0,
      hasVideo: (videoCount ?? 0) > 0,
      loggedNutrition: (nutritionCount ?? 0) > 0,
    };

    const acwr = computeACWR(trainRows as unknown as TrainingLog[]);

    /**
     * A WRITE WITH NO READ, AND IT HAS TO STAY.
     *
     * Home no longer shows a rank or an XP bar, so the two queries that fetched
     * the standing and the days-held counters are gone with them. This one is
     * not a query: `record_ladder_standing` recomputes the athlete's position
     * server-side and writes down that they held it today, which is what the
     * Elite and Apex badges count. Home is the page people open daily, so it is
     * the only place that heartbeat reliably happens — dropping it would leave
     * those badges accruing only on the days somebody visited Rewards.
     *
     * Returns 'none' and writes nothing for anyone who has not earned a
     * standing, including admins, who are off the ladder entirely. Failing is
     * not an error worth showing anybody: 0081/0082 may not be applied, or the
     * device may be offline.
     */
    try {
      await supabase.rpc("record_ladder_standing");
    } catch {
      // See above. The badges simply do not gain a day.
    }

    return {
      profile, checkIn, insight, streak, banked: streakNow.banked,
      quests: extra ? [...quests, extra] : quests,
      bioSignal, setup,
      week, acwr, activity,
      nextSession, hasProgram: programCount > 0, trainedToday,
      nutriToday: (nutriToday ?? null) as { calories_eaten: number | null; daily_calorie_target: number | null } | null,
    };
    // v2: banked. A cached v1 entry shows no shields to somebody who has two,
    // and the shields are the part that stops a bad evening ending the streak.
  }, [user.id], `home:v2:${user.id}`);

  const firstName = data?.profile?.full_name?.split(" ")[0] ?? "athlete";
  const streak = data?.streak ?? 0;

  /**
   * Memoised because ShareMomentCard reads it in an effect keyed on the object:
   * a fresh literal every render would re-run the lookup on every render.
   */
  const shareLink = athleteShareLink(
    (data?.profile as { username?: string | null } | null)?.username,
    !!(data?.profile as { public_profile?: boolean | null } | null)?.public_profile,
  );
  const momentInput = useMemo(() => ({
    name: firstName,
    streak,
    // The card said "pocketathlete.com" for everybody. Migrations 0107 and 0108
    // both exist to make a share creditable to the person who made it, and
    // neither did anything until something passed this.
    link: shareLink,
  }), [firstName, streak, shareLink]);
  // Tool order, accent and tagline all come from here — see lib/sport-profile.ts.
  const sport = sportProfile((data?.profile as { sport?: string } | null)?.sport);

  // First-run: send brand-new athletes through onboarding.
  const needsOnboarding = data?.profile != null && (data.profile as { onboarded?: boolean }).onboarded === false;
  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding");
  }, [needsOnboarding, router]);

  if (loading || needsOnboarding) return <Skeleton />;

  // From the saved target — not recomputed. Three places already worked out
  // calories and two of them disagreed; a fourth here would be the same bug.
  const kcalLeft = data!.nutriToday?.daily_calorie_target
    ? data!.nutriToday.daily_calorie_target - (data!.nutriToday.calories_eaten ?? 0)
    : null;

  // WHAT YOU CAME FOR, THEN WHAT YOU'VE EARNED — in that order.
  //
  // Home used to open with a streak, a rank, an XP bar, a four-step checklist
  // and a full-width "Start today's check-in" card. Every one of those is a
  // demand, and they all arrived before the app had been useful once. For
  // someone fitting training around school or a job that reads as a chore list
  // from something they pay for.
  //
  // The tools come first now. The check-in is a slim optional line that says
  // outright the app works without it, because it does — the program, the
  // library, video analysis and fuelling targets never needed it. Progress and
  // goals still exist, below, for the people who like them.
  /**
   * ONE RENDER, CHECKED IN OR NOT.
   *
   * There used to be two whole branches — a "no check-in yet" page and a real
   * one — which is why the same greeting, notification strip and tool grid were
   * maintained twice and had already drifted apart. The Today card carries that
   * state natively: the check-in row is simply unticked, which says what to do
   * more plainly than a separate page ever did.
   */
  const input: CheckInInput = {
    pain_map: data!.checkIn?.pain_map ?? {},
    fatigue_score: data!.checkIn?.fatigue_score ?? null,
    sleep_quality: data!.checkIn?.sleep_quality ?? null,
    nutrition_quality: data!.checkIn?.nutrition_quality ?? null,
    weight_kg: data!.checkIn?.weight_kg ?? null,
    is_match_day: data!.checkIn?.is_match_day ?? false,
    match_minutes_played: data!.checkIn?.match_minutes_played ?? 0,
  };
  // Home already knew whether you had trained today — it ticks a quest with it
  // — and the coach line underneath was still written as if you had not, telling
  // somebody who trained at seven to "train today, keep the intensity".
  // bioSignal was computed on load and then dropped on the floor — the whole
  // point of importing a watch export is this line.
  const readiness = assessReadiness(input, {
    acwr: data!.acwr.ratio,
    trainedToday: data!.trainedToday,
    biometric: data!.bioSignal,
  });
  const coachText = data!.insight?.ai_summary_text ?? readiness.advice;
  const watchZone = data!.insight?.focus_body_part ?? readiness.focus_body_part;
  const actionTag = actionLabel(data!.insight?.recommended_action ?? null);
  const readinessLabel = !data!.checkIn ? null
    : readiness.status === "Green" ? "Good to go"
    : readiness.status === "Yellow" ? "Ease off a little" : "Recovery day";

  return (
    <div className="animate-fade-up space-y-5">
      <Greeting name={firstName} sub="Here's your day." streak={streak} banked={data!.banked} />

      {/* Same promise as Progress: the numbers on this page are being redone,
          and nothing disappears while that happens. */}
      {revalidating && (
        <p className="flex items-center gap-2 text-xs text-slate-500" role="status">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pitch-400" />
          Bringing your numbers up to date…
        </p>
      )}

      <Notifications userId={user.id} />

      {/* THE DAY, THEN THE CONTEXT FOR IT.
          Home stacked eleven sections with the daily job third, including a
          second navigation grid and the same three actions repeated lower down
          as "daily quests" — so the page asked for the same thing twice, in two
          different voices. An athlete with ninety seconds before training met a
          homepage rather than an app.

          Everything cut went somewhere it already belonged: the tool grid to
          the nav bar that was always there, the wearable card to Progress
          (which now charts it properly), and rank and quests into the card
          below, where the reward sits underneath the work instead of three
          scrolls away from it. */}
      {/* NO PROGRAM, OR A FINISHED ONE, IS NOT A "DAY" — it's one decision, and
          it deserves the whole card rather than a row inside a checklist. This
          is the first-run call to action and the single most valuable thing a
          new athlete can do, so it stays as prominent as it ever was. Once a
          block exists the day takes over and this never appears again. */}
      {(!data!.hasProgram || !data!.nextSession) && (
        <NextUp
          hasProgram={data!.hasProgram}
          nextSession={data!.nextSession}
          trainedToday={data!.trainedToday}
          accent={sport.accent}
        />
      )}

      {/* ASKED AT THE MOMENT, NOT PARKED BEHIND A BUTTON.
          The share card existed on two screens under "Share my progress", and
          nobody opens a progress page in order to post — people post when
          something just happened. This renders only when there IS something,
          and never twice for the same thing. See lib/share-moment.ts. */}
      <ShareMomentCard input={momentInput} />

      <TodayCard
        quests={data!.quests}
        sessionTitle={data!.nextSession?.title ?? null}
        sessionSub={data!.nextSession ? `Week ${data!.nextSession.week} · ${data!.nextSession.drills} exercise${data!.nextSession.drills === 1 ? "" : "s"}` : null}
        kcalLeft={kcalLeft}
        readinessLabel={readinessLabel}
      />

      {/* THE PAGE GOT EMPTIER THE MORE YOU DID.
          Home is one card by design, and that was right — but tick all three
          quests and the reward was a screen with less on it than when you
          arrived. The week strip is what the day adds up to, and the data was
          already being fetched and thrown away. */}
      <WeekStrip
        days={data!.week.days}
        sessions={data!.week.sessions}
        minutes={data!.week.minutes}
        // Progress's teal, not the sport accent — see the note on the prop.
        // Rugby and basketball made this strip orange, which read as a warning
        // on the card that exists to say the week has gone well.
        accent="#5fd3c4"
        complete={data!.quests.every((q) => q.done)}
      />

      {/* THE NUMBERS YOUR SPORT IS MEASURED IN, WHERE THE XP BAR USED TO BE.
          A runner gets distance and pace, a lifter weight moved, a rugby player
          contact minutes — chosen from what they actually log rather than from
          what they signed up as. See lib/home-stats.ts. */}
      <HomeStats stats={data!.activity} />

      {/* Only once they have checked in. A readiness gauge before any input is
          a dial pointing at nothing, and the coach has nothing to go on. */}
      {data!.checkIn && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="card flex items-center justify-center p-6 pt-8 lg:col-span-1">
            <ReadinessGauge score={readiness.score} status={readiness.status} />
          </div>
          <div className="space-y-5 lg:col-span-2">
            <div className="card overflow-hidden p-5 sm:p-6">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pitch-400" /> AI Coach
                </span>
                {actionTag && <span className="chip text-accent-400">{actionTag}</span>}
              </div>
              <p className="text-sm leading-relaxed text-slate-200 sm:text-base">{coachText}</p>
              {watchZone && <div className="chip mt-3 text-readiness-red">⚠️ Watch zone: {watchZone}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Both conditional — they render nothing when there is nothing to say. */}
      <SorenessCard painMap={data!.checkIn?.pain_map ?? {}} focus={readiness.focus_body_part} />
      {/* Same condition as the NextUp card above, so the two can never both be
          telling you to build a program. */}
      <GettingStarted setup={data!.setup} showingProgramCta={!data!.hasProgram || !data!.nextSession} />
    </div>
  );
}

/**
 * ONE thing to do, stated plainly.
 *
 * The real complaint wasn't that the app asks a lot — it's that everything on
 * this page had the same weight, so nothing said where to start. A readiness
 * gauge, a rank, an XP bar, four quick links, three quests and a checklist all
 * shouting at once is a page you bounce off, not a page you use.
 *
 * So home now answers one question above the fold: what should I do right now?
 * It's derived, not generic — the actual next session in the actual block, by
 * name. Everything else on the page is support for that answer or is below it.
 */
function NextUp({ hasProgram, nextSession, trainedToday, accent }: {
  hasProgram: boolean;
  nextSession: { title: string; week: number; drills: number } | null;
  trainedToday: boolean;
  /** Sport accent — the one place on home that visibly belongs to their sport. */
  accent: string;
}) {
  // Ordered by what's genuinely most useful, not by what we'd like them to do.
  const card = !hasProgram
    ? {
        href: "/coach",
        eyebrow: "Start here",
        title: "Build your training program",
        sub: "Answer a few questions and the coach writes you a four-week block. Everything else works better once this exists.",
        cta: "Build it",
      }
    : nextSession
      ? {
          href: "/coach",
          eyebrow: trainedToday ? "Next session" : "Today",
          title: nextSession.title,
          sub: `Week ${nextSession.week} · ${nextSession.drills} exercise${nextSession.drills === 1 ? "" : "s"}${
            trainedToday ? " · you've already logged something today, so this can wait" : ""
          }`,
          cta: trainedToday ? "Have a look" : "Start session",
        }
      : {
          href: "/coach",
          eyebrow: "Block complete",
          title: "Build your next block",
          sub: "You've finished every session in this one. The next block progresses from what you actually did.",
          cta: "Build it",
        };

  return (
    <Link
      href={card.href}
      className="card-premium card-hover block border-l-4 p-5 sm:p-6"
      style={{ borderLeftColor: accent }}
    >
      <span className="eyebrow" style={{ color: accent }}>{card.eyebrow}</span>
      <h2 className="mt-1 text-xl font-extrabold leading-tight sm:text-2xl">{card.title}</h2>
      <p className="mt-2 text-sm text-slate-400">{card.sub}</p>
      <span className="btn-primary mt-4 inline-block">{card.cta} →</span>
    </Link>
  );
}


/**
 * The check-in, offered rather than demanded.
 *
 * The old card was full-width, premium-styled and said "Start today's check-in"
 * above "A minute of sleep, soreness and how you feel". A minute, every day,
 * before anything else — and it was the first thing on the page. This says what
 * it's for, how long it really takes now, and that skipping it costs nothing,
 * which is true and worth saying out loud.
 */
/**
 * Shown only when they've reported real soreness.
 *
 * Threshold is 4/10 — below that it's ordinary training stiffness and a card
 * offering rehab every time someone ticks a 2 would be noise, which is how
 * people learn to ignore the one that matters.
 */
function SorenessCard({ painMap, focus }: { painMap: Record<string, number>; focus: string | null }) {
  const worst = Math.max(0, ...Object.values(painMap).map((v) => Number(v) || 0));
  if (worst < 4 || !focus) return null;
  const bad = worst >= 7;

  return (
    <Link
      href="/injury"
      className={`card card-hover flex items-center gap-3 border-l-4 p-4 ${bad ? "border-l-readiness-red" : "border-l-amber-400"}`}
    >
      <span className="text-2xl">🩹</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-slate-100">
          Your {focus} is at {worst}/10
        </span>
        <span className="block text-xs text-slate-400">
          {bad
            ? "Get a graded plan to load it safely — and if it's this sore for more than a couple of weeks, see a physio."
            : "Build a rehab plan around it, or find mobility work for the area."}
        </span>
      </span>
      <span className="shrink-0 text-xs font-bold text-accent-400">Open →</span>
    </Link>
  );
}

function CheckInNudge() {
  return (
    <Link href="/journal" className="card card-hover flex items-center gap-3 p-4">
      <span className="text-2xl">🌤️</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-slate-100">Tune today to how you&apos;re feeling</span>
        <span className="block text-xs text-slate-400">
          Three taps, about ten seconds. Skip it and everything above still works.
        </span>
      </span>
      <span className="shrink-0 text-xs font-bold text-accent-400">Open →</span>
    </Link>
  );
}



/**
 * The things this app does that aren't part of the daily loop.
 *
 * IT USED TO BE THE SAME LIST TWICE. Home already shows "Today" — check in,
 * train, eat — and, when there's no program, a full-width gold card saying
 * BUILD IT. This checklist then repeated three of those four as its own to-do
 * list, several thousand pixels down the same screen. Someone with a ten-day
 * streak and today's check-in still to do was shown "Check in" in Today and
 * "Try a check-in" down here, under a heading that said "Things you haven't
 * tried yet" — which was, for them, simply false.
 *
 * Three stacked to-do lists is not three times the guidance. It's the reader
 * having to work out which list is the real one.
 *
 * So anything the day already asks for is filtered out, and what's left is what
 * this card is genuinely for: the parts of the app you'd otherwise never find.
 */
function GettingStarted({ setup, showingProgramCta }: {
  setup: { checkedIn: boolean; hasProgram: boolean; hasVideo: boolean; loggedNutrition: boolean };
  /** The gold "build your program" card is on screen — don't say it again. */
  showingProgramCta: boolean;
}) {
  const steps = [
    // Checking in and logging food are daily quests in the card above. They are
    // deliberately NOT repeated here; a permanent row telling you to do a thing
    // you do every morning stops being information after day one.
    { done: setup.hasProgram, href: "/coach", title: "Build your training program", sub: "The AI coach periodises it to your goal", hide: showingProgramCta },
    { done: setup.hasVideo, href: "/train", title: "Analyse a video", sub: "Upload a clip for a technique breakdown", hide: false },
  ].filter((s) => !s.hide);

  const doneCount = steps.filter((s) => s.done).length;
  const [hidden, setHidden] = useState(false);

  // Once the core loop is set up, this disappears for good.
  if (!steps.length || doneCount === steps.length || hidden) return null;
  const next = steps.find((s) => !s.done);

  return (
    /* A plain card, not `card-premium`. The premium treatment is a gold glow,
       and the "build your program" hero at the top of this page is the other
       thing wearing it. Two glowing gold cards on one screen means neither is
       the primary — and this one, by definition, is the optional extras. */
    <section className="card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="eyebrow">Worth a look</span>
          <h2 className="mt-1 text-lg font-extrabold">More the app can do</h2>
        </div>
        <button onClick={() => setHidden(true)} className="tap-target shrink-0 text-xs text-slate-500 hover:text-slate-300">Hide</button>
      </div>

      <ol className="mt-4 space-y-1.5">
        {steps.map((st) => (
          <li key={st.href}>
            <Link
              href={st.href}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                st.done
                  ? "border-white/5 bg-white/[0.02] opacity-60"
                  : st === next
                    ? "border-pitch-400/40 bg-pitch-400/[0.06] hover:bg-pitch-400/10"
                    : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
              }`}
            >
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs ${st.done ? "border-pitch-400 bg-pitch-400 text-on-accent" : "border-white/25 text-transparent"}`}>✓</span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold ${st.done ? "text-slate-400 line-through" : "text-slate-100"}`}>{st.title}</span>
                {!st.done && <span className="block text-xs text-slate-400">{st.sub}</span>}
              </span>
              {st === next && <span className="shrink-0 text-xs font-bold text-accent-400">Start →</span>}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}


function Greeting({ name, sub, streak = 0, banked = 0 }: { name: string; sub: string; streak?: number; banked?: number }) {
  return (
    <header className="flex items-start justify-between">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Hi {name} <span className="inline-block">👋</span>
        </h1>
        <p className="mt-1 text-sm text-slate-400">{sub}</p>
      </div>
      {streak > 0 && (
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <span className="chip text-accent-400" title="Consecutive days logged">🔥 {streak}-day streak</span>
          {/* THE SHIELDS BELONG NEXT TO THE FIRE, not on a page nobody opens
              on a bad day. Somebody deciding at 11pm whether to bother needs to
              already know a missed day is survivable — Rewards explains the
              rule, this is what makes them go and read it. */}
          {banked > 0 && (
            <span
              className="chip text-slate-300"
              title={`${banked} rest day${banked === 1 ? "" : "s"} banked — a missed day won't end your streak`}
            >
              {"🛡️".repeat(banked)}
            </span>
          )}
        </div>
      )}
    </header>
  );
}

/**
 * Shaped like the page it stands in for.
 *
 * It was a heading bar, a tall card and a short card — which was roughly right
 * for the OLD home and is wrong for this one, so every load settled with a jump
 * as a 6-tile grid appeared where a 28px card had been. A skeleton whose
 * proportions don't match the real layout is worse than none: it promises a
 * shape and then breaks it.
 */
function Skeleton() {
  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="h-9 w-40 animate-pulse rounded-lg bg-white/5" />
      {/* NextUp — the tall primary card */}
      <div className="card h-44 animate-pulse" />
      {/* CheckInNudge — one slim row */}
      <div className="card h-16 animate-pulse" />
      {/* ToolGrid — 2 columns on mobile, 3 from sm, six tiles (the seventh is
          /coach, which the primary card above already links to) */}
      <div>
        <div className="mb-2 h-3 w-24 animate-pulse rounded bg-white/5" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="card h-24 animate-pulse" />)}
        </div>
      </div>
    </div>
  );
}

/**
 * Today's fuel, on the front page.
 *
 * Nutrition was the seventh of seven tiles in the tool grid for football, rugby
 * and basketball, and on a phone it sat behind the More sheet — so the one paid
 * feature with a job to do EVERY DAY was the hardest thing in the app to reach.
 * You cannot build a habit out of something that takes three taps to find.
 *
 * Reads the saved target rather than recomputing one. Three places already
 * calculated calories and two of them disagreed; adding a fourth here would
 * reintroduce exactly the bug that took a day to unpick. This is the number the
 * athlete themselves is working to.
 */
function FuelCard({ nutri }: { nutri: { calories_eaten: number | null; daily_calorie_target: number | null } | null }) {
  const eaten = nutri?.calories_eaten ?? 0;
  const target = nutri?.daily_calorie_target ?? 0;

  // Nothing set up yet — an invitation, not an empty progress bar reading 0%.
  if (!target) {
    return (
      <Link href="/nutrition" className="card card-hover flex items-center gap-3 p-4">
        <span className="text-lg" aria-hidden>🍽️</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-100">What should I eat today?</span>
          <span className="block text-xs text-slate-400">Calorie and protein targets from your body and training.</span>
        </span>
        <span className="shrink-0 text-accent-400">→</span>
      </Link>
    );
  }

  const left = target - eaten;
  const pct = Math.min(100, Math.round((eaten / target) * 100));
  // "600 left" is the actionable phrasing; "you are 600 over" is the honest one
  // once they have passed it. Neither is a telling-off.
  const headline = left > 0
    ? `${left.toLocaleString()} kcal left today`
    : left === 0 ? "Bang on target" : `${Math.abs(left).toLocaleString()} kcal over`;

  return (
    <Link href="/nutrition" className="card card-hover block p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="stat-label">🍽️ Today&apos;s fuel</div>
          <div className="mt-0.5 text-lg font-extrabold text-slate-100">{headline}</div>
          <div className="text-xs text-slate-500">{eaten.toLocaleString()} of {target.toLocaleString()} kcal</div>
        </div>
        <span className="shrink-0 text-accent-400">→</span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-pitch-400 to-pitch-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </Link>
  );
}
