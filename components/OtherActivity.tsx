"use client";

import { useState } from "react";
import { NumberInput } from "@/components/NumberInput";
import { ACTIVITIES, matchActivity, activityDrill, isActivityDrill, activityMinutes } from "@/lib/activities";
import type { TrainingDrill } from "@/lib/types";

/**
 * "I played padel for an hour."
 *
 * The check-in could record the session the block prescribed and a run, and
 * nothing else. Everything an athlete actually does around their programme —
 * padel, a bike ride, a kickabout, a swim — had to go through the drill picker,
 * which asks for sets, reps and a weight. So it was either skipped, which loses
 * the load, or logged as "3 × 10 padel at 0kg", which pollutes every volume
 * number it reaches.
 *
 * ONE FIELD AND A DURATION, because that is all an activity is. It becomes an
 * ordinary drill measured in minutes (see lib/activities.ts), so the session
 * summary, the week's totals and the acute:chronic ratio all count it without
 * learning a new kind of row.
 *
 * The chips are a shortcut and never a limit: the box takes anything typed, and
 * an athlete who plays korfball should not be told their sport does not exist.
 */
export function OtherActivity({ drills, onChange, onSuggestIntensity }: {
  drills: TrainingDrill[];
  onChange: (drills: TrainingDrill[]) => void;
  /**
   * Offer a starting effort for a recognised activity.
   *
   * Only ever called when the field is still empty — see TrainingLogInput. A
   * number the athlete typed is theirs, and quietly replacing it is how a form
   * stops being trustworthy.
   */
  onSuggestIntensity?: (intensity: number) => void;
}) {
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState<number | null>(null);

  const logged = drills.filter(isActivityDrill);
  const known = matchActivity(name);

  function add(label: string, mins: number | null) {
    const drill = activityDrill(label, mins ?? 0);
    if (!drill) return;
    onChange([...drills, drill]);
    const match = matchActivity(label);
    if (match && onSuggestIntensity) onSuggestIntensity(match.intensity);
    setName("");
    setMinutes(null);
  }

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="mb-3">
        <span className="eyebrow text-slate-400">Anything else</span>
        <h3 className="mt-0.5 text-base font-extrabold text-slate-100">Did you do something else today?</h3>
        <p className="mt-1 text-xs text-slate-500">
          Padel, a ride, a swim, a kickabout. It counts toward your week and your load.
        </p>
      </div>

      {logged.length > 0 && (
        <ul className="mb-3 space-y-2">
          {logged.map((drill) => {
            const match = matchActivity(drill.name);
            return (
              <li key={`${drill.name}-${drill.duration_seconds}`} className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2">
                <span aria-hidden className="text-base">{match?.emoji ?? "🏃"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-100">{drill.name}</span>
                  <span className="block text-xs text-slate-500">{activityMinutes(drill)} min</span>
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

      {/* Tapping a chip fills the name rather than adding it outright: the
          duration is the half that matters, and an activity with no minutes on
          it carries no load. */}
      <div className="no-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
        {ACTIVITIES.slice(0, 10).map((activity) => (
          <button
            key={activity.id}
            type="button"
            onClick={() => setName(activity.label)}
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

      <div className="grid grid-cols-[1fr_auto_auto] gap-2">
        <label className="block">
          <span className="sr-only">What did you do?</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Padel, cycling, swimming…"
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
        <button
          type="button"
          onClick={() => add(name, minutes)}
          disabled={!name.trim() || !minutes}
          className="btn-ghost min-h-[44px] w-auto px-4 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </section>
  );
}
