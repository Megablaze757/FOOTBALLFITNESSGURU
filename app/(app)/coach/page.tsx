"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import {
  GOALS, goalsForSport, buildProgram, analyzeProgress, painByArea,
  FOCI,
  type GoalType, type ProgramPlan, type TrainingFocus,
} from "@/lib/coach";
import { positionList } from "@/lib/positions";
import { PositionPicker } from "@/components/PositionPicker";
import { FeatureLock, tierOfSub } from "@/components/FeatureLock";
import { can } from "@/lib/subscription";
import type { SportId } from "@/lib/exercises";
import type { SplitStyle } from "@/lib/hypertrophy";
import { templatesForSport } from "@/lib/programs";
import { assessReadiness } from "@/lib/readiness";
import { invokeAI } from "@/lib/api";
import { METRIC_CATALOG, metricDef, benchmarkProgress } from "@/lib/benchmarks";
import { RingProgress } from "@/components/RingProgress";
import { CoachChat } from "@/components/CoachChat";
import { ProgramCalendar } from "@/components/ProgramCalendar";
import { SessionDrills } from "@/components/SessionDrills";
import { WorkoutPlayer } from "@/components/WorkoutPlayer";
import type { CheckInInput, DailyCheckIn, Program, StrengthBenchmark, Tier, TrainingLog, TrainingDrill } from "@/lib/types";

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

function readinessOf(checkIn: DailyCheckIn | null) {
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
  return assessReadiness(input);
}

type CoachTab = "today" | "program" | "ask";
const COACH_TABS: { id: CoachTab; label: string; icon: string }[] = [
  { id: "today", label: "Today", icon: "⚡" },
  { id: "program", label: "Program", icon: "📅" },
  { id: "ask", label: "Ask coach", icon: "💬" },
];

export default function CoachPage() {
  const user = useCurrentUser();
  const today = new Date().toISOString().slice(0, 10);

  const { data, loading, reload } = useAsync(async () => {
    const supabase = createClient();
    const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
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

  if (loading) return <div className="card mt-6 h-80 animate-pulse" />;

  // Programs are the paid product. An existing program stays readable — someone
  // who lapses shouldn't lose the block they're mid-way through — but building
  // a new one needs Pro.
  if (!data?.program && !can(data?.tier ?? "bronze", "program")) {
    return (
      <div className="animate-fade-up">
        <header className="mb-5">
          <h1 className="text-3xl font-extrabold tracking-tight">AI Coach</h1>
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
        painMap={data?.checkIn?.pain_map ?? {}}
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

function GoalBuilder({ painMap, latestBench, sport, initialPositions, initialFocus, userId, onCreated }: { painMap: Record<string, number>; latestBench: Record<string, number>; sport: SportId; initialPositions: string[]; initialFocus: TrainingFocus; userId: string; onCreated: () => void }) {
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
  const [creating, setCreating] = useState(false);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sore = Object.entries(painByArea(painMap)).filter(([, v]) => (v ?? 0) >= 4).map(([a]) => a.replace("_", " "));

  async function createProgram(g: GoalType, f: TrainingFocus, pos: string[], tileId?: string, style?: SplitStyle, days?: number) {
    setGoal(g); setFocus(f); setPositions(pos);
    setCreating(true);
    setBuildingId(tileId ?? null);
    setError(null);
    const supabase = createClient();

    // Prefer the AI backend (Cloudflare Worker / Edge Function); fall back to the
    // local engine (works offline / on Pages).
    let plan: ProgramPlan;
    try {
      const data = await invokeAI<{ plan?: ProgramPlan }>("generate-program", { goal: g, pain_map: painMap, notes, in_season: inSeason, sport, position: pos, focus: f, days_per_week: days ?? daysPerWeek, split: style });
      if (!data?.plan) throw new Error("fallback");
      plan = data.plan;
    } catch {
      // `notes` matters as much here as on the AI path — without it the local
      // engine ignored "I don't train legs" and prescribed squats anyway.
      plan = buildProgram({ goal: g, painMap, isInSeason: inSeason, sport, position: pos, focus: f, daysPerWeek: days ?? daysPerWeek, notes, style });
    }

    // Remember the athlete's positions + focus for next time.
    await supabase.from("profiles").update({ positions: pos, position: pos[0] ?? null, training_focus: f }).eq("id", userId);
    // One active program at a time.
    await supabase.from("programs").update({ status: "archived" }).eq("user_id", userId).eq("status", "active");
    const baseline = metric ? latestBench[metric] ?? null : null;
    const { error: insErr } = await supabase.from("programs").insert({
      user_id: userId, goal_type: g, goal_notes: notes || null, plan, status: "active",
      in_season: inSeason, target_date: targetDate || null, block: 1,
      target_metric: metric || null, target_value: targetValue ? Number(targetValue) : null, baseline_value: baseline,
    });
    if (insErr) {
      setError(insErr.message);
      setCreating(false);
      setBuildingId(null);
      return;
    }
    onCreated();
  }

  return (
    <div className="animate-fade-up space-y-5">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">AI Coach</h1>
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
                    : t.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-100">{isBuilding ? "Building your program…" : t.name}</span>
                  <span className="block text-xs text-slate-400">{isBuilding ? "A few seconds" : t.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-3 text-xs text-slate-500">
          <span className="h-px flex-1 bg-white/10" /> or build your own <span className="h-px flex-1 bg-white/10" />
        </div>
      </div>

      {/* Position / event */}
      <PositionPicker sport={sport} value={positions} onChange={setPositions} />

      {/* Training focus */}
      <div>
        <span className="field-label">What are you training for?</span>
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

      <label className="block">
        <span className="field-label">Target date (optional)</span>
        <input type="date" className="field [color-scheme:dark]" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
      </label>

      {/* Measurable benchmark target */}
      <div>
        <span className="field-label">Measurable target (optional)</span>
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
        <span className="field-label">Anything specific? (optional)</span>
        <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. improve my first 5 metres" />
      </label>

      {error && <p className="text-sm text-readiness-red">{error}</p>}
      <button onClick={() => goal && createProgram(goal, focus, positions)} disabled={!goal || creating} className="btn-primary">
        {creating ? "Building your program…" : "Generate my program"}
      </button>
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
  const painMap = checkIn?.pain_map ?? {};
  const readiness = readinessOf(checkIn);
  const insights = analyzeProgress(training, checkHist);
  const totalSessions = plan.weeks.reduce((n, w) => n + w.sessions.length, 0);
  const doneCount = program.completed_sessions.length;
  const adherence = totalSessions ? Math.round((doneCount / totalSessions) * 100) : 0;

  // The next session that isn't ticked off — what to do today.
  const allSessions = plan.weeks.flatMap((w) => w.sessions.map((s) => ({ w: w.week, s })));
  const nextSession = allSessions.find(({ w, s }) => !program.completed_sessions.includes(`w${w}d${s.day}`));
  const complete = doneCount >= totalSessions && totalSessions > 0;

  // Goal-deadline progress.
  const deadline = program.target_date ? deadlineInfo(program.start_date, program.target_date, adherence) : null;

  // Measurable benchmark target progress.
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    await supabase.from("programs").update({ plan: newPlan, in_season: nextSeason }).eq("id", program.id);
    setSwitching(false);
    onChange();
  }

  async function toggleSession(sid: string) {
    const supabase = createClient();
    const marking = !program.completed_sessions.includes(sid);
    const next = marking
      ? [...program.completed_sessions, sid]
      : program.completed_sessions.filter((s) => s !== sid);
    await supabase.from("programs").update({ completed_sessions: next }).eq("id", program.id);

    // Completing a scheduled session logs it as training so it counts toward your
    // load (ACWR) and history. Merge into today's training log.
    if (marking) {
      const sess = allSessions.find(({ w, s }) => `w${w}d${s.day}` === sid);
      if (sess) {
        const newDrills = sess.s.drills.map((d) => ({ name: d.name, sets: d.sets, reps: d.reps, load_kg: null }));
        const { data: existing } = await supabase
          .from("training_logs").select("drills, total_minutes").eq("user_id", userId).eq("log_date", today).maybeSingle();
        const merged = dedupeDrills([...(existing?.drills ?? []), ...newDrills]);
        const intensity = sess.s.title.includes("Rehab") ? 4 : 7;
        await supabase.from("training_logs").upsert(
          { user_id: userId, log_date: today, drills: merged, total_minutes: (existing?.total_minutes ?? 0) + 45, intensity },
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
    await supabase.from("programs").update({ status: "archived" }).eq("id", program.id);
    await supabase.from("programs").insert({
      user_id: userId, goal_type: program.goal_type, goal_notes: program.goal_notes, plan: newPlan,
      status: "active", in_season: program.in_season, target_date: program.target_date, block: nextBlock,
    });
    setAdvancing(false);
    onChange();
  }


  async function newProgram() {
    const supabase = createClient();
    await supabase.from("programs").update({ status: "archived" }).eq("id", program.id);
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
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">AI Coach</h1>
          <p className="mt-1 text-sm capitalize text-pitch-400">
            {GOALS.find((g) => g.id === goal)?.label} program · Block {program.block}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button onClick={newProgram} className="text-xs text-slate-400 hover:text-pitch-400">New goal</button>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="text-xs text-slate-600 hover:text-readiness-red">
              Delete
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={deleteProgram} disabled={deleting} className="text-xs font-semibold text-readiness-red disabled:opacity-50">
                {deleting ? "…" : "Delete for good"}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-slate-500">Cancel</button>
            </div>
          )}
          {deleteError && <span className="max-w-[12rem] text-right text-[10px] text-readiness-red">{deleteError}</span>}
        </div>
      </header>

      {/* Today's session and today's recommended drills used to sit stacked with
          the calendar and the chat below, which left the athlete deciding which
          of two "today" blocks to actually do. Grouped into tabs instead. */}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {COACH_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-400"
                : "border-white/10 bg-white/[0.03] text-slate-300"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

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
      {tab === "today" && nextSession && (
        <section className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="field-label !mb-0">Today&apos;s session</h2>
            {readiness && (
              <span className="chip" style={{ color: readiness.status === "Green" ? "#34d399" : readiness.status === "Yellow" ? "#fbbf24" : "#fb5d6b" }}>
                Readiness {readiness.status}
              </span>
            )}
          </div>
          {readiness?.status === "Red" ? (
            <div className="rounded-2xl bg-readiness-red/10 p-3 text-sm text-slate-200">
              Your readiness is <b className="text-readiness-red">Red</b> today — skip the scheduled <b>{nextSession.s.title.split("· ")[1]}</b> and take active recovery: mobility, light spin and stretching. {readiness.advice}
            </div>
          ) : (
            <div>
              <div className="text-sm font-semibold text-slate-100">Week {nextSession.w} · {nextSession.s.title}</div>
              {readiness?.status === "Yellow" && <p className="mt-1 text-xs text-amber-300">Readiness is moderate — keep it crisp, cut the last set if you fade.</p>}
              <div className="mt-2">
                <SessionDrills drills={nextSession.s.drills} />
              </div>
              <button onClick={() => setPlaying(true)} className="btn-primary mt-4">▶ Start guided session</button>
            </div>
          )}
        </section>
      )}

      {playing && nextSession && (
        <WorkoutPlayer
          title={`Week ${nextSession.w} · ${nextSession.s.title}`}
          drills={nextSession.s.drills}
          onComplete={() => { if (!program.completed_sessions.includes(`w${nextSession.w}d${nextSession.s.day}`)) void toggleSession(`w${nextSession.w}d${nextSession.s.day}`); }}
          onClose={() => setPlaying(false)}
        />
      )}

      {/* "Today's recommended drills" used to sit here: a second, separately
          computed list of exercises directly beneath the scheduled session.
          Two different answers to "what do I do today" is worse than one
          imperfect answer, and the program is the one that counts toward
          adherence. Skill work now lives inside the session itself. */}

      {/* Ask the coach */}
      {tab === "ask" && <CoachChat context={chatContext} />}

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
    </div>
  );
}
