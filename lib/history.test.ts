import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeTraining, summarizeNutrition, caloriesFromMacros } from "./history";
import type { NutritionLog, TrainingLog } from "./types";

function tlog(date: string, drills: TrainingLog["drills"], minutes = 60): TrainingLog {
  return { id: date, user_id: "u", log_date: date, drills, total_minutes: minutes, intensity: 7, created_at: date };
}

test("training volume = sets*reps summed, sorted ascending", () => {
  const s = summarizeTraining([
    tlog("2026-06-03", [{ name: "Squat", sets: 3, reps: 5, load_kg: 100 }]),
    tlog("2026-06-01", [{ name: "Squat", sets: 5, reps: 5, load_kg: 90 }]),
  ]);
  assert.equal(s.volume[0].date, "2026-06-01");
  assert.equal(s.volume[0].value, 25);
  assert.equal(s.volume[1].value, 15);
  assert.equal(s.totalReps, 40);
});

test("drill frequency tracks sessions, sets and best load", () => {
  const s = summarizeTraining([
    tlog("2026-06-01", [{ name: "Squat", sets: 3, reps: 5, load_kg: 90 }]),
    tlog("2026-06-02", [{ name: "Squat", sets: 4, reps: 5, load_kg: 110 }, { name: "Lunge", sets: 3, reps: 10 }]),
  ]);
  const squat = s.drillFrequency.find((d) => d.name === "Squat")!;
  assert.equal(squat.sessions, 2);
  assert.equal(squat.totalSets, 7);
  assert.equal(squat.bestLoad, 110);
  assert.equal(s.drillFrequency[0].name, "Squat"); // most frequent first
});

test("calories computed from macros (4/4/9)", () => {
  assert.equal(caloriesFromMacros({ protein: 150, carbs: 200, fats: 60 }), 150 * 4 + 200 * 4 + 60 * 9);
});

test("nutrition averages ignore empty days", () => {
  const logs: NutritionLog[] = [
    { id: "1", user_id: "u", log_date: "2026-06-01", daily_calorie_target: 2800, macros: { protein: 150, carbs: 200, fats: 60 }, daily_water_intake_ml: 3000 },
    { id: "2", user_id: "u", log_date: "2026-06-02", daily_calorie_target: null, macros: {}, daily_water_intake_ml: 0 },
  ];
  const s = summarizeNutrition(logs);
  assert.equal(s.water[0].value, 3);
  assert.equal(s.avgProtein, 150); // empty day ignored
});
