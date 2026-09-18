import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CUT_FLOOR_PER_S, CUT_TARGET_PER_S, cutPlan, cutReport, cutsAllowed,
} from "./reel-cuts";
import { SCRIPTS, reelScript } from "./reel-script";
import { reelPlan } from "./reel-plan";
import type { PlanStep, ReelPlan } from "./reel-plan";

const step = (over: Partial<PlanStep> = {}): PlanStep => ({
  index: 0, at: 0, ms: 4_000, route: "/home", action: "look", captions: [],
  clips: [{ atMs: 400, ms: 900 }, { atMs: 1_500, ms: 900 }, { atMs: 2_600, ms: 900 }],
  ...over,
});

const plan = (steps: PlanStep[]): ReelPlan => ({
  id: "t", hook: "h", hookMs: 1_000, width: 540, height: 960, scale: 2,
  steps, totalMs: steps.reduce((t, s) => t + s.ms, 0),
});

// ═══════════════════════════════════════════════════════════════════════════
// WHERE A CUT MAY GO. BOTH EXCLUSIONS ARE BUGS THIS PROJECT ALREADY HAD.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The spotlight is position:fixed and aimed once. The drift already scrolled
 * the page out from under it once, and the recorded symptom was a gold ring
 * "correctly drawn, around 'Turkey breast mince £1.06' while the caption said
 * 'Cheapest: £0.31'". A snap does that instantly rather than gradually.
 */
test("a beat that aims a spotlight is left alone", () => {
  assert.match(cutsAllowed(step({ focus: "Cheapest" }), false)!, /spotlight/);
  assert.equal(cutsAllowed(step(), false), null);
});

/** The last shot has to match the first, which is the whole loop argument. */
test("the closing beat is left alone even without a spotlight", () => {
  assert.match(cutsAllowed(step(), true)!, /loop/);
});

test("closing wins over aiming, so the reason given is the outer one", () => {
  assert.match(cutsAllowed(step({ focus: "x" }), true)!, /loop/);
});

// ═══════════════════════════════════════════════════════════════════════════
// COUNTING.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The first phrase of a beat opens it, and a beat that changed route has just
 * replaced the whole screen. A cut on top of that is a shot nobody sees.
 */
test("the first phrase of a beat is not a cut", () => {
  const out = cutPlan(plan([step({ index: 0 }), step({ index: 1, ms: 4_000, at: 4_000 })]));
  for (const point of out.points) {
    assert.ok(point.phrase >= 1, "a cut was placed on the phrase that opens a beat");
  }
});

test("a navigation counts as a cut, because the screen is replaced", () => {
  const one = cutPlan(plan([step({ route: "/a", clips: [] })]));
  assert.equal(one.cuts, 1, "the navigation that starts the reel was not counted");

  const two = cutPlan(plan([
    step({ index: 0, route: "/a", clips: [] }),
    step({ index: 1, route: "/b", clips: [], at: 4_000 }),
  ]));
  assert.equal(two.cuts, 2);
});

test("three beats on one screen navigate once, not three times", () => {
  const out = cutPlan(plan([
    step({ index: 0, route: "/a", clips: [] }),
    step({ index: 1, route: "/a", clips: [], at: 4_000 }),
    step({ index: 2, route: "/a", clips: [], at: 8_000 }),
  ]));
  assert.equal(out.cuts, 1, "staying on one screen was counted as a new shot each beat");
});

test("cut times are absolute, not beat-relative", () => {
  /**
   * THREE BEATS, because the last one is always excluded as the closing beat.
   * The first draft of this used two and failed on its own setup — the beat it
   * was asserting about was the one that glides back for the loop.
   */
  const out = cutPlan(plan([
    step({ index: 0, at: 0 }),
    step({ index: 1, at: 4_000 }),
    step({ index: 2, at: 8_000 }),
  ]));
  const second = out.points.filter((p) => p.beat === 1);
  assert.ok(second.length > 0, "the middle beat produced no cuts");
  assert.ok(second.every((p) => p.at >= 4_000),
    "a cut in the second beat was timed from the start of that beat");
  assert.deepEqual(second.map((p) => p.at), [5_500, 6_600],
    "the cut times are not the beat's own start plus each phrase onset");
});

test("a beat with no narration contributes no cuts", () => {
  const out = cutPlan(plan([step({ clips: [] })]));
  assert.equal(out.points.length, 0);
});

test("an empty plan is zero rather than a division by zero", () => {
  const out = cutPlan(plan([]));
  assert.equal(out.cuts, 0);
  assert.equal(out.perSecond, 0);
  assert.equal(out.reachesFloor, false);
});

test("the floor sits below the target", () => {
  assert.ok(CUT_FLOOR_PER_S < CUT_TARGET_PER_S, "the floor is at or above the target");
});

// ═══════════════════════════════════════════════════════════════════════════
// AND THE FINDING THIS MODULE EXISTS TO RECORD.
//
// The cheap fix for zero cuts is "cut on every phrase boundary". Run over the
// real scripts it produces 0.14 to 0.18 cuts a second, against the 1.94
// measured on the reel being compared against. An order of magnitude short.
//
// The reason is structural rather than a parameter: almost every beat in every
// script aims a spotlight, a spotlight may not move, so almost every beat is
// excluded. What is left is the navigations, which the reels already had.
//
// Pinned here so the idea is not proposed again without meeting the number.
// ═══════════════════════════════════════════════════════════════════════════

const REAL = SCRIPTS.map((s) => reelPlan(reelScript(s.id as never) as never));

test("a cut per phrase boundary does not come close to the measured rate", () => {
  for (const p of REAL) {
    const out = cutPlan(p);
    assert.ok(out.cuts > 0, `${p.id} produced no cuts at all, not even a navigation`);
    assert.ok(!out.reachesTarget,
      `${p.id} now reaches ${CUT_TARGET_PER_S}/s at ${out.perSecond.toFixed(2)} — `
      + "if the scripts changed shape this finding is stale and worth re-reading");
    assert.ok(out.perSecond < CUT_FLOOR_PER_S,
      `${p.id} is at ${out.perSecond.toFixed(2)}/s, clear of the floor — the finding has changed`);
  }
});

/**
 * WHY it falls short matters more than that it does. If the scripts stopped
 * aiming spotlights the arithmetic would change completely, and this test is
 * what would notice.
 */
test("it falls short because nearly every beat aims a spotlight", () => {
  let aiming = 0;
  let beats = 0;
  for (const p of REAL) {
    beats += p.steps.length;
    aiming += cutPlan(p).skipped.filter((s) => /spotlight/.test(s.why)).length;
  }
  assert.ok(aiming / beats > 0.3,
    `only ${aiming} of ${beats} beats aim a spotlight — the reason given for falling short is wrong now`);
});

test("the report says what it would take and what the reels measure today", () => {
  const lines = cutReport(REAL);
  assert.match(lines.join("\n"), /0\.00\/s/, "the report no longer says what the reels measure today");
  assert.ok(lines.some((l) => /screen recording/.test(l)), "the verdict is missing");
  assert.ok(lines.some((l) => /left alone/.test(l)), "the report does not say which beats are excluded");
});

/**
 * NOTHING READS THIS YET, AND THAT IS DELIBERATE — but it is the exact shape
 * of DATA_ROUTE_PAINT_MS, so it is stated rather than left to be discovered.
 * If the recorder ever does use it, this test is the thing that should change.
 */
test("the recorder does not act on this, by design", async () => {
  const { readFileSync } = await import("node:fs");
  const recorder = readFileSync("scripts/record-reel.mts", "utf8");
  assert.doesNotMatch(recorder, /reel-cuts/,
    "the recorder now reads this module — the arithmetic here has not been verified "
    + "against a recording, so a change that acts on it needs one");
});
