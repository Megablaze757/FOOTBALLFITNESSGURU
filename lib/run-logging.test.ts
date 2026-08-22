import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SPORTS } from "./exercises";
import { RUN_TYPES, runPace } from "./running";
import { averagePaceSeconds } from "./load";
import type { TrainingLog } from "./types";

/**
 * "Can't input the time for a run, so it can't work out my pace."
 *
 * Runners could. The runner fast path has asked for mm:ss and shown a live pace
 * since it was built. Every other sport got a whole-minute "Duration" box three
 * sections above the run fields and no pace anywhere — and the program
 * prescribes easy and recovery runs in all six sports, so a footballer's
 * Tuesday can be a 30-minute Zone 2 run with nowhere to record what it was.
 *
 * A 5k in 27:34 logged as "28" is a pace six seconds per kilometre out, which
 * is the difference between a Zone 2 run and a tempo — so this is not only a
 * missing field, it is a wrong number for the one sport that had the field.
 */

const form = readFileSync(new URL("../components/TrainingLogInput.tsx", import.meta.url), "utf8");

test("the run fields are one set of fields, not two", () => {
  // THE REASON THIS DRIFTED. The runner block and the everyone-else block were
  // written separately and diverged: mm:ss, a live pace and a km/mi toggle grew
  // on one of them and never reached the other. Shared components cannot drift.
  for (const piece of ["RunTime", "PaceLine", "UnitToggle"]) {
    const uses = form.split(`<${piece} `).length - 1;
    assert.ok(uses >= 2, `<${piece}> is used ${uses} time(s) — the two run blocks have diverged again`);
    assert.ok(form.includes(`function ${piece}(`), `${piece} is not defined in this file`);
  }
});

test("a run's time is asked for to the second", () => {
  // Whole minutes are fine for a gym session and useless for a run.
  assert.match(form, /Time \(mm:ss\)/);
  assert.match(form, /aria-label="Run minutes"/);
  assert.match(form, /aria-label="Run seconds"/);
});

test("the two clocks are two boxes, because they are two numbers", () => {
  /**
   * THIS WAS BRIEFLY ONE FIELD, and one field cannot answer both questions.
   * Collapsing them looked like the tidy fix — a form should not argue with
   * itself — but a footballer's Tuesday is a 90-minute session with a
   * 20-minute run inside it, and the app was recording one of those and
   * quoting a pace from it.
   *
   * So: session length in whole minutes, always there, because load has never
   * needed the seconds; the run's own clock in mm:ss beside the distance,
   * because six seconds a kilometre is Zone 2 against a tempo.
   */
  assert.match(form, /Session length \(min\)/);
  assert.match(form, /onChange=\{setSessionMinutes\}/, "the session box writes something other than the session");
  assert.match(form, /run_seconds\?: number \| null;/, "the run's clock is not part of the form's state");
});

test("pace is offered in the unit the athlete is typing in", () => {
  // Being handed km/h after entering miles is how a good number becomes noise.
  assert.match(form, /unit === "mi" \? "mph" : "km\/h"/);
  assert.match(form, /1\.609344/, "miles are not converted for the pace line");
});

test("every sport that can be prescribed a run can log one", () => {
  // The fields are gated on `sport !== "running"` and `value.run_type`, not on
  // a list of sports — so this holds for a sport added tomorrow too. The check
  // that matters is that nothing gates them on being a runner.
  assert.ok(SPORTS.length >= 5);
  assert.ok(RUN_TYPES.length > 0);
  assert.match(form, /Did you run\?/, "the other sports lost their way into the run fields");
  assert.ok(!/sport === "running" && <PaceLine/.test(form), "pace is back behind a runners-only gate");
});

test("the saved row carries the seconds, not the rounded minutes", () => {
  // pace_seconds_per_km is computed at save time from duration_seconds. If the
  // form only ever wrote total_minutes, every pace in the app would be rounded
  // to the nearest minute before anybody saw it.
  const journal = readFileSync(new URL("../components/JournalForm.tsx", import.meta.url), "utf8");
  assert.match(journal, /pace_seconds_per_km: runPace\(/);
  assert.match(journal, /duration_seconds: trainingForSave\.duration_seconds/);
  assert.match(journal, /run_seconds: trainingForSave\.run_seconds/);
});

// --- the run's clock is not the session's -------------------------------------

/**
 * "Only shows session duration, not run duration separately."
 *
 * A footballer's Tuesday is a 90-minute session with a 20-minute run inside it.
 * The app had one time field, so pace came out of the session — 4:30/km logged
 * as 20:00/km, which is not a rounding error, it is a different sport. Runners
 * were the exception that hid it: for them the run IS the session.
 */

test("pace comes from one formula, wherever it is worked out", () => {
  // It was written three times: the live pace on the check-in, the
  // pace_seconds_per_km the save wrote, and the weekly average on Progress.
  // Two of the three read the session duration.
  assert.equal(runPace(5, 27 * 60 + 34)?.secondsPerKm, 331);
  assert.equal(runPace(10, 3000)?.kmh, 12);
  assert.equal(runPace(0, 3000), null, "a session with no distance is not a run");
  assert.equal(runPace(5, 0), null, "a run with no time has no pace");
  assert.equal(runPace(null, 1800), null);
  assert.equal(runPace(5, undefined), null);

  assert.match(form, /runPace\(/, "the check-in draws its own pace again");
  const journal = readFileSync(new URL("../components/JournalForm.tsx", import.meta.url), "utf8");
  assert.match(journal, /pace_seconds_per_km: runPace\(/, "the save computes its own pace again");
  assert.match(journal, /avg_speed_kmh: runPace\(/);
});

test("the saved pace is the run's, not the session's", () => {
  const journal = readFileSync(new URL("../components/JournalForm.tsx", import.meta.url), "utf8");
  assert.match(journal, /const runTime = trainingForSave\.run_seconds \?\? trainingForSave\.duration_seconds/,
    "pace is computed from the session duration again");
  assert.match(journal, /run_seconds: trainingForSave\.run_seconds/, "the run's own clock is not saved");
});

test("a week's average pace prefers the run's clock", () => {
  // A 5k inside a 90-minute session, and the same 5k logged on its own. Read
  // off the session, the first is 18:00/km.
  const inSession = { distance_km: 5, duration_seconds: 5400, run_seconds: 1500 } as TrainingLog;
  assert.equal(averagePaceSeconds([inSession]), 300);
  // Written before the two were told apart: the session is all there is, and
  // for a runner that was always the right reading.
  const legacy = { distance_km: 5, duration_seconds: 1500 } as TrainingLog;
  assert.equal(averagePaceSeconds([legacy]), 300);
});

test("both times are asked for, and only one of them in seconds", () => {
  // Session length drives training load and has never needed the seconds.
  // Six seconds a kilometre is the difference between Zone 2 and a tempo.
  assert.match(form, /Session length \(min\)/);
  assert.match(form, /Time \(mm:ss\)/);
  assert.match(form, /setRunPart/, "the run clock writes the session duration again");
  assert.ok(!/{!value\.run_type && <label className="block">\s*<span className="field-label">Session length/.test(form),
    "the session box hides itself when there is a run, so only one time can be recorded");
});

test("for a runner, the run is the session", () => {
  // Writing only run_seconds for them would leave the session duration blank
  // and take their training load with it.
  //
  // Matched on the branch rather than on its distance from `sport ===
  // "running"`: the runner path grew a second case when a day was allowed to
  // hold more than one session, and the claim being made here is about what a
  // lone run writes, not about how many lines away it is written.
  const runPart = form.slice(form.indexOf("const setRunPart"), form.indexOf("const setSessionMinutes"));
  const lone = runPart.slice(runPart.indexOf("if (!value.drills.some(isActivityDrill))"));
  assert.match(lone, /duration_seconds: run/);
  assert.match(lone, /total_minutes: run \? Math\.round\(run \/ 60\) : null/);
  assert.match(runPart, /if \(sport !== "running"\) \{[\s\S]{0,120}run_seconds: run \}\);/,
    "a non-runner's session length now follows their run clock");
});
