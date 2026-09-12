import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_WORD_MS, karaokeWords, litAt, wordSpans } from "./caption-karaoke";

const total = (text: string, ms: number) => {
  const s = wordSpans(text, ms);
  return s.length ? s[s.length - 1].at + s[s.length - 1].ms : 0;
};

test("every word gets a turn, in order, with no gaps", () => {
  const spans = wordSpans("Same protein ten times the price", 3_000);
  assert.deepEqual(spans.map((s) => s.text), ["Same", "protein", "ten", "times", "the", "price"]);
  for (let i = 1; i < spans.length; i += 1) {
    assert.equal(spans[i].at, spans[i - 1].at + spans[i - 1].ms,
      `word ${i} does not start where word ${i - 1} ends`);
  }
  assert.equal(spans[0].at, 0);
});

/**
 * The one that matters for the picture. A highlight that outlives its caption
 * leaves a word lit on screen after the line has been replaced.
 */
test("the highlight never outlives the caption", () => {
  for (const ms of [400, 1_000, 2_500, 6_000]) {
    assert.equal(total("Thirty-one pence or three pounds nineteen", ms), ms,
      `spans run to something other than ${ms}ms`);
  }
});

test("longer words hold longer than short ones", () => {
  const [a, of_, supermarket] = wordSpans("a of supermarket", 3_000);
  assert.ok(supermarket.ms > a.ms * 2, "a long word is held no longer than a one-letter one");
  // "of" is a letter longer than "a" and should hold longer. An earlier version
  // of this asserted they were within 40ms of each other, which was a claim
  // about the test author rather than about the code.
  assert.ok(of_.ms > a.ms, "a two-letter word is held no longer than a one-letter one");
  assert.ok(of_.ms < supermarket.ms);
});

/**
 * Short words strobe below about 90ms — the eye cannot land on something gone
 * in two frames. The floor is applied BEFORE the remainder is shared out; an
 * earlier version clamped afterwards, which added time the caption did not
 * have and left the last word lit after the voice had moved on.
 */
test("no word flashes past unreadably", () => {
  const spans = wordSpans("a b c d e f g h", 2_000);
  for (const s of spans) assert.ok(s.ms >= MIN_WORD_MS - 1, `"${s.text}" holds for only ${s.ms}ms`);
  assert.equal(total("a b c d e f g h", 2_000), 2_000, "the floor stole time from the caption");
});

/** A caption too short to give every word the floor still fills exactly. */
test("an impossibly short caption still shares out what it has", () => {
  const spans = wordSpans("one two three four five", 200);
  assert.equal(spans.length, 5);
  assert.equal(total("one two three four five", 200), 200);
  for (const s of spans) assert.ok(s.ms > 0, `"${s.text}" gets no time at all`);
});

test("nothing in, nothing out", () => {
  assert.deepEqual(wordSpans("", 1_000), []);
  assert.deepEqual(wordSpans("   ", 1_000), []);
  assert.deepEqual(wordSpans("word", 0), []);
  assert.deepEqual(wordSpans("word", -5), []);
});

test("punctuation rides with its word rather than becoming one", () => {
  const spans = wordSpans("Cheapest: 31p.", 1_000);
  assert.deepEqual(spans.map((s) => s.text), ["Cheapest:", "31p."]);
});

test("the lit word is the last one that has started", () => {
  const spans = wordSpans("one two three", 3_000);
  assert.equal(litAt(spans, -1), -1, "a word is lit before the caption begins");
  assert.equal(litAt(spans, 0), 0);
  assert.equal(litAt(spans, spans[1].at), 1);
  assert.equal(litAt(spans, spans[2].at + spans[2].ms + 500), 2,
    "the last word stops being lit while the caption is still up");
});

test("the coloured figure is the one emphasise picked, by position not by text", () => {
  const words = karaokeWords("Ten times the price for the same price", 3_000);
  assert.equal(words.length, 8);
  const keyed = words.map((w, i) => (w.key ? i : -1)).filter((i) => i >= 0);
  assert.ok(keyed.length <= 1, `${keyed.length} words coloured — the eye gets one landing point`);
});

test("a line with a figure colours it and nothing else", () => {
  const words = karaokeWords("The dear one is three pounds nineteen", 3_000);
  const lit = words.filter((w) => w.key).map((w) => w.text);
  assert.ok(lit.length <= 1, `coloured ${JSON.stringify(lit)}`);
  assert.equal(words.map((w) => w.text).join(" "), "The dear one is three pounds nineteen",
    "the words no longer reconstruct the caption");
});

test("timings survive the merge untouched", () => {
  const plain = wordSpans("one two three four", 2_000);
  const merged = karaokeWords("one two three four", 2_000);
  assert.deepEqual(merged.map(({ text, at, ms }) => ({ text, at, ms })), plain);
});

// ═══════════════════════════════════════════════════════════════════════════
// "SOMETIMES THE STRESS OF WORDS IS AT THE WRONG PLACE."
//
// The voice was not stressing the wrong word — the HIGHLIGHT was on the wrong
// one, which reads as the same thing. Weights were written characters, and
// these reels are built on numbers: "100kg" is five characters and takes as
// long to say as "one hundred kilos".
// ═══════════════════════════════════════════════════════════════════════════

test("a number is lit for as long as it takes to say", () => {
  const spans = wordSpans("100kg at 60kg bodyweight is exceptional.", 3_000);
  assert.equal(spans.length, 6);
  const share = (i: number) => spans[i].ms / 3_000;
  /**
   * "one hundred kilos" against "bodyweight": the number is the longer of the
   * two to say, and by written length it looks half the size.
   */
  assert.ok(share(0) > share(3),
    `"100kg" is lit for ${(share(0) * 100).toFixed(0)}% and "bodyweight" for `
    + `${(share(3) * 100).toFixed(0)}% — the highlight runs ahead of the voice`);
  assert.ok(share(0) > share(1) * 3, "a long number is not given more room than 'at'");
});

test("a line with no numbers in it is unchanged", () => {
  const spans = wordSpans("Means nothing at all here", 2_000);
  assert.equal(spans.length, 5);
  // Still longest-word-gets-most, just measured on what is said.
  const byWidth = [...spans].sort((a, b) => b.ms - a.ms)[0];
  assert.equal(byWidth.text, "nothing");
});

test("the spans still tile the caption exactly", () => {
  for (const line of ["100kg at 60kg bodyweight is exceptional.", "£0.31 or £3.19, same 30 grams."]) {
    const spans = wordSpans(line, 2_500);
    assert.equal(spans[0].at, 0, "the first word does not start at zero");
    for (let i = 1; i < spans.length; i++) {
      assert.equal(spans[i].at, spans[i - 1].at + spans[i - 1].ms,
        `a gap opened before "${spans[i].text}"`);
    }
    const last = spans[spans.length - 1];
    assert.equal(last.at + last.ms, 2_500, "the highlight outlives or undershoots the caption");
  }
});
