import { test } from "node:test";
import assert from "node:assert/strict";
import { positionGuide, relevantInjuryProtocols, gamedayLabel } from "./essentials";

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
