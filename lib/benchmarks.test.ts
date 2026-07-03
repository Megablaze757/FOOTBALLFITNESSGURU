import { test } from "node:test";
import assert from "node:assert/strict";
import { benchmarkProgress, improvementDelta } from "./benchmarks";

test("higher-is-better metric: squat 100 -> target 140, at 120 is 50%", () => {
  const p = benchmarkProgress("squat_1rm", 100, 140, 120);
  assert.equal(p.pct, 50);
  assert.equal(p.achieved, false);
});

test("lower-is-better metric: sprint 1.80 -> 1.60, at 1.70 is 50%", () => {
  const p = benchmarkProgress("sprint_10m", 1.8, 1.6, 1.7);
  assert.equal(p.pct, 50);
  assert.equal(p.achieved, false);
});

test("hitting (or beating) a lower-is-better target reads as achieved/100%", () => {
  const p = benchmarkProgress("sprint_10m", 1.8, 1.6, 1.58);
  assert.equal(p.achieved, true);
  assert.equal(p.pct, 100);
});

test("improvementDelta flips sign for time metrics", () => {
  assert.ok(Math.abs(improvementDelta("sprint_10m", 1.7, 1.8) - 0.1) < 1e-9); // faster = positive
  assert.equal(improvementDelta("squat_1rm", 110, 100), 10);
});
