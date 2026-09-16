import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  armFor, assign, bucket, feasibility, hash32, readout, running,
  type Experiment,
} from "./experiment";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `user-${i}`);
const TWO = [{ label: "control" }, { label: "variant" }];

// ═══════════════════════════════════════════════════════════════════════════
// ASSIGNMENT: STABLE, EVEN, AND INDEPENDENT ACROSS EXPERIMENTS.
// ═══════════════════════════════════════════════════════════════════════════

test("the same person gets the same arm every time", () => {
  for (const id of ids(50)) {
    const first = assign("win-back-subject", id, TWO);
    for (let i = 0; i < 5; i++) assert.equal(assign("win-back-subject", id, TWO), first, id);
  }
});

test("the bucket is a number in [0, 1)", () => {
  for (const id of ids(500)) {
    const b = bucket("e", id);
    assert.ok(b >= 0 && b < 1, `${id} bucketed to ${b}`);
  }
});

test("an even split is even", () => {
  const counts = { control: 0, variant: 0 } as Record<string, number>;
  for (const id of ids(4_000)) counts[assign("split", id, TWO)] += 1;
  const skew = Math.abs(counts.control - counts.variant) / 4_000;
  assert.ok(skew < 0.05, `the split is ${counts.control}/${counts.variant}, skewed by ${(skew * 100).toFixed(1)}%`);
});

test("weights are honoured", () => {
  const arms = [{ label: "control", weight: 3 }, { label: "variant", weight: 1 }];
  let variant = 0;
  for (const id of ids(4_000)) if (assign("weighted", id, arms) === "variant") variant += 1;
  assert.ok(Math.abs(variant / 4_000 - 0.25) < 0.03, `variant got ${(variant / 40).toFixed(1)}%, wanted 25%`);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE EXPERIMENT ID IS INSIDE THE HASH, NOT A SALT ADDED AFTERWARDS.
 *
 * Without it, two experiments splitting on the same athlete id would correlate
 * perfectly: everybody in the control arm of the first would be in the control
 * arm of the second, and the second experiment would be measuring the first.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("being in the control arm of one experiment says nothing about the next", () => {
  let agree = 0;
  const people = ids(4_000);
  for (const id of people) {
    if (assign("first-test", id, TWO) === assign("second-test", id, TWO)) agree += 1;
  }
  const rate = agree / people.length;
  assert.ok(Math.abs(rate - 0.5) < 0.05,
    `the two experiments agree ${(rate * 100).toFixed(1)}% of the time — they are not independent`);
});

test("the hash spreads ids that differ by one character", () => {
  const seen = new Set(ids(1_000).map((id) => hash32(id)));
  assert.equal(seen.size, 1_000, "two ids collided out of a thousand");
});

test("an unusable input gets the control arm rather than throwing", () => {
  assert.equal(assign("", "user-1", TWO), "control");
  assert.equal(assign("e", "", TWO), "control");
  assert.equal(assign("e", "user-1", []), "");
  assert.equal(assign("e", "user-1", [{ label: "only" }]), "only");
});

test("an arm with no weight is not assigned anybody", () => {
  const arms = [{ label: "control" }, { label: "off", weight: 0 }];
  for (const id of ids(300)) assert.equal(assign("zeroed", id, arms), "control");
});

// ═══════════════════════════════════════════════════════════════════════════
// FEASIBILITY: THE PART THAT IS MEANT TO SAY NO.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The state this project is actually in. 22 accounts, split in half, asked to
 * settle a five-point change — the answer has to be an unambiguous no.
 */
test("twenty-two accounts cannot settle a five-point change", () => {
  const able = feasibility({ population: 22, baseline: 0.3, lift: 0.05 });
  assert.equal(able.worthRunning, false);
  assert.equal(able.have, 11);
  assert.ok(able.needed > 1_000, `it claims ${able.needed} per arm is enough`);
  assert.ok(able.smallestVisible > 0.4);
  assert.match(able.verdict, /cannot settle/);
  assert.match(able.verdict, /not a change anybody would need a test to notice/);
});

test("a real sample is allowed to be enough", () => {
  const able = feasibility({ population: 6_000, baseline: 0.3, lift: 0.05 });
  assert.equal(able.worthRunning, true);
  assert.match(able.verdict, /is enough/);
});

test("more arms means fewer people in each", () => {
  const two = feasibility({ population: 900, baseline: 0.3, lift: 0.1, arms: 2 });
  const three = feasibility({ population: 900, baseline: 0.3, lift: 0.1, arms: 3 });
  assert.equal(two.have, 450);
  assert.equal(three.have, 300);
  assert.ok(three.smallestVisible > two.smallestVisible);
});

test("nobody at all is not a runnable test", () => {
  const able = feasibility({ population: 0, baseline: 0.3, lift: 0.05 });
  assert.equal(able.have, 0);
  assert.equal(able.worthRunning, false);
});

// ═══════════════════════════════════════════════════════════════════════════
// DATES: AN EXPERIMENT LEFT IN THE CODE MUST DECAY TO NOTHING HAPPENING.
// ═══════════════════════════════════════════════════════════════════════════

const TEST: Experiment = {
  id: "win-back-subject",
  question: "Does naming their own best lift in the subject line bring more lapsed athletes back?",
  worthShipping: 0.05,
  baseline: 0.1,
  arms: TWO,
  from: "2026-09-01",
  until: "2026-10-01",
};

test("an experiment runs between its dates and not outside them", () => {
  assert.equal(running(TEST, "2026-08-31"), false);
  assert.equal(running(TEST, "2026-09-01"), true, "the first day is part of the run");
  assert.equal(running(TEST, "2026-09-20"), true);
  assert.equal(running(TEST, "2026-10-01"), true, "the last day is part of the run");
  assert.equal(running(TEST, "2026-10-02"), false);
});

/**
 * An experiment nobody removed must not leave half the athletes on a variant
 * that was never decided on.
 */
test("after it ends, everybody is back on the control", () => {
  const after = ids(200).map((id) => armFor(TEST, id, "2026-12-01"));
  assert.deepEqual([...new Set(after)], ["control"]);

  const during = new Set(ids(200).map((id) => armFor(TEST, id, "2026-09-15")));
  assert.equal(during.size, 2, "nobody was assigned a variant while it was running");
});

test("an experiment with no dates is not running", () => {
  assert.equal(running({ ...TEST, from: "", until: "" }, "2026-09-15"), false);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE READOUT, WHOSE PRODUCT IS A DECISION.
// ═══════════════════════════════════════════════════════════════════════════

test("a real, big enough win says ship it", () => {
  const out = readout(TEST,
    { label: "control", trials: 3_000, successes: 300 },
    { label: "variant", trials: 3_000, successes: 600 });
  assert.match(out.decision, /^Ship variant\./);
});

/**
 * THE CASE EVERYBODY GETS WRONG. Statistically real, and smaller than the lift
 * written down in advance as the reason for doing it. The fork in the code
 * costs more than the two points are worth.
 */
test("a real win that is too small to matter says drop it anyway", () => {
  const out = readout(TEST,
    { label: "control", trials: 40_000, successes: 4_000 },
    { label: "variant", trials: 40_000, successes: 4_240 });
  assert.equal(out.comparison.significant, true, `p=${out.comparison.p}`);
  assert.match(out.decision, /under the 5\.0 points decided in advance/);
  assert.match(out.decision, /Drop it/);
});

test("a variant that loses is dropped, and named as losing", () => {
  const out = readout(TEST,
    { label: "control", trials: 3_000, successes: 600 },
    { label: "variant", trials: 3_000, successes: 300 });
  assert.match(out.decision, /Drop variant: it is worse/);
});

/** A null with a tight interval is a real answer: nothing here is worth having. */
test("a well-powered null drops the variant for the right reason", () => {
  const out = readout(TEST,
    { label: "control", trials: 20_000, successes: 2_000 },
    { label: "variant", trials: 20_000, successes: 2_020 });
  assert.equal(out.comparison.significant, false);
  assert.match(out.decision, /Not because it lost/);
});

/**
 * And the one this project would actually get: eleven people per arm, a gap
 * you can see with the naked eye, and an instrument that could never have
 * measured it.
 */
test("a test that was never going to settle is told to stop", () => {
  const out = readout(TEST,
    { label: "control", trials: 11, successes: 1 },
    { label: "variant", trials: 11, successes: 3 });
  assert.match(out.decision, /^Stop\./);
  assert.match(out.decision, /cannot settle/);
  assert.equal(out.feasibility.worthRunning, false);
});

test("a test with enough people and no answer yet is left running", () => {
  // 700 per arm clears the 686 this lift needs, and 10% against 12% leaves an
  // interval whose top end is still above the five points worth shipping for.
  const out = readout(TEST,
    { label: "control", trials: 700, successes: 70 },
    { label: "variant", trials: 700, successes: 84 });
  assert.equal(out.comparison.significant, false, `p=${out.comparison.p}`);
  assert.equal(out.feasibility.worthRunning, true);
  assert.match(out.decision, /Keep it running/);
});

/** The threshold has to be decided before the data, or every result means something. */
test("the shipping threshold is the experiment's, not a default", () => {
  const fussy = { ...TEST, worthShipping: 0.2 };
  const out = readout(fussy,
    { label: "control", trials: 40_000, successes: 4_000 },
    { label: "variant", trials: 40_000, successes: 4_600 });
  assert.equal(out.comparison.significant, true);
  assert.match(out.decision, /under the 20\.0 points decided in advance/);
});

/**
 * THE INPUT THIS WILL ACTUALLY SEE. A Supabase id is a random UUID, and the
 * splitter being even on `user-0`…`user-n` says nothing about whether it is
 * even on those. Before the avalanche step was added it was 9.3 points out on
 * sequential ids — a real effect present in the arms before anybody changed
 * anything.
 */
test("real UUIDs split evenly", () => {
  const uuids = Array.from({ length: 20_000 }, () => randomUUID());
  let control = 0;
  for (const id of uuids) if (assign("live", id, TWO) === "control") control += 1;
  const off = Math.abs(control - uuids.length / 2) / Math.sqrt(uuids.length * 0.25);
  assert.ok(off < 4, `the split is ${off.toFixed(1)} standard deviations out — that is bias, not luck`);
});
