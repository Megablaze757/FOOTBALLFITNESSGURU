import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConstraints, isExcluded, isEmpty } from "./constraints";
import { buildProgram } from "./coach";

test("picks up a plain refusal", () => {
  const c = parseConstraints("I don't train legs");
  assert.deepEqual(c.excludeRegions, ["legs"]);
  assert.ok(c.summary[0].includes("legs"));
});

test("handles the phrasings people actually type", () => {
  for (const note of ["no legs", "No leg day please", "avoid legs", "I can't train legs", "skip legs"]) {
    assert.ok(parseConstraints(note).excludeRegions.includes("legs"), note);
  }
});

test("a bare mention is not an exclusion", () => {
  // "I want to train legs harder" must not strip out leg work.
  assert.ok(isEmpty(parseConstraints("I want to train legs harder")));
  assert.ok(isEmpty(parseConstraints("focus on chest and back")));
  assert.ok(isEmpty(parseConstraints("")));
  assert.ok(isEmpty(parseConstraints(null)));
});

test("clauses are judged separately", () => {
  // The exclusion attaches to running, not to legs.
  const c = parseConstraints("I train legs but no running");
  assert.ok(c.excludeRegions.includes("conditioning"));
  assert.ok(!c.excludeRegions.includes("legs"));
});

test("catches several exclusions at once", () => {
  const c = parseConstraints("no cardio, and I don't do jumping");
  assert.ok(c.excludeRegions.includes("conditioning"));
  assert.ok(c.excludeRegions.includes("impact"));
});

test("named movements are excluded too", () => {
  const c = parseConstraints("avoid deadlifts");
  assert.ok(c.excludeMovements.includes("deadlift"));
  assert.ok(isExcluded(c, undefined, "Conventional deadlift"));
});

test("isExcluded matches on region and on name", () => {
  const c = parseConstraints("no legs");
  assert.equal(isExcluded(c, "legs", "Barbell back squat"), true);
  assert.equal(isExcluded(c, "chest", "Barbell bench press"), false);
});

// --- the regression this whole file exists for -------------------------------

test("a no-legs program contains no leg work", () => {
  const plan = buildProgram({
    goal: "strength",
    painMap: {},
    sport: "gym",
    focus: "aesthetics",
    daysPerWeek: 3,
    notes: "I don't train legs",
  });
  const names = plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.drills.map((d) => d.name.toLowerCase())));
  assert.ok(names.length > 0, "program should still have drills");
  for (const banned of ["squat", "deadlift", "lunge", "calf", "hip thrust", "rdl"]) {
    assert.ok(!names.some((n) => n.includes(banned)), `found "${banned}" in a no-legs program`);
  }
});

test("the exclusion is shown back to the athlete", () => {
  const plan = buildProgram({ goal: "strength", painMap: {}, sport: "gym", notes: "no legs" });
  assert.ok(plan.constraints.some((c) => c.toLowerCase().includes("legs")));
});

test("every session still has drills under heavy exclusions", () => {
  const plan = buildProgram({
    goal: "speed",
    painMap: {},
    sport: "football",
    daysPerWeek: 4,
    notes: "no legs, no running, no jumping",
  });
  for (const w of plan.weeks) {
    for (const s of w.sessions) {
      assert.ok(s.drills.length > 0, `week ${w.week} day ${s.day} came out empty`);
    }
  }
});

test("no notes behaves exactly as before", () => {
  const withNull = buildProgram({ goal: "strength", painMap: {}, sport: "gym", notes: null });
  const without = buildProgram({ goal: "strength", painMap: {}, sport: "gym" });
  assert.deepEqual(withNull, without);
});
