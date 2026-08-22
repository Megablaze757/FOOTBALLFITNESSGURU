"use client";

import { useState } from "react";
import { NumberInput } from "@/components/NumberInput";
import {
  ACTIVITIES, PARTS_OF_DAY, matchActivity, activityDrill, isActivityDrill,
  activityMinutes, type PartOfDay,
} from "@/lib/activities";
import type { TrainingDrill } from "@/lib/types";

/**
 * "Spin this morning, padel this afternoon."
 *
 * The check-in could record the session the block prescribed and a run, and one
 * of each. Everything else an athlete does — padel, a ride, a kickabout, a swim
 * — had no way in, and a SECOND session had no way in either: the log holds one
 * duration and one effort for the day, so a double day either overwrote itself
 * or went unrecorded. Both fail in the same direction, and it is the worst one:
 * a double day is the hardest kind, and it was being stored as the lightest.
 *
 * Each entry here is a session. It carries its own minutes and its own effort,
 * and the day's numbers are worked out from them — weighted by duration, so
 * minutes × intensity still equals what the sessions actually cost. See
 * `dayTotals` in lib/activities.ts.
 *
 * Stored as ordinary drills measured in minutes, inside the day's existing
 * `drills` JSONB. The database enforces one row per day and that is the right
 * shape — a check-in is a day — so nothing downstream has to learn about a
 * second row.
 */
export function OtherActivity({ drills, onChange }: {
  drills: TrainingDrill[];
  onChange: (drills: TrainingDrill[]) => void;
}) {
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState<number | null>(null);
  const [effort, setEffort] = useState<number | null>(null);
  const [part, setPart] = useState<PartOfDay | null>(null);

  const logged = drills.filter(isActivityDrill);
  const known = matchActivity(name);

  /** The chip fills the name AND its typical effort, which is still editable. */
  function choose(label: string) {
    setName(label);
    const match = matchActivity(label);
    if (match && effort == null) setEffort(match.intensity);
  }

  function add() {
    const drill = activityDrill(name, minutes ?? 0, {
      effort: effort ?? known?.intensity ?? null,
      part,
    });
    if (!drill) return;
    onChange([...drills, drill]);
    setName("");
    setMinutes(null);
    setEffort(null);
    setPart(null);
  }

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="mb-3">
        <span className="eyebrow text-slate-400">Anything else</span>
        <h3 className="mt-0.5 text-base font-extrabold text-slate-100">Did you train more than once?</h3>
        <p className="mt-1 text-xs text-slate-500">
          Spin this morning and padel later, rugby then the gym — add each one. They all count toward your week and your load.
        </p>
      </div>

      {logged.length > 0 && (
        <ul className="mb-3 space-y-2">
          {logged.map((drill, i) => {
            const match = matchActivity(drill.name);
            const when = PARTS_OF_DAY.find((p) => p.id === drill.part_of_day);
            return (
              <li key={`${drill.name}-${i}`} className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2">
                <span aria-hidden className="text-base">{match?.emoji ?? "🏃"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-100">{drill.name}</span>
                  <span className="block text-xs text-slate-500">
                    {when ? `${when.label} · ` : ""}{activityMinutes(drill)} min
                    {drill.effort ? ` · ${drill.effort}/10` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onChange(drills.filter((d) => d !== drill))}
                  aria-label={`Remove ${drill.name}`}
                  className="tap-target grid w-11 place-items-center text-slate-500 hover:text-readiness-red"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Tapping a chip fills the name and its typical effort. It does not add
          the entry: the duration is the half that carries the load, and an
          activity with no minutes on it is not a session. */}
      <div className="no-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
        {ACTIVITIES.slice(0, 10).map((activity) => (
          <button
            key={activity.id}
            type="button"
            onClick={() => choose(activity.label)}
            aria-pressed={known?.id === activity.id}
            className={`tap-target flex shrink-0 items-center gap-1.5 rounded-2xl border px-3 text-xs font-semibold transition ${
              known?.id === activity.id
                ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-300"
                : "border-white/[0.07] bg-white/[0.02] text-slate-300 hover:text-slate-100"
            }`}
          >
            <span aria-hidden>{activity.emoji}</span>
            {activity.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label className="block">
          <span className="sr-only">What did you do?</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Padel, spin, swimming…"
            className="field"
            aria-label="What did you do?"
          />
        </label>
        <label className="block w-24">
          <span className="sr-only">How many minutes?</span>
          <NumberInput
            value={minutes}
            onChange={setMinutes}
            min={0}
            max={1440}
            placeholder="min"
            className="field text-center"
            aria-label="How many minutes?"
          />
        </label>
      </div>

      {/* WHEN, AND HOW HARD — the two things that make a second session its own
          session rather than more of the first. Both optional: an entry with
          neither still counts its minutes, and the day's effort is worked out
          from the ones that have it. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {PARTS_OF_DAY.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setPart(part === option.id ? null : option.id)}
            aria-pressed={part === option.id}
            className={`tap-target flex items-center gap-1.5 rounded-2xl border px-3 text-xs font-semibold transition ${
              part === option.id
                ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-300"
                : "border-white/[0.07] bg-white/[0.02] text-slate-400 hover:text-slate-200"
            }`}
          >
            <span aria-hidden>{option.emoji}</span>
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <label className="flex-1">
          <span className="field-label !mb-1 flex items-center justify-between">
            How hard?
            <span className="font-normal text-slate-500">{effort ?? known?.intensity ?? "–"}/10</span>
          </span>
          <input
            type="range"
            min={1}
            max={10}
            value={effort ?? known?.intensity ?? 5}
            onChange={(e) => setEffort(Number(e.target.value))}
            className="w-full accent-pitch-400"
            aria-label="How hard was it, out of ten"
          />
        </label>
        <button
          type="button"
          onClick={add}
          disabled={!name.trim() || !minutes}
          className="btn-ghost mt-4 min-h-[44px] w-auto px-4 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </section>
  );
}
