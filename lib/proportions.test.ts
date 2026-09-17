import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALPHA, POWER,
  compareArms, describeRate, detectableLift, normalCdf, normalQuantile,
  sampleNeeded, wilson,
} from "./proportions";

const close = (actual: number, expected: number, tol: number, what: string) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} is not ${expected} ± ${tol}`);

// ═══════════════════════════════════════════════════════════════════════════
// THE NORMAL DISTRIBUTION, AGAINST VALUES ANYONE CAN LOOK UP.
//
// Every number below this line is built on these two functions, so they are
// checked against published table values rather than against each other.
// ═══════════════════════════════════════════════════════════════════════════

test("the normal CDF matches the table", () => {
  close(normalCdf(0), 0.5, 1e-9, "P(Z<=0)");
  close(normalCdf(1), 0.841345, 1e-5, "P(Z<=1)");
  close(normalCdf(1.96), 0.975002, 1e-5, "P(Z<=1.96)");
  close(normalCdf(2.576), 0.995009, 1e-5, "P(Z<=2.576)");
  close(normalCdf(-1.645), 0.049985, 1e-5, "P(Z<=-1.645)");
});

test("the CDF is symmetric and saturates rather than running out of range", () => {
  for (const z of [0.3, 1, 2.5, 4]) close(normalCdf(z) + normalCdf(-z), 1, 1e-6, `symmetry at ${z}`);
  assert.equal(normalCdf(Infinity), 1);
  assert.equal(normalCdf(-Infinity), 0);
  assert.ok(normalCdf(40) >= 0.999999);
});

test("the quantile is the CDF read backwards", () => {
  close(normalQuantile(0.975), 1.959964, 1e-4, "z for 97.5%");
  close(normalQuantile(0.8), 0.841621, 1e-4, "z for 80% power");
  close(normalQuantile(0.5), 0, 1e-6, "the median");
  for (const p of [0.01, 0.2, 0.5, 0.9, 0.999]) {
    close(normalCdf(normalQuantile(p)), p, 1e-5, `round trip at ${p}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// WILSON, AND THE TWO SHAPES THIS APP WILL ACTUALLY PRODUCE.
// ═══════════════════════════════════════════════════════════════════════════

/** Published values for the 95% Wilson interval; any textbook agrees. */
test("the interval matches the published numbers", () => {
  const half = wilson(5, 10);
  close(half.low, 0.2366, 1e-3, "5 of 10 low");
  close(half.high, 0.7634, 1e-3, "5 of 10 high");

  const wide = wilson(3, 11);
  close(wide.rate, 3 / 11, 1e-9, "3 of 11 rate");
  close(wide.low, 0.0975, 1e-3, "3 of 11 low");
  close(wide.high, 0.5656, 1e-3, "3 of 11 high");
});

/**
 * The shape that made this file necessary. The textbook interval gives 0% ± 0%
 * here, which reads as a certainty obtained from eight people.
 */
test("nobody returning out of eight is not proof that nobody returns", () => {
  const none = wilson(0, 8);
  assert.equal(none.rate, 0);
  assert.ok(none.low < 1e-9, `the low end is ${none.low}, not the zero the clamp should give`);
  close(none.high, 0.324, 1e-2, "0 of 8 high");
  assert.ok(none.high > 0.3, "0 of 8 is reported as ruling out a third of people returning");
});

test("everybody returning is not proof that everybody does", () => {
  const all = wilson(8, 8);
  assert.equal(all.high, 1, "the high end went above one");
  assert.ok(all.low < 0.7, `8 of 8 claims at least ${all.low}, which is too strong`);
});

test("an interval never leaves the range a proportion lives in", () => {
  for (let n = 1; n <= 40; n++) {
    for (let x = 0; x <= n; x++) {
      const i = wilson(x, n);
      assert.ok(i.low >= 0 && i.high <= 1, `${x} of ${n} gave ${i.low}..${i.high}`);
      assert.ok(i.low <= i.rate + 1e-9 && i.rate <= i.high + 1e-9, `${x} of ${n} excludes its own rate`);
    }
  }
});

/** No trials is not a rate of zero. It is no information, and it says so. */
test("no trials reports no knowledge rather than a rate of nothing", () => {
  assert.deepEqual(wilson(0, 0), { rate: 0, low: 0, high: 1 });
  assert.equal(describeRate(0, 0), "nobody yet");
});

test("more people narrow the interval", () => {
  const widths = [10, 50, 200, 1_000].map((n) => {
    const i = wilson(Math.round(n * 0.3), n);
    return i.high - i.low;
  });
  for (let i = 1; i < widths.length; i++) {
    assert.ok(widths[i] < widths[i - 1], `${widths[i]} is not narrower than ${widths[i - 1]}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// THE COUNT LEADS. This project has already believed a percentage that was
// one person; the guard against repeating it is where the eye lands first.
// ═══════════════════════════════════════════════════════════════════════════

test("a described rate puts the count before the percentage", () => {
  const said = describeRate(3, 11);
  assert.ok(said.startsWith("3 of 11"), said);
  assert.match(said, /27%/);
  assert.match(said, /10%.*57%/, "the interval is missing");
});

test("an interval too wide to read says so in words", () => {
  assert.match(describeRate(1, 3), /too few/);
  assert.doesNotMatch(describeRate(300, 1_000), /too few|wide reading/);
});

// ═══════════════════════════════════════════════════════════════════════════
// POWER: WHAT A TEST NEEDS, AND WHAT THIS PROJECT ACTUALLY HAS.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Against a standard calculator: a 30% baseline, five points of lift, 95%/80%.
 * The pooled-variance form used here gives about 1,377 per arm.
 */
test("the sample size matches a standard calculator", () => {
  close(sampleNeeded({ baseline: 0.3, lift: 0.05 }), 1_377, 5, "30% + 5 points");
  close(sampleNeeded({ baseline: 0.5, lift: 0.1 }), 388, 3, "50% + 10 points");
  close(sampleNeeded({ baseline: 0.05, lift: 0.05 }), 435, 5, "5% doubled");
});

test("a smaller lift costs more people, always", () => {
  let previous = 0;
  for (const lift of [0.2, 0.1, 0.05, 0.02, 0.01]) {
    const n = sampleNeeded({ baseline: 0.3, lift });
    assert.ok(n > previous, `${lift} needs ${n}, which is not more than ${previous}`);
    previous = n;
  }
});

/** No sample can see a difference that is not there, and it says infinity. */
test("a lift of nothing needs everybody", () => {
  assert.equal(sampleNeeded({ baseline: 0.3, lift: 0 }), Infinity);
  assert.equal(sampleNeeded({ baseline: 0.3, lift: -0 }), Infinity);
});

test("demanding more confidence or more power costs more people", () => {
  const base = sampleNeeded({ baseline: 0.3, lift: 0.05 });
  assert.ok(sampleNeeded({ baseline: 0.3, lift: 0.05, alpha: 0.01 }) > base);
  assert.ok(sampleNeeded({ baseline: 0.3, lift: 0.05, power: 0.95 }) > base);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FINDING THIS FILE EXISTS TO PRODUCE.
 *
 * Migration 0045 records the only sample size this project has ever had:
 * 22 users. Split in half, that is 11 per arm — and the smallest change 11
 * people per arm could detect is enormous. The number is asserted rather than
 * described, because it is the argument against running the test at all.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("eleven per arm can only see a change that would be obvious anyway", () => {
  const smallest = detectableLift(11, 0.3);
  assert.ok(smallest > 0.4,
    `11 per arm is claimed to detect ${(smallest * 100).toFixed(0)} points, which would be a remarkable test`);
  // And the round trip: a test powered for that lift really does need about 11.
  assert.ok(sampleNeeded({ baseline: 0.3, lift: smallest }) <= 11);
  assert.ok(sampleNeeded({ baseline: 0.3, lift: smallest - 0.01 }) > 11);
});

test("the detectable lift shrinks as the sample grows", () => {
  let previous = 1;
  for (const n of [11, 50, 200, 1_000, 5_000]) {
    const lift = detectableLift(n, 0.3);
    assert.ok(lift < previous, `${n} per arm detects ${lift}, not better than ${previous}`);
    previous = lift;
  }
  assert.ok(detectableLift(5_000, 0.3) < 0.03, "5,000 per arm should see a few points");
});

test("no people detect nothing, and it does not pretend otherwise", () => {
  assert.equal(detectableLift(0, 0.3), 1);
  assert.equal(detectableLift(-5, 0.3), 1);
});

/** A rate already at the ceiling has no room to improve, and says so. */
test("a baseline of one has nowhere to go", () => {
  assert.equal(detectableLift(1_000, 1), 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPARING TWO ARMS, INCLUDING THE CASE THAT MATTERS: NOT KNOWING.
// ═══════════════════════════════════════════════════════════════════════════

test("a real difference on a real sample is found", () => {
  const out = compareArms(
    { label: "control", trials: 2_000, successes: 600 },
    { label: "variant", trials: 2_000, successes: 760 },
  );
  assert.ok(out.significant, `p=${out.p}`);
  close(out.difference, 0.08, 1e-9, "the difference");
  assert.match(out.verdict, /variant is ahead by 8\.0 points/);
});

/**
 * THE CASE THIS PROJECT IS ACTUALLY IN. Two arms of eleven, one clearly ahead
 * by eye — and the honest answer is that the test could never have told.
 */
test("a null result from too few people is reported as not knowing", () => {
  const out = compareArms(
    { label: "control", trials: 11, successes: 3 },
    { label: "variant", trials: 11, successes: 5 },
  );
  assert.equal(out.significant, false);
  assert.match(out.verdict, /cannot tell/);
  assert.match(out.verdict, /11 per arm/);
  assert.doesNotMatch(out.verdict, /no difference/,
    "an underpowered test is being reported as evidence of no difference");
});

/** A big enough sample that a null really is evidence of no difference. */
test("a null result from enough people is allowed to mean no difference", () => {
  const out = compareArms(
    { label: "control", trials: 5_000, successes: 1_500 },
    { label: "variant", trials: 5_000, successes: 1_510 },
  );
  assert.equal(out.significant, false);
  assert.match(out.verdict, /no difference worth chasing/);
  assert.ok(Math.abs(out.low) <= 0.05 && Math.abs(out.high) <= 0.05,
    `the interval ${out.low}..${out.high} still admits a change worth shipping`);
});

/** A significant result off a tiny sample is flagged, not celebrated. */
test("a win on a handful of people comes with the warning attached", () => {
  const out = compareArms(
    { label: "control", trials: 20, successes: 1 },
    { label: "variant", trials: 20, successes: 10 },
  );
  assert.ok(out.significant, `p=${out.p}`);
  assert.match(out.verdict, /expect it to move/);
});

test("an empty arm is refused rather than divided by", () => {
  const out = compareArms(
    { label: "control", trials: 0, successes: 0 },
    { label: "variant", trials: 40, successes: 12 },
  );
  assert.equal(out.p, 1);
  assert.equal(out.significant, false);
  assert.match(out.verdict, /nobody in it/);
});

/**
 * Two arms at the same rate — both at zero especially — divide by a standard
 * error of nothing, which would report a difference of nothing as infinitely
 * significant.
 */
test("two identical arms are not a discovery", () => {
  for (const [x, n] of [[0, 50], [50, 50], [10, 50]] as const) {
    const out = compareArms({ label: "a", trials: n, successes: x }, { label: "b", trials: n, successes: x });
    assert.equal(out.difference, 0);
    assert.equal(out.p, x === 0 || x === n ? 1 : out.p);
    assert.equal(out.significant, false, `${x} of ${n} in both arms was called significant`);
  }
});

test("a variant that is worse is not reported as a win", () => {
  const out = compareArms(
    { label: "control", trials: 2_000, successes: 760 },
    { label: "variant", trials: 2_000, successes: 600 },
  );
  assert.ok(out.difference < 0);
  assert.doesNotMatch(out.verdict, /ahead/);
});

/** The defaults are the convention, and a test that changes them should say so. */
test("the defaults are the ones everybody means", () => {
  assert.equal(ALPHA, 0.05);
  assert.equal(POWER, 0.8);
});
