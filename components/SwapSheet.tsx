"use client";

import { useMemo, useState } from "react";
import { similarExercises, findExercise } from "@/lib/exercise-match";

/**
 * Swap a prescribed exercise for one you can actually do.
 *
 * WHY THIS IS NEEDED. The programme picked movements from a catalogue without
 * knowing which rack was free, what the gym owns, or that a shoulder hates
 * overhead pressing this month. The only options were do it anyway, skip it, or
 * regenerate the block — and regenerating throws away three weeks of
 * progression to fix one exercise.
 *
 * THE SUBSTITUTES ARE RANKED BY WHAT THEY TRAIN, not by what they look like.
 * Somebody swapping a barbell squat almost always has no barbell, so offering
 * the front squat, the box squat and the pause squat would be three more
 * barbell lifts and no help — see lib/exercise-match.ts, where different
 * equipment is a mild plus rather than a penalty.
 *
 * Nothing is offered for a movement the library cannot identify. Guessing there
 * is how somebody replaces a rehab isometric with a leg extension because both
 * mention a knee.
 */
export function SwapSheet({ name, current, onSwap, onClose }: {
  /** The PRESCRIBED name — the key a swap is stored against. */
  name: string;
  /** What they are doing instead already, if anything. */
  current?: string | null;
  /** Called with the substitute, or null to go back to what was prescribed. */
  onSwap: (to: string | null) => void | Promise<void>;
  onClose: () => void;
}) {
  const options = useMemo(() => similarExercises(name, 8), [name]);
  const original = useMemo(() => findExercise(name), [name]);
  const [busy, setBusy] = useState(false);

  async function choose(to: string | null) {
    setBusy(true);
    await onSwap(to);
    setBusy(false);
    onClose();
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Swap {original?.name ?? name}
        </span>
        <button onClick={onClose} className="tap-target text-xs font-semibold text-slate-500 hover:text-slate-300">
          Close
        </button>
      </div>

      {/* PUTTING IT BACK IS AS EASY AS CHANGING IT.
          A swap is a standing decision — it applies to every week — so it has
          to be as reversible as it was cheap, or people stop making them. */}
      {current && (
        <button
          disabled={busy}
          onClick={() => choose(null)}
          className="mb-2 w-full rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left text-sm text-slate-300 hover:border-pitch-400/40 disabled:opacity-50"
        >
          <b className="text-slate-100">Back to {original?.name ?? name}</b>
          <span className="mt-0.5 block text-xs text-slate-500">Undo this swap everywhere in the block.</span>
        </button>
      )}

      {options.length === 0 ? (
        /* Said plainly rather than showing an empty list. Offering nothing and
           explaining nothing reads as broken. */
        <p className="text-xs text-slate-500">
          No close match for this one in the library — it is specific enough that a substitute would be a
          guess. Skip it, or ask the coach what to do instead.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {options.map((o) => {
            const chosen = current === o.ex.name;
            return (
              <li key={o.ex.id}>
                <button
                  disabled={busy || chosen}
                  onClick={() => choose(o.ex.name)}
                  className={`w-full rounded-xl border p-3 text-left transition disabled:opacity-60 ${
                    chosen
                      ? "border-pitch-400/50 bg-pitch-400/[0.08]"
                      : "border-white/10 bg-white/[0.03] hover:border-pitch-400/40"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-100">{o.ex.name}</span>
                    {chosen && <span className="shrink-0 text-[10px] font-bold uppercase text-pitch-400">doing this</span>}
                  </span>
                  {/* What it trains and what it needs — the two things that
                      decide whether a substitute is any use to you today. */}
                  <span className="mt-0.5 block text-xs text-slate-500">{o.why}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
        Applies to every week of the block, not just today — sets and reps stay as prescribed.
      </p>
    </div>
  );
}
