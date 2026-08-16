"use client";

import { useState } from "react";
import { SLOT_LABEL, restText, type ProgramDrill, type Slot } from "@/lib/engine";
import { SwapSheet } from "@/components/SwapSheet";

/**
 * A session, rendered as a session: warm-up, main work, accessories, cool-down.
 *
 * Programs saved before the engine gained slots have no `slot` on their drills.
 * Those just render as one flat list — the same as they always did — rather than
 * being relabelled into a structure they weren't built with.
 */
export function SessionDrills({ drills, onPick, onSwap }: {
  drills: Drill[];
  /** Optional: open the exercise detail. Drills with no library entry stay inert. */
  onPick?: (name: string) => void;
  /**
   * Optional: offer to swap. Called with the PRESCRIBED name and the
   * substitute, or null to go back to what was prescribed. Absent on read-only
   * views like the calendar, where there is nothing to save to.
   */
  onSwap?: (prescribed: string, to: string | null) => void | Promise<void>;
}) {
  const [swapping, setSwapping] = useState<string | null>(null);
  const grouped = groupBySlot(drills);

  return (
    <ul className="space-y-1">
      {grouped.map((group, gi) => (
        <li key={gi}>
          {group.rehab ? (
            <div className="mb-1 mt-2 text-[10px] font-bold uppercase tracking-wider text-amber-400/80 first:mt-0">
              Rehab · do this first
            </div>
          ) : group.slot ? (
            <div className="mb-1 mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 first:mt-0">
              {SLOT_LABEL[group.slot]}
            </div>
          ) : null}
          <ul className="space-y-1">
            {group.drills.map((d, k) => {
              // The name a swap is stored against is the PRESCRIBED one, which
              // for an already-swapped row is not the name on screen.
              const prescribed = d.swappedFrom ?? d.name;
              const open = swapping === prescribed;
              return (
              <li key={k}>
                <div className="flex items-start gap-1">
                  <button
                    onClick={() => onPick?.(d.name)}
                    disabled={!onPick}
                    className="min-w-0 flex-1 text-left disabled:cursor-default"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 break-words text-xs text-slate-300">
                        {d.skill && <span className="mr-1.5 text-pitch-400">⚽</span>}
                        {d.name}
                      </span>
                      {/* Skill work carries its own prescription — "5 × 60 seconds
                          each foot" doesn't survive being squashed into sets×reps. */}
                      <span className="shrink-0 text-xs text-slate-500">
                        {d.prescription ?? `${d.sets}×${d.reps}`}
                      </span>
                    </div>
                    {/* WHAT IT REPLACED. A programme that silently shows a
                        different exercise from the one it prescribed has lost
                        the thread of its own plan; saying so keeps the
                        substitution the athlete's decision rather than the
                        app's. */}
                    {d.swappedFrom && (
                      <div className="text-[10px] text-slate-600">swapped from {d.swappedFrom}</div>
                    )}
                    {detailLine(d) && (
                      <div className="text-[10px] text-slate-500">{detailLine(d)}</div>
                    )}
                  </button>
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
