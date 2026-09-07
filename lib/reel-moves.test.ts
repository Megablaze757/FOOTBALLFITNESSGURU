import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MOVE_GAP_MS, isTap, isType, moveProblems, movesMs, type Move } from "./reel-moves";

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
  assert.deepEqual(taps, ["Barely", "Wrecked", "Log it"],
    "the taps changed — check them against the view /journal actually opens on");
  for (const beat of script!.beats) {
    assert.deepEqual(moveProblems(beat.moves), [], `${beat.route} has moves that cannot work`);
  }
});
