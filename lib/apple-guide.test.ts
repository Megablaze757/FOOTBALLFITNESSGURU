import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PANEL = readFileSync(new URL("../components/WearableConnect.tsx", import.meta.url), "utf8");
/**
 * Just the hand-built guide, and only the part an athlete can read.
 *
 * COMMENTS ARE STRIPPED FIRST. The rule below is about COPY, and the comment
 * explaining the rule quotes the very phrase it forbids — so scanning the raw
 * source failed on the note that says not to do it. A rule that catches its own
 * rationale is a rule nobody will keep.
 */
const GUIDE = PANEL
  .slice(PANEL.indexOf("function ManualBuild()"))
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WE CANNOT DESCRIBE APPLE'S APP AND STAY RIGHT.
 *
 * Reported by real users as "their Shortcuts app looks different to the
 * instructions", and it will keep being true: Apple moves buttons, renames
 * panels and redraws the editor between iOS versions, and this app is used
 * across several at once. A step written as "tap the button in the top right"
 * is wrong for somebody on the day it ships.
 *
 * What does not move is the NAME of an action. These tests hold the guide to
 * naming things you can search for rather than places you can point at.
 * ═══════════════════════════════════════════════════════════════════════════
 */

test("the guide says outright that the screen may not match", () => {
  assert.match(GUIDE, /may not look like this/i, "no warning that Shortcuts differs by version");
  assert.match(GUIDE, /search/i, "does not tell them to search for the action by name");
});

test("no step points at a place on someone else's screen", () => {
  const POSITIONS = [
    /top right/i, /top left/i, /bottom right/i, /bottom left/i,
    /above the keyboard/i, /at the bottom of the screen/i, /in the corner/i,
    /the two coloured squares/i,
  ];
  for (const re of POSITIONS) {
    assert.ok(!re.test(GUIDE), `the guide describes a screen position: ${re}`);
  }
});

/**
 * The action names ARE the guide. If one is dropped, the step it belonged to
 * has become a description of a screen instead of a thing to search for.
 */
test("every action the guide relies on is named exactly", () => {
  for (const action of [
    "Find Health Samples",
    "Get Details of Health Sample",
    "Get Contents of URL",
    "Sleep Analysis",
    "Latest First",
  ]) {
    assert.ok(GUIDE.includes(action), `the guide no longer names "${action}"`);
  }
});

/**
 * THE STEP EVERYBODY GETS STUCK ON. Health renders a duration as "7 hr 32 min"
 * and a URL cannot contain a space, so Shortcuts rejects the field — reported
 * three separate times as "it won't let me paste the url", which it never was.
 * If this explanation ever falls out of the guide, the reports come straight
 * back.
 */
test("the duration-unit trap is still explained where it happens", () => {
  assert.match(GUIDE, /Hours/, "the fix is gone");
  assert.match(GUIDE, /cannot contain space/i, "the reason is gone");
  assert.match(GUIDE, /7 hr 32 min/, "the symptom they will actually see is gone");
});

/**
 * The panel opens by saying they do not need it. Sleep is one number with a box
 * for it further down the same page, and a screen that opens with four steps
 * has told somebody the opposite before they read a word.
 */
test("the panel still leads with the escape hatch", () => {
  const intro = PANEL.slice(PANEL.indexOf("function AppleSetup"), PANEL.indexOf("function ManualBuild"));
  assert.match(intro, /You don&apos;t need this|You don't need this/, "the opt-out line is gone");
  assert.match(intro, /one number/i, "no longer says how small the manual alternative is");
});
