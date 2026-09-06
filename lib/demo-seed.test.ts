import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAYS, DEMO_PROFILE, WEIGH_IN_WEEKS, bodyLogs, checkIns, nutritionLogs, trainingLogs,
} from "./demo-seed";

const TODAY = new Date("2026-09-06T00:00:00Z");
const days = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/**
 * A demo that lies is worse than an empty one. Everything below is a way the
 * data could be visibly fake to somebody who trains — which is the entire
 * audience for these reels.
 */
test("nothing is dated in the future", () => {
  const all = [
    ...checkIns(TODAY).map((r) => r.check_in_date),
    ...bodyLogs(TODAY).map((r) => r.log_date),
    ...nutritionLogs(TODAY).map((r) => r.log_date),
    ...trainingLogs(TODAY).map((r) => r.log_date),
  ];
  for (const d of all) {
    assert.ok(Date.parse(d) <= TODAY.getTime(), `${d} is in the future`);
  }
  assert.ok(all.length > 0);
});

test("it is deterministic — two runs film the same athlete", () => {
  assert.deepEqual(checkIns(TODAY), checkIns(TODAY));
  assert.deepEqual(bodyLogs(TODAY), bodyLogs(TODAY));
  assert.deepEqual(nutritionLogs(TODAY), nutritionLogs(TODAY));
  assert.deepEqual(trainingLogs(TODAY), trainingLogs(TODAY));
});

test("no date is used twice — the tables have a unique constraint per day", () => {
  for (const rows of [
    checkIns(TODAY).map((r) => r.check_in_date),
    bodyLogs(TODAY).map((r) => r.log_date),
    nutritionLogs(TODAY).map((r) => r.log_date),
    trainingLogs(TODAY).map((r) => r.log_date),
  ]) {
    assert.equal(new Set(rows).size, rows.length, `duplicate day: ${rows.join(", ")}`);
  }
});

/**
 * THE WHOLE CLAIM OF THE READINESS REEL. "The app changes today's session
 * because of how you slept." A fortnight of sevens proves nothing and films as
 * a flat line.
 */
test("there is a genuinely bad night, and the training reacts to it", () => {
  const ins = checkIns(TODAY);
  const bad = ins.filter((r) => r.sleep_quality <= 4);
  assert.ok(bad.length >= 1, "every night is fine, so the readiness score never moves");

  const sleeps = new Set(ins.map((r) => r.sleep_quality));
  assert.ok(sleeps.size >= 4, `only ${sleeps.size} distinct sleep scores — that is a flat line`);

  // The day of the worst night is a rest day, which is the app doing the thing.
  const worst = ins.reduce((a, b) => (b.sleep_quality < a.sleep_quality ? b : a));
  const trained = new Set(trainingLogs(TODAY).map((r) => r.log_date));
  assert.ok(!trained.has(worst.check_in_date),
    `trained hard on ${worst.check_in_date}, the worst night of the fortnight`);
});

/** A real weight graph drifts. It does not climb four kilos in a fortnight. */
test("the weight trend is one a person could actually have", () => {
  const logs = bodyLogs(TODAY);
  assert.equal(logs.length, WEIGH_IN_WEEKS);
  for (let i = 1; i < logs.length; i++) {
    const step = Math.abs(logs[i].weight_kg - logs[i - 1].weight_kg);
    assert.ok(step <= 1.5, `${step}kg between weigh-ins is not a real week`);
  }
  const total = logs[logs.length - 1].weight_kg - logs[0].weight_kg;
  assert.ok(Math.abs(total) <= 3, `${total}kg over ${WEIGH_IN_WEEKS} weeks is not "maintaining"`);
  // And it is not a straight line, which is the other way to look invented.
  const rises = logs.slice(1).filter((l, i) => l.weight_kg < logs[i].weight_kg);
  assert.ok(rises.length >= 1, "the weight only ever goes one way");
});

test("weigh-ins are weekly and go back further than the check-ins", () => {
  const logs = bodyLogs(TODAY);
  for (let i = 1; i < logs.length; i++) {
    assert.equal(days(logs[i - 1].log_date, logs[i].log_date), 7);
  }
  assert.ok(days(logs[0].log_date, logs[logs.length - 1].log_date) > DAYS,
    "the weight history is no longer than the check-in history, so there is no trend to show");
});

/**
 * The numbers this audience will actually check. An 88kg lifter training six
 * hours a week does not maintain on 1,800 calories or 300g of protein.
 */
test("the intake is plausible for the athlete it belongs to", () => {
  for (const log of nutritionLogs(TODAY)) {
    assert.ok(log.daily_calorie_target >= 2400 && log.daily_calorie_target <= 4200,
      `${log.daily_calorie_target} kcal is not a maintaining 88kg athlete`);
    // Roughly 1.6-2.6 g/kg is the range anybody sane recommends.
    assert.ok(log.macros.protein >= 140 && log.macros.protein <= 230,
      `${log.macros.protein}g of protein`);
    assert.ok(log.macros.fats >= 60 && log.macros.fats <= 130, `${log.macros.fats}g of fat`);
    assert.ok(log.daily_water_intake_ml >= 1500 && log.daily_water_intake_ml <= 5000,
      `${log.daily_water_intake_ml}ml of water`);

    // And the macros have to add up to roughly the target, or the card
    // contradicts itself on screen.
    const kcal = log.macros.protein * 4 + log.macros.carbs * 4 + log.macros.fats * 9;
    const drift = Math.abs(kcal - log.daily_calorie_target) / log.daily_calorie_target;
    assert.ok(drift <= 0.12,
      `macros come to ${Math.round(kcal)} kcal against a ${log.daily_calorie_target} target`);
  }
});

test("intake varies — nobody eats their macros to the gram", () => {
  const logs = nutritionLogs(TODAY);
  assert.ok(new Set(logs.map((l) => l.macros.carbs)).size > 1, "identical every day");
  assert.ok(new Set(logs.map((l) => l.daily_water_intake_ml)).size > 1, "identical every day");
});

/**
 * The row this replaces was 90km in 60 minutes at a 40-second kilometre — a
 * test fixture, and the only training data the account had.
 */
test("no session is physically impossible", () => {
  const logs = trainingLogs(TODAY);
  assert.ok(logs.length >= 8, `${logs.length} sessions in a fortnight is not a training athlete`);
  for (const log of logs) {
    assert.ok(log.total_minutes >= 20 && log.total_minutes <= 150, `${log.total_minutes} minutes`);
    assert.ok(log.intensity >= 1 && log.intensity <= 10, `intensity ${log.intensity}`);
    assert.ok(log.notes.trim().length > 0, "a session with no name films as a blank row");
  }
  // Rest days exist. Fourteen days of training is a demo, not an athlete.
  assert.ok(logs.length < DAYS, "trained every single day for a fortnight");
});

test("the profile is complete enough to unlock targets", () => {
  for (const key of ["height_cm", "birth_year", "sex", "activity_level"] as const) {
    assert.ok(DEMO_PROFILE[key], `${key} is empty, so the targets card stays on its empty state`);
  }
  assert.ok(["male", "female"].includes(DEMO_PROFILE.sex));
  assert.ok(["sedentary", "moderate", "high", "athlete"].includes(DEMO_PROFILE.activity_level));
  const age = 2026 - DEMO_PROFILE.birth_year;
  assert.ok(age >= 18 && age <= 45, `a ${age}-year-old is not the demo we want`);
});
