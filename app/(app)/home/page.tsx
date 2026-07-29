"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { assessReadiness } from "@/lib/readiness";
import { actionLabel } from "@/lib/insights";
import { checkInStreak, computeACWR } from "@/lib/load";
import { dailyQuests, computeXp, levelFor, type ActivityStats, type LevelInfo } from "@/lib/gamification";
import { biometricSignal, type Biometric } from "@/lib/biometrics";
import { sportProfile } from "@/lib/sport-profile";
import { ReadinessGauge } from "@/components/ReadinessGauge";
import { BiometricSignalCard } from "@/components/BiometricSignalCard";
import { Notifications } from "@/components/Notifications";
import type { CheckInInput, DailyInsight, TrainingLog } from "@/lib/types";
import type { ProgramPlan } from "@/lib/engine";

export default function HomePage() {
  const user = useCurrentUser();
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const since = new Date(Date.now() - 40 * 86400_000).toISOString().slice(0, 10);
    const [{ data: profile }, { data: checkIn }, { data: streakRows }, { data: trainToday }, { data: nutriToday }] = await Promise.all([
      supabase.from("profiles").select("full_name, onboarded, sport").eq("id", user.id).maybeSingle(),
      supabase.from("daily_check_ins").select("*").eq("user_id", user.id).eq("check_in_date", today).maybeSingle(),
      supabase.from("daily_check_ins").select("check_in_date").eq("user_id", user.id).gte("check_in_date", since),
      supabase.from("training_logs").select("log_date").eq("user_id", user.id).eq("log_date", today).maybeSingle(),
      supabase.from("nutrition_logs").select("log_date").eq("user_id", user.id).eq("log_date", today).maybeSingle(),
    ]);
    const { data: bio } = await supabase.from("biometrics").select("*").eq("user_id", user.id)
      .gte("metric_date", new Date(Date.now() - 28 * 86400_000).toISOString().slice(0, 10)).order("metric_date", { ascending: true });
    const bioHistory = (bio ?? []) as Biometric[];
    const bioSignal = biometricSignal(bioHistory.find((b) => b.metric_date === today) ?? null, bioHistory);
    let insight: DailyInsight | null = null;
    if (checkIn) {
      const { data: ins } = await supabase
        .from("daily_insights").select("*").eq("user_id", user.id).eq("check_in_id", checkIn.id).maybeSingle();
      insight = (ins ?? null) as DailyInsight | null;
    }
    // Cheap existence checks so "Getting started" can show real progress.
    // The plan itself, not just a count — home can't name the one thing worth
    // doing without knowing which session is next.
    const [{ data: activeProgram }, { count: videoCount }] = await Promise.all([
      supabase.from("programs").select("plan, completed_sessions").eq("user_id", user.id)
        .eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("videos").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    ]);
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
    const streak = checkInStreak((streakRows ?? []).map((r) => r.check_in_date));
    const quests = dailyQuests({ checkedInToday: !!checkIn, trainedToday: !!trainToday, nutritionToday: !!nutriToday });

    // Rank + week-at-a-glance. Home used to show none of this, so an athlete
    // who hadn't checked in yet landed on a single empty-state card with
    // nothing to look at and no reason to stay.
    const head = { count: "exact" as const, head: true };
    const [allChecks, allTraining, progs, benchC, videoC, allNutrition] = await Promise.all([
      supabase.from("daily_check_ins").select("check_in_date").eq("user_id", user.id),
      // intensity and drills come along so the readiness verdict can account for
      // training load — without them sessionLoad has nothing to work with and
      // ACWR silently reads as "building" forever.
      supabase.from("training_logs").select("log_date, total_minutes, intensity, drills").eq("user_id", user.id),
      supabase.from("programs").select("completed_sessions, status").eq("user_id", user.id),
      supabase.from("strength_benchmarks").select("id", head).eq("user_id", user.id),
      supabase.from("ai_plans").select("id", head).eq("user_id", user.id),
      supabase.from("nutrition_logs").select("log_date").eq("user_id", user.id),
    ]);
    const since7 = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);
    const checkDates = (allChecks.data ?? []).map((r) => r.check_in_date as string);
    const trainRows = (allTraining.data ?? []) as { log_date: string; total_minutes: number | null }[];
    const programs = (progs.data ?? []) as { completed_sessions: string[] | null; status: string }[];
    const stats: ActivityStats = {
      checkIns: checkDates.length,
      streak,
      trainingSessions: trainRows.length,
      completedSessions: programs.reduce((n, p) => n + (p.completed_sessions?.length ?? 0), 0),
      completedBlocks: programs.filter((p) => p.status === "archived").length,
      benchmarks: benchC.count ?? 0,
      videos: videoC.count ?? 0,
      nutritionLogs: (allNutrition.data ?? []).length,
      checkInsLast7: checkDates.filter((d) => d >= since7).length,
    };
    const week = {
      sessions: trainRows.filter((r) => r.log_date >= since7).length,
      minutes: trainRows.filter((r) => r.log_date >= since7).reduce((n, r) => n + (r.total_minutes ?? 0), 0),
      checkIns: stats.checkInsLast7,
    };
    // "Getting started" asks whether they've EVER done each thing. It used to
    // ask whether they'd checked in TODAY, so the onboarding checklist rose from
    // the dead every morning they hadn't — a first-run card nagging month-old
    // users, which is precisely the tone this app was accused of.
    const setup = {
      checkedIn: checkDates.length > 0,
      hasProgram: (programCount ?? 0) > 0,
      hasVideo: (videoCount ?? 0) > 0,
      loggedNutrition: (allNutrition.data ?? []).length > 0,
    };

    const acwr = computeACWR(trainRows as unknown as TrainingLog[]);
    return {
      profile, checkIn, insight, streak, quests, bioSignal, setup, stats, week, acwr,
      nextSession, hasProgram: programCount > 0, trainedToday: !!trainToday,
    };
  }, [user.id], `home:${user.id}`);

  const firstName = data?.profile?.full_name?.split(" ")[0] ?? "athlete";
  const streak = data?.streak ?? 0;
  // Tool order, accent and tagline all come from here — see lib/sport-profile.ts.
  const sport = sportProfile((data?.profile as { sport?: string } | null)?.sport);

  // First-run: send brand-new athletes through onboarding.
  const needsOnboarding = data?.profile != null && (data.profile as { onboarded?: boolean }).onboarded === false;
  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding");
  }, [needsOnboarding, router]);

  if (loading || needsOnboarding) return <Skeleton />;

  const level = levelFor(computeXp(data!.stats));

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
  if (!data?.checkIn) {
    return (
      <div className="animate-fade-up space-y-6">
        <Greeting name={firstName} sub={sport.tagline} streak={streak} />
        <Notifications userId={user.id} />

        <NextUp hasProgram={data!.hasProgram} nextSession={data!.nextSession} trainedToday={data!.trainedToday} accent={sport.accent} />
        <CheckInNudge />
        <ToolGrid tools={sport.tools} />

        <GettingStarted setup={data!.setup} />
        <RankStrip level={level} week={data!.week} />
        <DailyQuests quests={data!.quests} />
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
  const readiness = assessReadiness(input, { acwr: data.acwr.ratio });
  const coachText = data.insight?.ai_summary_text ?? readiness.advice;
  const watchZone = data.insight?.focus_body_part ?? readiness.focus_body_part;
  const actionTag = actionLabel(data.insight?.recommended_action ?? null);

  return (
    <div className="animate-fade-up space-y-6">
      <Greeting name={firstName} sub="Here's where you're at today." streak={streak} />

      <Notifications userId={user.id} />

      {/* The action first, then the readiness that qualifies it. Readiness on
          its own is a number; what to do with it is the product. */}
      <NextUp hasProgram={data.hasProgram} nextSession={data.nextSession} trainedToday={data.trainedToday} accent={sport.accent} />

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
        </div>
      </div>

      <ToolGrid tools={sport.tools} />

      <BiometricSignalCard signal={data!.bioSignal} />

      <GettingStarted setup={data!.setup} />
      <RankStrip level={level} week={data!.week} />
      <DailyQuests quests={data!.quests} />
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
 * Everything else, deliberately quiet.
 *
 * Small, uniform, unlabelled with progress or counts — a drawer you open when
 * you want something, not six more things asking to be done. It sits below the
 * one real answer so the page has an obvious top.
 */
function ToolGrid({ tools }: { tools: { href: string; title: string; icon: string }[] }) {
  // Order comes from lib/sport-profile.ts. Same six destinations for everyone —
  // hiding features by sport would stop a footballer who wants to lift — but a
  // weightlifter shouldn't scan past video analysis to reach their plan, and a
  // runner's first stop is load, not drills. Wording matches the nav, because
  // two names for one destination on one screen is the confusion being removed.
  return (
    <div>
      <h2 className="field-label">Anything else</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {tools.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className="card card-hover flex flex-col items-start gap-2 p-4"
        >
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/[0.04] text-xl">{t.icon}</span>
          <span className="text-sm font-bold leading-tight text-slate-100">{t.title}</span>
        </Link>
      ))}
      </div>
    </div>
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
      <span className="shrink-0 text-xs font-bold text-pitch-400">Open →</span>
    </Link>
  );
}

/**
 * Rank, progress to the next level, and the week at a glance — one card.
 *
 * These were three separate blocks (a rank strip, a four-tile stat row, and a
 * Playbook card that pointed at the same place as one of the quick links).
 * Home had ten stacked sections and read as a dashboard of dashboards; level
 * appeared twice, and Playbook twice. Same information, a third of the height.
 */
function RankStrip({ level, week }: { level: LevelInfo; week: { sessions: number; minutes: number; checkIns: number } }) {
  const toNext = level.xpForNext - level.xpIntoLevel;
  const stats = [
    { label: "Sessions", value: String(week.sessions) },
    { label: "Trained", value: week.minutes >= 60 ? `${Math.round(week.minutes / 60)}h` : `${week.minutes}m` },
    // Was "3/7". A denominator turns a record of what you did into a score out
    // of seven you're failing, and nobody ever promised the app seven.
    { label: "Check-ins", value: String(week.checkIns) },
  ];
  return (
    <Link href="/rewards" className="card card-hover block p-4">
      <div className="flex items-center gap-4">
        <span
          className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl shadow-glow"
          style={{ background: `linear-gradient(135deg, ${level.color}, ${level.color}88)` }}
        >
          {level.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-lg font-extrabold" style={{ color: level.color }}>{level.rank}</span>
            <span className="shrink-0 text-xs text-slate-500">{toNext} XP to go</span>
          </span>
          <span className="mt-1.5 block h-2 w-full overflow-hidden rounded-full bg-white/10">
            <span
              className="block h-full rounded-full transition-all"
              style={{ width: `${Math.round(level.progress * 100)}%`, background: `linear-gradient(90deg, ${level.color}, ${level.color}aa)` }}
            />
          </span>
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/5 pt-3 text-center">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="text-lg font-extrabold text-slate-100">{s.value}</div>
            <div className="text-[11px] text-slate-500">{s.label} · 7d</div>
          </div>
        ))}
      </div>
    </Link>
  );
}

/**
 * Optional, and says so.
 *
 * Three unticked boxes labelled "quests" every morning is a debt you didn't
 * agree to, and the people most likely to feel it are exactly the ones with
 * least time. Gamification works when it's a bonus and grates when it's an
 * obligation, so this can now be turned off for good — the XP still accrues
 * from real activity either way, and /rewards still shows all of it.
 */
function DailyQuests({ quests }: { quests: { id: string; label: string; xp: number; done: boolean; href: string }[] }) {
  const done = quests.filter((q) => q.done).length;
  const [hidden, setHidden] = useState<boolean | null>(null);

  useEffect(() => {
    try { setHidden(localStorage.getItem("pa:hide-goals") === "1"); } catch { setHidden(false); }
  }, []);

  if (hidden !== false) return null; // null = not read yet, avoids a flash

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="field-label !mb-0">If you fancy it today</h2>
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/rewards" className="text-xs font-semibold text-pitch-400 hover:underline">{done}/{quests.length} · Rewards →</Link>
          <button
            type="button"
            onClick={() => { setHidden(true); try { localStorage.setItem("pa:hide-goals", "1"); } catch { /* ignore */ } }}
            className="text-xs text-slate-500 hover:text-slate-300"
            title="Hide these — XP still counts from what you actually do"
          >
            Hide
          </button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {quests.map((q) => (
          <Link key={q.id} href={q.href} className={`flex items-center gap-2 rounded-2xl border p-3 transition ${q.done ? "border-pitch-400/30 bg-pitch-400/[0.06]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}>
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs ${q.done ? "border-pitch-400 bg-pitch-400 text-ink-900" : "border-white/20 text-transparent"}`}>✓</span>
            <span className={`flex-1 text-xs font-medium ${q.done ? "text-slate-400 line-through" : "text-slate-100"}`}>{q.label}</span>
            <span className="text-[10px] font-bold text-pitch-400">+{q.xp}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function GettingStarted({ setup }: { setup: { checkedIn: boolean; hasProgram: boolean; hasVideo: boolean; loggedNutrition: boolean } }) {
  const steps = [
    { done: setup.checkedIn, href: "/journal", title: "Try a check-in", sub: "Three taps — it tunes your session to how you feel" },
    { done: setup.hasProgram, href: "/coach", title: "Build your training program", sub: "The AI coach periodises it to your goal" },
    { done: setup.hasVideo, href: "/train", title: "Analyse a video", sub: "Upload a clip for a technique breakdown" },
    { done: setup.loggedNutrition, href: "/nutrition", title: "Set your nutrition", sub: "Calorie & macro targets, meal plan" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const [hidden, setHidden] = useState(false);

  // Once the core loop is set up, this disappears for good.
  if (doneCount === steps.length || hidden) return null;
  const next = steps.find((s) => !s.done);

  return (
    <section className="card-premium p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="eyebrow">Worth a look · {doneCount}/{steps.length}</span>
          <h2 className="mt-1 text-lg font-extrabold">Things you haven&apos;t tried yet</h2>
        </div>
        <button onClick={() => setHidden(true)} className="shrink-0 text-xs text-slate-500 hover:text-slate-300">Hide</button>
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
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs ${st.done ? "border-pitch-400 bg-pitch-400 text-ink-900" : "border-white/25 text-transparent"}`}>✓</span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold ${st.done ? "text-slate-400 line-through" : "text-slate-100"}`}>{st.title}</span>
                {!st.done && <span className="block text-xs text-slate-400">{st.sub}</span>}
              </span>
              {st === next && <span className="shrink-0 text-xs font-bold text-pitch-400">Start →</span>}
            </Link>
          </li>
        ))}
      </ol>
    </section>
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
