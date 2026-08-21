import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  guessDemo, guessCategory, guessEquipment, guessMuscles, guessImplement, customExerciseRow,
} from "./exercise-guess";
import { howToFor } from "./how-to";
import { rowToExercise, exerciseEquip, EXERCISES } from "./exercises";
import { MUSCLE_LABEL } from "./muscle-volume";

/**
 * "MY CUSTOM EXERCISES DISAPPEAR — I HAVE TO RE-ADD THEM EVERY TIME."
 *
 * Two holes met. The check-in's drill picker searched the static catalogue and
 * nothing else, so an exercise the athlete had personally saved was invisible
 * at the one moment it exists to be used; and the only way past that dead end
 * appended a blank row to the log and saved the name nowhere.
 *
 * Saving a typed name means answering three questions with only the name in
 * hand — which figure, which muscles, which kit — and the app already had two
 * disagreeing answers to each. This file is the third and last.
 */

// --- one guesser, not three --------------------------------------------------

test("a name is drawn the same way wherever it is drawn", () => {
  // THE TEST THAT WOULD HAVE CAUGHT THE DRIFT. lib/how-to.ts carried a private
  // copy of these patterns, and the two copies already disagreed: the importer
  // reads a wall ball as a loaded jump, the private copy read it as a football
  // drill. The same movement drew a different picture depending on which screen
  // you opened it from.
  for (const name of ["5-a-side match", "Sunday kickabout", "Beach sprint relay", "Coach's tempo circuit"]) {
    const how = howToFor(name)!;
    assert.match(how.tag, /Custom exercise/, `${name} is in a catalogue — pick a name that is not`);
    assert.equal(how.demo, guessDemo(name), name);
    assert.deepEqual(how.muscles, guessMuscles(name), name);
    assert.equal(how.implement, guessImplement(name), name);
  }
});

test("a gym movement keeps the gym's reading of it", () => {
  // The sport patterns run first, so each one has to be narrow enough not to
  // steal a name the importer already classifies correctly. "Ball" alone turns
  // a wall ball into dribbling; "shuttle" is a run and a shuttle run both.
  assert.equal(guessDemo("Wall ball"), "jump");
  assert.equal(guessDemo("Barbell hip thrust"), "hinge");
  assert.equal(guessDemo("Cossack squat"), "squat");
  assert.equal(guessDemo("Kettlebell swing"), "hinge", "a swing is a hinge, not mobility work");
  assert.equal(guessDemo("Pendlay row"), "pull");
});

test("the work a gym catalogue has never seen still gets a picture", () => {
  assert.equal(guessDemo("400m repeats"), "run");
  assert.equal(guessDemo("Assault bike intervals"), "bike", "cardio beats the word 'intervals'");
  assert.equal(guessDemo("Tight cone weave"), "ball");
  assert.equal(guessDemo("5-a-side match"), "ball");
  assert.equal(guessDemo("Ladder quick feet"), "lateral");
  assert.equal(guessDemo("Farmer carry"), "plank", "a carry is a braced trunk, not a press");
  assert.equal(guessDemo("Hip flexor stretch"), "lunge");
  assert.equal(guessDemo("Thoracic opener"), "plank", "mobility above the waist is done on the floor");
});

test("every muscle the guesser can emit is a muscle the app counts", () => {
  // The strength map, the body figure and the library filter all key on these
  // exact labels. "Abs" instead of "Core" writes a row that draws no muscle and
  // counts toward nothing, and it would look perfectly fine in the form.
  const known = new Set(Object.values(MUSCLE_LABEL));
  const names = [
    "Cossack squat", "Farmer carry", "Sled push", "Thoracic opener", "Zercher squat",
    "400m repeats", "Assault bike intervals", "5-a-side match", "Ladder quick feet",
    "Single-arm landmine rainbow press", "Turkish get-up", "Hip flexor stretch",
  ];
  for (const name of names) {
    const muscles = guessMuscles(name);
    assert.ok(muscles.length > 0, `${name} trains nothing`);
    for (const m of muscles) assert.ok(known.has(m), `${name}: "${m}" is not a muscle the app knows`);
  }
});

// --- honesty -----------------------------------------------------------------

test("kit is only claimed when the name says it", () => {
  // equipmentOf ends with a rule that reads a barbell out of any name holding
  // "squat", "press", "row" or "curl". That rule is right for the importer,
  // whose input really is a barbell catalogue, and wrong the moment a person
  // types a name: it puts a bar in the picture and hides the movement from a
  // bodyweight-only filter.
  assert.equal(guessEquipment("Cossack squat"), null);
  assert.equal(guessEquipment("Zercher squat"), null);
  assert.equal(guessEquipment("Barbell hip thrust"), "Barbell");
  assert.equal(guessEquipment("Push ups"), "Bodyweight");
  assert.equal(guessEquipment("DB incline chest press"), "Dumbbell", "people abbreviate");
  assert.equal(guessEquipment("Sled push"), null);
});

test("an implement is drawn only when the athlete is holding one", () => {
  assert.equal(guessImplement("Barbell back squat"), "barbell_back");
  assert.equal(guessImplement("Barbell overhead press"), "barbell_hands");
  assert.equal(guessImplement("DB walking lunge"), "dumbbells");
  assert.equal(guessImplement("Box jump"), "box");
  assert.equal(guessImplement("Cossack squat"), "none");
});

test("what the movement is for", () => {
  assert.equal(guessCategory("Hip flexor stretch"), "Mobility");
  assert.equal(guessCategory("Flying 30m sprint"), "Speed", "a sprint is speed work before it is running");
  assert.equal(guessCategory("Box jump"), "Power");
  assert.equal(guessCategory("Tight cone weave"), "Skill", "the label has to agree with the figure");
  assert.equal(guessCategory("Ladder quick feet"), "Agility");
  assert.equal(guessCategory("Assault bike intervals"), "Endurance");
  assert.equal(guessCategory("Zercher squat"), "Strength");
});

// --- the row -----------------------------------------------------------------

test("a saved name reads back as the card it drew", () => {
  // The row goes to Postgres and comes back through rowToExercise, and the
  // library card is built from what comes back. If the round trip loses the
  // guess, the movement is a squat with no muscles the next time it is opened —
  // which is what a coach-authored row already looked like.
  const row = customExerciseRow("Sled push", "owner-1");
  const back = rowToExercise({ id: "abc", ...row, equipment: row.equipment });
  assert.equal(back.name, "Sled push");
  assert.equal(back.demo, guessDemo("Sled push"));
  assert.deepEqual(back.muscles, guessMuscles("Sled push"));
  assert.equal(back.custom, true);
  assert.equal(back.id, "custom_abc");
  // No equipment was claimed, so the filter must place it honestly rather than
  // inventing a bucket for it.
  assert.equal(exerciseEquip(back), "Bodyweight");
});

test("the row cannot hide itself again", () => {
  // sport: null, deliberately. This row exists because somebody logged a
  // movement the library lacks, and the one thing they must never see again is
  // it vanishing. Tagging it with today's sport hides it the day they switch —
  // which is the complaint that started all of this.
  const row = customExerciseRow("Sled   push ", "owner-1");
  assert.equal(row.sport, null);
  assert.equal(row.name, "Sled push", "whitespace is normalised so it matches next time");
  assert.equal(row.coach_id, "owner-1");
  assert.ok(row.why.length > 0, "the library card prints why — it must not be blank");
  assert.ok(!/coach/i.test(row.why), "the athlete added this themselves");
  assert.deepEqual(row.cues, []);
});

test("a name the library already holds is not worth saving twice", () => {
  // Not enforced here — the picker offers the add only when no entry carries
  // exactly this name — but the invariant is worth pinning: a guessed row for a
  // name the catalogue teaches properly is strictly worse than the catalogue's.
  const staple = EXERCISES.find((e) => e.name === "Barbell back squat");
  assert.ok(staple, "expected the staple lift to exist");
  assert.ok(staple!.cues.length > 0);
  assert.deepEqual(customExerciseRow("Barbell back squat", "owner-1").cues, [],
    "a guessed row has no coaching, which is why it must never shadow a real entry");
});

// --- the seam ----------------------------------------------------------------

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the check-in can see the exercises the athlete saved", () => {
  // THE ACTUAL BUG. DrillPicker's pool was getExercisesForSport(sport) — the
  // static catalogue, and only that. The library page has loaded and merged
  // custom_exercises for as long as the table has existed; the picker never
  // did, so search said "nothing matches" about a movement the athlete had
  // personally entered.
  const picker = source("../components/DrillPicker.tsx");
  assert.match(picker, /from\("custom_exercises"\)\s*\.select\(/,
    "the picker does not load the athlete's own exercises");
  assert.match(picker, /rowToExercise/, "rows are not mapped into the shared Exercise shape");
  assert.match(picker, /customExerciseRow/, "a typed name is logged but never saved");
  assert.match(picker, /insert\(customExerciseRow/, "nothing is written back to the library");
  assert.ok(!/add it as a custom drill below/.test(picker),
    "the empty state still points at a control instead of being one");
});

test("there is one way to log a movement the library lacks, and it keeps it", () => {
  // The free-text row under the picker appended `{ name: "" }` to the log and
  // saved the name nowhere, so the next check-in asked for it again — spelled
  // slightly differently, splitting that movement's history in two. Two paths
  // where one silently loses the exercise is the whole complaint.
  const form = source("../components/TrainingLogInput.tsx");
  assert.ok(!/Add something not in the library/.test(form),
    "the unsaved free-text path is back alongside the saving one");
});
