import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ANYTHING THE FORM CAN RESTORE, THE FORM MUST BE ABLE TO CLEAR.
 *
 * components/JournalForm.tsx keeps the check-in in a draft and puts it back
 * when you return. Over that restored entry it offers one button, "Start
 * fresh", whose job is to undo it — and whose own comment states the rule:
 * "Someone who says 'no, start again' must not have the draft re-saved from
 * the state that's still on screen."
 *
 * Those two blocks are hand-written lists of the same fields, in different
 * places, four hundred lines apart. Migration 0115 added four answers to the
 * first and not the second, so hours, stress, soreness and the cycle phase
 * survived "start fresh" and the next autosave wrote them back into the new
 * draft. Nothing typechecked it: both are just sequences of setter calls, and
 * a missing one is valid code that does less.
 *
 * So: every setter the restore calls must also be called by the reset. Not
 * the values — those differ on purpose, because the restore puts back what
 * was saved and the reset puts back the defaults — only that nothing can be
 * restored and then left behind.
 *
 * This is a source-text check, which is worth being honest about: it proves
 * the setter is MENTIONED, not that it is passed something sensible. The
 * values are covered where they can be seen, in
 * e2e/checkin-keeps-your-work.spec.ts, which fills the form, reloads it, and
 * presses the button.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const form = readFileSync("components/JournalForm.tsx", "utf8");

/**
 * The body of the arrow function a marker sits in or starts.
 *
 * TWO WRONGER VERSIONS CAME FIRST, both failing by matching the wrong braces,
 * which is worth leaving written down because a source-reading test that
 * matches the wrong region does not fail — it reports confident nonsense.
 *
 *  1. "the next {...} after the marker" parsed the reset as ZERO setters: its
 *     marker is a comment on the first line INSIDE the handler, so the next
 *     brace belonged to the object literal passed to setTraining.
 *  2. "scan on from the marker until a closing brace at depth 0" ran the
 *     RESTORE past its own end — `}, [deps])` closes the arrow body and the
 *     scan carried on to the end of the component, collecting setters from
 *     handleSubmit. It reported six fields as unclear that are not fields at
 *     all: Timeout, Saving, Error, Dropped, Queued, Result.
 *
 * So both anchors are resolved to the `=> {` that opens their arrow function
 * — searching backwards from the marker, which finds the enclosing one when
 * the marker is inside and the following one when it is the declaration —
 * and the body is brace-matched from there.
 */
function arrowBody(marker: string, where: "declares" | "inside"): string {
  const at = form.indexOf(marker);
  assert.notEqual(at, -1, `components/JournalForm.tsx no longer contains ${JSON.stringify(marker)}`);
  // Told, not guessed. A heuristic for which direction to search was the
  // third wrong version of this: it picked backwards for the declaration and
  // parsed zero setters. Each caller knows where its marker sits.
  const arrow = where === "declares" ? form.indexOf("=> {", at) : form.lastIndexOf("=> {", at);
  assert.notEqual(arrow, -1, `no arrow function found around ${JSON.stringify(marker)}`);
  const open = form.indexOf("{", arrow);
  let depth = 0;
  for (let i = open; i < form.length; i++) {
    if (form[i] === "{") depth++;
    else if (form[i] === "}") {
      depth--;
      if (depth === 0) return form.slice(open, i + 1);
    }
  }
  assert.fail(`could not find the end of the body around ${JSON.stringify(marker)}`);
}

const setters = (block: string) =>
  new Set([...block.matchAll(/\bset([A-Z]\w*)\(/g)].map((m) => m[1]));

const restore = setters(arrowBody("const applyDraft = useCallback(", "declares"));
const reset = setters(arrowBody('// Start clean. Someone who says "no, start again" must not have', "inside"));

/**
 * State the restore touches that is deliberately not the athlete's answers.
 *
 * `Restored` and `SavedAt` are the notice about the draft rather than
 * anything in it; the reset clears them too, but through different calls and
 * for a different reason, so they are not part of this comparison either way.
 */
const NOT_AN_ANSWER = new Set(["Restored", "SavedAt", "PendingDraft"]);

test("the scan finds both lists", () => {
  // A brace-matcher that silently returned nothing would compare two empty
  // sets and pass for ever.
  assert.ok(restore.size >= 8, `the restore block parsed as ${restore.size} setters`);
  assert.ok(reset.size >= 8, `the reset block parsed as ${reset.size} setters`);
  for (const expected of ["PainMap", "Fatigue", "Sleep", "Training"]) {
    assert.ok(restore.has(expected), `the restore no longer sets ${expected} — wrong block?`);
    assert.ok(reset.has(expected), `"Start fresh" no longer sets ${expected} — wrong block?`);
  }
});

test("start fresh clears everything the draft can restore", () => {
  const missing = [...restore].filter((name) => !NOT_AN_ANSWER.has(name) && !reset.has(name));
  assert.deepEqual(
    missing, [],
    `"Start fresh" does not clear: ${missing.join(", ")}.\n` +
    `  Those answers are restored from the draft and left on screen when somebody ` +
    `asks to start again, and the next autosave writes them back into the new draft.`,
  );
});

test("the new answers are in both lists by name", () => {
  // Named explicitly as well as compared, so this file says what it is about
  // rather than only how it checks.
  for (const name of ["SleepHours", "Stress", "Soreness", "CyclePhase"]) {
    assert.ok(restore.has(name), `the draft no longer restores ${name}`);
    assert.ok(reset.has(name), `"Start fresh" no longer clears ${name}`);
  }
});
