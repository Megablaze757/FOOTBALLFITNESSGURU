import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spokenForm, words } from "./spoken-numbers";
import { BASE_SPEED, RATE, VOICE, SHELF_DB, CHATTERBOX_TEMPO, pitchRatioFor, shelfDbFor } from "./speech-prosody";

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
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AND THEN: "THE VOICE IS PUTTING ME TO SLEEP IT NEEDS TO BE EXCITING."
 *
 * That reasoning was sound for something a person sat down to watch and wrong
 * for something competing with a thumb. Measured across all four finished
 * reels it produced 122 words a minute with 35% of the reel silent, against
 * 180-220 for the register these are aiming at.
 *
 * So the BAND moves and the guard stays. What this test is actually for is
 * unchanged and still worth having: a rate nobody can see, living in a script
 * rather than a module, drifting away from the value the recorder's fallback
 * uses. The ceiling is now set by measured articulation — 1.35 gives 190 words
 * a minute, 1.42 gives 201, 1.5 gives 209 — rather than by "slightly slow".
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the recorder never asks the voice to hurry", () => {
  /**
   * The rate lives in lib/speech-prosody.ts now — one per phrase rather than
   * one for the reel — so this checks the BASE the roles multiply, and that
   * no role is allowed to push past natural pace.
   */
  /**
   * IMPORTED, NOT SCRAPED. This read the file and pulled every
   * `  <role>: <number>,` out of it, which is a guard that matches whatever
   * happens to be written in that shape — and the moment a second table of
   * roles appeared (GAIN, the per-role loudness) it started scraping that one
   * too and counting `payoff: 0` as a speech rate. The values are exported;
   * reading the export cannot pick up the wrong table.
   */
  assert.ok(BASE_SPEED <= 1.6, `the base rate is ${BASE_SPEED}x — past this it stops being speech`);
  assert.ok(BASE_SPEED >= 1.2, `${BASE_SPEED}x is back under the pace that read as sleepy`);

  const rates = Object.values(RATE);
  assert.equal(rates.length, 4, "a role lost its rate");
  for (const r of rates) {
    assert.ok(BASE_SPEED * r <= 1.6, `a role reaches ${(BASE_SPEED * r).toFixed(2)}x, which is a rush`);
  }

  // The Python fallback must agree, or a run without the env var set gets a
  // different reel from one with it.
  const py = readFileSync("scripts/kokoro-say.py", "utf8");
  const pyMatch = py.match(/job\.get\("speed", ([0-9.]+)\)/);
  assert.ok(pyMatch, "kokoro-say.py no longer has a default speed");
  assert.equal(Number(pyMatch![1]), BASE_SPEED,
    "the recorder and its fallback disagree about how fast to read");

  /**
   * AND THE SAME FOR THE VOICE, which had drifted for exactly as long and was
   * caught by nothing: the fallback still named bf_alice three voices later.
   * A default nobody checks is a second configuration nobody knows about.
   */
  const voiceMatch = py.match(/job\.get\("voice", "([a-z_]+)"\)/);
  assert.ok(voiceMatch, "kokoro-say.py no longer has a default voice");
  assert.equal(voiceMatch![1], VOICE,
    "the recorder and its fallback disagree about who is speaking");

  /**
   * AND THE PITCH, which is a third setting in the same shape and would drift
   * the same way. It is the one a listener notices first: the complaint that
   * put it here was "too high pitched", and a fallback stuck at the old value
   * would put that back on any run that did not send the field.
   */
  const pitchMatch = py.match(/job\.get\("pitch", ([0-9.]+)\)/);
  assert.ok(pitchMatch, "kokoro-say.py no longer has a default pitch");
  assert.equal(Number(pitchMatch![1]), pitchRatioFor("kokoro"),
    "the recorder and its fallback disagree about how low the voice is");

  /**
   * The shelf is not a tone preference, it is the other half of the shift:
   * dropping four semitones moves energy out of the band a phone speaker
   * reproduces, and this puts it back. Shipping one without the other gives a
   * voice that is lower AND thinner.
   */
  const shelfMatch = py.match(/job\.get\("shelf_db", ([0-9.]+)\)/);
  assert.ok(shelfMatch, "kokoro-say.py no longer has a default shelf");
  assert.equal(Number(shelfMatch![1]), SHELF_DB,
    "the pitch shift ships without the correction that makes it survive a phone");

  /**
   * AND THE OTHER ENGINE, which has the same three settings plus a tempo it
   * cannot do for itself. Chatterbox is the default now, so its fallbacks are
   * the ones a run without the fields would actually use.
   */
  const cb = readFileSync("scripts/chatterbox-say.py", "utf8");
  const cbNum = (name: string) => {
    const m = cb.match(new RegExp(`job\\.get\\("${name}", ([0-9.]+)\\)`));
    assert.ok(m, `chatterbox-say.py no longer has a default ${name}`);
    return Number(m![1]);
  };
  /**
   * PER ENGINE, and that is the point. Chatterbox arrives at 94Hz and must be
   * left alone; one shared constant took it to 75Hz, under the male range.
   */
  assert.equal(cbNum("pitch"), pitchRatioFor("chatterbox"),
    "chatterbox would fall back to a shift measured for a different engine");
  assert.equal(cbNum("shelf_db"), shelfDbFor("chatterbox"),
    "an unshifted voice would get a shelf correcting for a loss it never had");
  assert.equal(cbNum("tempo"), CHATTERBOX_TEMPO,
    "chatterbox would fall back to a pace nobody chose");
});
