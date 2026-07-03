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
