// =============================================================================
// THE CYCLE QUESTION, AND THE RULES AROUND ASKING IT.
//
// ═══════════════════════════════════════════════════════════════════════════
// ONE OPTIONAL QUESTION. NOT A CYCLE TRACKER.
//
// An athlete picks a phase if they want the coach to know. There is no flow,
// no symptom list, no prediction, no calendar and no history beyond the
// check-in row it sits on — all of which would be a different feature with a
// much larger duty of care, and none of which was asked for.
//
// ═══════════════════════════════════════════════════════════════════════════
// IT INFORMS THE ADVICE AND NEVER THE SCORE.
//
// The obvious thing is to dock readiness in the phases where people often feel
// worse. This does not do that, on purpose.
//
// Individual response across a cycle varies enough that a blanket penalty
// would be this project inventing a physiological law and taking points off
// somebody with it. And a score that drops for a reason the athlete cannot act
// on is a score they stop trusting — which costs more than the signal is
// worth. lib/checkin-questions.test.ts has a test that the phase moves no
// number.
//
// What it CAN do honestly is put the fact next to the advice, so a heavier day
// reads as a heavier day rather than as a failure. That is a sentence, not a
// subtraction.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHO IS ASKED, AND HOW IT DECLINES TO ASSUME.
//
// The section appears when the profile records sex as female, because that is
// the only signal the app has and asking everybody would be worse. Two things
// follow from that, and both are the reason `shouldOfferCycle` is a function
// rather than an inline `=== "female"`:
//
//   * It is OFFERED, never required. No default, no pre-selected phase, and
//     "Prefer not to say" is a real answer that stores null — the same null a
//     quick check-in leaves. Nothing anywhere treats the absence as missing
//     data or nags for it.
//   * A profile with no sex recorded is NOT asked. Guessing from a name, a
//     sport or a position would be worse than not asking.
//
// Somebody whose profile says female and who does not want the question simply
// never answers it, and the form stops showing the section once it has been
// dismissed for the day.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

/**
 * The four phases, in cycle order.
 *
 * Kept in step with 0115's check constraint by lib/checkin-questions.test.ts
 * — the same
 * arrangement lib/win-back.ts has with migration 0114, and for the same
 * reason: a value the UI can send and the database refuses is an error the
 * athlete sees at the moment they press save.
 */
export const CYCLE_PHASES = ["period", "follicular", "ovulation", "luteal"] as const;

export type CyclePhase = (typeof CYCLE_PHASES)[number];

export function isCyclePhase(value: unknown): value is CyclePhase {
  return typeof value === "string" && (CYCLE_PHASES as readonly string[]).includes(value);
}

/**
 * What to put on the button, and what the phase means in training terms.
 *
 * NO CLINICAL CLAIMS. Each note says what athletes commonly report, hedged,
 * because the point is to give the athlete a frame for their own experience
 * rather than to tell them how they feel. "Often" is doing real work in these
 * strings and should survive editing.
 */
export const CYCLE_PHASE_LABELS: Record<CyclePhase, { label: string; note: string }> = {
  period: {
    label: "Period",
    note: "Many athletes train normally through it; some want a lighter day. Both are fine.",
  },
  follicular: {
    label: "Follicular",
    note: "The days after a period. Often when harder sessions feel most doable.",
  },
  ovulation: {
    label: "Ovulation",
    note: "Mid-cycle. Often a strong window, and worth noting if yours is not.",
  },
  luteal: {
    label: "Luteal",
    note: "The run-up to a period. Often heavier legs and a higher effort for the same work.",
  },
};

/**
 * Whether to show the cycle question at all.
 *
 * `null` sex means not recorded, and that is a no: the alternative is inferring
 * it from something else, which would be worse than leaving the question out.
 */
export function shouldOfferCycle(sex: string | null | undefined): boolean {
  return sex === "female";
}

/**
 * The line the coach adds when a phase is recorded, or null.
 *
 * CONTEXT, NOT INSTRUCTION. It never tells the athlete to do less — the rest
 * of the advice already does that when the numbers call for it, and a phase is
 * not a number. It says what phase they recorded and leaves the decision where
 * it belongs.
 */
export function cycleNote(phase: CyclePhase | null | undefined): string | null {
  if (!phase || !isCyclePhase(phase)) return null;
  return `You logged your ${CYCLE_PHASE_LABELS[phase].label.toLowerCase()} phase. ${CYCLE_PHASE_LABELS[phase].note}`;
}
