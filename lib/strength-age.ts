/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SAME LIFT MEANS MORE AT FIFTY THAN AT TWENTY-FIVE.
 *
 * The tiers in lib/strength-standards.ts are ABSOLUTE, and deliberately: a
 * 140kg squat is a 140kg squat, and "Advanced — stronger than most people in
 * any gym" is a claim about the gym rather than about a birthday. That stays
 * the headline, because it is the thing the words mean.
 *
 * What it cannot say is whether a 52-year-old's 140kg is remarkable, and
 * comparing yourself against a population that is mostly half your age is
 * either demoralising or meaningless depending on the day. So this adds a
 * second line rather than replacing the first.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS IS A RULE OF THUMB AND IS LABELLED AS ONE.
 *
 * There is no single authority to copy here, and inventing a precise-looking
 * curve would be exactly the false precision this app avoids elsewhere. What
 * is well established is only the shape: strength holds roughly flat into the
 * mid-thirties, declines slowly after, and declines faster past sixty. The
 * numbers below are that shape and nothing more, which is why nothing is
 * reported to two decimal places and why the absolute tier is never replaced.
 *
 * Nothing is applied under 35 — including to teenagers. A 16-year-old is still
 * growing, and handing them a bonus for being young would be a different kind
 * of wrong from the one this fixes.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Below this, no adjustment at all. */
export const PEAK_AGE = 35;

/** Past this, the decline steepens. */
export const STEEP_AGE = 60;

/** Per year, between PEAK_AGE and STEEP_AGE. */
const SLOW_DECLINE = 0.008;

/** Per year, past STEEP_AGE. */
const FAST_DECLINE = 0.015;

/**
 * A ceiling, because the curve is a straight line and straight lines are wrong
 * eventually. At 60% it already says "worth two thirds more than the raw
 * number", which is as far as a rule of thumb should be trusted to carry.
 */
export const MAX_FACTOR = 1.6;

/**
 * What a lift at this age is worth against the open standards.
 *
 * Multiplied INTO the lift, so an older athlete is compared as though they had
 * lifted more — rather than the thresholds moving, which would make two
 * athletes with the same tier name mean different things.
 */
export function ageFactor(age: number | null | undefined): number {
  if (age == null || !Number.isFinite(age) || age <= PEAK_AGE) return 1;

  const slowYears = Math.min(age, STEEP_AGE) - PEAK_AGE;
  const fastYears = Math.max(0, age - STEEP_AGE);
  const factor = 1 + slowYears * SLOW_DECLINE + fastYears * FAST_DECLINE;

  return Math.min(factor, MAX_FACTOR);
}

/** Whether an age adjustment would say anything at all. */
export function adjustsAnything(age: number | null | undefined): boolean {
  return ageFactor(age) > 1;
}

/**
 * The line to show under an absolute tier, or null when there is nothing to
 * add.
 *
 * Returns null when the adjustment does not change the tier, which is most of
 * the time. Repeating "Advanced · and Advanced for your age" on every row is
 * noise that teaches people to stop reading the row.
 */
export function ageNote(opts: {
  age: number | null | undefined;
  absoluteTier: string;
  adjustedTier: string;
}): string | null {
  if (!adjustsAnything(opts.age)) return null;
  if (opts.adjustedTier === opts.absoluteTier) return null;
  return `${opts.adjustedTier} for ${opts.age}`;
}
