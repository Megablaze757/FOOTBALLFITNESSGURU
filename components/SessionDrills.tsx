"use client";

import { SLOT_LABEL, restText, type ProgramDrill, type Slot } from "@/lib/engine";

/**
 * A session, rendered as a session: warm-up, main work, accessories, cool-down.
 *
 * Programs saved before the engine gained slots have no `slot` on their drills.
 * Those just render as one flat list — the same as they always did — rather than
 * being relabelled into a structure they weren't built with.
 */
export function SessionDrills({ drills, onPick }: {
  drills: ProgramDrill[];
  /** Optional: open the exercise detail. Drills with no library entry stay inert. */
  onPick?: (name: string) => void;
}) {
  const grouped = groupBySlot(drills);

  return (
    <ul className="space-y-1">
      {grouped.map((group, gi) => (
        <li key={gi}>
          {group.slot && (
            <div className="mb-1 mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 first:mt-0">
              {SLOT_LABEL[group.slot]}
            </div>
          )}
          <ul className="space-y-1">
            {group.drills.map((d, k) => (
              <li key={k}>
                <button
                  onClick={() => onPick?.(d.name)}
                  disabled={!onPick}
                  className="w-full text-left disabled:cursor-default"
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
                  {detailLine(d) && (
                    <div className="text-[10px] text-slate-500">{detailLine(d)}</div>
                  )}
                </button>
              </li>
            ))}
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

function groupBySlot(drills: ProgramDrill[]): { slot: Slot | null; drills: ProgramDrill[] }[] {
  const out: { slot: Slot | null; drills: ProgramDrill[] }[] = [];
  for (const d of drills) {
    const slot = d.slot ?? null;
    const last = out[out.length - 1];
    if (last && last.slot === slot) last.drills.push(d);
    else out.push({ slot, drills: [d] });
  }
  return out;
}
