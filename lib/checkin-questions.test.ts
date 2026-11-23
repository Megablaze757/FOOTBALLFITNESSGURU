import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessReadiness } from "./readiness";
import { CYCLE_PHASES, CYCLE_PHASE_LABELS, cycleNote, isCyclePhase, shouldOfferCycle } from "./cycle";
import type { CheckInInput } from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FOUR ANSWERS MIGRATION 0115 ADDED, AND THE ONE PROMISE THAT MATTERS
 * MOST: NOBODY'S SCORE MOVES UNTIL THEY ANSWER SOMETHING.
 *
 * Only hours-of-sleep is in the check-in's quick mode. Stress, soreness and
 * cycle are in the full form, so most rows — and every row already in the
 * database — have them null. If a missing answer counted as a bad one, or a
 * default made "not asked" look like "answered 5", this change would silently
 * re-score the app's entire history.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** A check-in exactly as it looked before 0115: none of the new fields set. */
const before = (over: Partial<CheckInInput> = {}): CheckInInput => ({
  pain_map: {},
  fatigue_score: 4,
  sleep_quality: 8,
  nutrition_quality: 6,
  weight_kg: null,
  is_match_day: false,
  match_minutes_played: 0,
  ...over,
});

test("a check-in with none of the new answers scores what it always did", () => {
  /**
   * HAND-COMPUTED, not snapshotted from the implementation — a snapshot would
   * record whatever the code does today, including a mistake.
   *
   *   painGood      = 1 - 0/10      = 1
   *   sleepGood     = (8 - 1) / 9   = 0.7777...
   *   fatigueGood   = (10 - 4) / 9  = 0.6666...
   *   nutritionGood = (6 - 1) / 9   = 0.5555...
   *
   *   0.35(1) + 0.30(0.7778) + 0.25(0.6667) + 0.10(0.5556)
   *     = 0.35 + 0.233333 + 0.166667 + 0.055556 = 0.805556  -> 81
   */
  assert.equal(assessReadiness(before()).score, 81);
});

test("every new field set to null is the same as the field not being there", () => {
  const bare = assessReadiness(before());
  const explicitNulls = assessReadiness(before({
    sleep_hours: null, stress_score: null, soreness_score: null, cycle_phase: null,
  }));
  assert.deepEqual(explicitNulls, bare,
    "an explicit null is being treated differently from an absent field");
});

/**
 * The shape a browser actually sends. An empty number input is "", and
 * `Number("")` is 0 — which would read as nought hours' sleep and force Red.
 */
test("an empty string from a form field is not an answer", () => {
  const bare = assessReadiness(before());
  const empty = assessReadiness(before({
    sleep_hours: "" as never, stress_score: "" as never, soreness_score: "" as never,
  }));
  assert.equal(empty.score, bare.score, "an empty form field was scored as zero");
  assert.equal(empty.status, bare.status);
});

/** NaN comparisons are all false, so a corrupt value would skip the hard limit. */
test("an unparseable value is ignored rather than trusted", () => {
  const bare = assessReadiness(before());
  const junk = assessReadiness(before({ sleep_hours: "not a number" as never }));
  assert.equal(junk.score, bare.score);
  assert.equal(junk.status, bare.status, "a corrupt hours value changed the verdict");
});

// ═══════════════════════════════════════════════════════════════════════════
// EACH NEW ANSWER MOVES THE SCORE IN THE DIRECTION IT SHOULD.
// ═══════════════════════════════════════════════════════════════════════════

test("soreness lowers the score, and more soreness lowers it further", () => {
  const none = assessReadiness(before({ soreness_score: 1 })).score;
  const some = assessReadiness(before({ soreness_score: 5 })).score;
  const lots = assessReadiness(before({ soreness_score: 10 })).score;
  assert.ok(none > some, `1/10 sore (${none}) did not score above 5/10 (${some})`);
  assert.ok(some > lots, `5/10 sore (${some}) did not score above 10/10 (${lots})`);
});

test("stress lowers the score, and more stress lowers it further", () => {
  const calm = assessReadiness(before({ stress_score: 1 })).score;
  const tense = assessReadiness(before({ stress_score: 10 })).score;
  assert.ok(calm > tense, `calm (${calm}) did not score above overwhelmed (${tense})`);
});

/**
 * SORENESS IS NOT FATIGUE. The whole argument for a separate column is that
 * these two want opposite sessions, so they must be separable in the score.
 */
test("soreness and fatigue are read as different things", () => {
  const soreNotTired = assessReadiness(before({ fatigue_score: 2, soreness_score: 9 }));
  const tiredNotSore = assessReadiness(before({ fatigue_score: 9, soreness_score: 2 }));
  assert.notEqual(soreNotTired.score, tiredNotSore.score,
    "sore-but-fresh and wrecked-but-not-sore score the same, so the split bought nothing");
});

// ═══════════════════════════════════════════════════════════════════════════
// HOURS OF SLEEP: A FACTOR, AND A HARD LIMIT.
// ═══════════════════════════════════════════════════════════════════════════

test("more sleep scores higher, up to a point", () => {
  const five = assessReadiness(before({ sleep_hours: 5 })).score;
  const eight = assessReadiness(before({ sleep_hours: 8 })).score;
  assert.ok(eight > five, `eight hours (${eight}) did not beat five (${five})`);

  // Oversleeping is not better than sleeping well. Eight is full marks.
  assert.equal(
    assessReadiness(before({ sleep_hours: 12 })).score,
    eight,
    "twelve hours scored above eight, which rewards oversleeping",
  );
});

/**
 * The biometric comment in readiness.ts already names this case — "no amount
 * of good HRV outranks a knee at 8/10 or three hours' sleep" — and until 0115
 * the app had no way to know about the three hours. Sleep QUALITY was the only
 * sleep signal, and four uninterrupted hours can honestly be rated 8/10.
 */
test("a very short night forces Red however good everything else is", () => {
  const perfect = before({ sleep_quality: 10, fatigue_score: 1, nutrition_quality: 10 });
  assert.equal(assessReadiness(perfect).status, "Green", "the control is not green");
  assert.equal(assessReadiness({ ...perfect, sleep_hours: 3 }).status, "Red",
    "three hours' sleep did not force Red");
  assert.equal(assessReadiness({ ...perfect, sleep_hours: 3.5 }).status, "Red");
});

test("the limit is below four hours, not at it", () => {
  const perfect = before({ sleep_quality: 10, fatigue_score: 1, nutrition_quality: 10 });
  assert.notEqual(assessReadiness({ ...perfect, sleep_hours: 4 }).status, "Red",
    "exactly four hours is being forced Red — the boundary is the wrong side");
});

test("zero hours is an answer, and the worst one", () => {
  // Distinct from null: somebody who did not sleep has told you something.
  assert.equal(assessReadiness(before({ sleep_hours: 0 })).status, "Red");
});

// ═══════════════════════════════════════════════════════════════════════════
// THE CYCLE PHASE, WHICH MUST NOT TOUCH THE NUMBER.
// ═══════════════════════════════════════════════════════════════════════════

test("the cycle phase changes the advice and never the score", () => {
  const bare = assessReadiness(before());
  for (const phase of CYCLE_PHASES) {
    const withPhase = assessReadiness(before({ cycle_phase: phase }));
    assert.equal(withPhase.score, bare.score,
      `logging the ${phase} phase moved the score from ${bare.score} to ${withPhase.score}`);
    assert.equal(withPhase.status, bare.status, `logging ${phase} changed the band`);
    assert.notEqual(withPhase.advice, bare.advice, `logging ${phase} added nothing to the advice`);
    assert.ok(withPhase.advice.startsWith(bare.advice),
      "the phase replaced the advice instead of being added to it");
  }
});

test("an unrecognised phase is ignored rather than printed", () => {
  const bare = assessReadiness(before());
  const nonsense = assessReadiness(before({ cycle_phase: "whatever" }));
  assert.equal(nonsense.advice, bare.advice, "a value the database would refuse was shown to the athlete");
});

test("the advice never tells somebody to do less because of a phase", () => {
  for (const phase of CYCLE_PHASES) {
    const note = cycleNote(phase)!;
    assert.ok(note, `${phase} has no note`);
    // The rest of the advice says to rest when the numbers say so. A phase is
    // not a number, and this must not quietly become a second verdict.
    for (const instruction of ["rest today", "do not train", "don't train", "skip"]) {
      assert.ok(!note.toLowerCase().includes(instruction),
        `the ${phase} note instructs rather than informs: "${note}"`);
    }
    assert.match(note, /often|many|some/i,
      `the ${phase} note states a certainty about how they feel: "${note}"`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// WHO IS ASKED.
// ═══════════════════════════════════════════════════════════════════════════

test("the question is offered on a female profile and not guessed at otherwise", () => {
  assert.equal(shouldOfferCycle("female"), true);
  assert.equal(shouldOfferCycle("male"), false);
  // Not recorded is a no. Inferring it from a name, sport or position would be
  // worse than leaving the question out.
  assert.equal(shouldOfferCycle(null), false);
  assert.equal(shouldOfferCycle(undefined), false);
  assert.equal(shouldOfferCycle(""), false);
});

test("every phase has a label and a note", () => {
  for (const phase of CYCLE_PHASES) {
    const entry = CYCLE_PHASE_LABELS[phase];
    assert.ok(entry?.label, `${phase} has no label`);
    assert.ok(entry.note.length > 20, `${phase}'s note is too short to be useful`);
  }
  assert.equal(Object.keys(CYCLE_PHASE_LABELS).length, CYCLE_PHASES.length,
    "there is a label for a phase that does not exist, or a phase with no label");
});

test("only the four phases are accepted", () => {
  for (const phase of CYCLE_PHASES) assert.equal(isCyclePhase(phase), true);
  for (const nope of ["", "Period", "menstrual", null, undefined, 3, {}]) {
    assert.equal(isCyclePhase(nope), false, `${String(nope)} was accepted as a phase`);
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE MIGRATION AND THIS FILE HAVE TO AGREE, AND NOTHING ELSE MAKES THEM.
 *
 * A phase the UI can send and the database refuses is an error the athlete
 * sees at the moment they press save. Same arrangement lib/win-back.ts has
 * with migration 0114.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const migration = readFileSync("supabase/migrations/0115_checkin_sleep_stress_soreness_cycle.sql", "utf8");

test("the database accepts exactly the phases this file defines", () => {
  const constraint = /cycle_phase = any \(array\[([^\]]+)\]\)/.exec(migration);
  assert.ok(constraint, "0115 no longer constrains cycle_phase to a list");
  const allowed = [...constraint[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...allowed].sort(), [...CYCLE_PHASES].sort(),
    "the phases the database allows and the ones the UI offers have drifted");
});

test("the new columns are nullable with no default", () => {
  for (const column of ["sleep_hours", "stress_score", "soreness_score", "cycle_phase"]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}\\b`),
      `0115 does not add ${column}`);
    // A default would turn "not asked" into an answer, which is the one thing
    // the renormalising weights above cannot survive.
    assert.doesNotMatch(migration, new RegExp(`add column if not exists ${column}[^,;]*default`),
      `${column} has a default, so "not asked" would score as an answer`);
    assert.doesNotMatch(migration, new RegExp(`add column if not exists ${column}[^,;]*not null`),
      `${column} is NOT NULL, which the quick check-in cannot satisfy`);
  }
});

test("the scores are bounded where the UI bounds them", () => {
  assert.match(migration, /stress_score between 1 and 10/);
  assert.match(migration, /soreness_score between 1 and 10/);
  assert.match(migration, /sleep_hours >= 0 and sleep_hours <= 24/);
});
