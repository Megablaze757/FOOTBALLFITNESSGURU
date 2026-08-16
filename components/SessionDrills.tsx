"use client";

import { useState } from "react";
import { SLOT_LABEL, restText, type ProgramDrill, type Slot } from "@/lib/engine";
import { howToFor } from "@/lib/how-to";
import { ExerciseDemo } from "@/components/ExerciseDemo";
import { SwapSheet } from "@/components/SwapSheet";
import { Icon, type IconName } from "@/components/Icon";

/**
 * A session, rendered as a session: warm-up, main work, accessories, cool-down.
 *
 * Programs saved before the engine gained slots have no `slot` on their drills.
 * Those just render as one flat list — the same as they always did — rather than
 * being relabelled into a structure they weren't built with.
 *
 * THE SAME CARDS AS THE LIBRARY. This was a list of thin text rows: a name, a
 * "3×8", and a tap target with no affordance whatsoever. The library — the same
 * movements, in a different part of the app — shows each one as a card with the
 * figure, what it trains and what kit it needs, and reads as something you can
 * open. Two treatments for the same object taught the athlete that the plan was
 * a list and the library was the content, when tapping a drill in the plan has
 * opened its detail since it was wired up.
 *
 * `compact` keeps the old dense rows for the four-week calendar, where the
 * question is "what does week 3 look like" and twelve cards a day would bury it.
 */
export function SessionDrills({ drills, onPick, onSwap, compact = false }: {
  drills: Drill[];
  /** Optional: open the exercise detail. Drills with no coaching stay inert. */
  onPick?: (name: string) => void;
  /**
   * Optional: offer to swap. Called with the PRESCRIBED name and the
   * substitute, or null to go back to what was prescribed. Absent on read-only
   * views like the calendar, where there is nothing to save to.
   */
  onSwap?: (prescribed: string, to: string | null) => void | Promise<void>;
  /** Dense text rows rather than cards. For the week-at-a-glance calendar. */
  compact?: boolean;
}) {
  const [swapping, setSwapping] = useState<string | null>(null);
  const grouped = groupBySlot(drills);

  return (
    <ul className={compact ? "space-y-1" : "space-y-2"}>
      {grouped.map((group, gi) => (
        <li key={gi} className={`${compact ? "mt-2 pl-2" : "mt-6 rounded-2xl border-l-4 p-3"} ${sectionStyle(group).wrap}`}>
          {group.rehab ? (
            <div className={`mb-2 flex items-center gap-2 font-bold ${compact ? "text-[10px] uppercase tracking-wider" : "text-[17px]"} text-amber-400/80`}>
              <Icon name="plaster" size={compact ? 13 : 18} /> Rehab <span className="text-[10px] font-medium text-amber-300/60">do this first</span>
            </div>
          ) : group.slot ? (
            <div className={`mb-2 flex items-center gap-2 font-bold ${compact ? "text-[10px] uppercase tracking-wider" : "text-[17px]"} ${sectionStyle(group).text}`}>
              <Icon name={sectionStyle(group).icon} size={compact ? 13 : 18} /> {sectionStyle(group).label}
            </div>
          ) : null}
          <ul className={compact ? "space-y-1" : "space-y-2"}>
            {group.drills.map((d, k) => {
              // The name a swap is stored against is the PRESCRIBED one, which
              // for an already-swapped row is not the name on screen.
              const prescribed = d.swappedFrom ?? d.name;
              const open = swapping === prescribed;
              return (
              <li key={k}>
                <div className="flex items-start gap-1">
                  {compact
                    ? <CompactRow drill={d} onPick={onPick} />
                    : <DrillCard drill={d} onPick={onPick} rehab={group.rehab} slot={group.slot} />}
                  {/* No swap on rehab work. Offering a "similar exercise" for a
                      stage-two isometric is offering to leave the protocol —
                      the substitution the athlete wants there is a
                      conversation with a physio, not a tap. */}
                  {onSwap && !d.skill && !d.rehab && (
                    <button
                      onClick={() => setSwapping(open ? null : prescribed)}
                      aria-label={`Swap ${d.name}`}
                      aria-expanded={open}
                      className={`tap-target shrink-0 px-1.5 text-xs transition ${
                        open || d.swappedFrom ? "text-pitch-400" : "text-slate-600 hover:text-pitch-400"
                      }`}
                    >
                      ⇄
                    </button>
                  )}
                </div>
                {onSwap && open && (
                  <div className="mt-1.5">
                    <SwapSheet
                      name={prescribed}
                      current={d.swappedFrom ? d.name : null}
                      onSwap={(to) => onSwap(prescribed, to)}
                      onClose={() => setSwapping(null)}
                    />
                  </div>
                )}
              </li>
            );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/**
 * One drill as a card — the library treatment, plus the prescription.
 *
 * The figure is the part that makes it a card rather than a row, and it is
 * available for every drill in a program: lib/how-to.ts gives ball work the
 * ball figure and runs the running figure, so a session no longer has a few
 * illustrated rows and a few blank ones.
 */
function DrillCard({ drill, onPick, rehab, slot }: { drill: Drill; onPick?: (name: string) => void; rehab: boolean; slot: Slot | null }) {
  const how = howToFor(drill.name);
  // No coaching behind it means nothing to open. A card that looks tappable and
  // isn't is worse than one that never claimed to be.
  const pickable = !!onPick && !!how;
  const detail = detailLine(drill);

  return (
    <button
      onClick={() => pickable && onPick!(drill.name)}
      disabled={!pickable}
      className={`flex min-w-0 flex-1 items-center gap-3 rounded-2xl border p-2.5 text-left transition disabled:cursor-default ${
        rehab
          ? "border-amber-400/25 bg-amber-400/[0.05]"
          : slot === "warmup" ? "border-sky-400/15 bg-sky-400/[0.035]"
          : slot === "conditioning" ? "border-emerald-400/15 bg-emerald-400/[0.035]"
          : slot === "cooldown" ? "border-violet-400/15 bg-violet-400/[0.035]"
          : "border-pitch-400/10 bg-pitch-400/[0.025]"
      } ${pickable ? "hover:border-white/20 hover:bg-white/[0.06]" : ""}`}
    >
      <span className={`grid h-14 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border bg-black/40 ${
        rehab ? "border-amber-400/20" : "border-white/10"
      }`}>
        {how
          ? <ExerciseDemo pattern={how.demo} implement={how.implement} className="h-12 w-10" />
          : <span className="text-lg text-slate-600">·</span>}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] text-slate-500">
          {how?.tag ?? (drill.skill ? "Skill work" : "Exercise")}
        </span>
        <span className="mt-0.5 block break-words text-sm font-bold text-slate-100">
          {drill.skill && <span className="mr-1.5 text-pitch-400">⚽</span>}
          {displayName(drill)}
        </span>
        {/* WHAT IT REPLACED. A programme that silently shows a different
            exercise from the one it prescribed has lost the thread of its own
            plan; saying so keeps the substitution the athlete's decision
            rather than the app's. */}
        {drill.swappedFrom && (
          <span className="mt-0.5 block text-[10px] text-slate-600">swapped from {drill.swappedFrom}</span>
        )}
        {detail && <span className="mt-0.5 block text-[10px] text-slate-500">{detail}</span>}
      </span>

      <span className="flex shrink-0 items-center gap-1.5 self-stretch">
        {/* Skill work carries its own prescription — "5 × 60 seconds each foot"
            doesn't survive being squashed into sets×reps. */}
        <span className="text-right text-xs font-semibold text-slate-300">
          {drill.prescription ?? `${drill.sets}×${drill.reps}`}
        </span>
        {pickable && <span aria-hidden className="text-xs text-slate-600">›</span>}
      </span>
    </button>
  );
}

/** The old dense row, kept for the calendar's week-at-a-glance. */
function CompactRow({ drill, onPick }: { drill: Drill; onPick?: (name: string) => void }) {
  const pickable = !!onPick && !!howToFor(drill.name);
  return (
    <button
      onClick={() => pickable && onPick!(drill.name)}
      disabled={!pickable}
      className="min-w-0 flex-1 text-left disabled:cursor-default"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 break-words text-xs text-slate-300">
          {drill.skill && <span className="mr-1.5 text-pitch-400">⚽</span>}
          {displayName(drill)}
        </span>
        <span className="shrink-0 text-xs text-slate-500">
          {drill.prescription ?? `${drill.sets}×${drill.reps}`}
        </span>
      </div>
      {drill.swappedFrom && (
        <div className="text-[10px] text-slate-600">swapped from {drill.swappedFrom}</div>
      )}
      {detailLine(drill) && <div className="text-[10px] text-slate-500">{detailLine(drill)}</div>}
    </button>
  );
}

/** "2 min rest · RPE 8 · 3s down" — the part that turns numbers into coaching. */
function detailLine(d: ProgramDrill): string {
  return [
    d.rest != null && d.rest > 0 ? `${restText(d.rest)} rest` : null,
    d.intensity,
    d.tempo,
  ].filter(Boolean).join(" · ");
}

type Drill = ProgramDrill & { swappedFrom?: string };

type Group = { slot: Slot | null; rehab: boolean; drills: Drill[] };

function displayName(drill: Drill): string {
  return /^cardio\s*(?:\.\.\.|…)?$/i.test(drill.name.trim()) || !drill.name.trim()
    ? "Conditioning"
    : drill.name;
}

function sectionStyle(group: Group): { label: string; icon: IconName; wrap: string; text: string } {
  if (group.rehab) return { label: "Rehab", icon: "plaster", wrap: "border-l-amber-400/70 bg-amber-400/[0.025]", text: "text-amber-400/80" };
  const slot = group.slot;
  if (slot === "warmup") return { label: "Warm-up", icon: "bolt", wrap: "border-l-sky-400/70 bg-sky-400/[0.02]", text: "text-sky-300/80" };
  if (slot === "conditioning") return { label: "Conditioning", icon: "run", wrap: "border-l-emerald-400/70 bg-emerald-400/[0.02]", text: "text-emerald-300/80" };
  if (slot === "cooldown") return { label: "Cool-down", icon: "stretch", wrap: "border-l-violet-400/70 bg-violet-400/[0.02]", text: "text-violet-300/80" };
  if (slot === "skill") return { label: "Skill", icon: "ball", wrap: "border-l-pitch-400/60 bg-pitch-400/[0.02]", text: "text-pitch-300/80" };
  if (slot) return { label: slot === "primary" ? "Main / Strength" : SLOT_LABEL[slot], icon: "dumbbell", wrap: "border-l-pitch-400/70 bg-pitch-400/[0.02]", text: "text-pitch-300/80" };
  return { label: "Workout", icon: "dumbbell", wrap: "border-l-white/15", text: "text-slate-400" };
}

/**
 * Group runs of drills that share a heading.
 *
 * Rehab work breaks the run whatever slot it carries. It comes from a
 * different document with a different reason, and folding it into "Warm-up"
 * would present a hamstring protocol as a way to get warm — which is exactly
 * the confusion that had people skipping it.
 */
function groupBySlot(drills: Drill[]): Group[] {
  const out: Group[] = [];
  for (const d of drills) {
    const slot = d.slot ?? null;
    const rehab = !!d.rehab;
    const last = out[out.length - 1];
    if (last && last.slot === slot && last.rehab === rehab) last.drills.push(d);
    else out.push({ slot, rehab, drills: [d] });
  }
  return out;
}
