"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import { useAsync } from "@/lib/use-async";
import { assessReadiness } from "@/lib/readiness";
import { checkInStreak } from "@/lib/load";
import { computeXp, levelFor } from "@/lib/gamification";
import { TeamExercises } from "@/components/TeamExercises";
import type { DailyCheckIn, Profile, Program } from "@/lib/types";

interface AthleteRow {
  id: string;
  name: string;
  readiness: { score: number; status: "Green" | "Yellow" | "Red" } | null;
  lastCheckIn: string | null;
  goal: string | null;
  adherence: number | null;
  xp: number;
  level: number;
  streak: number;
}

export default function SquadPage() {
  const user = useCurrentUser();
  const today = new Date().toISOString().slice(0, 10);

  const { data, loading, reload } = useAsync(async () => {
    const supabase = createClient();
    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const isCoach = me?.role === "coach" || me?.role === "admin";
    if (!isCoach) return { isCoach: false, athletes: [] as AthleteRow[], pending: [] as { id: string; name: string }[] };

    const { data: links } = await supabase.from("coach_athletes").select("athlete_id, status").eq("coach_id", user.id);
    const acceptedIds = (links ?? []).filter((l) => l.status === "accepted").map((l) => l.athlete_id);
    const pendingIds = (links ?? []).filter((l) => l.status === "pending").map((l) => l.athlete_id);

    const { data: allProfiles } = await supabase.from("profiles").select("id, full_name").in("id", [...acceptedIds, ...pendingIds]);
    const nameById = new Map((allProfiles ?? []).map((p) => [p.id, p.full_name ?? "Athlete"]));
    const pending = pendingIds.map((id) => ({ id, name: nameById.get(id) ?? "Athlete" }));

    if (!acceptedIds.length) return { isCoach: true, athletes: [] as AthleteRow[], pending };
    const ids = acceptedIds;

    const since7 = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);
    const [{ data: profiles }, { data: checkIns }, { data: programs }, { data: training }, { data: nutrition }, { data: benches }] = await Promise.all([
      supabase.from("profiles").select("id, full_name").in("id", ids),
      supabase.from("daily_check_ins").select("*").in("user_id", ids).order("check_in_date", { ascending: false }),
      supabase.from("programs").select("*").in("user_id", ids),
      supabase.from("training_logs").select("user_id, log_date").in("user_id", ids),
      supabase.from("nutrition_logs").select("user_id").in("user_id", ids),
      supabase.from("strength_benchmarks").select("user_id").in("user_id", ids),
    ]);

    const checkDatesByUser = new Map<string, string[]>();
    const latestCheck = new Map<string, DailyCheckIn>();
    for (const c of (checkIns ?? []) as DailyCheckIn[]) {
      if (!latestCheck.has(c.user_id)) latestCheck.set(c.user_id, c);
      (checkDatesByUser.get(c.user_id) ?? checkDatesByUser.set(c.user_id, []).get(c.user_id)!).push(c.check_in_date);
    }
    const activeProg = new Map<string, Program>();
    const blocksByUser = new Map<string, number>();
    for (const p of (programs ?? []) as Program[]) {
      if (p.status === "active") activeProg.set(p.user_id, p);
      if (p.status === "archived") blocksByUser.set(p.user_id, (blocksByUser.get(p.user_id) ?? 0) + 1);
    }
    const countBy = (rows: { user_id: string }[] | null) => {
      const m = new Map<string, number>();
      for (const r of rows ?? []) m.set(r.user_id, (m.get(r.user_id) ?? 0) + 1);
      return m;
    };
    const trainCount = countBy(training as { user_id: string }[] | null);
    const nutriCount = countBy(nutrition as { user_id: string }[] | null);
    const benchCount = countBy(benches as { user_id: string }[] | null);

    const athletes: AthleteRow[] = ((profiles ?? []) as Pick<Profile, "id" | "full_name">[]).map((p) => {
      const c = latestCheck.get(p.id);
      const prog = activeProg.get(p.id);
      const total = prog ? prog.plan.weeks.reduce((n, w) => n + w.sessions.length, 0) : 0;
      const dates = checkDatesByUser.get(p.id) ?? [];
      const xp = computeXp({
        checkIns: dates.length,
        streak: checkInStreak(dates),
        trainingSessions: trainCount.get(p.id) ?? 0,
        completedSessions: prog?.completed_sessions.length ?? 0,
        completedBlocks: blocksByUser.get(p.id) ?? 0,
        benchmarks: benchCount.get(p.id) ?? 0,
        videos: 0,
        nutritionLogs: nutriCount.get(p.id) ?? 0,
        checkInsLast7: dates.filter((d) => d >= since7).length,
      });
      return {
        id: p.id,
        name: p.full_name ?? "Athlete",
        readiness: c ? (({ score, status }) => ({ score, status }))(assessReadiness({
          pain_map: c.pain_map ?? {}, fatigue_score: c.fatigue_score, sleep_quality: c.sleep_quality,
          nutrition_quality: c.nutrition_quality, weight_kg: c.weight_kg, is_match_day: c.is_match_day, match_minutes_played: c.match_minutes_played,
        })) : null,
        lastCheckIn: c?.check_in_date ?? null,
        goal: prog?.goal_type ?? null,
        adherence: prog && total ? Math.round((prog.completed_sessions.length / total) * 100) : null,
        xp,
        level: levelFor(xp).level,
        streak: checkInStreak(dates),
      };
    });
    athletes.sort((a, b) => b.xp - a.xp);
    return { isCoach: true, athletes, pending };
  }, [user.id, today]);

  if (loading) return <div className="card mt-6 h-64 animate-pulse" />;

  if (!data?.isCoach) {
    return (
      <div className="animate-fade-up">
        <Header />
        <div className="card mt-6 p-6 text-center">
          <div className="text-3xl">🧑‍🏫</div>
          <h2 className="mt-2 text-lg font-extrabold">Coaches only</h2>
          <p className="mt-1 text-sm text-slate-400">Set your role to <b>Coach</b> in your profile to manage a squad.</p>
          <Link href="/profile" className="btn-primary mx-auto mt-4 max-w-[12rem]">Go to profile</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up mx-auto max-w-4xl space-y-5">
      <Header />
      <AddAthlete onAdded={reload} />
      {(data.pending?.length ?? 0) > 0 && (
        <div className="card px-4 py-3 text-sm text-slate-300">
          ⏳ Awaiting response: {data.pending!.map((p) => p.name).join(", ")}
          <span className="mt-0.5 block text-xs text-slate-500">They&apos;ll appear below once they accept your invite.</span>
        </div>
      )}
      {!data.athletes.length ? (
        <p className="card px-4 py-8 text-center text-sm text-slate-500">No athletes yet — add one by email above.</p>
      ) : (
        <>
        <h2 className="field-label">🏆 Squad leaderboard</h2>
        <ul className="space-y-2">
          {data.athletes.map((a, i) => (
            <li key={a.id}>
              <Link href={`/squad/view?id=${a.id}`} className="card card-hover flex items-center gap-3 p-3 sm:p-4">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold ${i < 3 ? "bg-pitch-400/15 text-pitch-400" : "bg-white/[0.04] text-slate-400"}`}>
                  {["🥇", "🥈", "🥉"][i] ?? i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-bold text-slate-100">{a.name}</span>
                    <span className="chip shrink-0 text-pitch-400">Lv {a.level}</span>
                  </div>
                  <div className="truncate text-xs text-slate-400">
                    {a.xp.toLocaleString()} XP · 🔥 {a.streak}d{a.goal ? ` · ${a.adherence ?? 0}% adherence` : ""}
                  </div>
                </div>
                {a.readiness ? (
                  <span className="shrink-0 rounded-full px-3 py-1 text-sm font-bold" style={{ color: color(a.readiness.status), background: `${color(a.readiness.status)}22` }}>
                    {a.readiness.score}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-slate-500">—</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
        </>
      )}

      <TeamExercises coachId={user.id} />
    </div>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Squad</h1>
        <p className="mt-1 text-sm text-slate-400">Your athletes at a glance.</p>
      </div>
      <Link href="/profile" className="text-sm text-slate-400 hover:text-pitch-400">← Back</Link>
    </header>
  );
}

function AddAthlete({ onAdded }: { onAdded: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("add_athlete_by_email", { p_email: email.trim() });
    if (error) setMsg({ ok: false, text: error.message.replace(/^.*?:/, "").trim() });
    else { setMsg({ ok: true, text: "Athlete added." }); setEmail(""); onAdded(); }
    setBusy(false);
  }

  return (
    <form onSubmit={add} className="card relative flex gap-2 p-3">
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="athlete@email.com" className="field flex-1" />
      <button type="submit" disabled={busy} className="rounded-2xl bg-gradient-to-br from-pitch-400 to-pitch-600 px-4 font-semibold text-ink-900 disabled:opacity-50">Add</button>
      {msg && <p className={`absolute -bottom-6 left-0 text-xs ${msg.ok ? "text-pitch-400" : "text-readiness-red"}`}>{msg.text}</p>}
    </form>
  );
}

function color(s: string): string {
  return s === "Green" ? "#34d399" : s === "Yellow" ? "#fbbf24" : "#fb5d6b";
}
