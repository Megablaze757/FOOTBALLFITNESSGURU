// Real anatomical artwork on the exercises we could pair confidently, and the
// drawn figure everywhere else.
//
// Everkinetic (github.com/everkinetic/data, CC BY-SA 4.0, by Greg Priday) is
// 293 illustrated exercises, two frames each. Ours is 263 gym movements plus
// several hundred sport drills, and no anatomy library has a cone weave.
//
// THE RISK THIS FILE EXISTS FOR is not "too few pictures". It is the wrong
// picture: "Dumbbell Row" and "Dumbbell Upright Rows" share three words in four
// and are different exercises — one trains the back, the other the shoulders —
// and any fuzzy matcher pairs them with confidence. A stick figure that says
// nothing beats an illustration that teaches the wrong lift.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { EXERCISE_ART, ART_SOURCES, artFor } from "./exercise-art";
import { IMPORTED_EXERCISES } from "./exercise-catalog";

const root = new URL("../", import.meta.url);
const script = readFileSync(new URL("scripts/build-exercise-art.mjs", root), "utf8");
const demo = readFileSync(new URL("components/ExerciseDemo.tsx", root), "utf8");

test("every mapped exercise has both frames on disk", () => {
  // A map entry with no file is a broken image, which is worse than the figure
  // it replaced.
  assert.ok(Object.keys(EXERCISE_ART).length > 50, "the map is suspiciously small — did the build run?");
  for (const name of Object.keys(EXERCISE_ART)) {
    const art = artFor(name);
    assert.ok(art, `${name} is in the map and artFor says no`);
    for (const src of [art!.start, art!.end]) {
      assert.ok(existsSync(new URL(`public${src}`, root)), `${name}: ${src} is missing`);
    }
  }
});

test("every mapped name is a real exercise", () => {
  // Rename an exercise and its art silently stops resolving — the map is keyed
  // by name, so the two have to be checked against each other.
  const known = new Set(IMPORTED_EXERCISES.map((e) => e.name));
  for (const name of Object.keys(EXERCISE_ART)) {
    assert.ok(known.has(name), `${name} has artwork and is not in the catalogue any more`);
  }
});

test("an exercise with no artwork gets no artwork, not a wrong one", () => {
  assert.equal(artFor("Cone weave dribble"), null);
  assert.equal(artFor("Copenhagen plank"), null);
  assert.equal(artFor(""), null);
});

test("the pairing refuses a word that changes the movement", () => {
  // The whole safety property, asserted on the matcher itself rather than on
  // its output — the output is regenerated, the rule is the thing that holds.
  assert.match(script, /const FORM = \[/);
  for (const word of ["upright", "concentration", "incline", "seated", "side", "single", "reverse"]) {
    assert.ok(script.includes(`"${word}"`), `${word} is not treated as changing the exercise`);
  }
  assert.match(script, /if \(FORM\.some\(\(d\) => mineSet\.has\(d\) !== c\.w\.has\(d\)\)\) continue;/);
});

test("...and refuses the wrong implement without demanding one", () => {
  // Everkinetic names the implement in nearly every title and we usually only
  // name it when it is not the obvious one, so requiring a match cost 24 good
  // pairs to avoid 2 bad ones. Both sides naming DIFFERENT kit is still a
  // refusal: a dumbbell lunge must never be drawn with a barbell.
  assert.match(script, /const IMPLEMENT = \["barbell", "dumbbell"/);
  assert.match(script, /if \(mineKit\.length && theirKit\.length && !mineKit\.some\(\(k\) => theirKit\.includes\(k\)\)\) continue;/);
});

test("the pairs that started this are still refused", () => {
  // Named individually because they are the evidence, not an example: each was
  // produced by an earlier version of the matcher and teaches a different
  // exercise from the one on the card.
  //
  //   Dumbbell Row      -> Dumbbell Upright Rows   back vs shoulders
  //   Wall Ball         -> Ball Wall Circles       two nouns, one exercise apart
  for (const name of ["Dumbbell Row", "Wall Ball"]) {
    assert.equal(EXERCISE_ART[name], undefined, `${name} was paired with something it is not`);
  }
});

test("a refusal is about the candidate, not about the exercise", () => {
  /**
   * "Plank" belongs on the list above and no longer is, which is the rule
   * working rather than failing.
   *
   * The only plank Everkinetic has is a SIDE plank — a different exercise, so
   * the pair was refused and the card kept the drawn figure. The photograph set
   * has an actual plank, so now it gets one. Nothing about the rule changed;
   * the pool of candidates did.
   *
   * Worth pinning, because the tempting "fix" when coverage looks low is to
   * relax the threshold until the wrong picture gets in. The answer is another
   * library, not a lower bar.
   */
  assert.equal(EXERCISE_ART["Plank"]?.from, "free-exercise-db");
});

test("a plain movement may be illustrated holding the usual implement", () => {
  /**
   * "Lunge" is paired with "Barbell Lunges", and that is deliberate.
   *
   * The rule refuses a DIFFERENT movement, not a different amount of weight:
   * the lunge in the picture is the lunge on the card, and the bar across the
   * shoulders is what a lunge looks like in most gyms. Refusing it took twenty
   * more good pairs with it — every "Bent Over Row", "Good Morning" and
   * "Overhead Squat" we have, all of which Everkinetic names with the barbell
   * that is simply assumed.
   *
   * The line is drawn where the athlete would be misled about what to DO. Both
   * sides naming different kit is still refused, so a dumbbell lunge is never
   * drawn with a barbell.
   */
  assert.equal(EXERCISE_ART["Lunge"]?.key, "lunge");
  assert.equal(EXERCISE_ART["Dumbbell Lunge"]?.key, "dumbbell-lunge");
});

test("both libraries are used, and the drawn one is preferred", () => {
  // Everkinetic first because it is drawn: one consistent figure, vector, sharp
  // at any size. The photographs fill what no illustrator covered rather than
  // competing with it — so a lift that exists in both is illustrated.
  const from = Object.values(EXERCISE_ART).map((e) => e.from);
  const drawn = from.filter((f) => f === "everkinetic").length;
  const shot = from.filter((f) => f === "free-exercise-db").length;
  assert.ok(drawn > 50 && shot > 40, `${drawn} illustrated, ${shot} photographed`);
  assert.equal(EXERCISE_ART["Bench Press"]?.from, "everkinetic");
  assert.equal(EXERCISE_ART["Bench Press"]?.ext, "svg");
  // Nobody illustrated a clean and jerk.
  assert.equal(EXERCISE_ART["Clean and Jerk"]?.from, "free-exercise-db");
  assert.equal(EXERCISE_ART["Clean and Jerk"]?.ext, "jpg");
});

test("the licence is honoured in the app, not only in a comment", () => {
  // CC BY-SA asks for credit. It also binds ADAPTATIONS, which is why the
  // pipeline copies files and never edits them.
  assert.equal(ART_SOURCES.everkinetic.licence, "CC BY-SA 4.0");
  assert.match(ART_SOURCES.everkinetic.source, /github\.com\/everkinetic\/data/);
  assert.equal(ART_SOURCES["free-exercise-db"].licence, "Public domain");
  for (const s of Object.values(ART_SOURCES)) assert.ok(s.author.length > 0 && s.licenceUrl.startsWith("http"));
  // The credit names the library the picture on THIS card came from — one
  // blanket credit under a photograph from the other set is a false statement.
  assert.match(demo, /\{ART_SOURCES\[art\.from\]\.work\} · \{ART_SOURCES\[art\.from\]\.licence\}/, "the credit never renders");
  assert.match(script, /copyFileSync/, "the pipeline transforms the art rather than copying it");
});

test("the drawn figure is still the fallback, not a dead code path", () => {
  // Most of the sport-specific work will never have artwork, so the figure has
  // to keep working — and the card has to look the same either way, or a
  // session with four illustrated lifts and one drawn drill reads as two apps.
  assert.match(demo, /const art = name \? artFor\(name\) : null;/);
  assert.match(demo, /\{src \? \(/);
  assert.match(demo, /\) : <Figure/);
  const withArt = IMPORTED_EXERCISES.filter((e) => artFor(e.name)).length;
  assert.ok(withArt < IMPORTED_EXERCISES.length, "everything has art, so the fallback is untested");
  assert.ok(withArt > 40, `only ${withArt} exercises have art`);
});

test("the key describes the picture it sits under", () => {
  // The dots meant "this colour on the figure is the primary mover". On an
  // illustration shaded by an artist they describe nothing, and a key to
  // colours that are not on screen is worse than no key.
  assert.match(demo, /\{!art && <span className="h-2 w-2 shrink-0 rounded-full" style=\{\{ background: activationColour\("primary"\) \}\} \/>\}/);
});

test("the exercises athletes typed in by hand are in the catalogue", () => {
  // These six came off a report of what people logged as custom entries, which
  // is the most honest gap list there is: somebody wanted the exercise, could
  // not find it, and typed it anyway. Five are lifts; "Spin" is an activity and
  // belongs with padel and cycling, not in a list of gym movements.
  const names = new Set(IMPORTED_EXERCISES.map((e) => e.name));
  for (const name of [
    "Incline Bicep Curl", "Rear Delt Fly", "Cable Chest Fly",
    "Single Arm Tricep Extension", "Skull Crushers",
  ]) {
    assert.ok(names.has(name), `${name} is still missing from the library`);
  }
});
