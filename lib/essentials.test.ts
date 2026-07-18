import { test } from "node:test";
import assert from "node:assert/strict";
import { positionGuide, relevantInjuryProtocols, gamedayLabel, RECOVERY_INJURY } from "./essentials";
import { getExercise } from "./exercises";

test("positionGuide returns position-specific guidance, with fallback", () => {
  const cb = positionGuide("football", "Centre back");
  assert.match(cb.summary, /air|duel/i);
  assert.ok(cb.keyDrills.includes("box_jumps"));

  const striker = positionGuide("football", "Striker");
  assert.ok(striker.keyDrills.includes("resisted_sprint"));

  // unknown position → sport fallback
  const fb = positionGuide("football", "Nonexistent");
  assert.ok(fb.keyDrills.length > 0);
  // no position → fallback too
  assert.ok(positionGuide("rugby", null).keyDrills.length > 0);
});

test("gameday label adapts to sport", () => {
  assert.equal(gamedayLabel("football"), "Matchday");
  assert.equal(gamedayLabel("running"), "Race day");
  assert.equal(gamedayLabel("gym"), "Big session day");
});

test("injury protocols surface for sore areas only", () => {
  const none = relevantInjuryProtocols({ knee_left: 2 });
  assert.equal(none.length, 0);

  const knee = relevantInjuryProtocols({ knee_left: 8 });
  assert.equal(knee.length, 1);
  assert.equal(knee[0].id, "knee");

  const both = relevantInjuryProtocols({ ankle: 6, hamstring_right: 5 });
  assert.deepEqual(both.map((p) => p.id).sort(), ["ankle", "hamstring"]);
});

test("every rehab protocol links only to real exercises", () => {
  for (const p of RECOVERY_INJURY) {
    for (const id of p.exerciseIds ?? []) {
      assert.ok(getExercise(id), `${p.id} references missing exercise "${id}"`);
    }
  }
});

test("every position guide links only to real exercises", () => {
  for (const sport of ["football", "rugby", "basketball", "running", "weightlifting", "gym"] as const) {
    const g = positionGuide(sport, null);
    for (const id of g.keyDrills) {
      assert.ok(getExercise(id), `${sport} guide references missing exercise "${id}"`);
    }
  }
});

test("staged protocols are well-formed", () => {
  const staged = RECOVERY_INJURY.filter((p) => p.stages);
  assert.ok(staged.length >= 8, "expected staged plans on the main injuries");
  for (const p of staged) {
    assert.ok(p.stages!.length >= 4, `${p.id} needs a full progression`);
    assert.ok(p.redFlags?.length, `${p.id} must carry red flags`);
    for (const s of p.stages!) assert.ok(s.criteria.length > 5, `${p.id} stage missing criteria`);
  }
});
