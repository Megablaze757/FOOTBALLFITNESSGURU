import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeTrends, computeFatigueTrend, average } from "./trends";
import type { DailyCheckIn } from "./types";

function row(date: string, over: Partial<DailyCheckIn>): DailyCheckIn {
  return {
    id: date,
    user_id: "u",
    check_in_date: date,
    pain_map: {},
    fatigue_score: 5,
    sleep_quality: 7,
    nutrition_quality: 7,
    weight_kg: null,
    is_match_day: false,
    match_minutes_played: 0,
    created_at: date,
    updated_at: date,
    ...over,
  };
}

test("summarizeTrends sorts ascending and derives risk from latest readiness", () => {
  const rows = [
    row("2026-06-03", { pain_map: { knee_left: 8 }, sleep_quality: 3 }), // newest, risky
    row("2026-06-01", { sleep_quality: 8 }),
    row("2026-06-02", { sleep_quality: 8 }),
  ];
  const s = summarizeTrends(rows);
  assert.equal(s.series[0].date, "2026-06-01"); // sorted ascending
  assert.equal(s.series[s.series.length - 1].date, "2026-06-03");
  assert.ok(s.riskScore > 0.5, `expected high risk, got ${s.riskScore}`);
  assert.equal(s.focusBodyPart, "left knee");
});

test("rising fatigue across the window reads as declining", () => {
  const series = [2, 3, 7, 8].map((f, i) => ({
    date: `d${i}`,
    maxPain: 0,
    sleep: 7,
    fatigue: f,
    readinessScore: 70,
  }));
  assert.equal(computeFatigueTrend(series), "declining");
});

test("falling fatigue reads as improving", () => {
  const series = [8, 7, 3, 2].map((f, i) => ({
    date: `d${i}`,
    maxPain: 0,
    sleep: 7,
    fatigue: f,
    readinessScore: 70,
  }));
  assert.equal(computeFatigueTrend(series), "improving");
});

test("weight delta is latest minus oldest", () => {
  const rows = [
    row("2026-06-03", { weight_kg: 81 }),
    row("2026-06-01", { weight_kg: 80 }),
  ];
  assert.equal(summarizeTrends(rows).weightDeltaKg, 1);
});

test("average ignores nulls", () => {
  assert.equal(average([2, null, 4]), 3);
  assert.equal(average([null]), null);
});
