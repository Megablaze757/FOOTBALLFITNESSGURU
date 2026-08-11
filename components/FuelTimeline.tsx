"use client";

import { useState } from "react";
import type { NutritionPhase } from "@/lib/essentials";

/**
 * Matchday fuelling, one phase at a time.
 *
 * IT WAS EIGHTEEN BULLETS DOWN A RAIL. Six phases, three tips each, 180 words,
 * every one on screen at once and all at the same weight — the reader had to
 * find their own place in it. That is the "wall of text" complaint, and no
 * amount of tightening the copy fixes it, because the copy is fine. There is
 * just no reason to read Friday's dinner advice while you are sitting in the
 * changing room ninety minutes before kick-off.
 *
 * A timeline is a thing you are at a point *in*. So it's a strip you step
 * through: six taps, three bullets showing. Same words, a sixth of the screen,
 * and the phase you actually want is one tap rather than a scroll and a scan.
 *
 * Same interaction as the meal planner's day strip on purpose — two places in
 * the app that show "pick a point in time, see what's at it" should not be two
 * different controls.
 */
export function FuelTimeline({ phases, label }: {
  phases: NutritionPhase[];
  /** e.g. "Matchday" / "Race day" — the sport's own word. */
  label: string;
}) {
  const [at, setAt] = useState(0);
  const phase = phases[at];
  if (!phase) return null;

  return (
    <div className="card overflow-hidden">
      {/* The strip carries the WHEN, because that is what you navigate by.
          Titles like "Top up the tank" are lovely and tell you nothing about
          whether it's the bit you need right now. */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-white/[0.08] p-3">
        {phases.map((p, i) => {
          const on = i === at;
          return (
            <button
              key={p.when}
              onClick={() => setAt(i)}
              aria-pressed={on}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                on
                  ? "border-pitch-400/50 bg-pitch-400/10 text-pitch-400"
                  : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20"
              }`}
            >
              <span className="text-sm" aria-hidden>{p.icon}</span>
              {p.when}
            </button>
          );
        })}
      </div>

      <div className="p-5">
        <div className="flex items-baseline gap-2">
          <h3 className="text-base font-extrabold text-slate-100">{phase.title}</h3>
          <span className="text-xs font-semibold text-pitch-400">{phase.when}</span>
        </div>
        <ul className="mt-3 space-y-2">
          {phase.tips.map((t) => (
            <li key={t} className="flex gap-2.5 text-sm text-slate-300">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-pitch-400/60" aria-hidden />
              {t}
            </li>
          ))}
        </ul>

        {/* Where you are in the run of it, and a way forward without scrolling
            back up to the strip. */}
        <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-3">
          <span className="text-[11px] text-slate-600">
            {label} · {at + 1} of {phases.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setAt((n) => Math.max(0, n - 1))}
              disabled={at === 0}
              className="tap-target text-xs font-semibold text-slate-400 transition hover:text-pitch-400 disabled:opacity-30"
            >
              ← Earlier
            </button>
            <button
              onClick={() => setAt((n) => Math.min(phases.length - 1, n + 1))}
              disabled={at === phases.length - 1}
              className="tap-target text-xs font-semibold text-slate-400 transition hover:text-pitch-400 disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
