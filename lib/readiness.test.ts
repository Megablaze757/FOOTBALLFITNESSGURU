// Run with: node --test  (after `tsc`/`ts-node`) — or use vitest in CI.
// Kept as plain node:test assertions against the pure scoring function.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assessReadiness, prettyBodyPart } from "./readiness";

const base = {
  pain_map: {},
  fatigue_score: 3,
  sleep_quality: 8,
  nutrition_quality: 8,
  weight_kg: null,
  is_match_day: false,
  match_minutes_played: 0,
};

test("well-rested athlete is Green", () => {
  const r = assessReadiness(base);
  assert.equal(r.status, "Green");
  assert.ok(r.score >= 70);
  assert.equal(r.focus_body_part, null);
});

test("high joint pain forces Red and names the body part", () => {
  const r = assessReadiness({ ...base, pain_map: { knee_left: 8 } });
  assert.equal(r.status, "Red");
  assert.equal(r.focus_body_part, "left knee");
  assert.match(r.advice, /left knee/i);
});

test("very poor sleep forces Red regardless of score", () => {
  const r = assessReadiness({ ...base, sleep_quality: 2 });
  assert.equal(r.status, "Red");
});

test("middling inputs land in Yellow", () => {
  const r = assessReadiness({
    ...base,
    fatigue_score: 7,
    sleep_quality: 5,
    nutrition_quality: 5,
    pain_map: { ankle_right: 4 },
  });
  assert.equal(r.status, "Yellow");
});

test("prettyBodyPart formats sided joints", () => {
  assert.equal(prettyBodyPart("hamstring_right"), "right hamstring");
  assert.equal(prettyBodyPart("lower_back"), "lower back");
  assert.equal(prettyBodyPart(null), null);
});

// --- training load in the verdict -------------------------------------------
// The app used to say "ready to train" on Home while the load panel was red,
// because readiness scored only how you FEEL. These pin the reconciliation.

test("a load spike caps a Green day at Yellow", () => {
  const green = assessReadiness(base);
  assert.equal(green.status, "Green");

  const spiked = assessReadiness(base, { acwr: 1.8 });
  assert.equal(spiked.status, "Yellow", "feeling fine on an 80% load jump is exactly what ACWR is for");
  assert.equal(spiked.score, green.score, "the spike changes the verdict, not how recovered they are");
});

test("the spike advice says what happened and what to do", () => {
  const r = assessReadiness(base, { acwr: 1.6 });
  assert.match(r.advice, /60%/, "states the jump as a percentage, not a bare ratio");
  assert.match(r.advice, /volume/i, "tells them what to hold back");
});

test("load never rescues a Red day", () => {
  const r = assessReadiness({ ...base, pain_map: { knee_left: 8 } }, { acwr: 0.5 });
  assert.equal(r.status, "Red", "a low ratio must not talk an injured athlete into training");
});

test("load in the sweet spot leaves the verdict alone", () => {
  const plain = assessReadiness(base);
  const withLoad = assessReadiness(base, { acwr: 1.0 });
  assert.equal(withLoad.status, plain.status);
  assert.equal(withLoad.advice, plain.advice);
});

test("climbing load is mentioned without downgrading the day", () => {
  const r = assessReadiness(base, { acwr: 1.4 });
  assert.equal(r.status, "Green");
  assert.match(r.advice, /climbing/i);
});

test("no load data behaves exactly as before", () => {
  assert.deepEqual(assessReadiness(base, { acwr: null }), assessReadiness(base));
  assert.deepEqual(assessReadiness(base, {}), assessReadiness(base));
});
