// =============================================================================
// RATES, AND WHAT A RATE FROM A SMALL SAMPLE IS ALLOWED TO CLAIM.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY THIS IS THE FIRST FILE AND NOT THE LAST ONE.
//
// Migration 0045 opens with the only sample size this project has ever written
// down: "22 users, 0 paying". Every engagement question worth asking — does
// the win-back work, is the new card better, did retention move — is a
// comparison of two rates, and at that size almost every comparison has the
// same honest answer: cannot tell yet.
//
// That answer is unpopular and it is the correct one. A rate quoted without
// its sample is the failure this project has already made once, on its own
// analytics: a published reel reported "save rate 0.8% higher, in green", it
// was read as a signal, and it was ONE PERSON out of about 133 views. The
// number was real, the arrow was real, the conclusion was invented.
//
// So nothing here returns a bare percentage. Every rate carries the interval
// it could actually be, every comparison carries whether the two are
// distinguishable at all, and the experiment readout refuses to name a winner
// the sample cannot support. Being unable to see a difference is a fact about
// the evidence, and it is reported as one.
// ═══════════════════════════════════════════════════════════════════════════
//
// Pure, dependency-free and tested against published values, because a
// statistics module that is subtly wrong produces plausible numbers rather
// than errors — which is the worst failure mode a measurement can have.
// =============================================================================

/**
 * The standard normal CDF: P(Z <= z).
 *
 * Abramowitz & Stegun 26.2.17, the 5-term rational approximation, whose stated
 * error is below 7.5e-8 — far finer than anything a proportion from a few
 * dozen people can justify.
 *
 * Written out rather than pulled from a library on purpose. This has no
 * dependencies, runs in the Worker as happily as in the app, and is checked
 * against published values in the tests; a maths dependency would be a
 * supply-chain risk taken on for thirty lines of arithmetic.
 */
export function normalCdf(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * The z with `p` of the distribution below it.
 *
 * BISECTION, NOT A RATIONAL APPROXIMATION. The inverse normal has well-known
 * closed forms and they are all a page of unexplained constants; this is
 * twelve lines whose correctness is visible, converges to 1e-12 in about fifty
 * steps, and is called a handful of times per report. The cost is nothing and
 * the thing bought is that anyone can check it.
 */
export function normalQuantile(p: number): number {
  if (!(p > 0) || !(p < 1)) return p <= 0 ? -Infinity : Infinity;
  let low = -40;
  let high = 40;
  for (let i = 0; i < 200 && high - low > 1e-12; i++) {
    const mid = (low + high) / 2;
    if (normalCdf(mid) < p) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** The conventional two-sided 95% / 80% power pair, named so call sites read. */
export const ALPHA = 0.05;
export const POWER = 0.8;

export interface Interval {
  /** The observed proportion. Zero trials gives zero, which means "no data". */
  rate: number;
  low: number;
  high: number;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE WILSON SCORE INTERVAL, AND WHY NOT THE ONE EVERYBODY WRITES.
 *
 * The obvious interval is p ± z·sqrt(p(1-p)/n), and at these sample sizes it
 * is not merely imprecise, it is wrong in ways that matter here:
 *
 *   0 of 8 returned   ->  0% ± 0%       a certainty, from eight people
 *   1 of 3 returned   ->  33% ± 53%     an interval running below zero
 *
 * Both are the shapes this app will actually produce. Wilson is built by
 * asking which true rates would plausibly generate what was seen, so it never
 * leaves [0, 1], never collapses at the extremes, and is the interval the
 * statistics literature recommends for exactly this case — small n, or p near
 * zero or one.
 *
 * `0 of 8` comes back as 0% to 32% under Wilson. That is the honest reading:
 * eight people all failing to return is entirely compatible with a third of
 * people returning.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function wilson(successes: number, trials: number, alpha: number = ALPHA): Interval {
  const n = Math.max(0, Math.floor(trials));
  const x = Math.min(Math.max(0, Math.floor(successes)), n);
  // No trials is not a rate of zero; it is no information at all, and the
  // interval says so by covering everything.
  if (n === 0) return { rate: 0, low: 0, high: 1 };

  const z = normalQuantile(1 - alpha / 2);
  const p = x / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const half = (z / denominator) * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n));
  return {
    rate: p,
    low: Math.max(0, centre - half),
    high: Math.min(1, centre + half),
  };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * A rate as a sentence, with the count first.
 *
 * THE COUNT LEADS, ALWAYS. "27%" and "3 of 11" are the same fact and they are
 * read completely differently: the first invites a comparison with last
 * month's 24%, the second makes it obvious that one person changing their mind
 * moves it nine points. This project has already believed a percentage that
 * was one person; putting the count where the eye lands first is the cheapest
 * guard against doing it again.
 */
export function describeRate(successes: number, trials: number, alpha: number = ALPHA): string {
  const n = Math.max(0, Math.floor(trials));
  if (n === 0) return "nobody yet";
  const i = wilson(successes, n, alpha);
  const width = i.high - i.low;
  // An interval wider than the rate it surrounds is not a measurement, and
  // saying so in words costs nothing and stops the number being quoted alone.
  const verdict = width > 0.4 ? " — too few to read anything into"
    : width > 0.2 ? " — a wide reading"
    : "";
  return `${Math.floor(successes)} of ${n} (${pct(i.rate)}, and anywhere from `
    + `${pct(i.low)} to ${pct(i.high)})${verdict}`;
}

export interface PowerAsk {
  /** The rate you expect without the change, as a fraction. */
  baseline: number;
  /** The improvement you want to be able to see, in PERCENTAGE POINTS. */
  lift: number;
  alpha?: number;
  power?: number;
}

/**
 * How many people PER ARM a test needs to see a lift of `lift`.
 *
 * The standard two-proportion sample size, with the pooled variance under the
 * null — the same arithmetic every calculator uses, written out so the inputs
 * are visible:
 *
 *   n = ( z(1-a/2)*sqrt(2*pbar*qbar) + z(power)*sqrt(p1*q1 + p2*q2) )^2 / d^2
 *
 * IN PERCENTAGE POINTS, not "a 20% improvement". A relative lift is the unit
 * in which a change to a 1% rate and a change to a 60% rate sound identical
 * and need sample sizes three orders of magnitude apart. Points are the unit
 * the arithmetic is actually in.
 *
 * Infinity for a lift of nothing, because no sample can distinguish a
 * difference that is not there — and returning a big number instead would read
 * as "expensive but possible".
 */
export function sampleNeeded({ baseline, lift, alpha = ALPHA, power = POWER }: PowerAsk): number {
  const p1 = Math.min(Math.max(baseline, 0), 1);
  const p2 = Math.min(Math.max(p1 + lift, 0), 1);
  const d = Math.abs(p2 - p1);
  if (!(d > 0)) return Infinity;

  const zA = normalQuantile(1 - alpha / 2);
  const zB = normalQuantile(power);
  const pbar = (p1 + p2) / 2;
  const pooled = zA * Math.sqrt(2 * pbar * (1 - pbar));
  const apart = zB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  return Math.ceil(((pooled + apart) ** 2) / (d * d));
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE OTHER DIRECTION, WHICH IS THE ONE THIS PROJECT NEEDS.
 *
 * "How many people do I need?" is the question a growing product asks. The
 * question a product with 22 accounts has to ask is the inverse: given the
 * people I actually have, what is the smallest change I could possibly see?
 *
 * The answer is usually enormous, and that IS the finding. An experiment that
 * can only detect "the new version is forty points better" is not an
 * experiment; it is a coin toss with a report attached, and the time it costs
 * is better spent on a change big enough not to need one.
 *
 * Found by bisection on sampleNeeded rather than by inverting it, because the
 * inverse has no closed form and a search over a monotone function is exact to
 * whatever tolerance you ask for.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function detectableLift(
  perArm: number,
  baseline: number,
  alpha: number = ALPHA,
  power: number = POWER,
): number {
  const n = Math.floor(perArm);
  if (!(n > 0)) return 1;
  const p1 = Math.min(Math.max(baseline, 0), 1);

  // The largest lift that stays inside [0, 1]. If even that is beyond reach,
  // no lift is detectable with this many people and the answer is "all of it".
  const ceiling = 1 - p1;
  if (!(ceiling > 0) || sampleNeeded({ baseline: p1, lift: ceiling, alpha, power }) > n) return ceiling || 1;

  let low = 0;
  let high = ceiling;
  for (let i = 0; i < 80 && high - low > 1e-6; i++) {
    const mid = (low + high) / 2;
    if (sampleNeeded({ baseline: p1, lift: mid, alpha, power }) > n) low = mid;
    else high = mid;
  }
  return high;
}

export interface Arm {
  label: string;
  /** People who could have converted. */
  trials: number;
  /** People who did. */
  successes: number;
}

/**
 * How big a difference has to be before it is worth acting on.
 *
 * Five points. Not a statistical quantity — a product one: a change to a
 * re-engagement email that moves returns by less than this is not worth the
 * send, the code, or the second experiment to confirm it. It exists so that
 * "we found nothing" can be separated into its two very different meanings.
 */
export const WORTHWHILE = 0.05;

export interface Comparison {
  control: Arm;
  variant: Arm;
  /** variant rate minus control rate, in fractions. Negative means worse. */
  difference: number;
  /** The 95% interval on that difference — see the note on newcombe(). */
  low: number;
  high: number;
  /** Two-sided p-value from the pooled two-proportion z-test. */
  p: number;
  /** Whether the difference clears `alpha`. Not the same as "worth shipping". */
  significant: boolean;
  /** The smallest lift this many people could reliably have detected. */
  detectable: number;
  /** The plain-English reading, including the refusals. */
  verdict: string;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE INTERVAL ON THE DIFFERENCE, BY NEWCOMBE'S HYBRID SCORE METHOD.
 *
 * The textbook interval on a difference is d ± z*sqrt(p1q1/n1 + p2q2/n2), and
 * it fails in exactly the place this app lives. Nobody converting in either
 * arm — 0 of 50 against 0 of 50 — gives a standard error of zero and therefore
 * an interval of zero width: "the difference is exactly nothing, and we are
 * certain". From a hundred people who all did nothing, against a true rate
 * that could comfortably be 5%.
 *
 * Newcombe builds the interval out of each arm's WILSON bounds instead, so it
 * inherits their behaviour at the edges. The same 0 of 50 against 0 of 50 comes
 * back as -7 to +7 points, which is the honest answer: a difference that size
 * is entirely compatible with what was seen.
 *
 *   low  = d - sqrt( (p2 - l2)^2 + (u1 - p1)^2 )
 *   high = d + sqrt( (u2 - p2)^2 + (p1 - l1)^2 )
 * ═══════════════════════════════════════════════════════════════════════════
 */
function newcombe(x1: number, n1: number, x2: number, n2: number, alpha: number): { low: number; high: number } {
  const a = wilson(x1, n1, alpha);
  const b = wilson(x2, n2, alpha);
  const d = b.rate - a.rate;
  const below = Math.sqrt((b.rate - b.low) ** 2 + (a.high - a.rate) ** 2);
  const above = Math.sqrt((b.high - b.rate) ** 2 + (a.rate - a.low) ** 2);
  return { low: Math.max(-1, d - below), high: Math.min(1, d + above) };
}

/**
 * Compare two arms, and say what the comparison is worth.
 *
 * THE VERDICT IS THE PRODUCT, not the p-value. A p-value answers "would a gap
 * this big turn up by chance", and both of its answers are routinely misread:
 * a small p from a tiny sample is usually a fluke that will not replicate, and
 * a large p is read as "no difference" when it usually means "no idea".
 *
 * Those last two are separated by the INTERVAL, not by the p-value. If the
 * plausible range of the difference has both ends inside `worthwhile`, then
 * every effect still on the table is too small to act on, and "we found
 * nothing" genuinely means there is nothing here. If the range still admits a
 * change worth shipping, the test simply did not answer the question — and
 * that is reported as not knowing rather than as a null result.
 */
export function compareArms(
  control: Arm,
  variant: Arm,
  alpha: number = ALPHA,
  worthwhile: number = WORTHWHILE,
): Comparison {
  const n1 = Math.max(0, Math.floor(control.trials));
  const n2 = Math.max(0, Math.floor(variant.trials));
  const x1 = Math.min(Math.max(0, Math.floor(control.successes)), n1);
  const x2 = Math.min(Math.max(0, Math.floor(variant.successes)), n2);
  const p1 = n1 ? x1 / n1 : 0;
  const p2 = n2 ? x2 / n2 : 0;
  const difference = p2 - p1;
  const perArm = Math.min(n1, n2);
  const detectable = detectableLift(perArm, p1, alpha);

  if (!n1 || !n2) {
    return {
      control, variant, difference, low: -1, high: 1, p: 1, significant: false, detectable,
      verdict: "one arm has nobody in it — nothing to compare",
    };
  }

  const { low, high } = newcombe(x1, n1, x2, n2, alpha);
  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  // Both arms at the same rate — including both at zero — is a difference of
  // nothing, and dividing by a standard error of nothing would report it as
  // infinitely significant.
  const p = se > 0 ? 2 * (1 - normalCdf(Math.abs(difference) / se)) : 1;
  const significant = p < alpha;

  const points = (v: number) => `${(v * 100).toFixed(1)} points`;
  const range = `${(low * 100).toFixed(1)} to ${(high * 100).toFixed(1)} points`;

  let verdict: string;
  if (significant) {
    // SIGNED. This read "ahead by -8.0 points" for a variant that lost, which
    // is a sentence nobody parses as a loss.
    const way = difference > 0 ? "ahead" : "behind";
    verdict = `${variant.label} is ${way} by ${points(Math.abs(difference))} (p=${p.toFixed(3)})`
      + (perArm < 30 ? ` — but on ${perArm} per arm, expect it to move` : "");
  } else if (Math.abs(low) <= worthwhile && Math.abs(high) <= worthwhile) {
    verdict = `no difference worth chasing — the truth is between ${range}, `
      + `all of it under the ${(worthwhile * 100).toFixed(0)} points that would justify the change`;
  } else {
    verdict = `cannot tell: the difference is somewhere between ${range}. `
      + `${perArm} per arm can only settle a change of ${points(detectable)} or more`;
  }

  return { control, variant, difference, low, high, p, significant, detectable, verdict };
}
