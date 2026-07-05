import { test } from "node:test";
import assert from "node:assert/strict";
import { getExerciseByName, exerciseProgression, progressionForName } from "./exercises";

test("progression method matches how each drill is actually overloaded", () => {
  // barbell lifts → load
  assert.equal(exerciseProgression(getExerciseByName("Barbell back squat")!), "load");
  assert.equal(exerciseProgression(getExerciseByName("Conventional deadlift")!), "load");
  // skill / ball / sprint work → NOT load
  assert.equal(exerciseProgression(getExerciseByName("Wall passing reps")!), "skill");
  assert.equal(exerciseProgression(getExerciseByName("Tight-space dribbling")!), "skill");
  assert.equal(exerciseProgression(getExerciseByName("Flying 20m sprints")!), "skill");
  // conditioning → time
  assert.equal(exerciseProgression(getExerciseByName("Tempo runs")!), "time");
  // bodyweight strength → reps
  assert.equal(exerciseProgression(getExerciseByName("Pull-up")!), "reps");
});

test("progressionForName returns null for unknown drills", () => {
  assert.equal(progressionForName("some made-up drill"), null);
  assert.equal(progressionForName("Wall passing reps"), "skill");
});
