import assert from "node:assert/strict";
import test from "node:test";
import { summarizeRunProgress } from "./run-progress";
import type { StrengthBenchmark, TrainingLog } from "./types";

function run(date: string, patch: Partial<TrainingLog> = {}): TrainingLog {
  return {
    id: date,
    user_id: "runner",
    log_date: date,
    drills: [],
    total_minutes: 30,
    intensity: 4,
    run_type: "easy",
    zone: 2,
    distance_km: 5,
    created_at: `${date}T12:00:00Z`,
    ...patch,
  };
}

function benchmark(date: string, metrics: Record<string, number>): StrengthBenchmark {
  return { id: date, user_id: "runner", test_date: date, metrics, notes: null, created_at: `${date}T12:00:00Z` };
}

test("keeps hundredths and compares equal 28-day running blocks", () => {
  const result = summarizeRunProgress([
    run("2026-08-16", { distance_km: 5.66, total_minutes: 30 }),
    run("2026-08-10", { distance_km: 8.25, total_minutes: 44 }),
    run("2026-07-15", { distance_km: 10, total_minutes: 60 }),
  ], [], "2026-08-16");

  assert.equal(result.current.distanceKm, 13.91);
  assert.equal(result.previous.distanceKm, 10);
  assert.equal(result.distanceDeltaKm, 3.91);
  assert.equal(result.zone2.distanceKm, 13.91);
  assert.equal(result.zone2.distanceDeltaKm, 3.91);
});

test("calculates distance-weighted pace and duration-weighted heart rate", () => {
  const result = summarizeRunProgress([
    run("2026-08-16", { distance_km: 5, total_minutes: 25, avg_hr: 140 }),
    run("2026-08-12", { distance_km: 10, total_minutes: 60, avg_hr: 150 }),
  ], [], "2026-08-16");

  assert.equal(result.current.avgPaceSecPerKm, 340);
  assert.equal(result.current.avgHr, 147);
  assert.equal(result.current.longestKm, 10);
});

test("infers a zone from run type for older rows and tracks unzoned distance", () => {
  const result = summarizeRunProgress([
    run("2026-08-16", { zone: null, run_type: "easy", distance_km: 6 }),
    run("2026-08-15", { zone: null, run_type: null, distance_km: 4 }),
  ], [], "2026-08-16");

  assert.equal(result.zones.find((zone) => zone.zone === 2)?.distanceKm, 6);
  assert.equal(result.unzonedKm, 4);
});

test("reports race PBs and improvement in clock seconds", () => {
  const result = summarizeRunProgress([], [
    benchmark("2026-06-01", { run_5k_min: 25.5 }),
    benchmark("2026-08-01", { run_5k_min: 24.75 }),
  ], "2026-08-16");

  assert.deepEqual(result.races[0], {
    key: "run_5k_min",
    distanceKm: 5,
    testDate: "2026-08-01",
    latestMinutes: 24.75,
    bestMinutes: 24.75,
    isPb: true,
    gainSeconds: 45,
  });
  assert.equal(result.rank?.label, "Bronze");
  assert.equal(result.rank?.improvementPct, 2.9);
  assert.equal(result.rank?.best5kSeconds, 1485);
});

test("runner rank compares different race distances on a 5k-equivalent scale", () => {
  const result = summarizeRunProgress([], [
    benchmark("2026-01-01", { run_10k_min: 50 }),
    benchmark("2026-08-01", { run_5k_min: 23 }),
  ], "2026-08-16");

  assert.ok(result.rank);
  assert.ok(result.rank.improvementPct > 3);
  assert.equal(result.rank.label, "Silver");
  assert.equal(result.rank.nextLabel, "Gold");
  assert.ok((result.rank.secondsToNext ?? 0) > 0);
});
