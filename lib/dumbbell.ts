// =============================================================================
// A dumbbell weight is what is in ONE hand.
//
// That is how every gym, every logbook and every athlete talks: "I pressed the
// 30s" means a 30kg dumbbell in each hand, not fifteen a side. The app took the
// number at face value and multiplied it by sets and reps, so a dumbbell bench
// press with 30s was recorded as half the work it was — and the one place that
// already knew better, the strength ranks, knew it privately (`perHand` in
// lib/lift-variants.ts) for six named lifts and nowhere else.
//
// So the convention is stated once here, and the three places that need it —
// what the log asks for, what tonnage counts, and what the programme prescribes
// — read it from this file rather than each having an opinion.
//
// THE HALF THAT IS EASY TO MISS: not every dumbbell lift uses two. A single-arm
// row, a suitcase carry and a one-arm press are one dumbbell by definition, and
// doubling those would be the same error in the other direction.
// =============================================================================

import { findExercise } from "./exercise-match";

/** Kit that is held one per hand — dumbbells and kettlebells both. */
const HELD_PER_HAND = /\b(dumbbell|dumbell|db|kettlebell|kb)s?\b/i;

/**
 * Worked one side at a time.
 *
 * "Alternating" counts: the weight moving at any moment is one dumbbell, and
 * the set is the same total work as a single-arm set of twice the reps.
 */
const ONE_SIDE = /\b(single[- ]?arm|one[- ]?arm|single[- ]?sided|alternating|suitcase|one[- ]?legged|single[- ]?leg)\b/i;

/** Whether the weight logged against this movement is per hand rather than total. */
export function isPerHand(name: string): boolean {
  return HELD_PER_HAND.test(name);
}

/**
 * Kit written in the plural, which is the catalogue saying "one in each hand".
 *
 * The name is not always enough. A farmer's carry is two dumbbells and does not
 * say so; a goblet squat is one dumbbell held in both hands and does not say
 * that either. The catalogue already draws the distinction where it matters —
 * `equipment: "Dumbbells"` against `equipment: "Dumbbell"` — so that is read
 * rather than a second list of exceptions being maintained here.
 */
const PAIRED_KIT = /\b(dumbbells|kettlebells)\b/i;

/**
 * How many dumbbells the movement uses — 1 or 2.
 *
 * Anything not held per hand returns 1, so the total is the logged number and
 * callers need no special case for a barbell. Deliberately conservative: where
 * neither the name nor the catalogue says a pair, it counts one, because
 * doubling a number somebody entered as a total is the same error in reverse.
 */
export function handsFor(name: string): 1 | 2 {
  if (ONE_SIDE.test(name)) return 1;
  if (isPerHand(name)) return 2;
  const kit = findExercise(name)?.equipment ?? "";
  return PAIRED_KIT.test(kit) ? 2 : 1;
}

/**
 * The weight actually moved by one rep, from the number the athlete typed.
 *
 * Null in, null out — an unlogged weight is not zero weight, and treating it as
 * zero is how a session of unrecorded loads reads as a session of empty bars.
 */
export function totalLoadKg(name: string, perHandKg: number | null | undefined): number | null {
  const kg = Number(perHandKg);
  if (!Number.isFinite(kg) || kg <= 0) return null;
  return kg * handsFor(name);
}

/**
 * What to prescribe in each hand, given a total the engine worked out.
 *
 * The inverse of the above, and the reason a prescribed dumbbell weight has to
 * go through it: a 1RM-derived 60kg bench is 30s in the hands, and putting 60
 * on the page next to "Dumbbell bench press" asks for a set nobody can do.
 */
export function perHandFromTotal(name: string, totalKg: number): number {
  return totalKg / handsFor(name);
}

/** "kg per dumbbell" or "kg", for a field label that has to say which. */
export function loadUnitLabel(name: string): string {
  if (!isPerHand(name)) return "kg";
  return handsFor(name) === 2 ? "kg each" : "kg";
}
