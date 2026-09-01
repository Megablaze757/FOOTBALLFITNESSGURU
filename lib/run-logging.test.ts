import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SPORTS } from "./exercises";
import { RUN_TYPES, RUN_BANDS, runBands, runPace } from "./running";
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

const source = readFileSync(new URL("../components/TrainingLogInput.tsx", import.meta.url), "utf8");

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COMMENTS STRIPPED, BECAUSE ONE MADE A FAILING TEST PASS.
 *
 * The copy below changed from "Did you run?" to "Did you run today?", and the
 * assertion for the old string kept passing — because the comment explaining
 * the change QUOTED the old string. A source-scanning test that reads its own
 * rationale is not testing the component, and it fails in the direction that
 * hides work rather than the direction that shouts.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const form = source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");

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
  assert.match(form, /Did you run today\?/, "the other sports lost their way into the run fields");
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

// --- "no this wasn't a run" was confusing --------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A YES/NO QUESTION WAS A SIXTEEN-ITEM DROPDOWN.
 *
 * Reported as: the run bit on check-in is confusing, "No — this wasn't a run"
 * especially. Two separate faults sat behind that one sentence.
 *
 * The copy argued with you. An untouched field asserting "No — this wasn't a
 * run" reads as the form contradicting something, and "this" never had an
 * antecedent — this session, this day, this check-in?
 *
 * And the shape was wrong. Saying the overwhelmingly common answer meant
 * opening a list of every run type written in runners' vocabulary — Fartlek,
 * Cruise intervals, Shakeout — at a footballer who did not run.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the common answer is the cheapest thing on screen to give", () => {
  assert.ok(!/No — this wasn/.test(form),
    "the form is asserting 'No — this wasn't a run' at somebody who has not answered");
  assert.match(form, /Did you run today\?/, "the question is gone");
  assert.match(form, /aria-pressed=\{ranToday === yes\}/,
    "the answer is not a pair of buttons with a pressed state");

  // The types must be behind the yes, not in front of it. Measured
  // within the non-runner block specifically: the runner's own form shows the
  // same picker unconditionally, and should.
  const question = form.indexOf("Did you run today?");
  const yesGate = form.indexOf("{ranToday && (", question);
  const picker = form.indexOf("<RunTypeOptions />", question);
  assert.ok(question > 0 && yesGate > question, "the yes/no gate is gone");
  assert.ok(picker > yesGate, "the run type picker is rendered outside the yes branch");
});

/**
 * A flat list of every type is fine for a runner, who knows what a Fartlek is.
 * fine for the footballer this control is mostly shown to, whose honest answer
 * is nearly always in the first group.
 */
test("the run types are grouped by effort, off the data rather than by hand", () => {
  assert.match(form, /<optgroup key=\{band\.label\} label=\{band\.label\}>/,
    "the types are an ungrouped flat list again");
  assert.match(form, /runBands\(\)\.map/,
    "the picker builds its own grouping again instead of using the one beside the data");

  // The real thing: every type reaches the picker, exactly once. Tested through
  // runBands() rather than against a copy of the bands — a test holding its own
  // duplicate of the data under test is asserting a constant.
  const listed = runBands().flatMap((b) => b.types);
  assert.equal(listed.length, RUN_TYPES.length,
    "a run type is missing from the picker, or is in it twice");
  assert.deepEqual(
    [...listed.map((t) => t.id)].sort(),
    [...RUN_TYPES.map((t) => t.id)].sort(),
    "the picker does not offer the same set of types the app defines");

  for (const band of runBands()) {
    assert.ok(band.types.length > 0, `the "${band.label}" group is empty`);
    assert.ok(band.label.length > 0, "a group has no heading");
  }

  // Easy is where a non-runner almost always lands, so it must not be empty
  // or buried.
  assert.equal(runBands()[0].label, "Easy", "the easiest group is no longer first");
});

/** A zone no band covers must surface, not vanish from a complete-looking select. */
test("a run type in an uncovered zone is still offered", () => {
  const covered = new Set(RUN_BANDS.flatMap((b) => b.zones));
  const uncovered = RUN_TYPES.filter((t) => !covered.has(t.primaryZone));
  assert.deepEqual(uncovered, [], "some run type is only reachable via the Other fallback");

  assert.ok(!runBands().some((b) => b.label === "Other"),
    "a type has fallen out of every band — check RUN_BANDS against primaryZone");

  // And the rescue itself works, proven by taking a band away rather than by
  // reading the code: every type still reaches the picker.
  const missingSteady = runBands([
    { label: "Easy", zones: [1, 2] },
    { label: "Hard", zones: [4, 5] },
  ]);
  const rescued = missingSteady.find((b) => b.label === "Other");
  assert.ok(rescued, "dropping a band silently loses every type that was in it");
  assert.deepEqual(
    rescued.types.map((t) => t.id).sort(),
    RUN_TYPES.filter((t) => t.primaryZone === 3).map((t) => t.id).sort());
  assert.equal(missingSteady.flatMap((b) => b.types).length, RUN_TYPES.length,
    "a run type vanished from a select that still looked complete");
});

test("saying no clears the run rather than hiding it", () => {
  // A collapsed control over a still-set run_type is the worst outcome: the
  // athlete believes they answered no and the row still says they ran.
  assert.match(form, /if \(!yes && value\.run_type != null\) chooseRunType\(null\)/,
    "answering no leaves a logged run behind a collapsed control");
});

test("an existing run opens expanded, however the row arrived", () => {
  // Derived, not seeded once — a useState(!!value.run_type) is correct on mount
  // and wrong for a row loaded afterwards, which would hide a logged run.
  assert.match(form, /const ranToday = saidRan \|\| value\.run_type != null/,
    "a row that already carries a run can open collapsed");
});

/**
 * The guard above this file's `form` constant, tested rather than trusted.
 * It exists because an assertion for "Did you run?" kept passing after the copy
 * changed, matching the comment that explained the change.
 */
test("the source scan cannot be satisfied by a comment", () => {
  assert.ok(/Did you run\?/.test(source),
    "fixture gone: no comment in the component quotes the old copy any more");
  assert.ok(!/Did you run\?[^t]/.test(form.replace(/Did you run today\?/g, "")),
    "comments are reaching the scanned source, so it can pass on its own rationale");
});
