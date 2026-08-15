"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Icon, type IconName } from "@/components/Icon";
import { ConfirmButton } from "@/components/ConfirmButton";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import {
  GOALS, goalsForSport, buildProgram, analyzeProgress, painByArea,
  FOCI,
  type GoalType, type ProgramPlan, type TrainingFocus,
} from "@/lib/coach";
import { adjustForReadiness, type ReadinessStatus } from "@/lib/engine";
import { repairPlan } from "@/lib/program-repair";
import { useJobs } from "@/lib/jobs";
import { positionList } from "@/lib/positions";
import { currentPain, painAgeNote } from "@/lib/pain";
import { effortCheck, prescribedEffort } from "@/lib/effort";
import { PositionPicker } from "@/components/PositionPicker";
import { FeatureLock, tierOfSub } from "@/components/FeatureLock";
import { can } from "@/lib/subscription";
import type { SportId } from "@/lib/exercises";
import type { SplitStyle } from "@/lib/hypertrophy";
import { templatesForSport } from "@/lib/programs";
import { assessReadiness } from "@/lib/readiness";
import { computeACWR } from "@/lib/load";
import { invokeAI } from "@/lib/api";
import {
  RACE_GOALS, thresholdPaceFromBenchmarks, paceZones, formatPace, formatPaceRange,
  ZONE_LIST, type RunnerLevel,
} from "@/lib/running";
import { track } from "@/lib/funnel";
import { METRIC_CATALOG, metricDef, benchmarkProgress } from "@/lib/benchmarks";
import { RingProgress } from "@/components/RingProgress";
import { Tabs, TabPanel } from "@/components/Tabs";
import { CoachChat } from "@/components/CoachChat";
import { ProgramCalendar } from "@/components/ProgramCalendar";
import { SessionDrills } from "@/components/SessionDrills";
import { WorkoutPlayer, type SessionResult } from "@/components/WorkoutPlayer";
import type { CheckInInput, DailyCheckIn, Program, StrengthBenchmark, Tier, TrainingLog, TrainingDrill } from "@/lib/types";
import { daysAgoLocal, todayLocal } from "@/lib/day";

/** Latest recorded value per benchmark metric, newest test first. */
function latestBenchmarks(rows: StrengthBenchmark[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of [...rows].sort((a, b) => b.test_date.localeCompare(a.test_date))) {
    for (const [k, v] of Object.entries(r.metrics ?? {})) if (!(k in out) && typeof v === "number") out[k] = v;
  }
  return out;
}

function dedupeDrills(drills: TrainingDrill[]): TrainingDrill[] {
  const seen = new Set<string>();
  return drills.filter((d) => {
    const k = d.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function deadlineInfo(startDate: string, targetDate: string, adherencePct: number) {
  const start = new Date(startDate).getTime();
  const end = new Date(targetDate).getTime();
  const now = Date.now();
  const daysLeft = Math.ceil((end - now) / 86400_000);
  const elapsedPct = end > start ? Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100)) : 0;
  const onTrack = adherencePct >= elapsedPct - 10;
  return { daysLeft, elapsedPct: Math.round(elapsedPct), onTrack };
}

function readinessOf(checkIn: DailyCheckIn | null, training: TrainingLog[] = []) {
  if (!checkIn) return null;
  const input: CheckInInput = {
    pain_map: checkIn.pain_map ?? {},
    fatigue_score: checkIn.fatigue_score,
    sleep_quality: checkIn.sleep_quality,
    nutrition_quality: checkIn.nutrition_quality,
    weight_kg: checkIn.weight_kg,
    is_match_day: checkIn.is_match_day,
    match_minutes_played: checkIn.match_minutes_played,
  };
  // Training load is part of the verdict, not a separate panel — see
  // lib/readiness.ts. Without this the plan page can tell you you're good to go
  // while Progress shows a red load spike.
  return assessReadiness(input, { acwr: computeACWR(training).ratio });
}

type CoachTab = "today" | "program";
const COACH_TABS: { id: CoachTab; label: string; icon: IconName }[] = [
  { id: "today", label: "Today", icon: "bolt" },
  { id: "program", label: "Program", icon: "calendar" },
];

export default function CoachPage() {
  const user = useCurrentUser();
  const today = todayLocal();

  const { data, loading, reload } = useAsync(async () => {
    const supabase = createClient();
    const since = daysAgoLocal(30);
    const [{ data: program }, { data: checkIn }, { data: training }, { data: checkHist }, { data: benches }, { data: profile }, { data: sub }] = await Promise.all([
      supabase.from("programs").select("*").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("daily_check_ins").select("*").eq("user_id", user.id).eq("check_in_date", today).maybeSingle(),
      supabase.from("training_logs").select("*").eq("user_id", user.id).gte("log_date", since).order("log_date", { ascending: true }),
      supabase.from("daily_check_ins").select("check_in_date, pain_map").eq("user_id", user.id).gte("check_in_date", since).order("check_in_date", { ascending: true }),
      supabase.from("strength_benchmarks").select("*").eq("user_id", user.id).order("test_date", { ascending: false }).limit(20),
      supabase.from("profiles").select("sport, position, positions, training_focus").eq("id", user.id).maybeSingle(),
      supabase.from("subscriptions").select("tier, status").eq("user_id", user.id).maybeSingle(),
    ]);
    const p = profile as { sport?: string; position?: string; positions?: string[]; training_focus?: string } | null;
    return {
      program: (program ?? null) as Program | null,
      checkIn: (checkIn ?? null) as DailyCheckIn | null,
      training: (training ?? []) as TrainingLog[],
      checkHist: (checkHist ?? []) as { check_in_date: string; pain_map: Record<string, number> | null }[],
      latestBench: latestBenchmarks((benches ?? []) as StrengthBenchmark[]),
      sport: (p?.sport ?? "football") as SportId,
      // Profiles written before 0042 only have the single column.
      positions: positionList(p?.positions?.length ? p.positions : p?.position),
      focus: (p?.training_focus ?? "performance") as TrainingFocus,
      tier: tierOfSub(sub as { tier?: Tier; status?: string } | null),
    };
  }, [user.id], `coach:${user.id}`);

  // Title first, always — see the note in nutrition/page.tsx. Matches the
  // heading and lead the loaded page uses, so nothing shifts when data lands.
  if (loading) {
    return (
      <div className="animate-fade-up">
        <header className="mb-5">
          <h1 className="text-3xl font-extrabold tracking-tight">My plan</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-400">
            Your four-week training block — what to do, in what order, and how it progresses.
          </p>
        </header>
        <div className="card h-80 animate-pulse" />
      </div>
    );
  }

  // Programs are the paid product. An existing program stays readable — someone
  // who lapses shouldn't lose the block they're mid-way through — but building
  // a new one needs Pro.
  if (!data?.program && !can(data?.tier ?? "bronze", "program")) {
    return (
      <div className="animate-fade-up">
        <header className="mb-5">
          <h1 className="text-3xl font-extrabold tracking-tight">My plan</h1>
          <p className="mt-1 max-w-prose text-sm text-slate-400">
            Your four-week training block — what to do, in what order, and how it progresses.
          </p>
        </header>
        <FeatureLock
          capability="program"
          title="Training programs are part of Pro"
          blurb="Four-week blocks built around your sport, your position and how recovered you are — progressing Base, Build, Peak, Deload. Your check-ins, readiness and the full drill library stay free."
        />
      </div>
    );
  }

  if (!data?.program) {
    return (
      <GoalBuilder
        // Aged. This is where a NEW block is generated, so a knee reported once
        // in March would otherwise be designed around for the rest of the year.
        painMap={currentPain(data?.checkIn?.pain_map, data?.checkIn?.check_in_date, todayLocal())}
        painNote={painAgeNote(data?.checkIn?.check_in_date, todayLocal())}
        latestBench={data?.latestBench ?? {}}
        sport={data?.sport ?? "football"}
        initialPositions={data?.positions ?? []}
        initialFocus={data?.focus ?? "performance"}
        userId={user.id}
        onCreated={reload}
      />
    );
  }

  return (
    <ActiveProgram
      program={data.program}
      checkIn={data.checkIn}
      training={data.training}
      checkHist={data.checkHist}
      userId={user.id}
      today={today}
      latestBench={data.latestBench}
      sport={data.sport}
      focus={data.focus}
      positions={data.positions}
      onChange={reload}
    />
  );
}

// --- Goal builder -----------------------------------------------------------

function GoalBuilder({ painMap, painNote, latestBench, sport, initialPositions, initialFocus, userId, onCreated }: { painMap: Record<string, number>; painNote: string | null; latestBench: Record<string, number>; sport: SportId; initialPositions: string[]; initialFocus: TrainingFocus; userId: string; onCreated: () => void }) {
  const goals = goalsForSport(sport);
  const [goal, setGoal] = useState<GoalType | null>(null);
  const [positions, setPositions] = useState<string[]>(initialPositions);
  const [focus, setFocus] = useState<TrainingFocus>(initialFocus);
  const [inSeason, setInSeason] = useState(false);
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [targetDate, setTargetDate] = useState("");
  const [metric, setMetric] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [notes, setNotes] = useState("");
  // Runner inputs. Only asked for when they'd change the block — see the form
  // below — and defaulted so a runner who ignores them still gets a sane plan.
  const [raceGoalId, setRaceGoalId] = useState("general");
  const [weeklyKm, setWeeklyKm] = useState("");
  const [runnerLevel, setRunnerLevel] = useState<RunnerLevel>("intermediate");
  const [creating, setCreating] = useState(false);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { start: startJob } = useJobs();

  const sore = Object.entries(painByArea(painMap)).filter(([, v]) => (v ?? 0) >= 4).map(([a]) => a.replace("_", " "));

  /**
   * Build and save a program.
   *
   * Runs as a background job so you can leave this page while it works. The
   * AI call can take the best part of a minute for a four-week block, and
   * before this you had to sit and watch it — on a phone, on a page you had
   * already read. The job survives navigating away; the tray tells you when
   * it's done.
   */
  function createProgram(g: GoalType, f: TrainingFocus, pos: string[], tileId?: string, style?: SplitStyle, days?: number) {
    setGoal(g); setFocus(f); setPositions(pos);
    setCreating(true);
    setBuildingId(tileId ?? null);
    setError(null);
    startJob("program", "Building your program", () => buildAndSave(g, f, pos, style, days));
  }

  async function buildAndSave(g: GoalType, f: TrainingFocus, pos: string[], style?: SplitStyle, days?: number) {
    const supabase = createClient();

    // Paces come from whatever race they've actually logged, so the plan is
    // written in their numbers rather than in zone names alone.
    const thresholdSecPerKm = thresholdPaceFromBenchmarks(latestBench);
    const runInput = {
      weeklyKm: weeklyKm ? Number(weeklyKm) : null,
      runnerLevel,
      raceGoalId,
      thresholdSecPerKm,
    };

    /**
     * A RUNNER'S BLOCK IS BUILT LOCALLY, NOT BY THE MODEL.
     *
     * generate-program knows about sets, reps and drills; it has never been
     * told what a threshold session is, so it answers a runner with a gym block
     * and the local engine's run plan never gets a look in. The on-device
     * engine is the one that understands this sport, so for runs it isn't the
     * fallback — it's the answer.
     */
    if (sport === "running" && (g === "endurance" || g === "speed")) {
      const plan = buildProgram({
        goal: g, painMap, isInSeason: inSeason, sport, position: pos, focus: f,
        daysPerWeek: days ?? daysPerWeek, notes, ...runInput,
      });
      return await savePlan(plan, g, f, pos);
    }

    // Prefer the AI backend (Cloudflare Worker / Edge Function); fall back to the
    // local engine (works offline / on Pages).
    let plan: ProgramPlan;
    try {
      const data = await invokeAI<{ plan?: ProgramPlan }>("generate-program", { goal: g, pain_map: painMap, notes, in_season: inSeason, sport, position: pos, focus: f, days_per_week: days ?? daysPerWeek, split: style });
      if (!data?.plan) throw new Error("fallback");
      /**
       * TRUST THE MODEL WITH THE TRAINING, NOT WITH THE SAFETY SCAFFOLDING.
       *
       * This used to be `plan = data.plan` — whatever came back was shown to
       * the athlete verbatim. Programs that had always opened with mobility
       * work and closed with a stretch started arriving as a bare list of
       * lifts, and nothing here noticed, because the only check was that a
       * `plan` key existed.
       *
       * The Worker's source is not in this repository, so a change to it
       * cannot be caught in review. This is the boundary where that gets
       * checked instead. See lib/program-repair.ts.
       */
      const repaired = repairPlan(data.plan, {
        goal: g, painMap, isInSeason: inSeason, sport, position: pos, focus: f,
        daysPerWeek: days ?? daysPerWeek,
      });
      // Logged rather than surfaced: the athlete gets a correct program either
      // way, and "your backend is misbehaving" is not their problem to read.
      // `slotless` is worth its own line — it means the backend sent no slot
      // labels at all, which the repair used to treat as unfixable and now
      // recovers by name from the movement library.
      if (repaired.report.repaired.length || repaired.report.slotless || repaired.report.toppedUp.length) {
        console.warn(
          `generate-program returned ${repaired.report.slotless ? "a plan with no slot labels" : "sessions missing a warm-up or cool-down"}` +
          `; recovered ${repaired.report.inferred} slot(s) by name, added scaffolding to ` +
          `${repaired.report.repaired.length} session(s), topped up ${repaired.report.toppedUp.length} short week(s)`,
          repaired.report,
        );
      }
      plan = repaired.plan;
    } catch (e) {
      // 402 is the server saying this needs Pro, and 403 that the account is
      // deactivated. Neither means "the backend is down", so neither may fall
      // through to the local engine — that would quietly overrule our own
      // paywall and build the program anyway.
      const status = (e as { status?: number })?.status;
      if (status === 402 || status === 403) {
        setError(e instanceof Error ? e.message : "This is part of Pro.");
        setCreating(false);
        setBuildingId(null);
        return;
      }
      // `notes` matters as much here as on the AI path — without it the local
      // engine ignored "I don't train legs" and prescribed squats anyway.
      plan = buildProgram({ goal: g, painMap, isInSeason: inSeason, sport, position: pos, focus: f, daysPerWeek: days ?? daysPerWeek, notes, style, ...runInput });
    }

    return await savePlan(plan, g, f, pos);
  }

  /** Persist a built block. Split out so the run path and the gym path share it. */
  async function savePlan(plan: ProgramPlan, g: GoalType, f: TrainingFocus, pos: string[]) {
    const supabase = createClient();

    // Remember the athlete's positions + focus for next time.
    await supabase.from("profiles").update({ positions: pos, position: pos[0] ?? null, training_focus: f }).eq("id", userId);

    // Insert the new block BEFORE archiving the old one. The other order
    // archives what they're following and then, if the insert is refused,
    // leaves them with no program at all — having just asked for a better one.
    const { data: current } = await supabase
      .from("programs").select("id").eq("user_id", userId).eq("status", "active");
    const baseline = metric ? latestBench[metric] ?? null : null;
    const { error: insErr } = await supabase.from("programs").insert({
      user_id: userId, goal_type: g, goal_notes: notes || null, plan, status: "active",
      in_season: inSeason, target_date: targetDate || null, block: 1,
      target_metric: metric || null, target_value: targetValue ? Number(targetValue) : null, baseline_value: baseline,
    });
    if (insErr) {
      setCreating(false);
      setBuildingId(null);
      // Thrown, not swallowed: the job runner catches it and the tray shows the
      // real reason, which works whether or not you're still on this page.
      throw new Error(insErr.message);
    }
    // Safe now. One active program at a time, so stand the previous one down.
    const priorIds = (current ?? []).map((p) => p.id);
    if (priorIds.length) {
      await supabase.from("programs").update({ status: "archived" }).in("id", priorIds);
    }
    setCreating(false);
    setBuildingId(null);
    // Milestone: a plan exists. Carries seconds-since-signup automatically, so
    // "how long from account to program" becomes a query — see lib/funnel.ts.
    // Fired on every build, not just the first: funnel_summary counts DISTINCT
    // users, so first-time conversion stays correct and the repeat count doubles
    // as a signal that people rebuild.
    track("program_built", { goal: g, block: 1 });
    onCreated();
  }

  return (
    <div className="animate-fade-up space-y-5">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">My plan</h1>
        <p className="mt-1 text-sm text-slate-400">A few quick questions and I&apos;ll build a program around you.</p>
      </header>

      {sore.length > 0 && (
        <div className="card px-4 py-3 text-sm text-readiness-red">
          ⚠️ I see soreness in your <b>{sore.join(" & ")}</b> — I&apos;ll work around it with lower-impact options.
        </div>
      )}

      {/* One-tap templates */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="field-label !mb-0">Quick-start programs</span>
          <span className="text-xs text-slate-500">tap to build instantly</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {templatesForSport(sport).map((t) => {
            const isBuilding = buildingId === t.id;
            return (
              <button
                key={t.id}
                onClick={() => createProgram(t.goal, t.focus, t.position ? [t.position] : positions, t.id, t.style, t.daysPerWeek)}
                disabled={creating}
                className={`card flex items-center gap-3 p-4 text-left transition disabled:opacity-50 ${isBuilding ? "ring-2 ring-pitch-400/70" : "card-hover"}`}
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/[0.04] text-xl">
                  {isBuilding
                    ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-pitch-500 border-t-transparent" />
                    : <Icon name={t.icon} size={22} className="text-pitch-400" />}
                </span>
                {/* min-w-0 lets the text column shrink inside the flex row —
                    without it a flex child refuses to go below its content
                    width — and break-words handles the long hyphenated blurbs
                    like "Chest-shoulders-triceps" that otherwise push the card
                    wider than the phone. */}
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-bold text-slate-100">{isBuilding ? "Building your program…" : t.name}</span>
                  <span className="block break-words text-xs text-slate-400">{isBuilding ? "A few seconds" : t.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SIX QUESTIONS, BEHIND ONE TAP.
          The quick-start tiles above already build a programme in a single tap,
          and everything down here was permanently open underneath them — so a
          new athlete met a seven-question form and never registered that the
          tiles were the answer. ROADMAP calls this out: the quiz between "build
          my program" and an actual program is what decides whether a new
          account ever sees the product work.

          Nothing is removed, and anyone who wants the control is one tap from
          all of it. */}
      <details className="group card overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-semibold text-slate-200">
          <span>
            Build your own
            <span className="ml-2 text-xs font-normal text-slate-500">pick the goal, days and focus yourself</span>
          </span>
          <span className="text-xs text-slate-500 transition group-open:rotate-180">▾</span>
        </summary>
        <div className="space-y-5 border-t border-white/[0.08] p-4">
        {/* Position / event */}
        <PositionPicker sport={sport} value={positions} onChange={setPositions} />

        {/* Training focus */}
        <div>
          {/* Was also "What are you training for?" — the same words as the race
              question further down, so the page asked one question twice and
              meant two different things by it. */}
          <span className="field-label">What kind of training?</span>
          <div className="grid grid-cols-2 gap-2">
            {FOCI.map((f) => (
              <button
                key={f.id}
                onClick={() => setFocus(focus === f.id ? initialFocus : f.id)}
                className={`card p-3 text-left transition ${focus === f.id ? "ring-2 ring-pitch-400/70 shadow-glow" : "card-hover"}`}
              >
                <div className="text-sm font-bold text-slate-100">{f.label}</div>
                <div className="mt-0.5 text-xs text-slate-400">{f.blurb}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="field-label">Your main goal</span>
          <div className="grid grid-cols-2 gap-3">
            {goals.map((g) => (
            <button
              key={g.id}
              onClick={() => setGoal(goal === g.id ? null : g.id)}
              className={`card p-4 text-left transition ${goal === g.id ? "ring-2 ring-pitch-400/70 shadow-glow" : "card-hover"}`}
            >
              <div className="font-bold text-slate-100">{g.label}</div>
              <div className="mt-0.5 text-xs text-slate-400">{g.blurb}</div>
            </button>
          ))}
          </div>
        </div>

        {/* RUNNER INPUTS.
            Only for a running block, and only three of them. A runner's plan
            hangs almost entirely on two numbers — what they're training for and
            how far they currently run in a week — and without them the engine has
            to assume, which for mileage means guessing at the one variable that
            decides whether a block builds someone or injures them.

            Shown after the goal so it appears once the goal makes it relevant,
            rather than as a permanent block of running questions a footballer has
            to scroll past. */}
        {sport === "running" && (goal === "endurance" || goal === "speed") && (
          <div className="card space-y-4 p-4">
            <div>
              <span className="field-label">Which distance?</span>
              <select
                className="field [color-scheme:dark]"
                value={raceGoalId}
                onChange={(e) => setRaceGoalId(e.target.value)}
              >
                {RACE_GOALS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              <span className="mt-1 block text-xs text-slate-500">
                {RACE_GOALS.find((r) => r.id === raceGoalId)?.note}
              </span>
            </div>

            <div>
              <span className="field-label">Current weekly mileage</span>
              <input
                type="number" inputMode="decimal" min={0} max={250} step="1"
                value={weeklyKm}
                onChange={(e) => setWeeklyKm(e.target.value)}
                placeholder="e.g. 40"
                className="field"
              />
              <span className="mt-1 block text-xs text-slate-500">
                What you run now, not what you&apos;d like to. Leave it blank and we&apos;ll start easy.
              </span>
            </div>

            <div>
              <span className="field-label">How long have you been running?</span>
              <div className="flex gap-2">
                {([
                  ["beginner", "Under a year", "1 hard session a week"],
                  ["intermediate", "A year or two", "2 hard sessions"],
                  ["advanced", "Longer", "3 hard sessions"],
                ] as const).map(([id, label, sub]) => (
                  <button
                    key={id}
                    onClick={() => setRunnerLevel(id)}
                    className={`flex-1 rounded-xl border p-2.5 text-center transition ${
                      runnerLevel === id
                        ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-400"
                        : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className="block text-xs font-bold">{label}</span>
                    <span className="mt-0.5 block text-[10px] text-slate-500">{sub}</span>
                  </button>
                ))}
              </div>
              <span className="mt-1 block text-xs text-slate-500">
                You get fitter between hard sessions, not during them.
              </span>
            </div>

            <RunnerPaces latestBench={latestBench} />
          </div>
        )}

        <div>
          <span className="field-label">Days per week</span>
          <div className="flex gap-2">
            {[2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setDaysPerWeek(n)}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-bold transition ${
                  daysPerWeek === n
                    ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-400"
                    : "border-white/10 bg-white/[0.03] text-slate-300"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">How many sessions we&apos;ll schedule each week.</p>
        </div>

        <SeasonToggle inSeason={inSeason} onChange={setInSeason} />

        {/* THE THREE OPTIONAL FIELDS, COLLAPSED.
            This is the form standing between "build my program" and a program —
            the one stretch that decides whether a new account ever sees the
            product work. Eight visible inputs read as a long form even when five
            of them are the only ones that matter; a target date, a benchmark
            target and a free-text note are all refinements you'd add on a second
            block, not things to ask before anyone has trained once.
            Collapsed, not removed: someone with a trial date in mind still wants
            them, and open is one tap. */}
        <details className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <summary className="tap-target cursor-pointer text-sm font-medium text-slate-300">
            Add a deadline or a target <span className="text-xs text-slate-500">— optional</span>
          </summary>

          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="field-label">Target date</span>
              <input type="date" className="field [color-scheme:dark]" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </label>

        {/* Measurable benchmark target */}
        <div>
          <span className="field-label">Measurable target</span>
          <div className="grid grid-cols-2 gap-2">
            <select className="field [color-scheme:dark]" value={metric} onChange={(e) => setMetric(e.target.value)}>
              <option value="">No metric</option>
              {METRIC_CATALOG.map((m) => (
                <option key={m.key} value={m.key}>{m.label}{latestBench[m.key] != null ? ` (now ${latestBench[m.key]})` : ""}</option>
              ))}
            </select>
            <input
              type="number" step="any" inputMode="decimal" disabled={!metric}
              className="field text-center disabled:opacity-40"
              value={targetValue} onChange={(e) => setTargetValue(e.target.value)}
              placeholder={metric ? `target ${metricDef(metric).unit}` : "—"}
            />
          </div>
          {metric && latestBench[metric] != null && (
            <p className="mt-1 text-xs text-slate-500">Baseline from your latest test: {latestBench[metric]} {metricDef(metric).unit}</p>
          )}
        </div>

            <label className="block">
              <span className="field-label">Anything specific?</span>
              <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. improve my first 5 metres" />
            </label>
          </div>
        </details>

        {error && <p className="text-sm text-readiness-red">{error}</p>}
        <button onClick={() => goal && createProgram(goal, focus, positions)} disabled={!goal || creating} className="btn-primary">
          {creating ? "Building your program…" : "Generate my program"}
        </button>
        {/* A dead button with no reason is the most common way a form traps
            someone: they tap, nothing happens, and there's nothing on screen
            saying why. The goal select starts empty, so this is the default state
            of the page, not an edge case. */}
        {!goal && !creating && (
          <p className="text-xs text-slate-500">Pick your main goal above and this turns on.</p>
        )}
        </div>
      </details>
    </div>
  );
}

function SeasonToggle({ inSeason, onChange }: { inSeason: boolean; onChange: (v: boolean) => void }) {
  return (
    <div>
      <span className="field-label">Season</span>
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/[0.04] p-1">
        {[
          { v: false, label: "Out-of-season", sub: "Build — higher volume" },
          { v: true, label: "In-season", sub: "Taper — recovery-weighted" },
        ].map((o) => (
          <button
            key={String(o.v)}
            onClick={() => onChange(o.v)}
            className={`rounded-xl px-3 py-2 text-center transition ${inSeason === o.v ? "bg-gradient-to-br from-pitch-400 to-pitch-600 text-ink-900" : "text-slate-300 hover:bg-white/5"}`}
          >
            <div className="text-sm font-semibold">{o.label}</div>
            <div className={`text-[10px] ${inSeason === o.v ? "text-ink-900/70" : "text-slate-500"}`}>{o.sub}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Active program ---------------------------------------------------------

function ActiveProgram({
  program, checkIn, training, checkHist, userId, today, latestBench, sport, focus, positions, onChange,
}: {
  program: Program; checkIn: DailyCheckIn | null; training: TrainingLog[];
  checkHist: { check_in_date: string; pain_map: Record<string, number> | null }[];
  userId: string; today: string; latestBench: Record<string, number>;
  sport: SportId; focus: TrainingFocus; positions: string[]; onChange: () => void;
}) {
  const plan = program.plan;
  const goal = program.goal_type as GoalType;
  /**
   * AGED, not raw. A knee marked 7/10 in March used to keep shaping every
   * programme built afterwards, because a stale report and a current one were
   * the same number — see lib/pain.ts. This is the screen that builds the
   * training, so it is the screen where a memory did the most damage.
   */
  const painMap = currentPain(checkIn?.pain_map, checkIn?.check_in_date, today);
  const readiness = readinessOf(checkIn, training);
  const insights = analyzeProgress(training, checkHist);
  /**
   * IS THIS BLOCK THE RIGHT DIFFICULTY? The engine prescribes an effort for
   * every working drill and the check-in records how hard it actually felt, on
   * the same 1-10 scale. Nothing compared them — so an athlete could report 9s
   * against a block written at 7, all month, and be handed the same block every
   * week. Both numbers were already in the database. See lib/effort.ts.
   */
  const effort = effortCheck(training.map((t) => t.intensity), plan);
  const totalSessions = plan.weeks.reduce((n, w) => n + w.sessions.length, 0);
  const doneCount = program.completed_sessions.length;
  const adherence = totalSessions ? Math.round((doneCount / totalSessions) * 100) : 0;

  // The next session that isn't ticked off — what to do today.
  const allSessions = plan.weeks.flatMap((w) => w.sessions.map((s) => ({ w: w.week, s })));
  const nextSession = allSessions.find(({ w, s }) => !program.completed_sessions.includes(`w${w}d${s.day}`));
  const complete = doneCount >= totalSessions && totalSessions > 0;
  // Whether anything has been logged today, so the page can stop calling the
  // next unticked session "today's".
  const loggedToday = training.some((t) => t.log_date === today);

  // Goal-deadline progress.
  const deadline = program.target_date ? deadlineInfo(program.start_date, program.target_date, adherence) : null;

  // Measurable benchmark target progress.
  // What today's session ACTUALLY is, once this morning's check-in is taken
  // into account. Everything downstream — the list, the guided player, what
  // gets logged — uses this rather than the version written four weeks ago.
  const todaySession = nextSession
    ? adjustForReadiness(nextSession.s, (readiness?.status as ReadinessStatus) ?? "Green")
    : null;

  const bench = (program.target_metric && program.target_value != null && program.baseline_value != null)
    ? benchmarkProgress(program.target_metric, program.baseline_value, program.target_value, latestBench[program.target_metric] ?? program.baseline_value)
    : null;

  const chatContext = {
    goal,
    soreAreas: Object.entries(painByArea(painMap)).filter(([, v]) => (v ?? 0) >= 4).map(([a]) => a.replace("_", " ")),
    readinessStatus: readiness?.status ?? null,
    programDrills: nextSession?.s.drills.map((d) => d.name) ?? [],
  };

  const [switching, setSwitching] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<CoachTab>("today");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  /**
   * Anything that went wrong changing the program. These writes all used to
   * discard their error: the tick would appear, the state would silently snap
   * back on the next load, and nothing ever said the save was refused.
   */
  const [actionError, setActionError] = useState<string | null>(null);

  async function switchSeason() {
    setSwitching(true);
    const supabase = createClient();
    const nextSeason = !program.in_season;
    // Days-per-week isn't stored on the program, so read it back off the plan —
    // rebuilding without it silently reset a 5-day athlete to the 3-day default.
    const newPlan = buildProgram({
      goal, painMap, isInSeason: nextSeason, sport, focus, position: positions,
      daysPerWeek: plan.weeks[0]?.sessions.length, notes: program.goal_notes,
    });
    const { error: seasonErr } = await supabase
      .from("programs").update({ plan: newPlan, in_season: nextSeason }).eq("id", program.id);
    setSwitching(false);
    if (seasonErr) { setActionError(`Couldn't switch phase: ${seasonErr.message}`); return; }
    onChange();
  }

  /**
   * Tick a session off, and log it as training.
   *
   * `result` is present when the guided player finished it and measured what
   * happened; absent when the athlete ticked the box by hand, in which case the
   * old estimates still apply — there is nothing better to use.
   */
  async function toggleSession(sid: string, result?: SessionResult) {
    const supabase = createClient();
    setActionError(null);
    const marking = !program.completed_sessions.includes(sid);
    const next = marking
      ? [...program.completed_sessions, sid]
      : program.completed_sessions.filter((s) => s !== sid);
    const { error: tickErr } = await supabase
      .from("programs").update({ completed_sessions: next }).eq("id", program.id);
    // Ticking a session off is the core habit of the whole app. If it doesn't
    // save, say so — the alternative is a tick that vanishes on the next visit
    // and an athlete who thinks the app lost their week.
    if (tickErr) {
      setActionError(`Couldn't save that session as done: ${tickErr.message}`);
      return;
    }

    // Milestone: they trained from the plan. The other half of the first-run
    // measurement — a program nobody trains from hasn't activated anyone.
    if (marking) {
      track("first_session", { played: result ? true : false, minutes: result?.minutes ?? 0 });
    }

    // Completing a scheduled session logs it as training so it counts toward your
    // load (ACWR) and history. Merge into today's training log.
    if (marking) {
      const sess = allSessions.find(({ w, s }) => `w${w}d${s.day}` === sid);
      if (sess) {
        /**
         * LOG WHAT WAS PRESCRIBED TODAY, NOT WHAT WAS WRITTEN FOUR WEEKS AGO.
         *
         * On a low-readiness morning the session is eased — a set trimmed off
         * every working drill, RPE down a notch, or on Red replaced outright by
         * a recovery spin — and the card, the drill list and the guided player
         * all use that eased version. This logged `sess.s`, the original.
         *
         * So the app told you to do less, walked you through less, and then
         * wrote down the full prescription. Everything downstream believed it:
         * ACWR treated a deliberately easy day as a full one, the volume chart
         * over-counted, and the effort check compared how hard you said it felt
         * against a prescription you were never actually given.
         *
         * Only for the session shown as today's. Ticking off a different day
         * from the calendar is not a claim about this morning's readiness, so
         * it keeps the plan's own numbers.
         */
        const isToday = nextSession && sid === `w${nextSession.w}d${nextSession.s.day}`;
        const logged = isToday && todaySession ? todaySession : sess.s;
        // What actually happened, when the player measured it.
        //
        // This used to log a flat 45 minutes and the PRESCRIBED reps for every
        // session, however long it took and whatever was actually completed —
        // then ACWR, the nutrition targets and the whole readiness verdict were
        // computed off that fiction. The player already had the real numbers and
        // dropped them on the floor. `result` is absent when a session is ticked
        // off by hand rather than played, and 45 is still the estimate then.
        const newDrills = logged.drills.map((d) => ({
          name: d.name,
          sets: d.sets,
          reps: result?.repsByDrill[d.name] != null
            // repsByDrill is the TOTAL across sets; drills store per-set reps.
            ? Math.max(0, Math.round(result.repsByDrill[d.name] / Math.max(1, d.sets)))
            : d.reps,
          load_kg: null,
        }));
        const { data: existing } = await supabase
          .from("training_logs").select("drills, total_minutes, intensity").eq("user_id", userId).eq("log_date", today).maybeSingle();
        const merged = dedupeDrills([...(existing?.drills ?? []), ...newDrills]);
        /**
         * WHAT THE ATHLETE SAID BEATS WHAT WE GUESSED.
         *
         * This wrote a flat 7 (or 4 for rehab) unconditionally and did not even
         * read the existing row's intensity — so somebody who reported a 9 in
         * their check-in and then ticked the session off had their 9 replaced
         * by the app's own invention. Then lib/effort.ts compares reported
         * effort against prescribed effort to decide whether a block is too
         * hard, which against a hardcoded 7 would have been the app marking its
         * own homework.
         *
         * The estimate is now the session's OWN prescribed effort rather than a
         * constant, so an untouched rehab day reads as light and a heavy
         * strength day reads as heavy — but only ever as a fallback, when the
         * athlete has not said.
         */
        const prescribed = prescribedEffort({ weeks: [{ sessions: [logged] }] } as never);
        const intensity = existing?.intensity ?? prescribed ?? (logged.title.includes("Rehab") ? 4 : 7);
        await supabase.from("training_logs").upsert(
          {
            user_id: userId,
            log_date: today,
            drills: merged,
            total_minutes: (existing?.total_minutes ?? 0) + (result?.minutes ?? 45),
            intensity,
          },
          { onConflict: "user_id,log_date" }
        );
      }
    }
    onChange();
  }

  async function startNextBlock() {
    setAdvancing(true);
    const supabase = createClient();
    const nextBlock = program.block + 1;
    const newPlan = buildProgram({
      goal, painMap, isInSeason: program.in_season, block: nextBlock, sport, focus, position: positions,
      daysPerWeek: plan.weeks[0]?.sessions.length, notes: program.goal_notes,
    });
    // Insert first, archive second. The other order archives the block they're
    // on and then, if the insert fails, leaves them with no active program at
    // all — their training plan gone, with nothing on screen to say why.
    const { error: insErr } = await supabase.from("programs").insert({
      user_id: userId, goal_type: program.goal_type, goal_notes: program.goal_notes, plan: newPlan,
      status: "active", in_season: program.in_season, target_date: program.target_date, block: nextBlock,
    });
    if (insErr) {
      setAdvancing(false);
      setActionError(`Couldn't start the next block: ${insErr.message}`);
      return;
    }
    await supabase.from("programs").update({ status: "archived" }).eq("id", program.id);
    setAdvancing(false);
    onChange();
  }


  async function newProgram() {
    setActionError(null);
    const { error } = await createClient().from("programs").update({ status: "archived" }).eq("id", program.id);
    if (error) { setActionError(`Couldn't archive this block: ${error.message}`); return; }
    onChange();
  }

  /**
   * Actually removes it, rather than archiving. "New goal" keeps the old block
   * around so its completed sessions stay in your history; this is for a
   * program you never wanted — built by mistake, or abandoned — which
   * otherwise sits in the table forever with no way to be rid of it.
   */
  async function deleteProgram() {
    setDeleting(true);
    const { error } = await createClient().from("programs").delete().eq("id", program.id);
    setDeleting(false);
    if (error) { setDeleteError(error.message); return; }
    onChange();
  }

  return (
    <div className="animate-fade-up space-y-5">
      {/* A refused write has to be visible. Without this the tick just doesn't
          stick and the athlete blames the app for losing their session. */}
      {actionError && (
        <div className="rounded-2xl border border-readiness-red/30 bg-readiness-red/10 p-3 text-sm text-slate-200">
          {actionError}
          <button onClick={() => setActionError(null)} className="ml-2 text-xs text-slate-400 hover:text-pitch-400">Dismiss</button>
        </div>
      )}
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">My plan</h1>
          <p className="mt-1 text-sm capitalize text-pitch-400">
            {GOALS.find((g) => g.id === goal)?.label} program · Block {program.block}
          </p>
        </div>
        {/* BOTH ESCAPE ROUTES EXISTED AND NEITHER READ AS ONE.
            "New goal" is what someone clicks when they've FINISHED a goal, not
            when the program they were just given is wrong — so an athlete with a
            bad first block had the fix in front of them and no reason to think
            it was the fix.

            "Delete" was also the dimmest thing on the page — the way out of a
            mistake shouldn't be the hardest thing to see. It's slate-400 now.

            An earlier version of this comment claimed slate-600 failed AA at
            3.1:1. That was wrong: it quoted Tailwind's stock #475569, and
            tailwind.config.ts overrides slate-600 to #717f96 precisely so the
            muted tiers pass. Measured against this app's real background it's
            4.88:1 — a pass. The change was still worth making; the reason given
            for it wasn't true. */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          {/* Archives the block you are part-way through. Delete below already
              asked before acting; this did not, and it is the one people reach
              for by accident because it sits at the top of the card. */}
          <ConfirmButton
            onConfirm={newProgram}
            question="Archive this block and start again?"
            confirmLabel="Rebuild it"
            destructive={false}
            className="tap-target text-xs font-semibold text-slate-300 hover:text-pitch-400"
          >
            Not right? Rebuild it
          </ConfirmButton>
          {/* Was a hand-rolled inline confirm — "Delete for good" and "Cancel"
              side by side inside this shrink-0 column, which on a 375px phone
              ran straight off the card. Same dialog as everything else now, so
              there is one confirmation layout to keep working rather than two. */}
          <ConfirmButton
            onConfirm={deleteProgram}
            disabled={deleting}
            question="Delete this block for good? Its completed sessions go with it."
            confirmLabel={deleting ? "Deleting…" : "Delete for good"}
            className="tap-target text-xs text-slate-400 hover:text-readiness-red"
          >
            Delete
          </ConfirmButton>
          {deleteError && <span className="max-w-[12rem] text-right text-[10px] text-readiness-red">{deleteError}</span>}
        </div>
      </header>

      {/* Today's session and today's recommended drills used to sit stacked with
          the calendar and the chat below, which left the athlete deciding which
          of two "today" blocks to actually do. Grouped into tabs instead. */}
      {/* Shared strip, not a fourth copy of the same markup — see components/Tabs. */}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Tabs tabs={COACH_TABS} active={tab} onChange={setTab} label="Plan sections" />
        </div>
        {/* WHERE THE THIRD TAB USED TO BE.
            Ask coach is its own page now, and anybody who learned to find it
            here would otherwise just find it gone. It is not a seventh entry in
            the mobile tab bar because that would put every slot at 42.9px on a
            320px phone — measured — against this codebase's 44px floor. Six
            slots give 50.3px. So: the sidebar, the top of the More sheet, and
            here, next to the plan it will be asked about. */}
        <Link
          href="/ask"
          className="tap-target inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]"
        >
          <Icon name="chat" className="h-4 w-4" aria-hidden />
          Ask coach
        </Link>
      </div>

      {/* ONE panel wrapping every tab-conditional block below, keyed to the
          active tab. Per-block panels would mean three elements sharing
          `id="panel-program"`, because a tab here owns several sections
          rather than one. This way the id the selected tab points at always
          exists and is always unique. */}
      <TabPanel id={tab}>

      {/* Deadline-near nudge */}
      {tab === "today" && deadline && deadline.daysLeft >= 0 && deadline.daysLeft <= 7 && (
        <div className="card px-4 py-3 text-sm" style={{ color: deadline.onTrack ? "#34d399" : "#fbbf24" }}>
          ⏳ {deadline.daysLeft === 0 ? "Target date is today" : `${deadline.daysLeft} day(s) to your target`} — {deadline.onTrack ? "you're on pace, finish strong." : "you're behind pace, get a session in."}
        </div>
      )}

      {/* Benchmark target progress */}
      {tab === "program" && bench && (
        <div className="card flex items-center gap-4 p-5">
          <RingProgress pct={bench.pct} color={bench.achieved ? "#34d399" : "#e3b53f"} sub="to goal" />
          <div className="flex-1">
            <div className="stat-label">{metricDef(program.target_metric!).label}</div>
            <div className="mt-0.5 text-lg font-extrabold text-slate-100">{bench.label}</div>
            <div className="text-xs text-slate-400">
              {bench.achieved ? "🎯 Target hit — log a new test or set a fresh goal." : `Latest test: ${bench.current} ${metricDef(program.target_metric!).unit}`}
            </div>
          </div>
        </div>
      )}

      {/* Block complete → progress to the next block */}
      {complete && (
        <div className="card p-5 text-center shadow-glow ring-1 ring-pitch-400/40">
          <div className="text-3xl">🎉</div>
          <h2 className="mt-1 text-lg font-extrabold">Block {program.block} complete!</h2>
          <p className="mt-1 text-sm text-slate-400">Every session ticked off. Your next block steps volume up {program.block * 8}% and re-checks your pain.</p>
          <button onClick={startNextBlock} disabled={advancing} className="btn-primary mx-auto mt-4 max-w-[16rem]">
            {advancing ? "Building block " + (program.block + 1) + "…" : `Start block ${program.block + 1}`}
          </button>
        </div>
      )}

      {/* Adherence, the goal deadline and the season switch are facts about the
          PROGRAM, but they rendered on every tab — so "Today", which should be
          one session and a few drills, opened with a wall of block metadata. */}
      {tab === "program" && (
      <div className="card p-5">
        <div className="flex items-center gap-4">
          <RingProgress pct={adherence} label={`${doneCount}/${totalSessions}`} sub="sessions" />
          <div className="flex-1">
            <p className="text-sm leading-relaxed text-slate-200">{plan.summary}</p>
            {plan.constraints.map((c) => (
              <div key={c} className="chip mt-2 text-readiness-red">⚠️ {c}</div>
            ))}
          </div>
        </div>

        {/* Goal deadline */}
        {deadline && (
          <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/[0.04] px-4 py-3">
            <div>
              <div className="text-xs font-semibold text-slate-200">🎯 Target {program.target_date}</div>
              <div className="text-[11px] text-slate-500">{deadline.daysLeft > 0 ? `${deadline.daysLeft} days to go` : "deadline passed"}</div>
            </div>
            <span className="chip" style={{ color: deadline.onTrack ? "#34d399" : "#fbbf24" }}>
              {deadline.onTrack ? "On track" : "Behind pace"}
            </span>
          </div>
        )}

        {/* Season switch */}
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-white/[0.04] px-4 py-3">
          <div>
            <div className="text-xs font-semibold text-slate-200">{program.in_season ? "🏟️ In-season" : "🏋️ Out-of-season"}</div>
            <div className="text-[11px] text-slate-500">{program.in_season ? "Tapered, recovery-weighted" : "Build phase, higher volume"}</div>
          </div>
          <button onClick={switchSeason} disabled={switching} className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/5 disabled:opacity-50">
            {switching ? "…" : `Switch to ${program.in_season ? "out-of-season" : "in-season"}`}
          </button>
        </div>
      </div>
      )}

      {/* Readiness-aware: what to do today */}
      {tab === "today" && nextSession && todaySession && (
        <section className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            {/* "Today's session" was shown unconditionally, but nextSession is
                simply the next UNTICKED one — so after you'd trained it kept
                presenting the following session as today's, which is how people
                end up doing two in a day or assuming the app lost the first. */}
            <h2 className="field-label !mb-0">{loggedToday ? "Next session" : "Today’s session"}</h2>
            {readiness && (
              <span className="chip" style={{ color: readiness.status === "Green" ? "#34d399" : readiness.status === "Yellow" ? "#fbbf24" : "#fb5d6b" }}>
                Readiness {readiness.status}
              </span>
            )}
          </div>
          {/* The session shown is the ADJUSTED one. Readiness used to be
              measured, displayed, then ignored: Yellow told you to cut a set
              and left you to do it, Red told you to rest and gave you nothing
              to open. Now the plan itself changes. */}
          <div>
            {readiness?.status === "Red" ? (
              <div className="mb-3 rounded-2xl bg-readiness-red/10 p-3 text-sm text-slate-200">
                Readiness is <b className="text-readiness-red">Red</b>, so today&apos;s{" "}
                <b>{nextSession.s.title.split("· ")[1] ?? "session"}</b> has been swapped for active
                recovery. {readiness.advice} It still counts toward your block.
              </div>
            ) : readiness?.status === "Yellow" ? (
              /* YELLOW WAS SILENT. Red got a paragraph explaining the swap;
                 Yellow trimmed a set off every working drill and dropped the
                 RPE a notch, and said so only by appending "· eased back" to a
                 title. An athlete who does not know a set was removed will
                 either add it back or think the app has miscounted — and one
                 who does not know why will not trust it the next time. */
              <div className="mb-3 rounded-2xl bg-amber-500/10 p-3 text-sm text-slate-200">
                Readiness is <b className="text-amber-400">Yellow</b>, so today&apos;s session has
                been eased — a set off each working drill and the target effort down a notch.{" "}
                {readiness.advice} What you actually do is what gets logged.
              </div>
            ) : (
              <div className="text-sm font-semibold text-slate-100">Week {nextSession.w} · {todaySession.title}</div>
            )}
            {loggedToday && (
              <p className="mb-2 mt-1 text-xs text-slate-400">
                Already trained today. Here&apos;s what&apos;s next, whenever you&apos;re ready.
              </p>
            )}
            {readiness?.status === "Yellow" && (
              <p className="mb-2 mt-1 text-xs text-amber-300">
                Readiness is moderate, so today is lighter — a set off, and easier targets.
              </p>
            )}
            <div className="mt-2">
              <SessionDrills drills={todaySession.drills} />
            </div>
            <button onClick={() => setPlaying(true)} className="btn-primary mt-4">▶ Start guided session</button>
          </div>
        </section>
      )}

      {playing && nextSession && todaySession && (
        <WorkoutPlayer
          title={`Week ${nextSession.w} · ${todaySession.title}`}
          drills={todaySession.drills}
          onComplete={(result) => { if (!program.completed_sessions.includes(`w${nextSession.w}d${nextSession.s.day}`)) void toggleSession(`w${nextSession.w}d${nextSession.s.day}`, result); }}
          onClose={() => setPlaying(false)}
        />
      )}

      {/* "Today's recommended drills" used to sit here: a second, separately
          computed list of exercises directly beneath the scheduled session.
          Two different answers to "what do I do today" is worse than one
          imperfect answer, and the program is the one that counts toward
          adherence. Skill work now lives inside the session itself. */}

      {/* Ask the coach */}
      {/* HOW THE BLOCK IS LANDING, above "what's working" — a block that is
          too hard is a more urgent thing to know than which lift went up, and
          it is the one that ends in an injury if nobody says it. Silent when
          the block is landing where it was aimed: advice that appears every
          week is advice people stop reading. */}
      {tab === "program" && effort.note && (
        <section className={`card p-5 ${effort.verdict === "too_hard" ? "border-readiness-red/40" : ""}`}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="field-label !mb-0">
              {effort.verdict === "too_hard" ? "This block is running hard" : "There is room in this block"}
            </h2>
            <span className="shrink-0 text-xs tabular-nums text-slate-500">
              {effort.avgReported}/10 vs {effort.prescribed} asked
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{effort.note}</p>
        </section>
      )}

      {/* What's working */}
      {tab === "program" && (insights.insights.length > 0 || insights.progressions.length > 0) && (
        <section className="card p-5">
          <h2 className="field-label">What&apos;s working</h2>
          <ul className="space-y-2 text-sm text-slate-200">
            {insights.insights.map((i, k) => (
              <li key={k} className="flex gap-2"><span className="text-pitch-400">📈</span>{i}</li>
            ))}
          </ul>
          {insights.progressions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {insights.progressions.map((p) => (
                <span key={p.name} className="chip text-pitch-400">{p.name} +{p.deltaKg}kg</span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* The program — week-by-week calendar */}
      {tab === "program" && (
        <ProgramCalendar weeks={plan.weeks} completed={program.completed_sessions} onToggle={toggleSession} />
      )}

      </TabPanel>
    </div>
  );
}

/**
 * The paces this athlete's block will actually be written in.
 *
 * Shown at build time rather than only inside the finished plan, because the
 * honest answer changes what someone does next: with a logged race they get
 * real minute-per-kilometre targets, and without one they get zone names and a
 * pointer to the twenty minutes of testing that would fix it. Saying that
 * before the block exists is worth more than saying it after.
 */
function RunnerPaces({ latestBench }: { latestBench: Record<string, number> }) {
  const threshold = thresholdPaceFromBenchmarks(latestBench);

  if (!threshold) {
    return (
      <p className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs text-slate-400">
        Sessions come as <b className="text-slate-200">zones and effort</b>, so you don&apos;t need a watch.
        Log a <b className="text-slate-200">5k or 10k</b> on Benchmarks to get real paces too.
      </p>
    );
  }

  const zones = paceZones(threshold);
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
      <span className="stat-label">Your paces</span>
      <p className="mb-2 mt-0.5 text-xs text-slate-500">
        From your logged race times — threshold {formatPace(threshold)}/km, the pace you could hold for
        about an hour.
      </p>
      <ul className="space-y-1">
        {ZONE_LIST.map((z) => (
          <li key={z.id} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: z.colour }} />
            <span className="w-20 shrink-0 text-slate-400">{z.name}</span>
            <span className="tabular-nums text-slate-200">
              {formatPaceRange(zones.find((p) => p.zone === z.id)!)}/km
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
