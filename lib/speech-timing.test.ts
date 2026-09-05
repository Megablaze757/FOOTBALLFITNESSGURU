import { test } from "node:test";
import assert from "node:assert/strict";
import { GAP, PAYOFF_MAX_WORDS, phrases, totalGapMs } from "./speech-timing";
import { SCRIPTS, reelScript } from "./reel-script";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE BUG THAT WOULD HAVE BEEN IN EVERY SINGLE REEL.
 *
 * "£0.31 from red lentils" contains a full stop. Splitting sentences on it
 * gives "£0." and "31 from red lentils" — a voice saying "nought pounds",
 * stopping dead, and starting again on a number. Every price in this app is
 * written that way and the costed shopping list is the reel we lead with, so
 * this is the common case rather than an edge one.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a price is never mistaken for the end of a sentence", () => {
  for (const line of [
    "Thirty grams costs £0.31 from red lentils.",
    "It went from 3.5 to 4.2 in a week.",
    "That is 1.5 times what you paid.",
  ]) {
    const parts = phrases(line);
    assert.equal(parts.length, 1, `${line} → ${parts.map((p) => `"${p.text}"`).join(" + ")}`);
    assert.equal(parts[0].text, line);
  }
});

test("sentences are split and the punctuation stays attached", () => {
  const parts = phrases("One thing here. Another thing there. A third thing to say.");
  assert.deepEqual(parts.map((p) => p.text), [
    "One thing here.", "Another thing there.", "A third thing to say.",
  ]);
});

/** The gap a person leaves and a text-to-speech engine never does. */
test("the longest gap in a line is the one before the punchline", () => {
  const parts = phrases("The same thirty grams from a chicken breast. Three times that.");
  assert.equal(parts[0].gapMs, GAP.payoff, "no beat before the payoff");
  assert.ok(GAP.payoff > GAP.sentence && GAP.payoff > GAP.question, "the payoff gap is not the longest");
});

/** A gap before a long final sentence is a stall, not a beat. */
test("a long closing sentence gets an ordinary gap", () => {
  // A FIXED length, not PAYOFF_MAX_WORDS + n. Deriving the fixture from the
  // constant made the test scale with it, so raising the ceiling to 80 left
  // this green — the mutation moved the goalposts and the test followed.
  const long = Array.from({ length: 20 }, (_, i) => `word${i}`).join(" ");
  const parts = phrases(`Something short first. ${long}.`);
  assert.equal(parts[0].gapMs, GAP.sentence, `${PAYOFF_MAX_WORDS}-word ceiling not applied`);
  assert.ok(PAYOFF_MAX_WORDS < 20, `a ${PAYOFF_MAX_WORDS}-word "punchline" is a sentence, not a beat`);
});

/**
 * The other half of the price rule, and the half a lookbehind got wrong: a
 * sentence that genuinely ENDS on a digit still ends. "You did 12. That is a
 * personal best." is two thoughts, and this app writes lines like that
 * constantly.
 */
test("a sentence that ends on a digit still ends", () => {
  assert.deepEqual(
    phrases("It cost £4. Then we left.").map((p) => p.text),
    ["It cost £4.", "Then we left."],
  );
  assert.deepEqual(
    phrases("You did 12. That is a personal best.").map((p) => p.text),
    ["You did 12.", "That is a personal best."],
  );
});

test("a question asks for a moment", () => {
  const parts = phrases("Is your bench any good? Here is what the numbers say about it. And then some more.");
  assert.equal(parts[0].gapMs, GAP.question);
});

test("the last phrase never has a gap after it — the picture ends it", () => {
  for (const line of [
    "One. Two. Three.",
    "Only one thing.",
    "A question? An answer.",
  ]) {
    const parts = phrases(line);
    assert.equal(parts[parts.length - 1].gapMs, 0, line);
  }
});

test("nothing to say produces nothing, rather than a silent phrase", () => {
  for (const line of ["", "   ", ".", "...", null as unknown as string, undefined as unknown as string]) {
    assert.deepEqual(phrases(line), [], JSON.stringify(line));
  }
});

test("doubled punctuation does not create empty phrases", () => {
  for (const line of ["Wait!! Really?! Yes.", "What?? Three times."]) {
    const parts = phrases(line);
    assert.ok(parts.every((p) => p.text.trim().length > 0), `${line} → ${JSON.stringify(parts)}`);
    assert.ok(parts.length >= 2, line);
  }
});

test("the gaps add up, so a beat can be made long enough for them", () => {
  const parts = phrases("A first thing. A question? The end.");
  assert.equal(totalGapMs(parts), parts.reduce((n, p) => n + p.gapMs, 0));
  assert.ok(totalGapMs(parts) > 0);
  assert.equal(totalGapMs([]), 0);
});

/**
 * The lines that will actually be spoken. A split that produces a fragment
 * beginning with a digit or a lone symbol is a voice saying something that is
 * not a sentence — the failure this whole file exists to prevent.
 */
test("every line the app would narrate splits into real phrases", () => {
  for (const { id, label } of SCRIPTS) {
    const script = reelScript(id, "Five-spot shooting");
    assert.ok(script, id);
    for (const beat of script.beats) {
      if (!beat.say) continue;
      const parts = phrases(beat.say);
      assert.ok(parts.length > 0, `${label}: "${beat.say}" produced nothing`);
      for (const part of parts) {
        assert.ok(part.text.length > 1, `${label}: fragment "${part.text}" from "${beat.say}"`);
        assert.ok(
          /^[^\s.,!?;:]/.test(part.text),
          `${label}: "${part.text}" starts on punctuation, so it was split mid-sentence`,
        );
      }
      assert.equal(parts.map((p) => p.text).join(" ").replace(/\s+/g, " "), beat.say.replace(/\s+/g, " "),
        `${label}: splitting "${beat.say}" lost or added words`);
    }
  }
});
