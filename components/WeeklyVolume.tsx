"use client";

import type { ProgramWeek } from "@/lib/coach";
import {
  auditWeek, verdictFor, MUSCLE_LABEL, LANDMARKS,
  type MuscleGroup, type VolumeVerdict,
} from "@/lib/muscle-volume";

/**
 * What this week actually trains, in weekly sets per muscle.
 *
 * The programme already tells you what to do on Tuesday. It could not tell you
 * the thing a coach would look at first: over seven days, is anything being
 * hammered and is anything being missed. A four-day football block was shipping
 * with ZERO hamstring sets in it and nothing on this screen could have shown
 * you, because volume was only ever counted per session.
 *
 * Bars rather than a table because the question is comparative — which of these
 * is short, which is long — and a column of numbers makes you do that work
 * yourself. The scale is shared across every row so the comparison is honest.
 */
export function WeeklyVolume({ week }: { week: ProgramWeek }) {
  const audit = auditWeek(week);
  const rows = (Object.keys(audit.volume) as MuscleGroup[])
    .map((m) => ({ muscle: m, sets: audit.volume[m] }))
    .filter((r) => r.sets > 0)
    .sort((a, b) => b.sets - a.sets);

  if (!rows.length) return null;

  // One scale for every bar, floored at the top of the productive range so the
  // band below stays in a fixed place week to week. A deload otherwise redraws
  // itself full-width and looks identical to peak week.
  const scale = Math.max(LANDMARKS.productiveHigh, ...rows.map((r) => r.sets));

  return (
    <details className="mb-3 rounded-xl border border-white/[0.08] bg-white/[0.02]">
      <summary className="tap-target flex cursor-pointer list-none items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold text-slate-300">What this week trains</span>
        <span className="text-[11px] text-slate-500">
          {rows.length} muscle groups · tap
        </span>
      </summary>

      <div className="space-y-1.5 px-3 pb-3">
        {rows.map((r) => (
          <VolumeRow key={r.muscle} muscle={r.muscle} sets={r.sets} scale={scale} />
        ))}

        {/* Says what the shaded band on every bar means. Without it the bars are
            decoration — a number with no target is not information. */}
        <p className="pt-1 text-[11px] leading-relaxed text-slate-500">
          The shaded band is {LANDMARKS.productiveLow}–{LANDMARKS.productiveHigh} sets a week, where
          most of the benefit sits. Below {LANDMARKS.maintenance} is maintenance — enough to hold
          what you have, not to build. These are averages; in-season, most groups
          sitting at maintenance is the point, not a gap.
        </p>

        {audit.hamstringToQuad !== null && audit.hamstringToQuad < 0.5 && (
          /* The one ratio in team sport with a hard outcome attached. Hamstring
             strain is the most common non-contact injury in football and
             quad-dominant programming is a known contributor, so this is a real
             finding rather than a stylistic note. */
          <p className="rounded-lg border border-readiness-yellow/25 bg-readiness-yellow/[0.07] px-2.5 py-2 text-[11px] leading-relaxed text-readiness-yellow">
            <span aria-hidden>⚠ </span>
            This week is quad-heavy — {audit.hamstringToQuad} hamstring sets for every quad set.
            Worth adding a Nordic curl or an RDL if you sprint.
          </p>
        )}
      </div>
    </details>
  );
}

/**
 * Status, not category — so the colour is doing a job and there are only four
 * of them. It is also never the only signal: every row carries its number, and
 * anything off-target says so in words.
 */
const VERDICT: Record<VolumeVerdict, { bar: string; text: string; word: string | null }> = {
  untrained:   { bar: "bg-slate-600", text: "text-slate-500", word: "not trained" },
  maintenance: { bar: "bg-readiness-yellow", text: "text-readiness-yellow", word: "maintenance" },
  productive:  { bar: "bg-pitch-400", text: "text-slate-300", word: null },
  excessive:   { bar: "bg-readiness-red", text: "text-readiness-red", word: "very high" },
};

function VolumeRow({ muscle, sets, scale }: { muscle: MuscleGroup; sets: number; scale: number }) {
  const verdict = verdictFor(sets);
  const style = VERDICT[verdict];
  const pct = Math.min(100, (sets / scale) * 100);
  const bandLeft = (LANDMARKS.productiveLow / scale) * 100;
  const bandWidth = ((LANDMARKS.productiveHigh - LANDMARKS.productiveLow) / scale) * 100;

  return (
    <div className="flex items-center gap-2">
      <span className="w-[4.5rem] shrink-0 text-[11px] text-slate-400">{MUSCLE_LABEL[muscle]}</span>

      <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
        {/* The target band, behind the bar. Recessive on purpose: it is the
            reference, not the reading. */}
        <span
          className="absolute inset-y-0 bg-white/[0.06]"
          style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
          aria-hidden
        />
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${style.bar}`}
          style={{ width: `${Math.max(pct, 2)}%` }}
          aria-hidden
        />
      </span>

      <span className={`w-8 shrink-0 text-right text-[11px] font-semibold tabular-nums ${style.text}`}>
        {sets}
      </span>
      {/* Colour alone would leave this unreadable for anyone who can't separate
          the amber from the gold, and unspoken for a screen reader. */}
      <span className="w-[4.75rem] shrink-0 text-[10px] leading-tight text-slate-500">
        {style.word ?? ""}
      </span>
      <span className="sr-only">
        {MUSCLE_LABEL[muscle]}: {sets} sets this week, {style.word ?? "in the productive range"}.
      </span>
    </div>
  );
}
