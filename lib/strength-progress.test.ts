import test from "node:test";
import assert from "node:assert/strict";
import {
  liftProgress, muscleProgress, progressHeadline, BASELINE_DAYS, MIN_HISTORY_DAYS,
} from "./strength-progress";
import type { TrainingLog } from "./types";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);
const TODAY = day(200);

/** One log: a named lift at a load and rep count on day N. */
const log = (n: number, name: string, load_kg: number, reps = 5): TrainingLog =>
  ({ log_date: day(n), drills: [{ name, sets: 1, reps, load_kg }] }) as unknown as TrainingLog;

test("a lift's gain is measured from its opening month, not its first set", () => {
  // Day 0 is a light introduction; day 20 is a real effort in the same window.
  // Anchoring to day 0 would manufacture a percentage out of learning the lift.
  const logs = [log(0, "Back squat", 60), log(20, "Back squat", 100), log(180, "Back squat", 140)];
  const [g] = liftProgress(logs, TODAY);
  assert.equal(g.lift.key, "squat");
  assert.ok(g.baselineKg > 100 && g.baselineKg < 125, `baseline was ${g.baselineKg}, expected the 100kg effort`);
  assert.ok(g.pct > 25 && g.pct < 45, `gain read ${g.pct}%, which is not the 100→140 story`);
});

test("the baseline window really is the first four weeks", () => {
  const inside = [log(0, "Back squat", 80), log(BASELINE_DAYS - 1, "Back squat", 120), log(180, "Back squat", 150)];
  const outside = [log(0, "Back squat", 80), log(BASELINE_DAYS + 1, "Back squat", 120), log(180, "Back squat", 150)];
  const a = liftProgress(inside, TODAY)[0];
  const b = liftProgress(outside, TODAY)[0];
  assert.ok(b.baselineKg < a.baselineKg,
    "a heavy day just outside the window was counted in the baseline");
});

/**
 * THE FAILURE MODE THAT DECIDED THE DESIGN.
 *
 * "Best in the last 30 days vs the 30 before" reports a DECLINE for anybody who
 * did not go heavy this month — deloads, in-season blocks and tapers all read
 * as losing strength. An athlete told they are going backwards while peaking
 * correctly changes something that was working.
 */
test("a deload cannot report as losing strength", () => {
  const logs = [
    log(0, "Back squat", 100),
    log(90, "Back squat", 150),   // the peak
    log(185, "Back squat", 90),   // deload week, recent
    log(195, "Back squat", 95),
  ];
  const [g] = liftProgress(logs, TODAY);
  assert.equal(g.bestKg > g.baselineKg, true);
  assert.ok(g.pct > 0, `a deload turned into a ${g.pct}% change`);
  assert.match(String(g.bestDate), new RegExp(day(90)), "the peak is not what the gain is measured to");
});

test("percentages are never negative", () => {
  // Non-decreasing by construction: best-ever cannot fall below a fixed
  // baseline. Asserted rather than assumed, because it is the property the
  // whole "since you started" framing rests on.
  const logs = [log(0, "Back squat", 140), log(120, "Back squat", 60), log(190, "Back squat", 55)];
  for (const g of liftProgress(logs, TODAY)) assert.ok(g.pct >= 0, `${g.lift.key} reported ${g.pct}%`);
});

test("too little history reports nothing rather than a wild number", () => {
  // "+40% in your first fortnight" is a promise the next fortnight cannot keep.
  const recent = [log(195, "Back squat", 60), log(199, "Back squat", 100)];
  assert.deepEqual(liftProgress(recent, TODAY), []);
  // And the boundary is where it claims to be.
  const enough = [log(200 - MIN_HISTORY_DAYS, "Back squat", 60), log(199, "Back squat", 100)];
  assert.equal(liftProgress(enough, TODAY).length, 1);
});

test("a lift that has not moved is not reported as a gain", () => {
  const flat = [log(0, "Back squat", 100), log(180, "Back squat", 100)];
  assert.deepEqual(liftProgress(flat, TODAY), []);
});

test("each muscle shows the lift that actually moved it", () => {
  // The heaviest lift is often the one stuck longest; reporting its 3% beside a
  // squat that added 25% understates real work.
  const logs = [
    log(0, "Back squat", 100), log(180, "Back squat", 125),      // +25%
    log(0, "Front squat", 90), log(180, "Front squat", 93),      // +3%
  ];
  const [quads] = muscleProgress(logs, TODAY, ["quads"]);
  assert.equal(quads.gain?.lift.key, "squat");
  assert.ok(quads.gain!.pct > 20);
});

test("a muscle with no qualifying lift says so rather than showing zero", () => {
  const logs = [log(0, "Back squat", 100), log(180, "Back squat", 125)];
  const rows = muscleProgress(logs, TODAY, ["quads", "chest"]);
  assert.ok(rows.find((r) => r.muscle === "quads")?.gain, "quads should have a gain");
  assert.equal(rows.find((r) => r.muscle === "chest")?.gain, null,
    "chest reported a gain from a squat — absent is not zero");
});

test("the headline names the biggest mover", () => {
  const logs = [
    log(0, "Back squat", 100), log(180, "Back squat", 110),
    log(0, "Bench press", 60), log(180, "Bench press", 90),
  ];
  const rows = muscleProgress(logs, TODAY, ["quads", "chest"]);
  const line = progressHeadline(rows);
  assert.match(line ?? "", /chest/);
  assert.match(line ?? "", /bench press/i);
  assert.equal(progressHeadline([{ muscle: "quads", gain: null }]), null,
    "a headline was invented with nothing to report");
});

test("junk in the log does not become a percentage", () => {
  const junk = [
    { log_date: "", drills: [{ name: "Back squat", sets: 1, reps: 5, load_kg: 100 }] },
    { log_date: day(10), drills: null },
    { log_date: day(20), drills: [{ name: "Not a real lift", sets: 1, reps: 5, load_kg: 100 }] },
    { log_date: day(30), drills: [{ name: "Back squat", sets: 1, reps: 5, load_kg: 0 }] },
  ] as unknown as TrainingLog[];
  assert.deepEqual(liftProgress(junk, TODAY), []);
  assert.deepEqual(liftProgress(null, TODAY), []);
  assert.deepEqual(liftProgress([], TODAY), []);
});
