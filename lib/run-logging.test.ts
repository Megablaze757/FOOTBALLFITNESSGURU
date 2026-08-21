import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SPORTS } from "./exercises";
import { RUN_TYPES } from "./running";

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

test("there is only ever one box for the session's time", () => {
  // Both a "Duration (min)" box and an mm:ss pair, bound to the same field, on
  // one screen is a form that argues with itself. The minutes box hides once
  // there is a run to time.
  assert.match(form, /\{!value\.run_type && <label className="block">\s*<span className="field-label">Duration \(min\)</,
    "the whole-minute duration box no longer steps aside for a run");
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
  assert.match(journal, /pace_seconds_per_km:[\s\S]{0,200}duration_seconds/);
  assert.match(journal, /duration_seconds: trainingForSave\.duration_seconds/);
});
