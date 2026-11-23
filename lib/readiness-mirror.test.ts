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
