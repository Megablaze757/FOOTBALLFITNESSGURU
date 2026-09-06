import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spokenForm, words } from "./spoken-numbers";

test("numbers become words", () => {
  const cases: [number, string][] = [
    [0, "zero"], [7, "seven"], [13, "thirteen"], [20, "twenty"], [31, "thirty-one"],
    [90, "ninety"], [100, "one hundred"], [119, "one hundred and nineteen"],
    [375, "three hundred and seventy-five"], [1000, "one thousand"],
    [1200, "one thousand two hundred"],
  ];
  for (const [n, want] of cases) assert.equal(words(n), want, String(n));
});

/**
 * The exact strings from the reel that shipped. A speech model handed "£0.31"
 * says "pound zero point three one", and every price in this app looks like
 * that — so this was every reel, on the words the reel is about.
 */
test("money is said the way it is said", () => {
  assert.equal(spokenForm("£0.31"), "thirty-one pence");
  assert.equal(spokenForm("£3.19"), "three pounds nineteen");
  assert.equal(spokenForm("£1.00"), "one pound");
  assert.equal(spokenForm("£0.01"), "one penny");
  assert.equal(spokenForm("£12"), "twelve pounds");
  assert.equal(spokenForm("£3.05"), "three pounds oh five",
    "'three pounds five' is heard as £3.50");
  assert.equal(spokenForm("£0.75"), "seventy-five pence");
  // A shortened decimal: £3.1 is £3.10, not £3.01.
  assert.equal(spokenForm("£3.1"), "three pounds ten");
});

test("units are spoken, not spelled", () => {
  assert.equal(spokenForm("30g of protein"), "thirty grams of protein");
  assert.equal(spokenForm("375ml"), "three hundred and seventy-five millilitres");
  assert.equal(spokenForm("1g"), "one gram");
  assert.equal(spokenForm("20kg"), "twenty kilos");
});

test("multipliers and percentages", () => {
  assert.equal(spokenForm("10.2×"), "ten point two times");
  assert.equal(spokenForm("10x"), "ten times");
  assert.equal(spokenForm("25%"), "twenty-five percent");
});

/** The whole line, as the script actually writes it. */
test("a real line of script", () => {
  assert.equal(
    spokenForm("30 grams of protein costs £0.31 from red lentils."),
    "thirty grams of protein costs thirty-one pence from red lentils.",
  );
  assert.equal(
    spokenForm("The same 30 grams costs £3.19 at the other end."),
    "The same thirty grams costs three pounds nineteen at the other end.",
  );
});

test("text without numbers is left exactly alone", () => {
  for (const line of ["Same protein.", "", "No numbers here at all."]) {
    assert.equal(spokenForm(line), line, JSON.stringify(line));
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE NARRATION IS NOT SPED UP. "Too fast paced."
 *
 * scripts/record-reel.mts asked the voice for 1.05 — five percent faster than
 * natural, on a model that already reads briskly, under captions the viewer is
 * also trying to read. Nothing in the suite noticed, because the speed lives
 * in a script rather than a module: a mutation putting 1.05 back was caught by
 * nothing at all.
 *
 * Explainer voiceover is read slightly SLOW. The listener is looking at a
 * screen they have never seen, and that costs time the speaker has to give
 * back.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the recorder never asks the voice to hurry", () => {
  /**
   * The rate lives in lib/speech-prosody.ts now — one per phrase rather than
   * one for the reel — so this checks the BASE the roles multiply, and that
   * no role is allowed to push past natural pace.
   */
  const src = readFileSync("lib/speech-prosody.ts", "utf8");
  const base = Number(src.match(/BASE_SPEED = ([0-9.]+)/)?.[1]);
  assert.ok(base <= 1.0, `the base rate is ${base}x — faster than natural`);
  assert.ok(base >= 0.8, `${base}x is slow enough to sound wrong`);

  const rates = [...src.matchAll(/^\s{2}(hook|setup|figure|payoff): ([0-9.]+),/gm)]
    .map((m) => Number(m[2]));
  assert.equal(rates.length, 4, "a role lost its rate");
  for (const r of rates) {
    assert.ok(base * r <= 1.0, `a role reaches ${(base * r).toFixed(2)}x, which is a rush`);
  }

  // The Python fallback must agree, or a run without the env var set gets a
  // different reel from one with it.
  const py = readFileSync("scripts/kokoro-say.py", "utf8");
  const pyMatch = py.match(/job\.get\("speed", ([0-9.]+)\)/);
  assert.ok(pyMatch, "kokoro-say.py no longer has a default speed");
  assert.equal(Number(pyMatch![1]), base,
    "the recorder and its fallback disagree about how fast to read");
});
