import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConstraints, isExcluded, isEmpty , hasEquipmentFor } from "./constraints";
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
  assert.ok(c.excludeMovements.includes("running"));
  assert.ok(!c.excludeRegions.includes("legs"));
});

test("'no running' drops running, not every form of cardio", () => {
  // This banned the whole conditioning region, so someone asking for fitness
  // without running got no conditioning at all. Backwards: the person who
  // can't run is exactly who needs the bike and the rower.
  const c = parseConstraints("I want to get fit but no running");
  assert.ok(!c.excludeRegions.includes("conditioning"), "cardio as a category must survive");
  assert.ok(isExcluded(c, undefined, "Tempo runs"), "running work should go");
  for (const alt of ["Bike intervals", "Rowing intervals", "Skipping", "Incline treadmill walk"]) {
    assert.ok(!isExcluded(c, undefined, alt), `${alt} should remain as a substitute`);
  }
});

test("'no cardio' still bans the whole category", () => {
  // The category words mean what they say — only the movement words narrowed.
  const c = parseConstraints("no cardio");
  assert.ok(c.excludeRegions.includes("conditioning"));
  assert.ok(isExcluded(c, "conditioning", "Bike intervals"));
});

test("exclusions match across word endings", () => {
  // The note says "running", the drill is called "Tempo runs". A substring
  // test missed that and the instruction silently did nothing.
  const c = parseConstraints("no running");
  assert.ok(isExcluded(c, undefined, "Tempo runs"), "plural");
  assert.ok(isExcluded(c, undefined, "Easy run"), "singular");
  // "no squats" against a drill named with the singular, and the reverse.
  assert.ok(isExcluded(parseConstraints("no squats"), undefined, "Back squat"));
  assert.ok(isExcluded(parseConstraints("avoid deadlifting"), undefined, "Romanian deadlift"));
});

test("stem matching doesn't catch unrelated words", () => {
  const c = parseConstraints("no rowing");
  assert.ok(isExcluded(c, undefined, "Rowing intervals"));
  assert.ok(!isExcluded(c, undefined, "Throw down"), "'throw' is not 'row'");
  assert.ok(!isExcluded(c, undefined, "Crowd work"), "'crowd' is not 'row'");
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

// =============================================================================
// WHAT THEY HAVE TO TRAIN WITH.
//
// The engine anchors sessions on a barbell back squat, a barbell row and a
// bench press. Those are the right lifts, and useless to somebody training in a
// bedroom with two dumbbells — who had no way to say so, and would not have
// been heard if they did: "I only have dumbbells at home" was read for regions
// and movements and the rest thrown away.
// =============================================================================

test("naming what you have is read as a restriction, with no negation in it", () => {
  /**
   * Every other rule in this parser is gated behind a negation word, because
   * every other rule is a thing to leave out. This one is usually a thing to
   * KEEP — "I've only got dumbbells" contains no negation at all — so gating it
   * the same way would drop the phrasing most people use.
   */
  assert.deepEqual(parseConstraints("I only have dumbbells at home").equipment, ["Dumbbell", "Bodyweight"]);
  assert.deepEqual(parseConstraints("home gym, just dumbbells and a kettlebell").equipment,
    ["Dumbbell", "Kettlebell", "Bodyweight"]);
  assert.deepEqual(parseConstraints("bodyweight only").equipment, ["Bodyweight"]);
});

test("and naming what you lack works too", () => {
  const c = parseConstraints("no barbell, no machines");
  assert.ok(!c.equipment.includes("Barbell"));
  assert.ok(!c.equipment.includes("Machine"));
  assert.ok(c.equipment.includes("Dumbbell"));
});

test("plurals, because nobody writes \"I only have dumbbell\"", () => {
  // The first version closed each alternation with \b, so "dumbbells" failed to
  // match "dumbbell" — the single most likely sentence an athlete types parsed
  // to nothing at all.
  for (const s of ["only dumbbells", "only kettlebells", "no barbells", "no machines", "only cables"]) {
    assert.ok(parseConstraints(s).equipment.length > 0, `"${s}" parsed to no equipment`);
  }
});

test("saying nothing means no restriction, not no equipment", () => {
  assert.deepEqual(parseConstraints("").equipment, []);
  assert.deepEqual(parseConstraints("I don't train legs").equipment, []);
  // …and an empty list must not be read as "they have nothing".
  assert.equal(hasEquipmentFor(parseConstraints(""), "Barbell"), true);
});

test("bodyweight is always available", () => {
  // Push-ups need nothing, and there is no gym so poorly stocked that they are
  // unavailable.
  const c = parseConstraints("only dumbbells");
  assert.equal(hasEquipmentFor(c, "Bodyweight"), true);
  assert.equal(hasEquipmentFor(c, "Barbell"), false);
  assert.equal(hasEquipmentFor(c, "Dumbbell"), true);
});
