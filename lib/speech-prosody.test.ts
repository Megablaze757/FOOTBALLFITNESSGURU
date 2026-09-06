import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BASE_SPEED,
  GAIN,
  GAIN_RANGE_DB,
  RATE,
  VOICE,
  gainFor,
  roleOf,
  shapeGains,
  shapeRates,
  speedFor,
} from "./speech-prosody";

/**
 * The measurement that chose this voice is checked in as
 * scripts/measure-voice.py. bf_emma — what this project used — measured 2.20
 * semitones of pitch variation, LAST of the eight British voices and inside
 * the range speech research calls monotone.
 */
test("the voice is not the one that measured monotone", () => {
  assert.notEqual(VOICE, "bf_emma", "back to the voice that measured 2.20 semitones");
  assert.match(VOICE, /^b[fm]_/, "not a British voice, in an app that prices in pounds");
});

/**
 * A listener hears CHANGE. A reel whose every phrase is spoken at one rate has
 * none to hear, however good the voice — tempo is the other half of prosody
 * and it was the half this project had no control over at all.
 */
test("the rates actually differ, or there is nothing to hear", () => {
  const rates = Object.values(RATE);
  assert.ok(new Set(rates).size === rates.length, "two roles share a rate");
  assert.ok(Math.max(...rates) - Math.min(...rates) >= 0.1,
    `a ${(Math.max(...rates) - Math.min(...rates)).toFixed(2)} spread is not audible variation`);
});

/** Past about ±12% the voice stops sounding like one person. */
test("the variation stays inside one speaker", () => {
  for (const [role, rate] of Object.entries(RATE)) {
    assert.ok(rate >= 0.85 && rate <= 1.15, `${role} at ${rate} is a different person`);
  }
});

test("the payoff is the slowest thing in the reel", () => {
  for (const [role, rate] of Object.entries(RATE)) {
    if (role === "payoff") continue;
    assert.ok(RATE.payoff < rate, `${role} is spoken slower than the payoff`);
  }
  assert.ok(RATE.setup > RATE.hook, "the hook is not given more time than connective material");
});

/**
 * First and last are the reel's, not each beat's. A hook that resets every
 * beat is four hooks and no reel.
 */
test("the hook is the first phrase and the payoff the last", () => {
  assert.equal(roleOf(0, 5, "anything"), "hook");
  assert.equal(roleOf(4, 5, "anything"), "payoff");
  assert.equal(roleOf(0, 1, "only one"), "hook", "a single phrase is the hook, not the payoff");
});

/**
 * THE SPOKEN FORM, which is what production actually passes.
 *
 * These rates are chosen in narrate(), after lib/spoken-numbers.ts has turned
 * "£3.19" into "three pounds nineteen" and "30g" into "thirty grams" — so by
 * the time a phrase reaches roleOf there is no currency symbol and no digit
 * left in it. A first version of this test used the written forms and passed
 * on branches of the pattern that can never fire in the real pipeline.
 */
test("a phrase carrying a number is given time to be heard as one", () => {
  const spoken = [
    "It costs three pounds nineteen",
    "thirty grams of protein",
    "ten times the price",
    "twenty percent of your calories",
    "Cheapest: thirty-one pence.",
  ];
  for (const line of spoken) {
    assert.equal(roleOf(1, 5, line), "figure", line);
  }
  // And still catches the written form, for any caller that skips spokenForm.
  for (const line of ["It costs £3.19", "30 grams of protein"]) {
    assert.equal(roleOf(1, 5, line), "figure", line);
  }
  assert.equal(roleOf(1, 5, "Every recipe is costed the same way"), "setup");
  assert.equal(roleOf(1, 5, "Not a warning you can ignore"), "setup");
});

/**
 * The rates are applied to the SPOKEN phrases, so a check against the written
 * script would be testing a string that never reaches the synthesiser.
 */
test("the recorder shapes the spoken phrases, not the written ones", () => {
  const src = readFileSync("scripts/record-reel.mts", "utf8");
  assert.match(src, /shapeRates\(flat\.map\(\(p\) => p\.text\)/,
    "the rates are computed from something other than the phrases actually spoken");
  assert.ok(
    src.indexOf("spokenForm") < src.indexOf("shapeRates(flat"),
    "rates are shaped before the numbers are turned into words",
  );
});

test("shaping a whole reel gives every phrase a speed and varies them", () => {
  const phrases = [
    "Same protein. Ten times the price.",
    "Red lentils: thirty-one pence.",
    "Every recipe is costed the same way.",
    "Before you go.",
  ];
  const rates = shapeRates(phrases);
  assert.equal(rates.length, phrases.length);
  assert.ok(new Set(rates).size >= 3, `only ${new Set(rates).size} distinct rates across a whole reel`);
  assert.equal(rates[0], speedFor("hook"));
  assert.equal(rates[rates.length - 1], speedFor("payoff"));
  for (const r of rates) assert.ok(r > 0.5 && r < 1.5, `${r} is not a speech rate`);
});

test("nothing in, nothing out", () => {
  assert.deepEqual(shapeRates([]), []);
});

test("the base rate is under natural pace, not over it", () => {
  assert.ok(BASE_SPEED <= 1.0, `${BASE_SPEED}x is faster than natural`);
  assert.ok(BASE_SPEED >= 0.85, `${BASE_SPEED}x is slow enough to sound wrong`);
});

// ═══════════════════════════════════════════════════════════════════════════
// LOUDNESS.
//
// Measured across all 21 phrases of all four reels, Kokoro speaks every phrase
// at the same level: 0.30 dB of standard deviation, 1.01 dB from the quietest
// to the loudest. These are the numbers that put the contrast back.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The one that matters. The voice already peaks at 1.02 of full scale, so a
 * positive gain has nowhere to go: it wraps into the clamp in lib/wav.ts and
 * pegs samples at full scale. Every boosted variant was measured doing exactly
 * that, which is why the shape is cut downward from a ceiling of zero and the
 * level is restored on the assembled track instead.
 */
test("no line is laid louder than it was spoken", () => {
  for (const [role, db] of Object.entries(GAIN)) {
    assert.ok(db <= 0, `${role} is boosted by ${db}dB, and there is no headroom to boost into`);
  }
  assert.equal(Math.max(...Object.values(GAIN)), 0, "nothing is at the ceiling, so the whole reel is quiet for no reason");
});

test("the payoff is the loudest thing in the reel and the setup the quietest", () => {
  const levels = Object.values(GAIN);
  assert.equal(gainFor("payoff"), Math.max(...levels));
  assert.equal(gainFor("setup"), Math.min(...levels));
  assert.ok(gainFor("figure") > gainFor("setup"), "a number is said at the same volume as the words around it");
  assert.ok(gainFor("hook") > gainFor("setup"), "the hook does not stand out from the line after it");
});

test("the spread is wide enough to hear and narrow enough to follow", () => {
  const levels = Object.values(GAIN);
  const spread = Math.max(...levels) - Math.min(...levels);
  assert.equal(spread, GAIN_RANGE_DB, "the documented range and the table disagree");
  // Read speech is 4-6 dB of phrase-to-phrase variation, animated 8-12. Under
  // 4 is the flatness this was written to fix; over 12 buries the setup.
  assert.ok(spread >= 4, `${spread}dB is inside the variation the voice already had`);
  assert.ok(spread <= 12, `${spread}dB leaves the quiet lines inaudible on a phone`);
});

test("shaping a whole reel gives every phrase a loudness and varies them", () => {
  const phrases = [
    "Same protein. Ten times the price.",
    "Red lentils: thirty-one pence.",
    "Every recipe is costed the same way.",
    "Before you spend a penny.",
  ];
  const gains = shapeGains(phrases);
  assert.equal(gains.length, phrases.length);
  assert.ok(new Set(gains).size >= 3, `only ${new Set(gains).size} distinct levels across a whole reel`);
  assert.equal(gains[0], gainFor("hook"));
  assert.equal(gains[gains.length - 1], gainFor("payoff"));
  assert.deepEqual(shapeGains([]), []);
});

/**
 * Rates are shaped from the spoken phrases; so must these be. Shaping the
 * written script would hand the wrong loudness to every line after the first
 * number, because spokenForm splits "£3.19" into words and changes the count.
 */
test("the recorder shapes the loudness of the spoken phrases too", () => {
  const src = readFileSync("scripts/record-reel.mts", "utf8");
  assert.match(src, /shapeGains\(flat\.map\(\(p\) => p\.text\)/,
    "the loudness is computed from something other than the phrases actually spoken");
  assert.match(src, /gainDb: clip\.phrase\.gainDb/,
    "the shaped loudness never reaches the track");
  assert.match(src, /normalised\(first\.format, track\)/,
    "the track is only ever cut, so the reel ships quieter than the last one");
});
