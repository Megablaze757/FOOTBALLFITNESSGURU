import test from "node:test";
import assert from "node:assert/strict";
import { durationPerSet, exerciseMeasure, formatMeasuredDose, measuredTrainingFields } from "./exercise-measure";

test("static holds and programme doses use time, not reps or weight", () => {
  for (const name of ["Plank", "Side plank", "Copenhagen plank", "Spanish squat iso-hold", "Single-leg balance progression"]) {
    assert.equal(exerciseMeasure(name), "seconds", name);
  }
  assert.equal(exerciseMeasure("VO2 intervals", "5 × 3 min · Zone 5"), "minutes");
  assert.equal(exerciseMeasure("Bike intervals", "8 × 40s"), "seconds");
  assert.equal(exerciseMeasure("Farmer's carry", "3 × 30m"), "metres");
});

test("dynamic movements that contain similar words stay repetition based", () => {
  assert.equal(exerciseMeasure("World's greatest stretch"), "reps");
  assert.equal(exerciseMeasure("Dead bug"), "reps");
  assert.equal(exerciseMeasure("Barbell hip thrust", null), "reps");
});

test("timed doses are stored and described in their real unit", () => {
  const plank = { name: "Plank", sets: 3, reps: 0, duration_seconds: 45 };
  assert.equal(durationPerSet(plank), 45);
  assert.equal(formatMeasuredDose(plank), "3 × 45s");
  assert.equal(formatMeasuredDose({ name: "Easy run", sets: 1, reps: 40, prescription: "40 min" }), "1 × 40 min");
  assert.deepEqual(measuredTrainingFields("Plank", 45), {
    measure: "seconds", reps: 0, duration_seconds: 45, prescription: undefined,
  });
});
