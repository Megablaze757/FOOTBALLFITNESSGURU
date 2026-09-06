import { test } from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, isRunEntry, getExerciseByName, exerciseProgression, progressionForName } from "./exercises";
import { BANNED_CLAIMS, draftProblems, needsDraft } from "./exercise-draft";

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
  // Static holds are time, regardless of a bench/band appearing in equipment.
  assert.equal(exerciseProgression(getExerciseByName("Plank")!), "time");
  assert.equal(exerciseProgression(getExerciseByName("Copenhagen plank")!), "time");
  assert.equal(exerciseProgression(getExerciseByName("Spanish squat iso-hold")!), "time");
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

// ═══════════════════════════════════════════════════════════════════════════
// EVERY MOVEMENT TEACHES, NOT JUST LISTS.
//
// 197 of these shipped with no cues and a `why` generated from the muscle
// name — 43 said "Builds the legs." verbatim. They are all written now, in
// COACHING in lib/exercise-catalog.ts.
// ═══════════════════════════════════════════════════════════════════════════

test("no movement is left listing itself without teaching it", () => {
  const short = EXERCISES.filter((e) => !isRunEntry(e) && needsDraft(e));
  assert.deepEqual(short.map((e) => e.name), [],
    `${short.length} movements have no cues or a placeholder why`);
});

/**
 * THE ONE WITH NO EXCEPTIONS.
 *
 * This ran only over fresh drafts, never over the catalogue, so three claims
 * the app says it will not make were live on the site: "Bulletproofs the
 * hamstring", "Bulletproofs the shoulders", "the basis of injury-proof trunk
 * control". Nothing was wrong with the rule — it was pointed at the wrong
 * half of the data.
 *
 * Wider than draftProblems on purpose: every row, including the runs and the
 * short ones. Whether a sentence is a promise about injuries has nothing to do
 * with how long its description is.
 */
test("no movement promises to prevent an injury", () => {
  const claims: string[] = [];
  for (const e of EXERCISES) {
    for (const text of [e.why ?? "", ...(e.cues ?? [])]) {
      if (BANNED_CLAIMS.some((p) => p.test(text))) claims.push(`${e.name}: "${text}"`);
    }
  }
  assert.deepEqual(claims, [], `${claims.length} movements make a claim this app will not make`);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE VOCABULARY RULE, AND THE DEBT IT INHERITED.
 *
 * draftProblems refuses a cue that names a body part or a piece of kit the
 * movement's own description never mentions. That is what stops "keep the bar
 * tight to your back" appearing on a leg press, and every one of the 173 cues
 * written for this release passes it.
 *
 * These 41 predate the rule. They are not wrong — "Squeeze the shoulder
 * blades" is correct coaching for a bent-over row; it fails only because that
 * row's description happens never to write the word "shoulder". Rewriting
 * correct content to satisfy a test is the trap this file already warns about
 * further up, so they are listed rather than edited.
 *
 * The list may only ever SHRINK, and the second assertion enforces that: a
 * name that starts passing must come off it. Otherwise an entry could be
 * fixed, silently keep its exemption, and cover a new fault later.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const CUES_PREDATING_THE_VALIDATOR = new Set([
"Nordic hamstring curl",
    "Spanish squat iso-hold",
    "Rowing intervals",
    "Swim intervals",
    "Hill sprints",
    "World's greatest stretch",
    "Thoracic spine openers",
    "Eccentric calf raises",
    "Single-leg balance progression",
    "Band external rotation",
    "Wobble board balance",
    "Box step up",
    "Shoulder Press",
    "Push Ups",
    "Dumbbell Curl",
    "Sled Leg Press",
    "Bent Over Row",
    "Leg Extension",
    "Tricep Pushdown",
    "Hammer Curl",
    "Crunches",
    "Hack Squat",
    "Bodyweight Squat",
    "Lying Tricep Extension",
    "Close Grip Bench Press",
    "Barbell Shrug",
    "T Bar Row",
    "Lying Leg Curl",
    "Push Press",
    "Decline Bench Press",
    "Dumbbell Lunge",
    "Hanging Leg Raise",
    "Cable Crunch",
    "Dumbbell Front Raise",
    "Barbell Lunge",
    "Russian Twist",
    "Incline Bicep Curl",
    "Rear Delt Fly",
    "Cable Chest Fly",
    "Single Arm Tricep Extension",
    "Skull Crushers",
]);

test("every cue written since the validator existed still passes it", () => {
  const failures: string[] = [];
  const stale: string[] = [];
  for (const e of EXERCISES) {
    if (isRunEntry(e) || !(e.cues?.length) || (e.description ?? "").trim().length < 80) continue;
    const target = {
      id: e.id,
      name: e.name,
      category: e.category,
      equipment: e.equipment,
      muscles: e.muscles,
      description: (e.description ?? "").trim(),
    };
    const problems = draftProblems({ id: e.id, why: e.why ?? "", cues: e.cues ?? [] }, target);
    const exempt = CUES_PREDATING_THE_VALIDATOR.has(e.name);
    if (problems.length && !exempt) failures.push(`${e.name}: ${problems.join("; ")}`);
    if (!problems.length && exempt) stale.push(e.name);
  }
  assert.deepEqual(failures, [], `${failures.length} movements have cues the validator rejects`);
  assert.deepEqual(stale, [],
    `${stale.length} movements pass now and must come off CUES_PREDATING_THE_VALIDATOR`);
});
