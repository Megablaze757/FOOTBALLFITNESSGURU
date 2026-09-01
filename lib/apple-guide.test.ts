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
    "Latest First",
  ]) {
    assert.ok(GUIDE.includes(action), `the guide no longer names "${action}"`);
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE NAME IN THE PICKER, NOT THE NAME IN THE DOCS.
 *
 * This guide said `Sleep Analysis` for months, and this test ASSERTED it — so
 * the test was holding the bug in place. HKCategoryTypeIdentifierSleepAnalysis
 * is what Apple calls it in HealthKit and what the Health app shows, which is
 * where the name came from and why it looked right to everyone who checked it
 * against a document instead of against a phone.
 *
 * The Shortcuts picker lists it as plain `Sleep`. Searching the longer name
 * finds nothing, and an athlete who cannot complete step 2 does not complete
 * step 3 either. Reported by somebody with the app actually open.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the sleep sample is named as Shortcuts lists it", () => {
  // Both copies. The same wrong name was in the in-app panel AND the build doc,
  // because they were written from the same source and checked against each
  // other rather than against a phone.
  const DOC = readFileSync(new URL("../docs/APPLE-SHORTCUT.md", import.meta.url), "utf8")
    .split("Two things that will otherwise cost you")[0];

  for (const [where, text] of [["the in-app panel", GUIDE], ["docs/APPLE-SHORTCUT.md", DOC]] as const) {
    assert.ok(!/Sleep Analysis/.test(text),
      `${where} says "Sleep Analysis" — Shortcuts has no such option, it is just "Sleep"`);
    assert.match(text, /\bSleep\b/, `${where} no longer names the sleep sample at all`);
  }
});

/** The doc numbers its steps, and the count above the table has to match it. */
test("the build doc counts its own steps correctly", () => {
  const doc = readFileSync(new URL("../docs/APPLE-SHORTCUT.md", import.meta.url), "utf8");
  const rows = [...doc.matchAll(/^\| (\d+) \|/gm)].map((m) => Number(m[1]));
  assert.ok(rows.length > 0, "the action table is gone");

  const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const claimed = doc.match(/add these (\w+) actions/);
  assert.ok(claimed, "the sentence introducing the table is gone");
  assert.equal(WORDS.indexOf(claimed[1]), rows.length,
    `the doc says "${claimed[1]} actions" over a table of ${rows.length}`);
  assert.deepEqual(rows, rows.map((_, i) => i + 1), "the steps are not numbered 1..n in order");
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


/**
 * PUBLISHING THE LINK MUST NOT NEED A DEVELOPER.
 *
 * It used to be a constant in a source file, so switching the one-tap Apple
 * setup on meant an edit, a commit, a build and a deploy — for a value that can
 * only be produced by hand on an iPhone. That is why it stayed unpublished.
 */
test("an admin can publish the shortcut link without a deploy", () => {
  const admin = readFileSync(new URL("../components/admin/AppleShortcutLink.tsx", import.meta.url), "utf8");
  assert.match(admin, /apple_shortcut_url/, "the admin screen does not write the setting");
  assert.match(admin, /isShortcutUrl/, "the admin screen does not validate what is pasted");

  const ops = readFileSync(new URL("../app/admin/ops/page.tsx", import.meta.url), "utf8");
  assert.match(ops, /<AppleShortcutLink\s*\/>/, "the admin screen is not rendered anywhere");

  // And the panel has to read what was published, not a compile-time constant.
  assert.match(PANEL, /useAppleShortcut\(\)/, "the wearable panel is not reading the published link");
});
