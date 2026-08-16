"use client";

import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { useTier } from "@/lib/use-tier";
import { can } from "@/lib/subscription";
import { FeatureLock } from "@/components/FeatureLock";
import { CoachChat } from "@/components/CoachChat";
import { buildBriefing } from "@/lib/coach-briefing";
import { describeRehab, type RehabPlanRow } from "@/lib/rehab-plan";
import { currentPain } from "@/lib/pain";
import { effortCheck } from "@/lib/effort";
import { latestBodyweight } from "@/lib/bodyweight";
import { nutritionTargets } from "@/lib/nutrition";
import { rankedLifts, bodyPartStrength, weakestLink, testedMaxesFrom } from "@/lib/strength-standards";
import { relevantInjuryProtocols, baseAreaOf } from "@/lib/essentials";
import { assessReadiness } from "@/lib/readiness";
import { computeACWR } from "@/lib/load";
import { painByArea } from "@/lib/coach";
import { selectProfile } from "@/lib/profile-columns";
import { daysAgoLocal, todayLocal } from "@/lib/day";
import type { CheckInInput, DailyCheckIn, Program, StrengthBenchmark, TrainingLog } from "@/lib/types";
import type { GoalType } from "@/lib/coach";

/**
 * Ask the coach — its own page, with the whole athlete behind it.
 *
 * IT WAS THE THIRD TAB OF /coach, and it was given four facts: the goal, the
 * NAMES of sore areas, a readiness colour, and the names of the drills in the
 * next session. So an athlete could ask "how's my rehab plan going?" and be
 * answered by something that had never seen their rehab plan — reported, and
 * fair. A coach that answers confidently without the evidence is worse than no
 * coach, because you cannot tell which answers were grounded.
 *
 * A tab is also the wrong shape for this. The chat is the one part of the app
 * you arrive at with a question already formed, rather than something you
 * browse into from a training block — the same argument that moved Injury out
 * of the third tab of Guides.
 *
 * WHY THE PAGE ASSEMBLES THE BRIEFING RATHER THAN THE EDGE FUNCTION. The
 * function has a service key and could fetch all of this itself, saving a round
 * trip — and would then hold a second implementation of every derived number in
 * the app: a second calorie target, a second definition of "sore", a second
 * strength ranking. This codebase has been bitten by exactly that before (see
 * the note atop lib/nutrition.ts about two calorie calculations). Sending what
 * the app already computed guarantees the coach is discussing the same athlete
 * the rest of the screens are showing.
 */
export default function AskCoachPage() {
  const user = useCurrentUser();
  const { tier, loading: tierLoading } = useTier();
  const today = todayLocal();

  const { data, loading } = useAsync(async () => {
    const supabase = createClient();
    const since30 = daysAgoLocal(29);
    const since14 = daysAgoLocal(13);

    const [
      program, checkIn, training, profile, weighCheck, weighBody,
      benches, allDrills, nutriToday, nutriRecent, rehab,
    ] = await Promise.all([
      supabase.from("programs").select("*").eq("user_id", user.id).eq("status", "active")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      // The latest check-in whatever its date — the pain map is aged below
      // rather than filtered here, so an old report is discounted rather than
      // hidden. See lib/pain.ts.
      supabase.from("daily_check_ins").select("*").eq("user_id", user.id)
        .order("check_in_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("training_logs").select("*").eq("user_id", user.id).gte("log_date", since30)
        .order("log_date", { ascending: true }),
      selectProfile(supabase, user.id, "full_name, sport, position, positions, training_focus, sex, height_cm, birth_year, activity_level, diet_goal", []),
      supabase.from("daily_check_ins").select("check_in_date, weight_kg").eq("user_id", user.id)
        .not("weight_kg", "is", null).order("check_in_date", { ascending: false }).limit(1),
      supabase.from("body_logs").select("log_date, weight_kg").eq("user_id", user.id)
        .not("weight_kg", "is", null).order("log_date", { ascending: false }).limit(1),
      supabase.from("strength_benchmarks").select("*").eq("user_id", user.id)
        .order("test_date", { ascending: false }).limit(20),
      supabase.from("training_logs").select("log_date, drills").eq("user_id", user.id).not("drills", "is", null),
      supabase.from("nutrition_logs").select("calories_eaten, macros").eq("user_id", user.id).eq("log_date", today).maybeSingle(),
      supabase.from("nutrition_logs").select("calories_eaten, macros").eq("user_id", user.id).gte("log_date", since14),
      /**
       * THEIR OWN REHAB PLAN, which the briefing never had.
       *
       * `relevantInjuryProtocols` is the app's static guidance for a body area
       * — identical for everybody with a sore hamstring. This is the graded
       * plan written for THIS injury, with the stage they are on. Its absence
       * is the whole of "it's not reading my injury plan in ask coach": the
       * coach had the textbook and not the athlete's notes.
       */
      supabase.from("rehab_plans").select("*").eq("user_id", user.id).eq("active", true)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const pr = profile as {
      full_name?: string; sport?: string; position?: string; positions?: string[];
      training_focus?: string; sex?: string; height_cm?: number; birth_year?: number;
      activity_level?: string; diet_goal?: string;
    } | null;
    const ci = checkIn.data as DailyCheckIn | null;
    const prog = program.data as Program | null;
    const logs = (training.data ?? []) as TrainingLog[];

    const bodyweight = latestBodyweight({
      checkIns: (weighCheck.data ?? []).map((r) => ({ date: r.check_in_date as string, kg: r.weight_kg as number })),
      weighIns: (weighBody.data ?? []).map((r) => ({ date: r.log_date as string, kg: r.weight_kg as number })),
    });

    // Aged, so a knee reported in March is discounted rather than presented to
    // the coach as today's problem.
    const pain = currentPain(ci?.pain_map, ci?.check_in_date, today);
    const sex = (pr?.sex === "female" ? "female" : "male") as "male" | "female";

    const ranks = bodyweight?.kg ? rankedLifts(
      (allDrills.data ?? []) as TrainingLog[], bodyweight.kg, sex,
      testedMaxesFrom(benches.data ?? []),
    ) : [];
    const parts = bodyPartStrength(ranks);

    const avgMinutes = logs.length
      ? Math.round(logs.reduce((n, l) => n + (l.total_minutes ?? 0), 0) / 30)
      : 0;
    const injured = Object.values(pain).some((v) => (Number(v) || 0) >= 4);

    const targets = nutritionTargets({
      weightKg: bodyweight?.kg ?? null,
      goal: (prog?.goal_type ?? null) as GoalType | null,
      avgTrainingMinutes: avgMinutes,
      heightCm: pr?.height_cm ?? null,
      age: pr?.birth_year ? new Date().getFullYear() - pr.birth_year : null,
      sex,
      activity: (pr?.activity_level as never) ?? null,
      dietGoal: (pr?.diet_goal as never) ?? null,
      trainingDaysLogged: logs.length,
      injured,
    });

    const readiness = ci ? assessReadiness({
      pain_map: pain,
      fatigue_score: ci.fatigue_score, sleep_quality: ci.sleep_quality,
      nutrition_quality: ci.nutrition_quality, weight_kg: ci.weight_kg,
      is_match_day: ci.is_match_day, match_minutes_played: ci.match_minutes_played,
    } as CheckInInput, { acwr: computeACWR(logs).ratio }) : null;

    const plan = prog?.plan ?? null;
    const done = prog?.completed_sessions ?? [];
    const allSessions = (plan?.weeks ?? []).flatMap((w) => w.sessions.map((s) => ({ w: w.week, s })));
    const next = allSessions.find(({ w, s }) => !done.includes(`w${w}d${s.day}`));
    const totalSessions = allSessions.length;

    /**
     * THE CLOSED LIST OF WHAT IS ACTUALLY PRESCRIBED.
     *
     * The briefing used to carry the next session's drills and nothing else, so
     * a question about the block as a whole had almost nothing behind it — and
     * the coach filled the gap, telling an athlete their preacher curls were
     * going well when no preacher curl had ever been prescribed. Every drill in
     * the plan, deduplicated, keeping the order it appears in so the first
     * names are the ones they see most.
     */
    const programExercises = Array.from(new Set(
      (plan?.weeks ?? []).flatMap((w) => w.sessions.flatMap((sn) => sn.drills.map((d) => d.name))),
    ));

    // "Going well" is a claim about performance, so it needs what was actually
    // done rather than what was planned.
    const loggedExercises = Array.from(new Set(
      logs.flatMap((t) => (t.drills ?? []).map((d) => String(d.name ?? "").trim()).filter(Boolean)),
    )).slice(0, 60);

    const recent = (nutriRecent.data ?? []) as { calories_eaten: number | null; macros: { protein?: number } | null }[];
    const avgOf = (pick: (r: (typeof recent)[0]) => number | null | undefined) => {
      const ns = recent.map(pick).filter((n): n is number => typeof n === "number" && n > 0);
      return ns.length ? Math.round(ns.reduce((a, b) => a + b, 0) / ns.length) : null;
    };
    const todayRow = nutriToday.data as { calories_eaten: number | null; macros: { protein?: number } | null } | null;

    const briefing = buildBriefing({
      sport: pr?.sport, positions: pr?.positions?.length ? pr.positions : (pr?.position ? [pr.position] : []),
      focus: pr?.training_focus, sex, bodyweight,
      goal: (prog?.goal_type ?? null) as GoalType | null,
      blockWeek: next?.w ?? null,
      adherencePct: totalSessions ? Math.round((done.length / totalSessions) * 100) : null,
      inSeason: !!prog?.in_season,
      nextSessionTitle: next?.s.title ?? null,
      nextSessionDrills: (next?.s.drills ?? []).map((d) => ({
        name: d.name, prescription: d.prescription, intensity: d.intensity,
      })),
      programExercises,
      loggedExercises,
      effort: effortCheck(logs.map((t) => t.intensity), plan),
      readinessStatus: (readiness?.status as "Green" | "Yellow" | "Red") ?? null,
      readinessReason: readiness?.advice ?? null,
      fatigue: ci?.fatigue_score ?? null,
      sleepQuality: ci?.sleep_quality ?? null,
      pain,
      painReportedOn: ci?.check_in_date ?? null,
      protocols: relevantInjuryProtocols(pain),
      // Their own generated plan and the stage they are on — see lib/rehab-plan.ts.
      rehab: describeRehab(rehab.data as RehabPlanRow | null),
      targets,
      eatenToday: todayRow ? { calories: todayRow.calories_eaten, protein: todayRow.macros?.protein ?? null } : null,
      avgCalories: avgOf((r) => r.calories_eaten),
      avgProtein: avgOf((r) => r.macros?.protein),
      ranks, parts, weak: weakestLink(parts),
      benchmarks: latestBenchmarkValues((benches.data ?? []) as StrengthBenchmark[]),
    });

    return {
      briefing,
      // The narrow shape the offline fallback answers from — see CoachChat.
      context: {
        goal: (prog?.goal_type ?? null) as GoalType | null,
        soreAreas: Object.entries(painByArea(pain)).filter(([, v]) => (v ?? 0) >= 4).map(([a]) => a.replace("_", " ")),
        readinessStatus: (readiness?.status as "Green" | "Yellow" | "Red") ?? null,
        programDrills: (next?.s.drills ?? []).map((d) => d.name),
      },
      /** Prompts that only appear when the coach can actually answer them. */
      suggestions: [
        ...(relevantInjuryProtocols(pain).length ? ["How is my rehab plan going?"] : []),
        ...(next ? ["Why is this session built this way?"] : []),
        ...(readiness ? ["Should I train hard today?"] : []),
        ...(targets ? ["Am I eating enough for this block?"] : []),
        ...(ranks.length ? ["What is my weakest area and how do I fix it?"] : []),
      ].slice(0, 4),
    };
  }, [user.id], `ask:${user.id}`);

  const header = (
    <header className="mb-5">
      <h1 className="text-3xl font-extrabold tracking-tight">Ask coach</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-400">
        Your plan, your injuries, your food and your lifts — all in front of it before you ask.
      </p>
    </header>
  );

  if (loading || tierLoading) {
    return <div className="mx-auto max-w-3xl">{header}<div className="card h-96 animate-pulse" /></div>;
  }

  if (!can(tier, "ai_chat")) {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        <FeatureLock
          capability="ai_chat"
          title="Ask your coach anything"
          blurb="A coach that has already read your training block, your rehab plan and its stages, today's readiness, your calorie targets and every lift you have ranked — then answers in your own numbers."
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-up mx-auto max-w-3xl">
      {header}
      <CoachChat
        context={data!.context}
        briefing={data!.briefing}
        suggestions={data!.suggestions.length ? data!.suggestions : undefined}
      />
      {/* WHAT IT CAN SEE, said plainly. An athlete who does not know the coach
          has their rehab plan will not ask about it, and one who assumes it can
          see things it cannot will be misled by a confident answer. */}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        It can see your current block and next session, today&apos;s readiness and check-in, anything
        you have marked as sore along with the rehab protocol for it, your calorie and protein
        targets against what you have logged, and every lift it has ranked. It cannot see anything
        you have not recorded — if it says a number is missing, that is why.
      </p>
    </div>
  );
}

/** Newest recorded value per benchmark metric. */
function latestBenchmarkValues(rows: StrengthBenchmark[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of [...rows].sort((a, b) => b.test_date.localeCompare(a.test_date))) {
    for (const [k, v] of Object.entries(r.metrics ?? {})) if (!(k in out) && typeof v === "number") out[k] = v;
  }
  return out;
}
