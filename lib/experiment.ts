// =============================================================================
// SPLITTING PEOPLE INTO ARMS, AND KNOWING WHETHER IT WAS WORTH IT.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE MOST USEFUL THING THIS FILE DOES IS TALK YOU OUT OF EXPERIMENTS.
//
// An A/B test is a measuring instrument, and a measuring instrument with a
// resolution of forty percentage points is not a cheap version of a good one —
// it is a coin toss that produces a report. Run enough of those and the wins
// are all noise, the losses are all noise, and every one of them cost a fork
// in the code that somebody now has to maintain.
//
// So `feasibility()` comes first in this file on purpose, and the intended
// answer for most of what this app could test today is "do not run this; make
// the change or do not, and look at the retention curve in a month".
//
// The framework exists anyway, for three reasons. The arithmetic that says no
// has to live somewhere. Some changes really are testable — a send to every
// lapsed account is a hundred percent sample of the population that matters,
// not a slice of daily traffic. And when this does grow, the instrument
// should already be the honest one rather than a dashboard bolted on in a
// hurry that reports p-values to three decimal places.
// ═══════════════════════════════════════════════════════════════════════════
//
// NO ASSIGNMENT TABLE. Which arm somebody is in is a pure function of their id
// and the experiment's id, so it is the same answer in the app, in the Worker,
// in a SQL report and six months later when the row would have been deleted.
// A stored assignment can disagree with the code that reads it; a hash cannot.
// =============================================================================

import { compareArms, detectableLift, sampleNeeded, type Arm, type Comparison } from "./proportions";

/**
 * FNV-1a, 32-bit.
 *
 * Chosen for being tiny, dependency-free, identical in the app and the Worker,
 * and well enough distributed for splitting people into halves. It is not a
 * cryptographic hash and must never be used as one: an athlete's id is not
 * secret from this function, and the assignment it produces is not a secret
 * either — anybody can compute which arm they are in, which is fine, because
 * the arms are a caption and an email subject line.
 */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    // The FNV prime 16777619, by shifts: 2^24 + 2^8 + 2^7 + 2^4 + 2^1 + 1.
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    h >>>= 0;
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * AND THEN AVALANCHE IT, WHICH IS NOT OPTIONAL.
   *
   * FNV-1a alone is not good enough for what this does with it. Its weakness
   * is in the HIGH bits for short, similar inputs — and "short and similar" is
   * exactly what a set of athlete ids is, and the high bits are exactly what
   * dividing by 2^32 to get a bucket reads.
   *
   * Measured, not assumed: splitting four thousand sequential ids in half came
   * out 2185 to 1815, a 9.3 point skew on what is supposed to be a coin toss.
   * An experiment run on that split would have had a real effect in it before
   * anybody changed anything.
   *
   * murmur3's finalising mix fixes it — two multiplies and three xor-shifts
   * whose whole job is to spread every input bit across every output bit.
   * Re-measured afterwards:
   *
   *   the same 4,000 sequential ids     1.25 points off an even split
   *   200,000 real UUIDs                0.35 points, 1.6 standard deviations
   *
   * The second one is the case that matters, because a Supabase id is a
   * random UUID. Sequential ids are a pathological input this will never see
   * and are measured anyway, on the grounds that a splitter which is fine only
   * on well-behaved input is a splitter nobody should trust.
   * ═══════════════════════════════════════════════════════════════════════
   */
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** A stable number in [0, 1) for this person in this experiment. */
export function bucket(experiment: string, subject: string): number {
  // THE EXPERIMENT ID IS IN THE HASH, not a salt added afterwards, so the same
  // athlete is not in the control arm of everything forever. Two experiments
  // that split on the same id without it would correlate perfectly, and the
  // second one would be measuring the first.
  return hash32(`${experiment}:${subject}`) / 0x100000000;
}

export interface Split {
  label: string;
  /** Relative weight. Two arms of 1 and 1 is an even split. */
  weight?: number;
}

/**
 * Which arm this person is in.
 *
 * Returns the FIRST arm for an unusable input rather than throwing. An
 * analytics decision must never be able to break the thing the athlete was
 * doing, and the first arm is by convention the control — so the failure mode
 * of every part of this file is "they got the existing behaviour".
 */
export function assign(experiment: string, subject: string, arms: readonly Split[]): string {
  const usable = (arms ?? []).filter((a) => a?.label && (a.weight ?? 1) > 0);
  if (!usable.length) return "";
  if (!experiment || !subject) return usable[0].label;

  const total = usable.reduce((sum, a) => sum + (a.weight ?? 1), 0);
  let at = bucket(experiment, subject) * total;
  for (const arm of usable) {
    at -= arm.weight ?? 1;
    if (at < 0) return arm.label;
  }
  // Floating point can leave `at` at exactly zero on the last arm.
  return usable[usable.length - 1].label;
}

export interface Feasibility {
  /** People per arm the test would need. */
  needed: number;
  /** People per arm actually available. */
  have: number;
  /** The smallest lift the available sample could settle. */
  smallestVisible: number;
  worthRunning: boolean;
  verdict: string;
}

/**
 * Should this test be run at all?
 *
 * ASKED BEFORE, NOT AFTER. Running an underpowered test and discovering at the
 * readout that it could never have worked costs the same weeks as running a
 * good one, and the report at the end is indistinguishable from a real null
 * result unless somebody remembers to check. This is that check, moved to the
 * only point where the answer can still change anything.
 */
export function feasibility(
  { population, baseline, lift, arms = 2 }:
  { population: number; baseline: number; lift: number; arms?: number },
): Feasibility {
  const have = Math.floor(Math.max(0, population) / Math.max(1, arms));
  const needed = sampleNeeded({ baseline, lift });
  const smallestVisible = detectableLift(have, baseline);
  const worthRunning = have >= needed;

  const points = (v: number) => `${(v * 100).toFixed(1)} points`;
  const verdict = worthRunning
    ? `${have} per arm is enough: this can settle a ${points(lift)} change`
    : `${have} per arm cannot settle a ${points(lift)} change — that needs `
      + `${Number.isFinite(needed) ? needed.toLocaleString() : "an unlimited number of"} per arm. `
      + `The smallest change this many people could settle is ${points(smallestVisible)}, `
      + `which is not a change anybody would need a test to notice.`;

  return { needed, have, smallestVisible, worthRunning, verdict };
}

export interface Experiment {
  id: string;
  /** What is being asked, in a sentence, so a readout can be read cold. */
  question: string;
  /**
   * WRITTEN DOWN BEFORE THE DATA ARRIVES.
   *
   * The lift worth shipping for, decided in advance. Deciding it afterwards is
   * how a two-point wobble becomes "a 2% improvement in re-engagement": every
   * result looks like it means something once you already know which way it
   * went.
   */
  worthShipping: number;
  /** The rate expected without the change, for the feasibility arithmetic. */
  baseline: number;
  arms: readonly Split[];
  /** `YYYY-MM-DD`. An experiment with no end is a permanent fork in the code. */
  from: string;
  until: string;
}

/** Is this experiment meant to be running on `today`? */
export function running(experiment: Experiment, today: string): boolean {
  if (!experiment?.from || !experiment?.until) return false;
  return experiment.from <= today && today <= experiment.until;
}

/**
 * Which arm, for an experiment that may not be running.
 *
 * Outside its dates everybody gets the first arm — the control, which is the
 * existing behaviour. So an experiment that is left in the code after it ends
 * degrades to "nothing happens" rather than to half the athletes silently
 * keeping a variant nobody decided to ship.
 */
export function armFor(experiment: Experiment, subject: string, today: string): string {
  if (!running(experiment, today)) return experiment.arms?.[0]?.label ?? "";
  return assign(experiment.id, subject, experiment.arms);
}

export interface Readout {
  experiment: Experiment;
  comparison: Comparison;
  feasibility: Feasibility;
  /** What to do, in a sentence: ship it, drop it, or keep waiting. */
  decision: string;
}

/**
 * The result, and what to do about it.
 *
 * THE DECISION IS SEPARATE FROM THE SIGNIFICANCE, because they answer
 * different questions and only one of them is about shipping. A statistically
 * significant two-point lift on a rate nobody cares about is a reason to
 * delete the fork, not to keep it; that is what `worthShipping` is for, and it
 * was written down before the data arrived.
 */
export function readout(experiment: Experiment, control: Arm, variant: Arm): Readout {
  const comparison = compareArms(control, variant, undefined, experiment.worthShipping);
  const able = feasibility({
    population: control.trials + variant.trials,
    baseline: experiment.baseline,
    lift: experiment.worthShipping,
    arms: experiment.arms.length || 2,
  });

  const points = (v: number) => `${(v * 100).toFixed(1)} points`;
  let decision: string;
  if (comparison.significant && comparison.difference >= experiment.worthShipping) {
    decision = `Ship ${variant.label}.`;
  } else if (comparison.significant && comparison.difference > 0) {
    decision = `${variant.label} really is ahead, but by ${points(comparison.difference)} — under the `
      + `${points(experiment.worthShipping)} decided in advance. Drop it and keep the simpler code.`;
  } else if (comparison.significant) {
    decision = `Drop ${variant.label}: it is worse.`;
  } else if (Math.abs(comparison.low) <= experiment.worthShipping
             && Math.abs(comparison.high) <= experiment.worthShipping) {
    decision = `Drop ${variant.label}. Not because it lost — because everything still on the `
      + `table is smaller than the ${points(experiment.worthShipping)} that would have justified it.`;
  } else if (able.worthRunning) {
    decision = "Keep it running: there are enough people for an answer and it has not arrived yet.";
  } else {
    decision = `Stop. This was never going to settle: ${able.verdict}`;
  }

  return { experiment, comparison, feasibility: able, decision };
}
