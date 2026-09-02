"use client";

import { useMemo } from "react";
import type { TrainingLog } from "@/lib/types";
import { todayLocal } from "@/lib/day";
import { muscleProgress, progressHeadline, MIN_HISTORY_DAYS } from "@/lib/strength-progress";
import { MUSCLE_WORD, RANKABLE_MUSCLES } from "@/lib/strength-standards";

/**
 * "Am I getting stronger?" — per part of the body, as a percentage.
 *
 * The ranks beside this answer "am I strong", which is a comparison. They are
 * too coarse to show PROGRESS: Novice to Intermediate on the squat is half a
 * bodyweight of load, so somebody can train hard for three months, add 20kg,
 * and watch the badge not move once. The percentage moves every session.
 *
 * BARS, NOT A LINE CHART. There is one number per muscle — a percentage gained
 * since you started — and eleven of them. A line chart of eleven series over
 * time is unreadable on a phone and answers a different question; the per-lift
 * chart directly below already owns "how did it move, and when". This is the
 * summary: what has grown most, what has not moved.
 */
export function MuscleGains({ logs }: { logs: TrainingLog[] | null | undefined }) {
  const today = todayLocal();
  const rows = useMemo(
    () => muscleProgress(logs, today, RANKABLE_MUSCLES),
    [logs, today],
  );
  const headline = useMemo(() => progressHeadline(rows), [rows]);
  const withGain = rows.filter((r) => r.gain);

  /**
   * Nothing to show is a different state from zero growth, and it needs its own
   * sentence — the rest of this card would otherwise render eleven empty bars
   * and read as "you have gained nothing", which is a lie about somebody who
   * started last week.
   */
  if (withGain.length === 0) {
    return (
      <section className="card p-5">
        <h2 className="field-label">Strength gained</h2>
        <p className="text-sm text-slate-400">
          Once you have {MIN_HISTORY_DAYS} days of logged lifts behind you, this shows how much each
          part of you has added since you started — as a percentage, so a 5kg gain on a press counts
          as much as a 15kg gain on a squat.
        </p>
      </section>
    );
  }

  // The longest bar is the biggest gain, so the scale is always used fully —
  // a fixed 100% axis would render a real 12% gain as a stub nobody can read.
  const max = Math.max(...withGain.map((r) => r.gain!.pct));

  return (
    <section className="card p-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="field-label !mb-0">Strength gained</h2>
        <span className="shrink-0 text-[11px] text-slate-500">since you started</span>
      </div>
      {headline && <p className="mb-3 text-sm text-slate-300">{headline}</p>}

      <ul className="space-y-2">
        {rows.map(({ muscle, gain }) => (
          <li key={muscle} className="flex items-center gap-3">
            <span className="w-[4.5rem] shrink-0 truncate text-xs font-semibold capitalize text-slate-300">
              {MUSCLE_WORD[muscle]}
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              {gain && (
                <span
                  className="block h-full rounded-full bg-pitch-400 transition-all duration-700"
                  style={{ width: `${Math.max(4, (gain.pct / max) * 100)}%` }}
                />
              )}
            </span>
            {/* A muscle with no qualifying lift shows a dash, not a 0%. Absent
                is not zero: nothing has been measured, which is not the same as
                nothing has been gained. */}
            <span className="w-20 shrink-0 text-right text-xs tabular-nums">
              {gain
                ? <><b className="text-accent-400">+{gain.pct}%</b></>
                : <span className="text-slate-600">—</span>}
            </span>
          </li>
        ))}
      </ul>

      {/* The evidence, for the biggest movers. A percentage with no kilos
          behind it is a number you cannot check. */}
      <ul className="mt-3 space-y-1 border-t border-white/[0.08] pt-3">
        {withGain
          .sort((a, b) => b.gain!.pct - a.gain!.pct)
          .slice(0, 3)
          .map(({ muscle, gain }) => (
            <li key={muscle} className="text-[11px] text-slate-500">
              <span className="capitalize text-slate-400">{MUSCLE_WORD[muscle]}</span>
              {" — "}{gain!.label} {gain!.baselineKg}kg → {gain!.bestKg}kg
            </li>
          ))}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Measured from your best effort in your first four weeks on each lift to your best ever, using
        estimated one-rep max. It only counts up: a deload or an easy in-season block will not show
        as going backwards. For when a lift moved, and whether it has stalled, use the chart below.
      </p>
    </section>
  );
}
