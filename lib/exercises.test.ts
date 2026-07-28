import { test } from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, getExerciseByName, exerciseProgression, progressionForName } from "./exercises";

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

// --- every exercise can actually teach you the movement ----------------------

test("every exercise has a real how-to, not a statement of benefit", () => {
  const missing = EXERCISES.filter((e) => !e.hasHowTo);
  assert.deepEqual(
    missing.map((e) => e.id),
    [],
    `${missing.length} exercises would show "What it's for" instead of instructions`
  );
});

test("a how-to is long enough to actually be one", () => {
  // 120 characters is roughly the point below which you have a slogan rather
  // than instructions. Deliberately the ONLY shape rule here: an earlier
  // version also demanded a specific vocabulary of instruction verbs and a
  // named common error, and it failed ten entries that were perfectly good —
  // they just opened with "Face", "Swing" or "Trace". A test that rejects
  // correct content is worse than no test, because the temptation is to
  // rewrite the content to satisfy it.
  for (const e of EXERCISES) {
    const d = (e.description ?? "").trim();
    assert.ok(d.length >= 120, `${e.id}: "${d}" is too short to teach the movement`);
  }
});

test("nothing renders an empty coaching-cues list", () => {
  // ExerciseDetail always drew the "Coaching cues" heading, so an exercise with
  // no cues showed a heading over nothing. Either an exercise has cues, or the
  // UI must not promise them — this asserts the data side of that contract.
  for (const e of EXERCISES) {
    const cues = (e.cues ?? []).filter(Boolean);
    assert.ok(cues.length === 0 || cues.length >= 2,
      `${e.id} has exactly one cue — either give it a second or none at all`);
  }
});
