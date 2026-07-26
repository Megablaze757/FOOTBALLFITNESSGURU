"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { invalidate } from "@/lib/use-async";
import { buildProgram, GOALS, type GoalType } from "@/lib/coach";
import { SPLIT_STYLES, type SplitStyle } from "@/lib/hypertrophy";
import type { SportId } from "@/lib/exercises";

/**
 * Builds a program for an athlete and assigns it to them.
 *
 * Uses the same engine the athlete's own coach page uses, so an assigned
 * program is the same shape as a self-made one — the calendar, workout player
 * and session logging all work on it untouched. The only difference is
 * assigned_by, which is what the athlete sees and what the RLS policy pins.
 */
export function AssignProgram({ athleteId, athleteName, sport, position, coachId, onAssigned }: {
  athleteId: string;
  athleteName: string;
  sport: SportId;
  position?: string | null;
  coachId: string;
  onAssigned?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState<GoalType>("strength");
  const [days, setDays] = useState(3);
  const [style, setStyle] = useState<SplitStyle>("auto");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const isGym = sport === "gym";

  async function assign() {
    setBusy(true);
    setError(null);
    const supabase = createClient();

    const plan = buildProgram({
      goal, painMap: {}, sport, position: position ?? undefined,
      focus: isGym ? "aesthetics" : "performance",
      daysPerWeek: days, notes: notes || null,
      style: isGym ? style : undefined,
    });

    // One active program at a time, same rule as the athlete's own page —
    // otherwise they open Coach and find two competing plans.
    await supabase.from("programs").update({ status: "archived" })
      .eq("user_id", athleteId).eq("status", "active");

    const { error: e } = await supabase.from("programs").insert({
      user_id: athleteId,
      assigned_by: coachId,
      goal_type: goal,
      goal_notes: notes || null,
      plan,
      status: "active",
      in_season: false,
      block: 1,
    });
    setBusy(false);
    if (e) {
      setError(
        /row-level security/i.test(e.message)
          ? "They haven't accepted you as their coach yet — they need to approve the request first."
          : e.message
      );
      return;
    }
    invalidate();           // their coach page is cached; drop it so the new plan shows
    setDone(true);
    setOpen(false);
    onAssigned?.();
    setTimeout(() => setDone(false), 3000);
  }

  if (done) {
    return <p className="text-xs font-semibold text-pitch-400">✓ Program assigned to {athleteName}</p>;
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-semibold text-pitch-400 hover:underline">
        Assign a program →
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-100">Program for {athleteName}</span>
        <button onClick={() => setOpen(false)} className="text-xs text-slate-500">Cancel</button>
      </div>

      <label className="block">
        <span className="field-label">Goal</span>
        <select value={goal} onChange={(e) => setGoal(e.target.value as GoalType)} className="field [color-scheme:dark]">
          {GOALS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
      </label>

      {isGym && (
        <label className="block">
          <span className="field-label">Split</span>
          <select value={style} onChange={(e) => setStyle(e.target.value as SplitStyle)} className="field [color-scheme:dark]">
            <option value="auto">Pick from training days</option>
            {SPLIT_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      )}

      <div>
        <span className="field-label">Days per week</span>
        <div className="flex gap-2">
          {[2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setDays(n)}
              className={`flex-1 rounded-xl border py-2 text-sm font-bold transition ${
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
