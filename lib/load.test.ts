import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionLoad, computeACWR, checkInStreak, weeklyReport } from "./load";
import type { DailyCheckIn, NutritionLog, TrainingLog } from "./types";

const day = (offset: number, from = new Date("2026-06-28")) =>
  new Date(from.getTime() - offset * 86400_000).toISOString().slice(0, 10);

function tlog(date: string, minutes: number, intensity: number): TrainingLog {
  return { id: date, user_id: "u", log_date: date, drills: [], total_minutes: minutes, intensity, created_at: date };
}

test("sessionLoad uses sRPE (minutes × intensity)", () => {
  assert.equal(sessionLoad(tlog("d", 60, 7)), 420);
});

test("ACWR flags a load spike as danger", () => {
  const asOf = new Date("2026-06-28");
  // Chronic baseline ~moderate for 28d, then a big recent spike.
  const logs: TrainingLog[] = [];
  for (let i = 7; i < 28; i++) logs.push(tlog(day(i, asOf), 40, 5)); // older: light
  for (let i = 0; i < 7; i++) logs.push(tlog(day(i, asOf), 90, 9)); // recent: heavy
  const a = computeACWR(logs, asOf);
  assert.ok(a.ratio && a.ratio > 1.5, `ratio ${a.ratio}`);
  assert.equal(a.zone, "danger");
});

test("ACWR steady load is optimal", () => {
  const asOf = new Date("2026-06-28");
  const logs: TrainingLog[] = [];
  for (let i = 0; i < 28; i++) if (i % 7 < 5) logs.push(tlog(day(i, asOf), 60, 7));
  const a = computeACWR(logs, asOf);
  assert.equal(a.zone, "optimal");
});

test("ACWR with no chronic data reports building", () => {
  assert.equal(computeACWR([]).zone, "building");
});

test("checkInStreak counts consecutive days ending today", () => {
  const today = "2026-06-28";
  assert.equal(checkInStreak(["2026-06-28", "2026-06-27", "2026-06-26"], today), 3);
  assert.equal(checkInStreak(["2026-06-27", "2026-06-26"], today), 2); // today missing, yesterday ok
  assert.equal(checkInStreak(["2026-06-25"], today), 0); // gap breaks it
});

test("weeklyReport summarises sessions, load trend and a focus", () => {
  const asOf = new Date("2026-06-28");
  const training: TrainingLog[] = [];
  for (let i = 0; i < 6; i++) training.push(tlog(day(i, asOf), 60, 7)); // this week
  for (let i = 7; i < 10; i++) training.push(tlog(day(i, asOf), 30, 5)); // prior week (lighter)
  const checkIns: DailyCheckIn[] = [0, 1, 2, 3, 4].map((i) => ({
    id: `${i}`, user_id: "u", check_in_date: day(i, asOf), pain_map: {}, fatigue_score: 5, sleep_quality: 7,
    nutrition_quality: 7, weight_kg: 75, is_match_day: false, match_minutes_played: 0, created_at: "", updated_at: "",
  }));
  const nutrition: NutritionLog[] = [];
  const r = weeklyReport(checkIns, training, nutrition, asOf);
  assert.equal(r.sessions, 6);
  assert.equal(r.loadTrend, "up");
  assert.ok(r.topWin.length > 0 && r.focus.length > 0);
});
