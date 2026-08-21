"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { invalidate } from "@/lib/use-async";
import { buildProgram, GOALS, goalsForSport, type GoalType } from "@/lib/coach";
import { SPLIT_STYLES, type SplitStyle } from "@/lib/hypertrophy";
import { ExercisePicker } from "@/components/ExercisePicker";
import type { SportId } from "@/lib/exercises";

/**
 * Builds a program for an athlete and assigns it to them.
 *
 * Uses the same engine the athlete's own coach page uses, so an assigned
 * program is the same shape as a self-made one — the calendar, workout player
 * and session logging all work on it untouched. The only difference is
 * assigned_by, which is what the athlete sees and what the RLS policy pins.
 */
/** One athlete a program can be built for. */
export interface AssignTarget {
  id: string;
  name: string;
  sport: SportId;
  position?: string | string[] | null;
}

export function AssignProgram({ athleteId, athleteName, sport, position, coachId, team, onAssigned }: {
  athleteId: string;
  athleteName: string;
  sport: SportId;
  position?: string | string[] | null;
  coachId: string;
  /** The whole squad, so one build can go to everyone rather than being
   *  repeated athlete by athlete for a session they all do together. */
  team?: AssignTarget[];
  onAssigned?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState<GoalType>("strength");
  const [days, setDays] = useState(3);
  const [style, setStyle] = useState<SplitStyle>("auto");
  const [notes, setNotes] = useState("");
  const [picks, setPicks] = useState<string[]>([]);
  const [toTeam, setToTeam] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Mirrors wantsHypertrophy() in lib/coach.ts — the only case where the split
  // is read at all. Keep the two in step: a control that doesn't change the
  // output is worse than no control, because it teaches people it did.
  const usesSplit = sport === "gym" && goal === "strength";
  const squad = team ?? [];

  /**
   * Build and assign to one athlete. Returns an error string, or null.
   *
   * Each athlete is built SEPARATELY rather than sharing one plan object: the
   * engine reads their sport and position, so a squad of a keeper, two wingers
   * and a centre-back get the same session structure with the ball work each of
   * them actually needs. Copying one plan across the team would give the keeper
   * crossing practice.
   */
  async function assignTo(target: AssignTarget): Promise<string | null> {
    const supabase = createClient();
    const targetIsGym = target.sport === "gym";

    const plan = buildProgram({
      goal, painMap: {}, sport: target.sport, position: target.position ?? undefined,
      focus: targetIsGym ? "aesthetics" : "performance",
      daysPerWeek: days, notes: notes || null,
      style: targetIsGym && goal === "strength" ? style : undefined,
      mustInclude: picks.length ? picks : undefined,
    });

    // Insert FIRST, archive after it succeeds.
    //
    // This used to archive the athlete's active program and then insert. When
    // the insert was refused — most commonly by RLS, because the athlete hadn't
    // accepted the coach yet — the coach got a tidy error message and the
    // athlete quietly lost the program they were following. The failure case
    // destroyed data on someone who wasn't even in the room.
    const { data: existing } = await supabase
      .from("programs").select("id").eq("user_id", target.id).eq("status", "active");

    const { error: e } = await supabase.from("programs").insert({
      user_id: target.id,
      assigned_by: coachId,
      goal_type: goal,
      goal_notes: notes || null,
      plan,
      status: "active",
      in_season: false,
      block: 1,
    });
    if (e) {
      return /row-level security/i.test(e.message)
        ? `${target.name} hasn't accepted you as their coach yet.`
        : `${target.name}: ${e.message}`;
    }

    // Now it's safe to stand the old one down. One active program at a time,
    // otherwise they open Coach and find two competing plans.
    const oldIds = (existing ?? []).map((p) => p.id);
    if (oldIds.length) {
      await supabase.from("programs").update({ status: "archived" }).in("id", oldIds);
    }

    // Tell them. A program that appears silently is one they find next week.
    // Best-effort: the program is already assigned, so a failed notification
    // must not read as a failed assignment.
    await supabase.from("notifications").insert({
      user_id: target.id,
      kind: "program_assigned",
      title: "Your coach set you a new program",
      body: `${GOALS.find((g) => g.id === goal)?.label ?? goal}, ${days} days a week.${notes ? ` "${notes}"` : ""}`,
      href: "/coach",
      // This uses the existing program-email choice while the row itself is
      // also the in-app notification.
      email_category: "program",
    });
    return null;
  }

  async function assign() {
    setBusy(true);
    setError(null);

    const targets: AssignTarget[] = toTeam && squad.length
      ? squad
      : [{ id: athleteId, name: athleteName, sport, position }];

    // Sequential, not Promise.all. One refusal must not take the others down,
    // and a coach needs to know WHICH athletes it reached — "something went
    // wrong" across a squad of twenty is not a usable answer.
    const failures: string[] = [];
    for (const t of targets) {
      const err = await assignTo(t);
      if (err) failures.push(err);
    }

    setBusy(false);
    const ok = targets.length - failures.length;

    if (failures.length) {
      setError(
        ok > 0
          ? `Assigned to ${ok} of ${targets.length}. ${failures.join(" ")}`
          : failures.join(" ")
      );
      if (ok === 0) return;
    }

    invalidate();           // their coach page is cached; drop it so the new plan shows
    setDone(ok === 1 && targets.length === 1 ? athleteName : `${ok} athletes`);
    setOpen(false);
    onAssigned?.();
    setTimeout(() => setDone(null), 4000);
  }

  if (done) {
    return <p className="text-xs font-semibold text-pitch-400">✓ Program assigned to {done}</p>;
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="tap-target text-xs font-semibold text-pitch-400 hover:underline">
        Assign a program →
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 break-words text-sm font-bold text-slate-100">
          Program for {toTeam && squad.length ? `the whole squad (${squad.length})` : athleteName}
        </span>
        <button onClick={() => setOpen(false)} className="tap-target shrink-0 text-xs text-slate-500">Cancel</button>
      </div>

      {/* Whole-squad assignment. Each athlete is still built individually from
          their own sport and position — a keeper gets keeping drills, not the
          winger's crossing practice — so this saves the repetition without
          flattening everyone into one identical plan. */}
      {squad.length > 1 && (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-white/[0.04] p-3">
          <input
            type="checkbox"
            checked={toTeam}
            onChange={(e) => setToTeam(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#e3b53f]"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-100">Assign to all {squad.length} athletes</span>
            <span className="block text-[11px] text-slate-400">
              Each one is built for their own position and sport, not copied.
            </span>
          </span>
        </label>
      )}

      {/* Goals for THIS sport, not all six. A coach assigning to a gym athlete
          was being offered "Speed" and "Ball skill", and a runner could be set
          a ball-skill block — combinations the athlete's own page has never
          offered because they don't make sense. */}
      <label className="block">
        <span className="field-label">Goal</span>
        <select value={goal} onChange={(e) => setGoal(e.target.value as GoalType)} className="field [color-scheme:dark]">
          {goalsForSport(sport).map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
      </label>

      {/* The split only exists in the bodybuilding engine, and buildProgram only
          routes there for gym + strength. Showing an Arnold-split picker on a
          speed or conditioning block offered a choice that was then thrown
          away — the plan came back identical whatever was selected. */}
      {usesSplit && (
        <label className="block">
          <span className="field-label">Split</span>
          <select value={style} onChange={(e) => setStyle(e.target.value as SplitStyle)} className="field [color-scheme:dark]">
            <option value="auto">Pick from training days</option>
            {SPLIT_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      )}

      {/* Coach picks specific work */}
      <div>
        <span className="field-label">Exercises</span>
        <ExercisePicker sport={sport} value={picks} onChange={setPicks} />
      </div>

      <div>
        <span className="field-label">Days per week</span>
        <div className="flex gap-2">
          {[2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setDays(n)}
              className={`min-h-[44px] flex-1 rounded-xl border py-2 text-sm font-bold transition ${
                days === n ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-400" : "border-white/10 bg-white/[0.03] text-slate-300"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="field-label">Notes for them (optional)</span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. no legs this block, ankle still sore"
          className="field"
        />
        <span className="mt-1 block text-[11px] text-slate-500">
          Exclusions here are honoured — &ldquo;no legs&rdquo; removes leg work entirely.
        </span>
      </label>

      {error && <p className="text-sm text-readiness-red">{error}</p>}

      <button onClick={assign} disabled={busy} className="btn-primary">
        {busy ? "Building…" : `Assign to ${athleteName}`}
      </button>
      <p className="text-[11px] text-slate-500">
        This replaces their current active program. Their completed sessions stay in their history.
      </p>
    </div>
  );
}
