import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { benchmarkProgress, improvementDelta, latestMetrics } from "./benchmarks";

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

// --- which number is current --------------------------------------------------


/**
 * "My stats don't change."
 *
 * THE LATEST ROW IS NOT THE LATEST NUMBER. The benchmark form saves what you
 * typed and nothing more — "enter at least one metric" — so a row is a TEST,
 * not a profile: a squat on Monday, a 5k on Saturday, two rows with one number
 * each. Anything reading `.limit(1)` sees Saturday and reports a lifter who has
 * never squatted, or a runner with no run time.
 */

test("a metric survives a later test that did not measure it", () => {
  const current = latestMetrics([
    { test_date: "2026-08-15", metrics: { run_5k_min: 22.5 } },
    { test_date: "2026-08-01", metrics: { squat_1rm: 140, bench_1rm: 100 } },
  ]);
  assert.equal(current.squat_1rm, 140, "the squat vanished because a later test measured something else");
  assert.equal(current.run_5k_min, 22.5);
  assert.equal(current.bench_1rm, 100);
});

test("newest wins, and newest means newest — not biggest", () => {
  // This answers "where are you now", which is what a working weight and a pace
  // band need. Best-ever is a different question, and rankedLifts answers it:
  // a rank must never fall for one bad day, while a prescription must follow it
  // or it hands you a lift you cannot make.
  const current = latestMetrics([
    { test_date: "2026-08-15", metrics: { squat_1rm: 130 } },
    { test_date: "2026-06-01", metrics: { squat_1rm: 150 } },
  ]);
  assert.equal(current.squat_1rm, 130);
});

test("rows arrive in any order and the newest still wins", () => {
  const current = latestMetrics([
    { test_date: "2026-06-01", metrics: { squat_1rm: 150 } },
    { test_date: "2026-08-15", metrics: { squat_1rm: 130 } },
    { test_date: "2026-07-01", metrics: { squat_1rm: 140 } },
  ]);
  assert.equal(current.squat_1rm, 130);
});

test("two tests on one day are separated by when they were saved", () => {
  // A date cannot order two rows saved an hour apart, and the row order out of
  // PostgREST is not a promise.
  const current = latestMetrics([
    { test_date: "2026-08-15", created_at: "2026-08-15T09:00:00Z", metrics: { squat_1rm: 130 } },
    { test_date: "2026-08-15", created_at: "2026-08-15T18:00:00Z", metrics: { squat_1rm: 135 } },
  ]);
  assert.equal(current.squat_1rm, 135, "the earlier save won");
});

test("a metric that is not a number is absent, not zero", () => {
  // Writing 0 here prescribes a zero-kilo working weight and ranks the lift as
  // untrained — absent is not zero.
  const current = latestMetrics([
    { test_date: "2026-08-15", metrics: { squat_1rm: null, bench_1rm: "abc", deadlift_1rm: "180" } },
    { test_date: "2026-08-01", metrics: { squat_1rm: 140 } },
  ]);
  assert.equal(current.squat_1rm, 140);
  assert.equal("bench_1rm" in current, false);
  assert.equal(current.deadlift_1rm, 180, "a number stored as text is still a number");
  assert.deepEqual(latestMetrics(null), {});
  assert.deepEqual(latestMetrics([]), {});
});

test("no screen reads only the newest row", () => {
  // THE TEST THAT WOULD HAVE CAUGHT IT. The resolver can be perfect and a page
  // still reports a lifter who has never squatted, because the bug is in the
  // query. Two pages had their own answer to this; one of them was wrong.
  // The library used to be one of these. It fetched benchmarks only to shade
  // the running zone guide, and that guide has moved to Guides and loads its
  // own — so the query moved with it. The property is unchanged; the list
  // follows the code rather than the code being kept where a test expects it.
  for (const page of ["../components/RunningGuide.tsx", "../app/(app)/coach/page.tsx"]) {
    const src = readFileSync(new URL(page, import.meta.url), "utf8");
    const at = src.indexOf('from("strength_benchmarks")');
    assert.ok(at > 0, `${page} no longer reads benchmarks`);
    const query = src.slice(at, at + 240);
    assert.ok(!/\.limit\(1\)/.test(query), `${page} still reads one row and calls it the athlete's numbers`);
    assert.match(src, /latestMetrics\(/, `${page} resolves benchmarks its own way`);
  }
});
