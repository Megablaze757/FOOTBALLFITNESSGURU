import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CYCLE_PHASES, CYCLE_PHASE_LABELS, cycleNote } from "./cycle";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE READINESS ENGINE EXISTS TWICE, AND NOTHING MADE THE COPIES AGREE.
 *
 * lib/readiness.ts runs in the browser. supabase/functions/assess-readiness
 * is a Deno rewrite of the same arithmetic, and its own header has said "keep
 * the scoring logic in sync with lib/readiness.ts" since it was written. That
 * sentence was the entire mechanism.
 *
 * Migration 0115 is what made the gap matter. It added three scored answers
 * and changed how the weights divide, so for a while the browser scored a
 * check-in one way and this function scored it another — a number the whole
 * app is built around, differing by which code answered, with nothing
 * anywhere to notice. An athlete would see their readiness move and no part
 * of the product could explain why.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS TEST PROVES, AND WHAT IT DOES NOT.
 *
 * It compares the constants and the structure: the weights, the hard limits,
 * the renormalising divisor, the phase list and the phase notes. That catches
 * the realistic drift, which is somebody tuning a weight in one file.
 *
 * It does NOT execute the Deno copy — `Deno.serve` at module scope cannot be
 * imported here — so it cannot prove the two produce identical scores. Two
 * files can hold the same numbers and still disagree. That is a real limit and
 * worth stating rather than implying otherwise: the honest fix is one shared
 * module, which is a bigger change than 0115, and this guard is what stands in
 * for it until then.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const browser = readFileSync("lib/readiness.ts", "utf8");
const edge = readFileSync("supabase/functions/assess-readiness/index.ts", "utf8");

/** The `name: 0.35,` pairs out of a WEIGHTS object literal. */
function weights(src: string, file: string): Record<string, number> {
  const block = /const WEIGHTS = \{([\s\S]*?)\}/.exec(src);
  assert.ok(block, `${file} has no WEIGHTS object — the scoring was restructured`);
  const found: Record<string, number> = {};
  for (const [, key, value] of block[1].matchAll(/(\w+):\s*([\d.]+)/g)) {
    found[key] = Number(value);
  }
  assert.ok(Object.keys(found).length >= 4, `${file}'s WEIGHTS parsed as empty`);
  return found;
}

test("both copies weigh the same factors by the same amounts", () => {
  assert.deepEqual(
    weights(edge, "the edge function"),
    weights(browser, "lib/readiness.ts"),
    "the browser and the edge function would score the same check-in differently",
  );
});

test("both copies renormalise over the answers present", () => {
  for (const [file, src] of [["lib/readiness.ts", browser], ["the edge function", edge]] as const) {
    // A fixed divisor is the failure this is here to stop: it would re-score
    // every check-in that skipped an optional question.
    assert.match(src, /\/ totalWeight/,
      `${file} no longer divides by the weight of the factors actually present`);
    assert.match(src, /const totalWeight = parts\.reduce/,
      `${file} does not compute its divisor from the parts it used`);
  }
});

test("both copies use the same hard limits", () => {
  for (const limit of ["PAIN_HARD_LIMIT", "SLEEP_HARD_LIMIT", "SLEEP_HOURS_HARD_LIMIT"]) {
    const re = new RegExp(`const ${limit} = (\\d+)`);
    const a = re.exec(browser);
    const b = re.exec(edge);
    assert.ok(a, `lib/readiness.ts has no ${limit}`);
    assert.ok(b, `the edge function has no ${limit}`);
    assert.equal(b[1], a[1], `${limit} differs between the two copies`);
  }
});

test("the short-night limit is applied in both, not just declared", () => {
  for (const [file, src] of [["lib/readiness.ts", browser], ["the edge function", edge]] as const) {
    assert.match(src, /sleepHours != null && sleepHours < SLEEP_HOURS_HARD_LIMIT/,
      `${file} declares the limit without using it`);
  }
});

test("an unanswered question is skipped in both, not scored as a middling one", () => {
  for (const [file, src] of [["lib/readiness.ts", browser], ["the edge function", edge]] as const) {
    assert.match(src, /function numberOrNull/, `${file} has no numberOrNull`);
    assert.match(src, /value === ""\) return null/,
      `${file} would read an empty form field as a number`);
    assert.match(src, /Number\.isFinite\(n\) \? n : null/,
      `${file} would trust an unparseable value`);
    for (const field of ["sleep_hours", "soreness_score", "stress_score"]) {
      assert.match(src, new RegExp(`numberOrNull\\(input\\.${field}\\)`),
        `${file} does not read ${field} through numberOrNull`);
    }
  }
});

test("eight hours is full marks in both", () => {
  for (const [file, src] of [["lib/readiness.ts", browser], ["the edge function", edge]] as const) {
    assert.match(src, /Math\.max\(0, Math\.min\(1, h \/ 8\)\)/,
      `${file} scores hours of sleep on a different curve`);
  }
});

/**
 * THE PHASE NOTES ARE PRODUCT COPY IN TWO PLACES, which is how one of them
 * gets edited. The edge function cannot import lib/cycle.ts — it is Deno, it
 * is deployed on its own — so it carries its own copy of the sentences, and
 * this is the only thing keeping them the same words.
 */
test("the edge function offers exactly the phases lib/cycle.ts defines", () => {
  const list = /const CYCLE_PHASES = \[([^\]]+)\]/.exec(edge);
  assert.ok(list, "the edge function no longer has a phase list");
  const names = [...list[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names, [...CYCLE_PHASES], "the two phase lists have drifted");
});

test("the edge function says the same thing about each phase", () => {
  for (const phase of CYCLE_PHASES) {
    const note = cycleNote(phase)!;
    assert.ok(
      edge.includes(note),
      `the ${phase} note was edited in lib/cycle.ts and not in the edge function.\n` +
      `  lib/cycle.ts: ${note}`,
    );
    // And the label it is built from, so a rename cannot slip through either.
    assert.ok(edge.includes(CYCLE_PHASE_LABELS[phase].note),
      `the ${phase} description differs between the two copies`);
  }
});

test("the phase reaches the advice and nothing else, in both", () => {
  for (const [file, src] of [["lib/readiness.ts", browser], ["the edge function", edge]] as const) {
    assert.match(src, /advice: cycle \? `\$\{advice\} \$\{cycle\}` : advice/,
      `${file} does not append the phase note to the advice`);
    // The one thing it must never touch. `parts` is the scored list; a phase
    // pushed into it would dock somebody's readiness for their cycle.
    assert.doesNotMatch(src, /parts\.push\([^)]*cycle/i,
      `${file} lets the cycle phase into the score`);
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE WORDS, NOT JUST THE NUMBERS — THE HALF THAT HAD ALREADY DRIFTED.
 *
 * The tests above compare weights, limits and curves, and those agreed. The
 * SENTENCES did not, and had not for some time: the edge function said
 * "Skip sprints today — focus on gentle mobility and static stretching around
 * the area" where the browser says "No sprints today — gentle mobility and
 * stretching around it", with three more differing the same way. Nobody wrote
 * two versions deliberately. One was edited; the other was under a header
 * asking whoever did it to remember.
 *
 * So the advice an athlete is given would depend on which copy answered —
 * quietly, because both readings are perfectly sensible English.
 *
 * WHAT IS DELIBERATELY NOT COMPARED. The browser's advice also knows the
 * acute:chronic load ratio, whether they have trained today, and what the
 * watch said. A request to the edge function carries a check-in and nothing
 * else, so those lines have no input there and are absent rather than
 * approximated. Only the branches that exist in both are pinned here, and
 * that is a real limit of this test rather than a gap to be papered over.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Advice lines in lib/readiness.ts that depend only on the check-in. */
const SHARED_ADVICE = [
  "No sprints today — gentle mobility and stretching around it.",
  "Rest and light work only — training hard on that is where injuries come from.",
  "Rest and light work only — heavy training now raises injury risk.",
  "Load is high. Active recovery today — stretching, mobility, hydration.",
  "moderate intensity, warm up properly.",
  "Fatigue is up. A moderate session is fine — no maximal efforts.",
  "Moderately ready. Train as planned, ease off if anything flares up.",
  "You're well recovered and ready to go. Good day for a higher-intensity session.",
  "Train light and move — mobility and easy work beat sitting still.",
];

test("the sentences in this list are really in the browser copy", () => {
  // Checked first. A list that had drifted from lib/readiness.ts would compare
  // two files against a third thing neither of them says, and pass only by
  // failing to be about anything.
  for (const line of SHARED_ADVICE) {
    assert.ok(browser.includes(line),
      `lib/readiness.ts no longer says "${line}" — update this list with its new wording`);
  }
});

test("both copies give the same advice, word for word", () => {
  for (const line of SHARED_ADVICE) {
    assert.ok(edge.includes(line),
      `the edge function would tell an athlete something different here.\n` +
      `  lib/readiness.ts: "${line}"`);
  }
});

test("the soreness line is gated the same way in both", () => {
  // It yields to a Red verdict, a named painful joint and systemic fatigue —
  // three conditions, and dropping any one of them in one copy would change
  // which athletes hear it.
  for (const [file, src] of [["lib/readiness.ts", browser], ["the edge function", edge]] as const) {
    assert.match(src, /soreness >= SORENESS_SPEAK_UP/, `${file} does not gate the soreness line`);
    assert.match(src, /status !== "Red" && fatigue < 7 && !\(focus && pain\.value > 0\)/,
      `${file} gates the soreness line differently, so different athletes hear it`);
  }
  const limit = /const SORENESS_SPEAK_UP = (\d+)/;
  assert.equal(limit.exec(edge)?.[1], limit.exec(browser)?.[1],
    "the two copies speak up about soreness at different thresholds");
});
