import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  effortCheck, effortText, prescribedEffort, rpeOf,
  EFFORT_TOLERANCE, MIN_SESSIONS_FOR_VERDICT,
} from "./effort";
import { buildProgram, type ProgramPlan } from "./coach";

/** A plan whose working drills sit at the given RPEs, plus light work either side. */
function planAt(...rpes: number[]): ProgramPlan {
  return {
    goal: "strength",
    summary: "",
    constraints: [],
    weeks: [{
      week: 1, theme: "", intensity: "", focusNote: "",
      sessions: [{
        day: 1, title: "Day 1", focus: "strength",
        drills: [
          // Light work, which must not drag the figure down.
          { name: "A-skips", sets: 3, reps: 20, cue: "", reason: "", prescription: "", slot: "warmup", rest: 30, intensity: "RPE 3" },
          ...rpes.map((r, i) => ({
            name: `Lift ${i}`, sets: 4, reps: 5, cue: "", reason: "", prescription: "",
            slot: "primary" as const, rest: 150, intensity: `RPE ${r}`,
          })),
          { name: "Stretch", sets: 1, reps: 1, cue: "", reason: "", prescription: "", slot: "cooldown", rest: 0, intensity: "RPE 2" },
        ],
      }],
    }],
  } as unknown as ProgramPlan;
}

test("the prescribed figure comes from working sets, not from warm-ups", () => {
  // A session is mostly light work BY COUNT — mobility, skips, a cool-down — so
  // a mean over every drill reports a hard strength day as easy and would tell
  // somebody grinding at 9 that they should push harder.
  assert.equal(prescribedEffort(planAt(8, 8, 7)), 8);
  assert.equal(prescribedEffort(planAt(7)), 7);
  assert.equal(prescribedEffort(planAt(7, 8)), 7.5, "median of two");
  assert.equal(prescribedEffort(null), null);
  assert.equal(prescribedEffort(planAt()), null, "no working drills means no answer");
});

test("RPE is read out of the string the engine writes", () => {
  assert.equal(rpeOf("RPE 8"), 8);
  assert.equal(rpeOf("RPE 7.5"), 7.5);
  assert.equal(rpeOf("rpe 6"), 6);
  assert.equal(rpeOf("Hard"), null);
  assert.equal(rpeOf(undefined), null);
  assert.equal(rpeOf(""), null);
  // Out of range is not an RPE, whatever it says.
  assert.equal(rpeOf("RPE 0"), null);
  assert.equal(rpeOf("RPE 45"), null);
});

/**
 * THE POINT OF THE WHOLE THING. An athlete reporting 9s against a block written
 * at 7 is being handed the same block every week, and the app already had both
 * numbers.
 */
test("a block that is too hard is called too hard", () => {
  const c = effortCheck([9, 9, 10, 9], planAt(7, 7, 7));
  assert.equal(c.verdict, "too_hard");
  assert.equal(c.prescribed, 7);
  assert.ok(c.gap! >= EFFORT_TOLERANCE);
  assert.match(c.note ?? "", /harder than intended/);
  assert.match(c.note ?? "", /drop a set/);
});

test("a block with room in it says so", () => {
  const c = effortCheck([5, 5, 4], planAt(8, 8));
  assert.equal(c.verdict, "too_easy");
  assert.match(c.note ?? "", /room to push/);
  assert.match(c.note ?? "", /add load .* before adding sessions/);
});

test("a block landing where it was aimed says nothing at all", () => {
  const c = effortCheck([7, 8, 7, 8], planAt(7, 8));
  assert.equal(c.verdict, "on_target");
  assert.equal(c.note, null, "an on-target block should not produce advice");
});

/**
 * Self-reported RPE is noisy — the same session honestly rates 7 one day and 8
 * the next. A tolerance of 1 would flag half of all blocks and the advice would
 * become noise that people learn to ignore.
 */
test("ordinary noise does not trip a verdict", () => {
  for (const reported of [[8, 7, 8], [6, 7, 7], [8, 8, 7, 7]]) {
    assert.equal(effortCheck(reported, planAt(7, 8)).verdict, "on_target",
      `${reported.join(",")} against a 7.5 block should be on target`);
  }
});

test("one brutal Tuesday is not a verdict about a block", () => {
  const c = effortCheck([10, 10], planAt(7));
  assert.equal(c.verdict, "unknown", "two sessions is not enough to redesign a block on");
  assert.equal(c.note, null);
  assert.equal(c.sessions, 2);
  // And the threshold is exactly where it claims to be.
  assert.equal(effortCheck(Array(MIN_SESSIONS_FOR_VERDICT).fill(10), planAt(7)).verdict, "too_hard");
});

test("a session logged without an effort rating is missing, not easy", () => {
  // Counting nulls as zero would drag every average down and report a hard
  // block as too easy — absent is not zero, again.
  const c = effortCheck([9, null, 9, undefined, 9], planAt(7));
  assert.equal(c.sessions, 3, "null ratings were counted as sessions");
  assert.equal(c.avgReported, 9);
  assert.equal(c.verdict, "too_hard");
});

test("nonsense ratings are discarded rather than averaged in", () => {
  const c = effortCheck([9, 0, 9, 99, 9, -4], planAt(7));
  assert.equal(c.sessions, 3);
  assert.equal(c.avgReported, 9);
});

test("no plan, or a plan with no prescribed efforts, is honest about it", () => {
  const c = effortCheck([9, 9, 9], null);
  assert.equal(c.verdict, "unknown");
  assert.equal(c.prescribed, null);
  assert.equal(c.note, null);
});

/**
 * THE OTHER HALF OF THE LOOP, and a bug in its own right.
 *
 * Completing a session from the plan wrote `intensity: title.includes("Rehab")
 * ? 4 : 7` — a hardcoded guess — unconditionally, without reading the existing
 * row's intensity. So an athlete who reported a 9 in their check-in and then
 * ticked the session off had their 9 overwritten with a 7, and the comparison
 * above would have been run against the app's own invention.
 */
test("completing a session never overwrites a reported effort", () => {
  const page = readFileSync(new URL("../app/(app)/coach/page.tsx", import.meta.url), "utf8");
  const noComments = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/const intensity = sess\.s\.title\.includes\("Rehab"\) \? 4 : 7;/.test(noComments),
    "the hardcoded 7 is back, and it clobbers whatever the athlete reported");
  assert.match(noComments, /select\("drills, total_minutes(?:, duration_seconds)?, intensity(?:, session_type, notes)?"\)/,
    "the existing row's intensity is not read, so it cannot be preserved");
  assert.match(noComments, /existing\?\.intensity \?\?/,
    "a reported intensity is no longer preferred over the estimate");
});

// --- Saying what the number means --------------------------------------------

/**
 * "Idiot-proof the whole site / granny-able."
 *
 * Audited over 606 distinct athlete-facing strings from generated blocks. Only
 * one piece of jargon was left with nothing attached to it: RPE. Running zones
 * already carry their meaning inline — "Zone 2 (Easy) — full sentences without
 * gasping" — and reps-in-reserve is plain English already.
 *
 * The codebase had already decided this and applied it to one engine. See
 * drillFrom in lib/hypertrophy.ts: "'RPE 8' is jargon to most people using
 * this". The S&C engine, the preference pass, the template days and the run
 * builder all carried on emitting a bare number.
 */

test("an effort target says what the number means", () => {
  assert.equal(effortText(8), "RPE 8 — 2 reps left in you");
  assert.equal(effortText(9), "RPE 9 — 1 rep left in you");
  assert.equal(effortText(10), "RPE 10 — to failure, nothing left");
  // Below six there are no meaningful "reps left" — it is simply easy, and
  // saying "5 reps left in you" of a warm-up set is a strange thing to read.
  assert.match(effortText(4) ?? "", /easy/);
});

test("a half-point is a range, not a rounding", () => {
  // The engine writes 7.5 precisely because it sits between two rep counts.
  // Rounding it to "3 reps left" states a precision the prescription never had.
  assert.equal(effortText(7.5), "RPE 7.5 — 2–3 reps left in you");
  assert.equal(effortText(8.5), "RPE 8.5 — 1–2 reps left in you");
});

test("the number survives, because the check-in asks for it back", () => {
  // Both, not either. Somebody who knows the scale reads the number instantly,
  // and it is the same scale the athlete is asked to report against.
  for (const n of [5, 6, 7, 7.5, 8, 9, 10]) {
    assert.equal(rpeOf(effortText(n)), n, `effortText(${n}) is not readable back`);
  }
});

test("nothing is invented from nothing", () => {
  assert.equal(effortText(null), undefined);
  assert.equal(effortText(undefined), undefined);
  assert.equal(effortText(Number.NaN), undefined);
});

test("no generated block shows a bare RPE number", () => {
  // THE TEST THAT WOULD HAVE CAUGHT IT. Each engine was individually
  // defensible and four of them emitted `RPE ${n}` with nothing beside it —
  // the S&C engine, the hypertrophy finisher, the preference pass and the run
  // builder. Only walking real output finds that.
  const bare: string[] = [];
  for (const sport of ["football", "gym", "running", "rugby"]) {
    for (const goal of ["strength", "endurance", "speed", "aesthetics"]) {
      const plan = buildProgram({ sport, goal, daysPerWeek: 4 } as any);
      for (const week of plan.weeks) {
        for (const session of week.sessions) {
          for (const drill of session.drills) {
            const text = drill.intensity ?? "";
            if (!/RPE/i.test(text)) continue;
            // An RPE with no words after it is a number the athlete cannot use.
            if (!/—/.test(text)) bare.push(`${sport}/${goal} ${drill.name}: "${text}"`);
          }
        }
      }
    }
  }
  assert.deepEqual(bare.slice(0, 6), [], `${bare.length} drills carry a bare RPE`);
});
