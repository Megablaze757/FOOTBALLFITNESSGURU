import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EVERY SCREEN THAT RE-SCORES A STORED CHECK-IN HAS TO SCORE IT THE SAME WAY.
 *
 * `assessReadiness` is called from eight places. One of them — the check-in
 * form — passes what the athlete just typed. The other seven REBUILD the
 * input by hand from a row in the database, naming each column:
 *
 *   home            the number and the coach line on the front screen
 *   report          the week's average
 *   trends          the readiness line on Progress
 *   coach-context   what the AI coach is told
 *   squad           a coach's list of their athletes
 *   squad/view      one athlete, read-only, with the advice printed out
 *   CheckInDone     the screen straight after saving
 *
 * Migration 0115 added three answers that MOVE THE SCORE. A hand-built input
 * that omits them produces a different number from the one the athlete saw,
 * and nothing about the screen says so: the chart just steps, or the coach
 * says Green over a three-hour night. Seven places had to be updated and the
 * compiler could not help, because every new field is optional — it has to
 * be, since most rows do not have them.
 *
 * So the guard is: a call site that names `sleep_quality` is rebuilding an
 * input from a row, and it must name the three scored answers too.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AND THE CYCLE PHASE MUST NOT REACH A SCREEN ABOUT SOMEBODY ELSE.
 *
 * It moves no number, so adding it to a squad screen would buy nothing. What
 * it would do is print "You logged your luteal phase…" — `readiness.advice`
 * is rendered verbatim on squad/view — to a coach, about an athlete who is
 * not in the room. That is a disclosure of special-category data, and it
 * would arrive as a one-word change that looks like an improvement.
 *
 * The phase belongs on the athlete's own screens and in nothing shared.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Files under lib/, components/ and app/, excluding tests. */
function sources(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { sources(path, found); continue; }
    if (!/\.tsx?$/.test(path) || /\.test\.tsx?$/.test(path)) continue;
    found.push(path);
  }
  return found;
}

/**
 * THE CHECK IS PER FILE, NOT PER CALL, AND THAT IS A DELIBERATE COARSENING.
 *
 * Matching the call's arguments was the obvious shape and it does not work:
 * home, CheckInDone and the check-in form all build the input into a variable
 * first, so `assessReadiness(input, …)` names no columns at all and a
 * per-call scan sees nothing to check — passing silently on exactly the
 * screens that matter most.
 *
 * Going the other way — find the object literal around each `sleep_quality:`
 * — fails differently: the check-in form splits its payload in two on
 * purpose, so the settled half legitimately has no 0115 columns in it.
 *
 * So: a file that calls assessReadiness and names `sleep_quality` is building
 * a readiness input somewhere in it, and must name the three scored answers
 * somewhere in it too. Coarser, and it would miss a file that built two
 * different inputs and only updated one. No file does; if one ever should,
 * this test is the place that has to be made cleverer rather than quieter.
 */
const inputs = ["lib", "components", "app"]
  .flatMap((d) => sources(d))
  .map((file) => ({ file, src: readFileSync(file, "utf8") }))
  .filter(({ src }) => src.includes("assessReadiness(") && /sleep_quality:/.test(src));

/**
 * `sleep_quality:` WITH THE COLON — a key being written, not a value being
 * read. components/CheckInDone.tsx is the reason: it reads
 * `checkIn.sleep_quality` to display it, and hands assessReadiness the WHOLE
 * ROW, which the journal page fetched with `select("*")`. It therefore needs
 * no updating for 0115 and never will, and a scan matching the bare word
 * would have demanded a change there that would be pure noise.
 *
 * It is checked below rather than left out, because "this file is fine
 * because of how it passes its input" is a claim worth testing.
 */

test("the scan finds the places it is about", () => {
  // A guard that matched nothing would pass on any codebase at all, including
  // one where somebody had deleted the readiness engine.
  assert.ok(inputs.length >= 6,
    `only ${inputs.length} files build a readiness input — the scan is matching the wrong thing`);
  for (const expected of ["home", "report", "trends", "coach-context", "squad", "JournalForm"]) {
    assert.ok(inputs.some(({ file }) => file.includes(expected)),
      `the scan no longer sees ${expected}, which builds a readiness input`);
  }
});

test("every re-scored check-in includes the answers that move the score", () => {
  for (const { file, src } of inputs) {
    for (const field of ["sleep_hours", "stress_score", "soreness_score"]) {
      assert.ok(src.includes(field),
        `${file} builds a readiness input without ${field}, so it will show a ` +
        `readiness the athlete never saw`);
    }
  }
});

test("the cycle phase never reaches a screen about somebody else", () => {
  // Named rather than pattern-matched: a new shared screen should have to be
  // added to this list deliberately, by somebody who read the reason above.
  const SHARED = ["squad", "coach-context", "coach-briefing", "admin"];
  for (const { file, src } of inputs) {
    if (!SHARED.some((s) => file.includes(s))) continue;
    const line = src.split("\n").find((l) =>
      /cycle_phase/.test(l) && !l.trimStart().startsWith("*") && !l.trimStart().startsWith("//"));
    assert.equal(line, undefined,
      `${file} is a screen about another person and it now reads the cycle phase. ` +
      `readiness.advice is rendered verbatim there:\n  ${line?.trim()}`);
  }
});

test("the athlete's own screens do get it", () => {
  // The other half, so "nothing passes it anywhere" cannot pass this file.
  for (const own of ["home", "JournalForm"]) {
    const entry = inputs.find(({ file }) => file.includes(own));
    assert.ok(entry, `${own} no longer builds a readiness input`);
    assert.ok(entry.src.includes("cycle_phase"),
      `${own} does not pass the cycle phase, so the note the athlete logged it for never appears`);
  }
});

test("the done screen passes the whole row, which is why it is not in the list above", () => {
  const src = readFileSync("components/CheckInDone.tsx", "utf8");
  assert.match(src, /assessReadiness\(checkIn as CheckInInput/,
    "CheckInDone no longer hands over the whole row — if it now names columns, " +
    "it has to name 0115's as well, and the scan above will not see it");
  assert.doesNotMatch(src, /sleep_quality:/,
    "CheckInDone has started rebuilding an input by hand, which puts it back in scope");
});
