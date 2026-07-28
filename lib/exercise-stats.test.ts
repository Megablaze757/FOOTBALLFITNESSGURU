import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exerciseKey, estimate1RM, exerciseOptions, exerciseSeries, exerciseProgress,
  metricsFor, valueAt, MAX_REPS_FOR_1RM,
} from "./exercise-stats";
import type { TrainingDrill, TrainingLog } from "./types";

const log = (log_date: string, drills: Partial<TrainingDrill>[]): TrainingLog => ({
  id: log_date, user_id: "u", log_date, total_minutes: 60, intensity: 7, created_at: log_date,
  drills: drills.map((d) => ({ name: "Back Squat", sets: 3, reps: 5, load_kg: null, ...d })) as TrainingDrill[],
});

// --- naming ------------------------------------------------------------------

test("the same lift spelled differently is one exercise", () => {
  assert.equal(exerciseKey("Back Squat"), exerciseKey("back  squat "));
  const logs = [
    log("2026-01-01", [{ name: "Back Squat" }]),
    log("2026-01-03", [{ name: "back squat" }]),
    log("2026-01-05", [{ name: "BACK  SQUAT" }]),
  ];
  const opts = exerciseOptions(logs);
  assert.equal(opts.length, 1);
  assert.equal(opts[0].sessions, 3);
});

test("it's labelled the way the athlete usually writes it", () => {
  const logs = [
    log("2026-01-01", [{ name: "bench press" }]),
    log("2026-01-02", [{ name: "Bench Press" }]),
    log("2026-01-03", [{ name: "Bench Press" }]),
  ];
  assert.equal(exerciseOptions(logs)[0].name, "Bench Press");
});

test("unnamed drills are not offered as an exercise", () => {
  const logs = [log("2026-01-01", [{ name: "  " }, { name: "Deadlift" }])];
  assert.deepEqual(exerciseOptions(logs).map((o) => o.name), ["Deadlift"]);
});

test("options lead with the most-trained lift", () => {
  const logs = [
    log("2026-01-01", [{ name: "Squat" }, { name: "Curl" }]),
    log("2026-01-02", [{ name: "Squat" }]),
    log("2026-01-03", [{ name: "Squat" }]),
  ];
  assert.deepEqual(exerciseOptions(logs).map((o) => o.name), ["Squat", "Curl"]);
});

test("a lift done twice in one session is still one session", () => {
  const logs = [log("2026-01-01", [{ name: "Squat" }, { name: "Squat" }])];
  assert.equal(exerciseOptions(logs)[0].sessions, 1);
});

// --- one-rep max -------------------------------------------------------------

test("Epley, and only where Epley holds", () => {
  assert.equal(estimate1RM(100, 1), 100);
  assert.equal(estimate1RM(100, 5), 117); // 100 * (1 + 5/30)
  assert.equal(estimate1RM(100, MAX_REPS_FOR_1RM + 1), null, "shouldn't guess from high reps");
  assert.equal(estimate1RM(0, 5), null, "bodyweight work has no 1RM to estimate");
  assert.equal(estimate1RM(100, 0), null);
});

test("the best set of the day sets the day's estimate", () => {
  // A heavy triple beats a light ten, even though the ten is more reps.
  const logs = [log("2026-01-01", [
    { name: "Squat", sets: 1, reps: 10, load_kg: 80 },
    { name: "Squat", sets: 1, reps: 3, load_kg: 120 },
  ])];
  const [p] = exerciseSeries(logs, "Squat");
  assert.equal(p.e1rm, estimate1RM(120, 3));
  assert.equal(p.topLoad, 120);
});

// --- series ------------------------------------------------------------------

test("a day's sets are summed and the days come back in order", () => {
  const logs = [
    log("2026-02-03", [{ name: "Squat", sets: 3, reps: 5, load_kg: 100 }]),
    log("2026-01-06", [
      { name: "Squat", sets: 2, reps: 5, load_kg: 90 },
      { name: "Squat", sets: 3, reps: 5, load_kg: 90 },
    ]),
  ];
  const s = exerciseSeries(logs, "Squat");
  assert.deepEqual(s.map((p) => p.date), ["2026-01-06", "2026-02-03"]);
  assert.equal(s[0].sets, 5);
  assert.equal(s[0].reps, 25);
  assert.equal(s[0].tonnage, 25 * 90);
});

test("loadless work still tracks reps, and offers only that metric", () => {
  const logs = [log("2026-01-01", [{ name: "Press-ups", sets: 4, reps: 20, load_kg: null }])];
  const [p] = exerciseSeries(logs, "Press-ups");
  assert.equal(p.reps, 80);
  assert.equal(p.tonnage, null);
  assert.equal(p.e1rm, null);
  assert.deepEqual(metricsFor(false).map((m) => m.id), ["reps"]);
  assert.deepEqual(metricsFor(true).map((m) => m.id), ["e1rm", "tonnage", "reps"]);
  assert.equal(valueAt(p, "reps"), 80);
  assert.equal(valueAt(p, "e1rm"), null);
});

test("other exercises don't leak into the series", () => {
  const logs = [log("2026-01-01", [
    { name: "Squat", sets: 3, reps: 5, load_kg: 100 },
    { name: "Deadlift", sets: 3, reps: 5, load_kg: 140 },
  ])];
  assert.equal(exerciseSeries(logs, "Squat")[0].topLoad, 100);
});

test("junk in the log doesn't produce junk in the chart", () => {
  const logs = [log("2026-01-01", [
    { name: "Squat", sets: NaN as unknown as number, reps: 5, load_kg: 100 },
    { name: "Squat", sets: 3, reps: -5, load_kg: 100 },
  ])];
  const [p] = exerciseSeries(logs, "Squat");
  assert.equal(p.reps, 0);
  assert.ok(p.tonnage === null || p.tonnage === 0);
});

// --- progress ----------------------------------------------------------------

const climbing = [90, 95, 100, 105, 110, 115].map((kg, i) =>
  log(`2026-01-0${i + 1}`, [{ name: "Squat", sets: 3, reps: 5, load_kg: kg }])
);

test("a lift going up reads as improving, with the PR and the percentage", () => {
  const p = exerciseProgress(climbing, "Squat", "e1rm");
  assert.equal(p.direction, "improving");
  assert.ok(p.changePct! > 5);
  assert.equal(p.best!.value, estimate1RM(115, 5));
  assert.equal(p.best!.date, "2026-01-06");
  assert.equal(p.hasLoad, true);
});

test("a lift going down reads as declining", () => {
  const p = exerciseProgress([...climbing].reverse().map((l, i) => ({
    ...l, log_date: `2026-01-0${i + 1}`,
  })), "Squat", "e1rm");
  assert.equal(p.direction, "declining");
  assert.ok(p.changePct! < -5);
});

test("holding steady is not called progress", () => {
  const flat = [0, 1, 2, 3, 4, 5].map((i) =>
    log(`2026-01-0${i + 1}`, [{ name: "Squat", sets: 3, reps: 5, load_kg: 100 }])
  );
  const p = exerciseProgress(flat, "Squat", "e1rm");
  assert.equal(p.direction, "stable");
  assert.equal(p.changePct, 0);
});

test("too few sessions to call it — so it doesn't", () => {
  const p = exerciseProgress(climbing.slice(0, 2), "Squat", "e1rm");
  assert.equal(p.changePct, null);
  assert.equal(p.direction, "stable");
});

test("an exercise with no history comes back empty rather than throwing", () => {
  const p = exerciseProgress(climbing, "Nothing I've Ever Done");
  assert.deepEqual(p.points, []);
  assert.equal(p.best, null);
  assert.equal(p.changePct, null);
  assert.equal(p.name, "Nothing I've Ever Done");
});

test("a log with no drills array at all is survivable", () => {
  const broken = [{ ...log("2026-01-01", []), drills: null as unknown as TrainingDrill[] }];
  assert.deepEqual(exerciseOptions(broken), []);
  assert.deepEqual(exerciseSeries(broken, "Squat"), []);
});
