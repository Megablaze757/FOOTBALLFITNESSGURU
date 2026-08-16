// Run with: node --test  (after `tsc`/`ts-node`) — or use vitest in CI.
// Kept as plain node:test assertions against the pure scoring function.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assessReadiness, prettyBodyPart } from "./readiness";
import type { CheckInInput } from "./types";

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

// =============================================================================
// THE ADVICE HAS TO KNOW WHETHER THEY HAVE ALREADY TRAINED.
//
// Every line was written for the morning and shown all day: "train today, keep
// the intensity, hold the volume" to somebody who trained at seven and opened
// the app at nine. Home already knew — it ticks a daily quest with exactly this
// fact — and never passed it to the thing giving the advice.
// =============================================================================

const recovered = {
  pain_map: {}, fatigue_score: 2, sleep_quality: 9, nutrition_quality: 8,
  weight_kg: null, is_match_day: false, match_minutes_played: null,
} as unknown as CheckInInput;

test("it does not tell someone who has trained to go and train", () => {
  // 2.22 is the reported case: "you've trained 122% more this week than your
  // four-week average… Train today, keep the intensity" — shown to somebody who
  // had already trained.
  for (const acwr of [2.22, 1.4, null] as (number | null)[]) {
    const after = assessReadiness(recovered, { acwr, trainedToday: true });
    assert.ok(!/\btrain today\b/i.test(after.advice), `acwr ${acwr}: still prescribing a session — ${after.advice}`);
    assert.match(after.advice, /trained today|session logged/i, `acwr ${acwr}: ${after.advice}`);
  }

  // …and it still prescribes one when they have not trained.
  assert.match(assessReadiness(recovered, { acwr: 2.22, trainedToday: false }).advice, /train today/i);
});

test("having trained changes the advice, never the score", () => {
  // Readiness is a statement about the body. Doing a session does not make you
  // more or less recovered than the check-in said it did — it changes what
  // there is left to decide.
  const a = assessReadiness(recovered, { acwr: 1.1, trainedToday: true });
  const b = assessReadiness(recovered, { acwr: 1.1, trainedToday: false });
  assert.equal(a.score, b.score);
  assert.equal(a.status, b.status);
  assert.notEqual(a.advice, b.advice);
});

test("a Yellow day that has been trained talks about recovery, not intensity", () => {
  const tired = { ...recovered, fatigue_score: 8, sleep_quality: 5 } as CheckInInput;
  const after = assessReadiness(tired, { trainedToday: true });
  assert.equal(after.status, "Yellow");
  assert.ok(!/a moderate session is fine/i.test(after.advice), after.advice);
});

test("a Red day says the same thing either way", () => {
  // High pain and no sleep are the message whether or not they trained — that
  // they already did is not a reason to stop saying so.
  const hurt = { ...recovered, pain_map: { knee_left: 9 } } as CheckInInput;
  assert.equal(
    assessReadiness(hurt, { trainedToday: true }).advice,
    assessReadiness(hurt, { trainedToday: false }).advice,
  );
});
