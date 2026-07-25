import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseChallenge, parseChallenges, localChallenges, evaluateChallenge,
  evaluateChallenges, challengeXp, clampTarget, CHALLENGE_METRICS, EMPTY_WEEK,
  type Challenge,
} from "./challenges";
import { EMPTY_STATS } from "./gamification";

const week = (over: Partial<typeof EMPTY_WEEK> = {}) => ({ ...EMPTY_WEEK, ...over });

// --- the constraint this whole module exists for -----------------------------

test("a challenge with an unmeasurable metric is rejected", () => {
  // "Eat clean for a week" is exactly what must not get through: nothing in the
  // app can decide whether it happened, so the badge could never unlock.
  assert.equal(parseChallenge({ title: "Eat clean for a week", metric: "eat_clean", target: 7 }, 0), null);
  assert.equal(parseChallenge({ title: "Feel great", metric: "vibes", target: 1 }, 0), null);
  assert.equal(parseChallenge({ title: "No metric at all", target: 3 }, 0), null);
});

test("a challenge with no title is rejected", () => {
  assert.equal(parseChallenge({ title: "  ", metric: "check_ins", target: 5 }, 0), null);
});

test("every accepted challenge can actually be evaluated", () => {
  const c = parseChallenge({ title: "Fuel up", metric: "nutrition_logs", target: 5, icon: "🍽️" }, 0);
  assert.ok(c);
  assert.ok(CHALLENGE_METRICS.includes(c.metric));
  const p = evaluateChallenge(c, week({ nutrition_logs: 5 }));
  assert.equal(p.complete, true);
});

// --- targets -----------------------------------------------------------------

test("impossible targets are clamped to a real week", () => {
  assert.equal(clampTarget("check_ins", 99), 7);
  assert.equal(clampTarget("training_sessions", 40), 6);
  assert.equal(clampTarget("check_ins", 0), 1);
  assert.equal(clampTarget("check_ins", -5), 1);
});

test("a garbage target becomes a usable one rather than NaN", () => {
  const c = parseChallenge({ title: "T", metric: "check_ins", target: "lots" }, 0);
  assert.ok(c);
  assert.ok(Number.isInteger(c.target) && c.target >= 1);
});

test("harder challenges are worth more XP", () => {
  const easy = parseChallenge({ title: "a", metric: "check_ins", target: 2 }, 0);
  const hard = parseChallenge({ title: "b", metric: "check_ins", target: 6 }, 1);
  assert.ok(hard.xp > easy.xp);
});

// --- lists -------------------------------------------------------------------

test("bad entries are dropped, good ones kept", () => {
  const out = parseChallenges([
    { title: "Eat clean", metric: "vibes", target: 7 },
    { title: "Log your food", metric: "nutrition_logs", target: 5 },
    { title: "Check in daily", metric: "check_ins", target: 6 },
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((c) => c.metric), ["nutrition_logs", "check_ins"]);
});

test("three challenges on one metric is one challenge with three names", () => {
  const out = parseChallenges([
    { title: "A", metric: "check_ins", target: 3 },
    { title: "B", metric: "check_ins", target: 5 },
    { title: "C", metric: "check_ins", target: 7 },
  ]);
  assert.equal(out.length, 1);
});

test("never more than three, and never throws on rubbish", () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ title: `T${i}`, metric: CHALLENGE_METRICS[i % 7], target: 3 }));
  assert.ok(parseChallenges(many).length <= 3);
  assert.deepEqual(parseChallenges(null), []);
  assert.deepEqual(parseChallenges("nonsense"), []);
  assert.deepEqual(parseChallenges([null, undefined, 42]), []);
});

// --- the local generator -----------------------------------------------------

test("there are always challenges, even with no history", () => {
  const out = localChallenges(EMPTY_STATS, EMPTY_WEEK);
  assert.equal(out.length, 3);
  for (const c of out) assert.ok(CHALLENGE_METRICS.includes(c.metric));
});

test("challenges aim at what's being neglected", () => {
  // Trains plenty, never logs food -> should be told to log food.
  const out = localChallenges({ ...EMPTY_STATS, trainingSessions: 40 }, week({ training_sessions: 5, nutrition_logs: 0 }));
  assert.ok(out.some((c) => c.metric === "nutrition_logs"), out.map((c) => c.metric).join(", "));
});

test("it doesn't nag about things already done", () => {
  const out = localChallenges(
    { ...EMPTY_STATS, videos: 5, benchmarks: 5 },
    week({ nutrition_logs: 7, check_ins: 7, training_sessions: 5 })
  );
  assert.ok(!out.some((c) => c.metric === "videos"), "already analysing clips");
  assert.ok(!out.some((c) => c.metric === "benchmarks"), "already benchmarking");
});

test("the same week produces the same challenges", () => {
  const a = localChallenges(EMPTY_STATS, week({ check_ins: 2 }));
  const b = localChallenges(EMPTY_STATS, week({ check_ins: 2 }));
  assert.deepEqual(a, b, "challenges must not reshuffle on every page load");
});

test("no duplicate metrics from the local generator", () => {
  const out = localChallenges(EMPTY_STATS, EMPTY_WEEK);
  assert.equal(new Set(out.map((c) => c.metric)).size, out.length);
});

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
