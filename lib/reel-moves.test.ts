import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MOVE_GAP_MS, MOVE_POLL_MS, MOVE_WAIT_MS,
  isTap, isType, moveProblems, movesMs, type Move,
} from "./reel-moves";

test("a move is one of exactly two things, and says which", () => {
  const typed: Move = { type: "80", into: "Weight" };
  const tapped: Move = { tap: "Save" };
  assert.ok(isType(typed) && !isTap(typed));
  assert.ok(isTap(tapped) && !isType(tapped));
});

test("a beat that performs moves is given time to perform them", () => {
  assert.equal(movesMs(undefined), 0);
  assert.equal(movesMs([]), 0);
  assert.equal(movesMs([{ tap: "Save" }]), MOVE_GAP_MS);
  assert.equal(movesMs([{ tap: "Save" }, { type: "80", into: "Weight" }]), 2 * MOVE_GAP_MS);
});

/**
 * The gap is what makes the filling VISIBLE. Instant is a jump cut to a
 * completed form, which is the narrated screenshot this whole thing exists to
 * stop being.
 */
test("the gap between moves is long enough to see and short enough to watch", () => {
  assert.ok(MOVE_GAP_MS >= 250, `${MOVE_GAP_MS}ms is faster than the eye follows`);
  assert.ok(MOVE_GAP_MS <= 800, `${MOVE_GAP_MS}ms per field makes a four-field form a scene`);
});

test("a clean set of moves has nothing wrong with it", () => {
  assert.deepEqual(moveProblems([
    { type: "3", into: "Hours slept" },
    { type: "8", into: "Fatigue" },
    { tap: "Save today" },
  ]), []);
  assert.deepEqual(moveProblems(undefined), []);
  assert.deepEqual(moveProblems([]), []);
});

/**
 * A one or two letter target matches half the page. This is the failure that
 * would not throw — it would fill the wrong field and film it.
 */
test("a target too short to identify anything is refused", () => {
  assert.match(moveProblems([{ type: "80", into: "kg" }]).join(" "), /too short to identify a field/);
  assert.match(moveProblems([{ tap: "OK" }]).join(" "), /too short to identify a control/);
  assert.deepEqual(moveProblems([{ tap: "Save" }]), [], "a real four-letter button was refused");
});

test("typing nothing, or into nothing, is refused", () => {
  assert.match(moveProblems([{ type: "", into: "Weight" }]).join(" "), /types nothing/);
  assert.match(moveProblems([{ type: "80", into: "   " }]).join(" "), /no name/);
  assert.match(moveProblems([{ tap: "  " }]).join(" "), /taps nothing/);
});

test("something that is neither a type nor a tap is refused rather than ignored", () => {
  assert.match(moveProblems([{ swipe: "left" } as unknown as Move]).join(" "), /neither a type nor a tap/);
});

/** Six moves is already 2.5s of gaps in a reel with a 30s ceiling. */
test("a beat cannot become a tutorial", () => {
  const many: Move[] = Array.from({ length: 7 }, (_, i) => ({ tap: `Button ${i}` }));
  assert.match(moveProblems(many).join(" "), /that is a tutorial, not a shot/);
  assert.deepEqual(moveProblems(many.slice(0, 6)), [], "six moves was refused, and six is allowed");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PART THAT MAKES IT REAL.
 *
 * A move type nothing performs is a data structure. These pin the two ends:
 * the page can carry out a move, and the recorder asks it to.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the page can actually perform a move", () => {
  const overlay = readFileSync("scripts/reel-overlay.js", "utf8");
  assert.match(overlay, /window\.__reelDo\s*=/, "the page has no way to perform a move");
  assert.match(overlay, /dispatchEvent/, "a typed value never fires an input event, so React ignores it");
  assert.match(overlay, /\.click\(\)/, "nothing is ever tapped");
});

test("the recorder performs a beat's moves, and says so when one misses", () => {
  const src = readFileSync("scripts/record-reel.mts", "utf8");
  assert.match(src, /__reelDo/, "the recorder never asks the page to do anything");
  assert.match(src, /step\.moves/, "moves never reach the recorder from the plan");
  assert.match(src, /console\.(warn|error)/,
    "a move that finds nothing films an empty form in silence");
});

/**
 * The guard that cannot be fooled by an environment.
 *
 * A browser check for these targets was written and removed: a stubbed athlete
 * always meets the consent gate, and stubbing enough to get past it would have
 * made the test assert against a fixture instead of the app. The recorder
 * refuses instead, which needs no environment to be reproduced because it runs
 * in the real one.
 */
test("a move that finds nothing stops the recording rather than filming it", () => {
  const src = readFileSync("scripts/record-reel.mts", "utf8");
  const block = src.slice(src.indexOf("for (const move of step.moves"), src.indexOf("const want = step.focus"));
  assert.match(block, /throw new Error\(/,
    "a missed move only warns, so a reel of an untouched form still gets published");
  assert.match(block, /Move missed on \$\{step\.route\}/,
    "the failure does not say which screen or which move");
  assert.ok(!/console\.(warn|error)\(`  MOVE MISSED/.test(block),
    "the old warn-and-carry-on path is still there");
});

test("the readiness reel taps the quick check-in, not the detailed one", async () => {
  const { reelScript } = await import("./reel-script");
  const script = reelScript("demo-readiness", "");
  assert.ok(script, "there is no demo-readiness script");
  const taps = script!.beats.flatMap((b) => (b.moves ?? []).filter(isTap).map((m) => m.tap));
  assert.deepEqual(taps, ["Change my answers", "Barely", "Wrecked", "Save today's log"],
    "the taps changed — check them against the view /journal actually opens on");
  /**
   * "Log it" was here and it was the wrong control: a button of that name
   * exists, is tappable, and opens the training section instead of saving.
   * The recorder reported three clean moves over an unsaved check-in.
   */
  assert.ok(!taps.includes("Log it"),
    "\"Log it\" opens the training section — it does not submit the check-in");
  for (const beat of script!.beats) {
    assert.deepEqual(moveProblems(beat.moves), [], `${beat.route} has moves that cannot work`);
  }
});

/**
 * The guard that catches a move which worked and did the wrong thing.
 *
 * Three taps reported clean while the check-in went unsaved, because "Log it"
 * is a real button that opens the training section. No check on the moves
 * themselves can see that — the words were there and the control responded.
 * What gives it away is the beat afterwards having nothing to point at.
 */
test("a reveal with nothing to reveal stops the recording", () => {
  const src = readFileSync("scripts/record-reel.mts", "utf8");
  const block = src.slice(src.indexOf("const want = step.focus"), src.indexOf("if (aimed) driftFrom"));
  assert.match(block, /throw new Error\(/,
    "a focus that finds nothing only warns, so a reel can still contradict its own line");
  assert.match(block, /Nothing on \$\{step\.route\} matches the focus/,
    "the failure does not say which screen or which target");
  assert.ok(!/console\.warn/.test(block), "the old warn-and-carry-on path is still there");
});

/**
 * A diagnostic on one of two identical failure paths is a diagnostic that is
 * missing half the time. The screen dump was attached to the focus guard
 * first, and the very next failure came from the move guard and threw with no
 * evidence at all — after three wrong theories about the cause.
 */
test("both refusals say what was on the screen", () => {
  const src = readFileSync("scripts/record-reel.mts", "utf8");
  const moves = src.slice(src.indexOf("for (const move of step.moves"), src.indexOf("const want = step.focus"));
  const focus = src.slice(src.indexOf("const want = step.focus"), src.indexOf("if (aimed) driftFrom"));
  assert.match(moves, /dumpScreen\(/, "a missed move throws with no evidence attached");
  assert.match(focus, /dumpScreen\(/, "a missed focus throws with no evidence attached");
  assert.match(src, /buttons on \$\{route\}/,
    "the dump does not list the buttons, which is what a tap is matched against");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PAGE IS EMPTY WHEN THE BEAT BEGINS.
 *
 * The recorder navigates with `waitUntil: "load"`, which in a Next.js app
 * fires while the document has nothing in it. The recorder's own screen dump
 * proved it: no headings, no buttons, no accessible names on /journal at the
 * moment the first move ran. Four theories preceded that one measurement.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a move waits for its target rather than assuming it is there", () => {
  const src = readFileSync("scripts/record-reel.mts", "utf8");
  const block = src.slice(src.indexOf("for (const move of step.moves"), src.indexOf("await sleep(MOVE_GAP_MS)"));
  assert.match(block, /MOVE_WAIT_MS/, "a move gives up the instant the page is not ready");
  assert.match(block, /while \(!did\)/, "there is no retry — one look at an empty page and it fails");
  assert.match(block, /Date\.now\(\) >= deadline/, "the retry has no deadline, so a real miss hangs");
});

test("the spotlight waits too, and does not spin when nothing was asked for", () => {
  const src = readFileSync("scripts/record-reel.mts", "utf8");
  const block = src.slice(src.indexOf("const focusBy"), src.indexOf("if (want && !aimed)"));
  assert.match(block, /MOVE_WAIT_MS/, "a beat with no moves aims at a page that may still be hydrating");
  assert.match(block, /!want/, "a beat with no focus burns the whole wait doing nothing");
});

test("the wait is long enough for a cold runner and short enough to notice a real miss", () => {
  assert.ok(MOVE_WAIT_MS >= 3_000, `${MOVE_WAIT_MS}ms will fail on a slow runner and look like a bug`);
  assert.ok(MOVE_WAIT_MS <= 15_000, `${MOVE_WAIT_MS}ms a move means a broken script takes a minute to say so`);
  assert.ok(MOVE_POLL_MS <= 500, `polling every ${MOVE_POLL_MS}ms adds visible lag to every move`);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CATCH-ALL THAT INVENTS A DIAGNOSIS.
 *
 * The move was `page.evaluate(...).catch(() => false)`, so every possible
 * fault reported as "the control was not found" — including the page being
 * unable to answer at all. It was the second: the screen dump came back
 * holding its own catch fallbacks, which means evaluate was throwing.
 *
 * Four runs were spent hunting a missing button that was never missing. A
 * catch that flattens every failure into one message is worse than no catch,
 * because it hides the evidence and supplies a wrong answer in its place.
 * ═══════════════════════════════════════════════════════════════════════════
 */
/**
 * Comments are stripped first. The first version of this matched the sentence
 * in record-reel.mts describing the OLD `.catch(() => false)` — prose about
 * the bug reading as the bug, which is the same wrong-occurrence trap that has
 * bitten this repo repeatedly.
 */
const code = (path: string) =>
  readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("a failure to ask the page is reported as that, not as a missing control", () => {
  const src = code("scripts/record-reel.mts");
  for (const [from, to] of [
    ["for (const move of step.moves", "await sleep(MOVE_GAP_MS)"],
    ["const focusBy", "if (want && !aimed) {"],
  ] as const) {
    const block = src.slice(src.indexOf(from), src.indexOf(to));
    assert.ok(block.length > 0, `could not find the ${from} block to check`);
    assert.ok(!/\.catch\(\(\)\s*=>\s*false\)/.test(block),
      `${from}: swallows every error into 'not found', which is how four runs chased the wrong fault`);
    assert.match(block, /the page could not be asked/,
      `${from}: nothing reports why the page could not answer`);
  }
});

test("the screen dump says when it could not inspect the page", () => {
  const src = readFileSync("scripts/record-reel.mts", "utf8");
  const dump = src.slice(src.indexOf("async function dumpScreen"), src.indexOf("const videoStart"));
  assert.match(dump, /the page could not be inspected/,
    "a failed dump prints its fallbacks, which read exactly like an empty page");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE DIAGNOSTIC THAT LIED FOR FIVE RUNS.
 *
 * dumpScreen declared `const text = (el) => ...` inside its evaluate
 * callback. tsx compiles this file with esbuild's keepNames, which wraps a
 * named arrow in `__name(...)`, and Playwright ships the TRANSPILED source of
 * a callback to the browser — where `__name` does not exist. Every call threw
 * ReferenceError, the catch returned its fallbacks, and those printed as "no
 * headings, no buttons, no labels".
 *
 * I read that as "the page has not rendered" and built a hydration fix on it.
 * The page was fine. A diagnostic that fails silently is worse than none,
 * because its output is believed.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("no evaluate callback declares an inner named function", () => {
  const src = code("scripts/record-reel.mts");
  /**
   * Matched on the whole file rather than one callback: every page.evaluate
   * in here has the same exposure, and the one that broke was the one nobody
   * was looking at.
   */
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * BALANCED PARENTHESES, BECAUSE THE SHAPE-MATCH WAS SLICING PAST THE CALL.
   *
   * This ended each callback at the first `\n  })`, which is the shape of SOME
   * of them. A page.evaluate written across several arguments closes on
   * `\n    ).catch(...)` instead, so its match ran on through the rest of the
   * file to the next `\n  })` — and when a new top-level function appeared
   * between the two, the guard read that function's body as an evaluate
   * callback and failed on code that never goes near a browser.
   *
   * A guard matched by the wrong occurrence, in a test written to catch a bug
   * that was itself invisible. Counting brackets is not clever, and it is
   * right about every call shape rather than about the two that were in the
   * file the day it was written. (It does not know about parentheses inside
   * string literals; there are none in these arguments, and a false POSITIVE
   * here costs a look rather than a bad recording.)
   * ═══════════════════════════════════════════════════════════════════════
   */
  const calls: string[] = [];
  const needle = "page.evaluate(";
  for (let i = src.indexOf(needle); i >= 0; i = src.indexOf(needle, i + 1)) {
    let depth = 0;
    let j = i + needle.length - 1;
    for (; j < src.length; j += 1) {
      if (src[j] === "(") depth += 1;
      else if (src[j] === ")") { depth -= 1; if (depth === 0) break; }
    }
    calls.push(src.slice(i + needle.length, j));
    i = j;
  }
  assert.ok(calls.length > 4, `only ${calls.length} evaluate callbacks found — the scan is not working`);

  for (const call of calls.map((c) => [c, c] as const)) {
    assert.doesNotMatch(call[1], /\bconst\s+\w+\s*=\s*\(/,
      "an evaluate callback declares an inner arrow — esbuild wraps it in __name(), "
      + "which does not exist in the browser, and the call throws at runtime");
    assert.doesNotMatch(call[1], /\bfunction\s+\w+/,
      "an evaluate callback declares a named function — same __name problem");
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE REEL WRITES TO THE ACCOUNT IT FILMS.
 *
 * One run saved a check-in. Every run after it found /journal showing
 * "✓ Checked in today — you're done for today", with a "Change my answers"
 * button where the tap-scale had been. Same script, same code, different film.
 *
 * That control exists only when there is something to change, so it cannot be
 * an ordinary move: a missing ordinary move fails the run, correctly, because
 * a demonstration that did not happen must not be published. An optional move
 * is state-normalisation — do it if the screen needs it, carry on if not.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("an optional move is skipped rather than fatal", () => {
  const src = code("scripts/record-reel.mts");
  const block = src.slice(src.indexOf("for (const move of step.moves"), src.indexOf("await sleep(MOVE_GAP_MS)"));
  assert.match(block, /move\.optional/, "optional moves are treated as ordinary ones and will fail the run");
  assert.match(block, /continue;/, "an optional move that is absent still falls through to the throw");
  assert.ok(block.indexOf("move.optional") < block.indexOf("if (!did) {"),
    "the optional check runs after the refusal, so it can never be reached");
});

test("only a tap may be optional", () => {
  const src = readFileSync("lib/reel-moves.ts", "utf8");
  const tapBlock = src.slice(src.indexOf("export interface TapMove"), src.indexOf("export type Move"));
  const typeBlock = src.slice(src.indexOf("export interface TypeMove"), src.indexOf("export interface TapMove"));
  assert.match(tapBlock, /optional\?: boolean/, "a tap cannot be optional");
  assert.doesNotMatch(typeBlock, /optional/,
    '"type this if the field happens to exist" is a script that does not know what it is filming');
});

test("the readiness reel normalises the screen before it demonstrates", async () => {
  const { reelScript } = await import("./reel-script");
  const beats = reelScript("demo-readiness", "")!.beats.filter((b) => b.moves?.length);
  const moves = beats.flatMap((b) => b.moves!);
  assert.equal(moves[0] && "tap" in moves[0] && moves[0].tap, "Change my answers",
    "the reel does not clear a check-in it may have written on a previous run");
  assert.ok(moves[0] && "optional" in moves[0] && moves[0].optional,
    "clearing is mandatory, so a clean account would fail the run");
  assert.ok(moves.slice(1).every((m) => !("optional" in m && m.optional)),
    "a move that demonstrates something is optional, so the reel could film nothing and pass");
});
