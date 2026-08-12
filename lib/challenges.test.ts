import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateChallenge, evaluateChallenges, challengeXp, clampTarget, xpFor,
  CHALLENGE_METRICS, EMPTY_WEEK, type Challenge, type ChallengeMetric,
} from "./challenges";

const week = (over: Partial<typeof EMPTY_WEEK> = {}) => ({ ...EMPTY_WEEK, ...over });

// --- evaluation --------------------------------------------------------------

const c = (metric: Challenge["metric"], target: number): Challenge =>
  ({ id: "x", title: "t", blurb: "b", icon: "🎯", metric, target, xp: 50 });

test("progress is reported as a percentage and caps at 100", () => {
  assert.equal(evaluateChallenge(c("check_ins", 4), week({ check_ins: 1 })).pct, 25);
  assert.equal(evaluateChallenge(c("check_ins", 4), week({ check_ins: 9 })).pct, 100);
  assert.equal(evaluateChallenge(c("check_ins", 4), week({ check_ins: 9 })).complete, true);
});

test("nothing done is zero, not NaN", () => {
  const p = evaluateChallenge(c("videos", 2), EMPTY_WEEK);
  assert.equal(p.current, 0);
  assert.equal(p.pct, 0);
  assert.equal(p.complete, false);
});

test("XP is only awarded for completed challenges", () => {
  const list = [c("check_ins", 3), c("videos", 1)];
  assert.equal(challengeXp(list, week({ check_ins: 3 })), 50);
  assert.equal(challengeXp(list, week({ check_ins: 3, videos: 1 })), 100);
  assert.equal(challengeXp(list, EMPTY_WEEK), 0);
});

test("evaluating a list keeps the order", () => {
  const list = [c("check_ins", 3), c("videos", 1)];
  assert.deepEqual(evaluateChallenges(list, EMPTY_WEEK).map((p) => p.challenge.metric), ["check_ins", "videos"]);
});

// --- targets and pricing -----------------------------------------------------

test("impossible targets are clamped to a real week", () => {
  assert.equal(clampTarget("check_ins", 99), 7);
  assert.equal(clampTarget("training_sessions", 40), 6);
  assert.equal(clampTarget("check_ins", 0), 1);
  assert.equal(clampTarget("check_ins", -5), 1);
  assert.equal(clampTarget("rest_days", 7), 4, "a week does not hold 7 rest days and 7 sessions");
});

test("harder challenges are worth more XP", () => {
  assert.ok(xpFor("check_ins", 6) > xpFor("check_ins", 2));
  for (const m of CHALLENGE_METRICS) assert.ok(xpFor(m, 1) > 0, `${m} pays nothing`);
});

/**
 * THE VOCABULARY RULE, as a test. A metric is only allowed here if it can be
 * counted OVER THE WINDOW — `program_sessions` was removed because
 * programs.completed_sessions carries no timestamps, so the only number
 * available was the lifetime total, which read as complete on day one forever.
 * Every metric must be a real field on WeekActivity or the evaluator reads
 * undefined, scores 0, and the challenge can never be finished.
 */
test("every metric in the vocabulary is a field the week actually carries", () => {
  for (const m of CHALLENGE_METRICS) {
    assert.ok(m in EMPTY_WEEK, `"${m}" is in the vocabulary but not on WeekActivity`);
    assert.equal(typeof EMPTY_WEEK[m], "number", `"${m}" is not a number`);
  }
  // And nothing on WeekActivity is missing from the vocabulary, which would be
  // a counter nobody can ever write a challenge against.
  for (const k of Object.keys(EMPTY_WEEK)) {
    assert.ok(CHALLENGE_METRICS.includes(k as ChallengeMetric), `"${k}" is counted but unusable`);
  }
});

test("a metric that cannot be counted over a week is not in the vocabulary", () => {
  assert.ok(!CHALLENGE_METRICS.includes("program_sessions" as ChallengeMetric),
    "program_sessions is back, and only a lifetime total exists to feed it");
});
