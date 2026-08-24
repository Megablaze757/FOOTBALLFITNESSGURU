import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  sessionBurn, metFor, metCalories, burnRangeLabel, burnBasisNote, keytelCaloriesPerMinute,
} from "./energy";

test("a run is costed from the distance, because that is the part we know", () => {
  /**
   * Running economy is close to constant across pace — the cost is the
   * distance, not the speed — so this is the one estimate in the app that does
   * not depend on somebody rating their own effort.
   *
   * 70kg × 10km ≈ 720 kcal, which is the figure every textbook gives.
   */
  const run = sessionBurn({ weightKg: 70, minutes: 50, distanceKm: 10 })!;
  assert.equal(run.basis, "distance");
  assert.equal(run.confidence, "good");
  assert.ok(run.mid >= 700 && run.mid <= 740, `10km at 70kg came out at ${run.mid}`);

  // And it ignores the RPE, which is the point: two runners covering 10km at
  // different efforts spend about the same.
  const hard = sessionBurn({ weightKg: 70, minutes: 50, distanceKm: 10, intensity: 10 })!;
  assert.equal(hard.mid, run.mid);
});

test("distance beats duration when both are there", () => {
  // A footballer's 90-minute session with a 5km run in it must not be costed as
  // 90 minutes of running.
  const both = sessionBurn({ weightKg: 80, minutes: 90, distanceKm: 5, activityId: "football" })!;
  assert.equal(both.basis, "distance");
});

test("a named activity uses its MET, scaled by how hard they said it was", () => {
  const easy = sessionBurn({ weightKg: 75, minutes: 60, activityId: "cycling", intensity: 3 })!;
  const listed = sessionBurn({ weightKg: 75, minutes: 60, activityId: "cycling", intensity: 6 })!;
  const hard = sessionBurn({ weightKg: 75, minutes: 60, activityId: "cycling", intensity: 9 })!;
  assert.ok(easy.mid < listed.mid && listed.mid < hard.mid);
  assert.equal(listed.basis, "activity");
  // An hour of ordinary cycling at 75kg is about 630 kcal (8 METs).
  assert.ok(listed.mid >= 600 && listed.mid <= 660, `an hour's cycling came out at ${listed.mid}`);
});

test("self-reported effort cannot treble the number", () => {
  /**
   * Somebody who rates every session a 10 would otherwise be told an hour's
   * walk burned what a hard ride does. Half again is as far as an unverifiable
   * rating should be allowed to move a figure this soft.
   */
  const walkListed = metFor("walking", 3);
  assert.equal(metFor("walking", 10), walkListed * 1.5);
  assert.equal(metFor("walking", 1), walkListed * 0.6);
  // And an absent rating just uses the listed value.
  assert.equal(metFor("cycling", null), 8);
});

test("lifting is given a band wide enough to admit what we do not know", () => {
  /**
   * Published estimates for the same resistance session vary by two to three
   * times. Anything narrower here would be a lie told in a smaller font.
   */
  const lift = sessionBurn({ weightKg: 80, minutes: 60, strength: true })!;
  assert.equal(lift.basis, "strength");
  assert.equal(lift.confidence, "rough");
  const width = (lift.high - lift.low) / lift.mid;
  assert.ok(width >= 0.7, `the lifting band is only ±${Math.round((width / 2) * 100)}%`);

  // A run's band is much tighter, because a run is much better known.
  const run = sessionBurn({ weightKg: 80, minutes: 60, distanceKm: 12 })!;
  assert.ok((run.high - run.low) / run.mid < width / 2);
});

test("nothing to go on returns nothing, rather than a confident zero", () => {
  assert.equal(sessionBurn({ weightKg: null, minutes: 60 }), null, "no weight, no estimate");
  assert.equal(sessionBurn({ weightKg: 0, minutes: 60 }), null);
  assert.equal(sessionBurn({ weightKg: 75, minutes: null }), null, "no duration and no distance");
  assert.equal(sessionBurn({ weightKg: 75, minutes: 0 }), null);
  assert.equal(burnRangeLabel(null), null);
  assert.equal(burnBasisNote(null), null);
});

test("an unknown activity still gets an answer, and is told it is a rough one", () => {
  const guess = sessionBurn({ weightKg: 70, minutes: 45, intensity: 7 })!;
  assert.equal(guess.basis, "duration");
  assert.equal(guess.confidence, "rough");
  assert.ok(guess.mid > 0);
});

test("the label is a range, never a single number dressed as a measurement", () => {
  const e = sessionBurn({ weightKg: 70, minutes: 60, activityId: "football", intensity: 7 })!;
  const label = burnRangeLabel(e)!;
  assert.match(label, /^\d+–\d+ kcal$/, `got "${label}"`);
  assert.ok(!/^~?\d+ kcal$/.test(label), "it collapsed to one figure");
  assert.match(burnBasisNote(e)!, /how hard you rated it/);
});

test("it is rounded to something a person would say", () => {
  // 487 implies a measurement. Tens are honest about being an estimate.
  for (const input of [
    { weightKg: 73.4, minutes: 47, activityId: "swimming", intensity: 6 },
    { weightKg: 61.2, minutes: 33, distanceKm: 6.4 },
  ]) {
    const e = sessionBurn(input)!;
    for (const n of [e.low, e.mid, e.high]) assert.equal(n % 10, 0, `${n} is not a round figure`);
  }
});

test("it never reaches the calorie target", () => {
  /**
   * THE WHOLE REASON THIS IS DISPLAY-ONLY.
   *
   * nutritionTargets derives its activity factor from LOGGED TRAINING MINUTES,
   * and says so in its own comment: training is counted once, and adding
   * measured training on top of a factor that already assumes it is "the
   * classic way these calculators end up several hundred calories high".
   *
   * So a burn figure feeding intake would double-count every session for every
   * athlete, and it would look plausible the whole time.
   */
  const nutrition = readFileSync(new URL("./nutrition.ts", import.meta.url), "utf8");
  assert.ok(!/from "\.\/energy"/.test(nutrition), "nutrition.ts imports the burn estimator");
  const plan = readFileSync(new URL("./meal-plan.ts", import.meta.url), "utf8");
  assert.ok(!/from "\.\/energy"/.test(plan), "meal-plan.ts imports the burn estimator");
});

test("a heart rate beats everything else, including a distance", () => {
  /**
   * Every other method here infers effort from what the session WAS and how
   * hard it felt. This one reads what the athlete's heart actually did, so it
   * is checked first — including ahead of the distance, which is otherwise the
   * strongest signal available.
   */
  const withHr = sessionBurn({
    weightKg: 70, minutes: 50, distanceKm: 10, avgHr: 155, sex: "male", age: 24,
  })!;
  assert.equal(withHr.basis, "heart-rate");
  assert.equal(withHr.confidence, "good");
});

test("it makes lifting knowable, which is the whole point of it", () => {
  // Activity-based estimates for resistance work disagree by two or three
  // times. A heart rate collapses that to the same band a run gets.
  const guessed = sessionBurn({ weightKg: 80, minutes: 60, strength: true })!;
  const measured = sessionBurn({ weightKg: 80, minutes: 60, strength: true, avgHr: 130, sex: "male", age: 30 })!;
  assert.equal(measured.basis, "heart-rate");
  const guessedBand = (guessed.high - guessed.low) / guessed.mid;
  const measuredBand = (measured.high - measured.low) / measured.mid;
  assert.ok(measuredBand < guessedBand / 2, "a measured session is no better than a guessed one");
});

test("the Keytel numbers land where the literature says", () => {
  // A 70kg 25-year-old man at 150bpm burns roughly 13-14 kcal/min.
  const male = keytelCaloriesPerMinute("male", 150, 70, 25);
  assert.ok(male > 12 && male < 15, `got ${male.toFixed(1)} kcal/min`);
  // A 60kg 25-year-old woman at 150bpm is nearer 9-10.
  const female = keytelCaloriesPerMinute("female", 150, 60, 25);
  assert.ok(female > 8 && female < 11, `got ${female.toFixed(1)} kcal/min`);
  // Same heart rate, different bodies, different work — which is why it needs
  // sex, age and weight rather than just the beats.
  assert.ok(male > female);
});

test("the regression going negative at rest is not a calorie refund", () => {
  // Keytel is fitted to exercise intensities and drops below zero at rest.
  assert.equal(keytelCaloriesPerMinute("female", 40, 60, 25), 0);
  // And an implausible or missing reading falls through to the other methods
  // rather than being trusted.
  const resting = sessionBurn({ weightKg: 70, minutes: 60, avgHr: 45, sex: "male", age: 24, activityId: "cycling" })!;
  assert.equal(resting.basis, "activity", "a 45bpm session average was treated as real");
  const noSex = sessionBurn({ weightKg: 70, minutes: 60, avgHr: 150, age: 24, activityId: "cycling" })!;
  assert.equal(noSex.basis, "activity", "Keytel ran without knowing which equation to use");
  const noAge = sessionBurn({ weightKg: 70, minutes: 60, avgHr: 150, sex: "male", activityId: "cycling" })!;
  assert.equal(noAge.basis, "activity");
});
