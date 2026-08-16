"use client";

import type { ProgramWeek } from "@/lib/coach";
import {
  auditWeek, volumeBreakdown, verdictFor, MUSCLE_LABEL, LANDMARKS,
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
  /**
   * SHOW THE WORKING, OR THE NUMBER LOOKS WRONG.
   *
   * The totals here count assisting muscles at half a set, which is the
   * convention the volume landmarks are measured in and the right way to read
   * the stimulus a muscle receives. It is also completely invisible from the
   * session in front of you: a week with two triceps movements in it reported
   * SIXTEEN triceps sets, because six pressing movements were quietly adding
   * eight more. An athlete counting the page gets 8, the bar says 16, and
   * nothing on screen accounts for the difference.
   *
   * A number you cannot reconcile with the thing it describes is
   * indistinguishable from a broken one — which is exactly how it was reported.
   * So the bar now separates the two: the solid part is work prescribed FOR
   * that muscle, the lighter part is what it picks up assisting the compounds.
   */
  const { direct } = volumeBreakdown(week);
  /**
   * A DELOAD IS SUPPOSED TO BE LOW.
   *
   * Rendered, the deload week came out as ten rows of amber "maintenance",
   * which reads as ten things going wrong in the week whose entire job is that
   * the work comes down. The verdicts are only meaningful against a week that
   * is trying to build something.
   */
  const deload = week.intensity === "Deload";
  const rows = (Object.keys(audit.volume) as MuscleGroup[])
    .map((m) => ({ muscle: m, sets: audit.volume[m], direct: direct[m] }))
    .filter((r) => r.sets > 0)
    .sort((a, b) => b.sets - a.sets);

  if (!rows.length) return null;

  // One scale for every bar, floored at the top of the productive range so the
  // band below stays in a fixed place week to week. A deload otherwise redraws
  // itself full-width and looks identical to peak week.
  const scale = Math.max(LANDMARKS.productiveHigh, ...rows.map((r) => r.sets));

  return (
    <details className="group/vol mb-3 rounded-xl border border-white/[0.08] bg-white/[0.02]">
      <summary className="tap-target flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2">
        <span className="text-xs font-semibold text-slate-300">What this week trains</span>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-500">
          {rows.length} muscle groups
          {/* `list-none` kills the default marker, so without this nothing says
              the row opens — the exact finding the UI audit already made about
              every other collapsible in the app. Same glyph and rotation as
              ProtocolCard and MealPlanner so it behaves the way the rest do. */}
          <span className="text-xs transition group-open/vol:rotate-180" aria-hidden>▾</span>
        </span>
      </summary>

      <div className="space-y-1.5 px-3 pb-3">
        {rows.map((r) => (
          <VolumeRow key={r.muscle} muscle={r.muscle} sets={r.sets} direct={r.direct} scale={scale} deload={deload} />
        ))}

        {/* Says what the shaded band on every bar means. Without it the bars are
            decoration — a number with no target is not information. */}
        <p className="pt-1 text-[11px] leading-relaxed text-slate-500">
          {deload ? (
            <>
              Deload week — everything is meant to be down. The lighter marker on each
              bar is {LANDMARKS.productiveLow}–{LANDMARKS.productiveHigh} sets, which is where a
              BUILDING week sits; you are below it on purpose.
            </>
          ) : (
            <>
              The marked section of each bar is {LANDMARKS.productiveLow}–{LANDMARKS.productiveHigh} sets
              a week, where most of the benefit sits. Below {LANDMARKS.maintenance} is
              maintenance — enough to hold what you have, not to build.{" "}
              {/* WHY THE NUMBER IS BIGGER THAN THE ONE YOU COUNTED. Without
                  this the totals look invented: a week with two triceps
                  movements in it reports sixteen triceps sets, because six
                  pressing movements are each adding half a set. */}
              <b className="text-slate-400">Solid</b> is work prescribed for that muscle;
              the faded part is what it picks up assisting your compounds, counted at
              half a set — a bench press is chest work and half a set for the triceps.
            </>
          )}
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

/** Nearest half-set. "3.7 sets" is arithmetic leaking through, not a prescription. */
const show = (n: number) => {
  const half = Math.round(n * 2) / 2;
  return Number.isInteger(half) ? String(half) : half.toFixed(1);
};

function VolumeRow({ muscle, sets, direct, scale, deload }: {
  muscle: MuscleGroup; sets: number; direct: number; scale: number; deload: boolean;
}) {
  /**
   * A MUSCLE THE BLOCK NEVER SET OUT TO TRAIN IS NOT UNDER-TRAINED.
   *
   * A footballer's block prescribes rows and chin-ups and no curls, so the
   * biceps pick up four sets a week assisting. This row used to be scored
   * against the landmarks like any other and came back amber "maintenance" —
   * so a block that had every muscle it actually trains in the productive band
   * still showed rows of amber, and read as a maintenance programme. It is
   * neither a plan to build them nor an oversight; it is what happens to your
   * arms when you pull heavy things.
   */
  const assistOnly = direct <= 0;
  const verdict = verdictFor(sets);
  const style = assistOnly
    ? { ...VERDICT.productive, word: "assisting" }
    : deload && verdict === "maintenance" ? VERDICT.productive : VERDICT[verdict];
  const pct = Math.min(100, (sets / scale) * 100);
  // How much of the bar is work prescribed FOR this muscle, as a share of the
  // bar itself — so the split lands in the right place whatever the scale.
  const directShare = sets > 0 ? Math.min(100, (direct / sets) * 100) : 100;
  const assisted = Math.max(0, Math.round((sets - direct) * 2) / 2);
  const bandLeft = (LANDMARKS.productiveLow / scale) * 100;
  const bandWidth = ((LANDMARKS.productiveHigh - LANDMARKS.productiveLow) / scale) * 100;

  return (
    <div className="flex items-center gap-2">
      <span className="w-[4.5rem] shrink-0 text-[11px] text-slate-400">{MUSCLE_LABEL[muscle]}</span>

      <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
        {/* The target band, behind the bar. Recessive on purpose: it is the
            reference, not the reading. */}
        {/* Rendered, this was INVISIBLE: bg-white/[0.06] sitting on a
            bg-white/[0.05] track is a one-percent difference nobody can see, so
            the caption was explaining a band that wasn't on screen. Marked with
            edges rather than a fill, which reads at 2.5px tall where a wash
            does not. */}
        <span
          className="absolute inset-y-0 border-x border-white/25 bg-white/[0.10]"
          style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
          aria-hidden
        />
        {/* The whole bar, at reduced opacity: total stimulus including what this
            muscle picks up assisting the compounds. */}
        <span
          className={`absolute inset-y-0 left-0 rounded-full opacity-40 ${style.bar}`}
          style={{ width: `${Math.max(pct, 2)}%` }}
          aria-hidden
        />
        {/* …and the part of it that is work prescribed FOR this muscle, solid.
            This is the number an athlete gets by counting the sessions, so it
            has to be visible or the total looks invented. */}
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${style.bar}`}
          style={{ width: `${Math.max(pct * (directShare / 100), direct > 0 ? 2 : 0)}%` }}
          aria-hidden
        />
      </span>

      <span className={`w-8 shrink-0 text-right text-[11px] font-semibold tabular-nums ${style.text}`}>
        {show(sets)}
      </span>
      {/* Colour alone would leave this unreadable for anyone who can't separate
          the amber from the gold, and unspoken for a screen reader. */}
      <span className="w-[4.75rem] shrink-0 text-[10px] leading-tight text-slate-500">
        {style.word ?? ""}
      </span>
      <span className="sr-only">
        {MUSCLE_LABEL[muscle]}: {show(sets)} sets this week
        {assistOnly
          ? ", all of it from assisting other lifts — this block has no exercise aimed at it"
          : assisted > 0
            ? `, of which ${show(direct)} are direct work and ${show(assisted)} come from assisting other lifts`
            : ""},
        {" "}{assistOnly ? "not directly trained" : style.word ?? "in the productive range"}.
      </span>
    </div>
  );
}
