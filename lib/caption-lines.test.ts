import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAPTION_ACQUIRE_MS, CAPTION_CPS, MAX_LINE_CHARS, MAX_LINE_WORDS, MIN_CAPTION_MS,
  beatFloorMs, captionLines, captionReadMs,
} from "./caption-lines";

/**
 * The real reel, and the real captions it produced. Every one of these strings
 * was burned into a video that went out looking like this.
 */
test("the fragments that shipped do not come back", () => {
  const shipped = captionLines(
    "So the plan it builds you has a number on it before you shop.",
  );
  for (const bad of ["So the plan it", "builds you has a", "number on it before"]) {
    assert.ok(!shipped.includes(bad), `still produces "${bad}"`);
  }
  assert.deepEqual(shipped.join(" ").split(/\s+/), 
    "So the plan it builds you has a number on it before you shop.".split(/\s+/),
    "the words changed — a caption may be re-broken but never rewritten");
});

test("no caption ends on a word that opens something", () => {
  const lines = [
    ...captionLines("The same 30 grams costs £3.19 at the other end."),
    ...captionLines("Every recipe in here is priced to the ingredient, from real pack sizes."),
    ...captionLines("So the plan it builds you has a number on it before you shop."),
    ...captionLines("30 grams of protein costs £0.31 from red lentils."),
  ];
  for (const line of lines) {
    const last = (line.split(/\s+/).at(-1) ?? "").toLowerCase().replace(/[^a-z']/g, "");
    assert.ok(
      !["a", "an", "the", "at", "of", "to", "from", "and", "but", "so", "is", "has", "your", "for", "in", "on", "with", "that"].includes(last),
      `"${line}" ends on "${last}"`,
    );
  }
});

/**
 * A comma is where the reader already pauses. A shorter line ending there
 * beats a full one ending mid-clause.
 */
test("a comma is preferred to the width limit", () => {
  const lines = captionLines("Every recipe in here is priced to the ingredient, from real pack sizes.");
  const atComma = lines.findIndex((l) => l.endsWith(","));
  assert.ok(atComma >= 0, `nothing broke at the comma: ${JSON.stringify(lines)}`);
});

/** A price is one word. Splitting it gives a caption reading "£0." */
test("a price is never split", () => {
  for (const line of captionLines("It costs £0.31 today and £3.19 at the other end.")) {
    assert.ok(!/£[0-9]+\.$/.test(line), `"${line}" ends mid-price`);
    assert.ok(!/^[0-9]+ /.test(line), `"${line}" starts with the pence of a split price`);
  }
});

/** Sentences are never merged: the voice pauses between them. */
test("two sentences never share a caption", () => {
  const lines = captionLines("Same protein. Same day.");
  assert.deepEqual(lines, ["Same protein.", "Same day."]);
});

test("the limits are respected, and an orphan word is not", () => {
  const long = "This particular sentence runs considerably longer than one caption could ever reasonably hold.";
  const lines = captionLines(long);
  assert.ok(lines.length > 1, "a long sentence stayed on one line");
  for (const line of lines.slice(0, -1)) {
    assert.ok(line.length <= MAX_LINE_CHARS, `"${line}" is ${line.length} chars`);
    assert.ok(line.split(/\s+/).length <= MAX_LINE_WORDS, `"${line}" has too many words`);
  }
  assert.ok(
    lines.at(-1)!.split(/\s+/).length > 1,
    `the last caption is a single stranded word: "${lines.at(-1)}"`,
  );
});

test("nothing in, nothing out", () => {
  assert.deepEqual(captionLines(""), []);
  assert.deepEqual(captionLines("   "), []);
  assert.deepEqual(captionLines("..."), []);
  assert.deepEqual(captionLines("Go."), ["Go."]);
});

/**
 * A word longer than the whole limit must still make progress rather than
 * loop forever trying to find a break that does not exist.
 */
test("an unbreakable word terminates", () => {
  const lines = captionLines("Supercalifragilisticexpialidocious antidisestablishmentarianism.", 10, 3);
  assert.ok(lines.length >= 1);
  assert.equal(lines.join(" ").split(/\s+/).length, 2, "a word was lost or duplicated");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FLOOR ITSELF, PINNED TO THE STANDARDS IT CAME FROM.
 *
 * A mutation dropped MIN_CAPTION_MS back to the old 450ms and every test still
 * passed — the suite checked that SOMETHING was refused, never that the
 * threshold was a reading speed rather than a number somebody liked. 450ms is
 * roughly half of the lowest published minimum, and it is what "too fast
 * paced" was made of.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the caption floor is a published reading speed, not a preference", () => {
  // Netflix's timed-text minimum duration is 5/6 of a second. Nothing below it.
  assert.ok(MIN_CAPTION_MS >= 833,
    `${MIN_CAPTION_MS}ms is under the 833ms broadcast minimum`);
  // Netflix caps English at 17 characters per second WITH audio. A reel is
  // watched on mute, so the caption is the content and this must not be looser.
  assert.ok(CAPTION_CPS <= 17, `${CAPTION_CPS} characters per second is faster than broadcast`);
  assert.ok(CAPTION_ACQUIRE_MS > 0, "finding new text on screen is assumed to be free");
});

test("a longer caption is given longer, because it is more reading", () => {
  const short = captionReadMs("Same protein.");
  const long = captionReadMs("Every recipe is costed the same way.");
  assert.ok(long > short + 500,
    `"${long}ms" vs "${short}ms" — length barely changes the time, so the rule is a flat floor`);
  // And the relationship is the stated one, not merely monotonic.
  const chars = "Every recipe is costed the same way.".length;
  assert.equal(long, Math.round(CAPTION_ACQUIRE_MS + (chars / CAPTION_CPS) * 1000));
});

test("a beat must hold every one of its captions", () => {
  const say = "Every recipe is costed the same way. Real supermarket pack sizes.";
  const lines = captionLines(say);
  assert.ok(lines.length > 1, "this fixture stopped exercising the sum");
  assert.equal(beatFloorMs(say), lines.reduce((n, l) => n + captionReadMs(l), 0));
  assert.ok(beatFloorMs(say) >= lines.length * MIN_CAPTION_MS);
});

/**
 * A single word alone on screen for a moment reads as a glitch. Explicit
 * limits, so the fixture cannot stop producing an orphan when the defaults
 * change and quietly take the assertion with it.
 */
test("a last line is never one stranded word", () => {
  // FIVE words at two per line: the fifth is stranded unless it is merged
  // back. Six words divide evenly and never exercised the rule at all.
  const lines = captionLines("alpha bravo charlie delta echo", 13, 2);
  assert.ok(lines.length > 1, "the fixture no longer splits");
  for (const line of lines) {
    assert.ok(line.split(/\s+/).length > 1 || lines.length === 1, `"${line}" is alone`);
  }
  assert.ok(
    lines[lines.length - 1].split(/\s+/).length >= 2,
    `stranded: ${JSON.stringify(lines)}`,
  );
});
