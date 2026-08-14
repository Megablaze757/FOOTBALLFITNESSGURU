import { test } from "node:test";
import assert from "node:assert/strict";
import { describeSets, hasSetDetail, setCount, setsOf, topLoad, totalReps, withSets } from "./training-sets";
import { sessionLoad } from "./load";
import type { TrainingDrill } from "./types";

const summary: TrainingDrill = { name: "Back squat", sets: 3, reps: 10, load_kg: 40 };
const detailed: TrainingDrill = {
  name: "Back squat", sets: 3, reps: 10, load_kg: 60,
  sets_detail: [{ reps: 12, load_kg: 40 }, { reps: 10, load_kg: 50 }, { reps: 8, load_kg: 60 }],
};

/**
 * EVERY ROW ALREADY IN THE DATABASE HAS NO DETAIL.
 *
 * Per-set logging is additive, so the old three-number shape has to keep
 * meaning exactly what it meant. If expanding a summary drifted by even one
 * rep, every historical session's volume would change the day this shipped —
 * and volume feeds ACWR, which tells athletes when to back off.
 */
test("a drill with no per-set detail behaves exactly as before", () => {
  assert.equal(setCount(summary), 3);
  assert.equal(totalReps(summary), 30, "3 × 10 must still be 30");
  assert.equal(topLoad(summary), 40);
  assert.deepEqual(setsOf(summary), [
    { reps: 10, load_kg: 40 }, { reps: 10, load_kg: 40 }, { reps: 10, load_kg: 40 },
  ]);
  assert.equal(hasSetDetail(summary), false);
});

test("detail is the truth when it is there", () => {
  assert.equal(setCount(detailed), 3);
  assert.equal(totalReps(detailed), 30, "12 + 10 + 8");
  assert.equal(topLoad(detailed), 60, "the heaviest set, not the average");
  assert.equal(hasSetDetail(detailed), true);
});

/**
 * THE SUMMARY MUST NOT LIE ABOUT THE DETAIL.
 *
 * Anything not yet taught about sets_detail still multiplies sets × reps.
 * Leaving a stale "3 × 10" beside sets of 12, 10 and 8 would have those readers
 * quietly disagreeing with the ones that were updated.
 */
test("writing sets rewrites the summary to match", () => {
  const d = withSets(summary, [{ reps: 12, load_kg: 40 }, { reps: 10, load_kg: 50 }, { reps: 8, load_kg: 60 }]);
  assert.equal(d.sets, 3);
  assert.equal(d.reps, 10, "the rounded average keeps sets × reps closest to the real total");
  assert.equal(d.load_kg, 60, "the summary load is the heaviest set");
  assert.equal(totalReps(d), 30);
});

test("deleting every set means the drill was not done", () => {
  const d = withSets(detailed, []);
  assert.equal(d.sets, 0);
  assert.equal(d.reps, 0);
  assert.equal(d.load_kg, null, "an old load must not survive as though it still applied");
  assert.equal(totalReps(d), 0);
});

/**
 * The number that reaches ACWR. Checked through the real function rather than
 * the helper, because the point is that the pipeline is correct end to end.
 */
test("session load counts the reps actually performed", () => {
  const varied: TrainingDrill = {
    name: "Bench", sets: 3, reps: 8,
    sets_detail: [{ reps: 10 }, { reps: 8 }, { reps: 5 }],
  };
  // 23 real reps. The summary would say 3 × 8 = 24, so anything reading the
  // legacy fields is one rep out — this asserts the pipeline uses the detail.
  // sessionLoad prefers sRPE (minutes × intensity) and only falls through to
  // rep count when there is none — which is the branch per-set logging changes.
  assert.equal(sessionLoad({ drills: [varied] } as never), 23);
  assert.equal(sessionLoad({ drills: [summary] } as never), 30, "summary-only rows are unchanged");
});

/** Rubbish in the JSON column must not produce NaN in a chart. */
test("malformed sets are read as zero, not NaN", () => {
  const junk = {
    name: "x", sets: 2, reps: 5,
    sets_detail: [{ reps: Number.NaN }, { reps: -4 }],
  } as unknown as TrainingDrill;
  assert.equal(totalReps(junk), 0);
  assert.ok(Number.isFinite(totalReps(junk)));
});

/**
 * The line an athlete reads back. Identical sets collapse because "10, 10, 10"
 * is noise; varied ones are spelled out because the variation is the whole
 * reason for logging them apart.
 */
test("the description says what actually happened", () => {
  assert.equal(describeSets(summary), "3 × 10 @ 40kg");
  assert.equal(describeSets({ ...summary, load_kg: null }), "3 × 10");
  assert.equal(describeSets(detailed), "12@40, 10@50, 8@60");
  assert.equal(
    describeSets({ sets: 3, reps: 10, load_kg: 40, sets_detail: [{ reps: 12, load_kg: 40 }, { reps: 10, load_kg: 40 }] }),
    "12, 10 @ 40kg",
    "same load throughout should be stated once, not repeated per set",
  );
  assert.equal(describeSets({ sets: 0, reps: 0 }), "—");
  // 42.5 survives; 40.0 does not become "40.0".
  assert.equal(describeSets({ sets: 1, reps: 5, load_kg: 42.5 }), "1 × 5 @ 42.5kg");
});

// --- the form itself ----------------------------------------------------------

import { readFileSync } from "node:fs";
const INPUT = readFileSync(new URL("../components/TrainingLogInput.tsx", import.meta.url), "utf8");

/**
 * THE FAST PATH MUST STAY THE DEFAULT.
 *
 * Most sets are three of ten at one weight. Making everyone type three rows to
 * say that would fail the bar docs/UI-AUDIT.md sets for anything added to this
 * form — "does it remove work, or does it add it?" — so Sets/Reps/kg stays what
 * you get, and per-set rows are one tap away for the sessions that need them.
 */
test("per-set logging is opt-in, and seeded from what was already typed", () => {
  assert.match(INPUT, /!hasSetDetail\(d\)/,
    "the form no longer branches on whether this drill was logged set by set");
  assert.match(INPUT, /Log each set separately/, "there is no way into per-set logging");
  assert.match(INPUT, /Back to sets × reps/, "there is no way back out");
  // Seeded via setsOf, so 3 × 10 @ 40 becomes three filled rows rather than
  // three empty ones the athlete has to retype.
  assert.match(INPUT, /withSets\(d, setsOf\(d\)\)/,
    "switching to per-set rows starts empty instead of carrying the numbers over");
});

/**
 * Every rule here is one the rest of the app is already held to, and each was
 * caught by measuring the rendered page rather than reading the source: the
 * number fields came out 38px against this codebase's 44px floor, and REPS/KG
 * repeated on all four rows.
 */
test("the set rows meet the playbook the rest of the app follows", () => {
  const block = INPUT.slice(INPUT.indexOf("COLUMN HEADERS ONCE"), INPUT.indexOf("+ Add set"));

  // 44px floor. `field py-1.5` alone renders at 38.
  const fields = block.match(/className="field[^"]*"/g) ?? [];
  assert.ok(fields.length >= 2, "the set rows have no number fields");
  for (const f of fields) {
    assert.match(f, /min-h-\[44px\]/, `a set field is under the 44px tap floor: ${f}`);
  }

  // Dropping the per-row visible label is only acceptable because each input
  // still names itself to assistive tech.
  assert.match(block, /aria-label=\{`Set \$\{si \+ 1\} reps`\}/, "the reps field has no accessible name");
  assert.match(block, /aria-label=\{`Set \$\{si \+ 1\} weight in kilograms`\}/, "the kg field has no accessible name");
  assert.match(INPUT, /aria-label=\{`Remove set \$\{si \+ 1\}`\}/, "the remove button is an unlabelled ✕");

  // Headers appear once, above the rows — not inside the map.
  const rowBody = block.slice(block.indexOf("(d.sets_detail ?? []).map"));
  assert.ok(!/uppercase tracking-wider text-slate-500">\s*Reps/.test(rowBody),
    "REPS is repeated on every row rather than sitting above the column");
});
