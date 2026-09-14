import { test } from "node:test";
import assert from "node:assert/strict";
import { GAP, PAYOFF_MAX_WORDS, phrases, totalGapMs, jitter, GAP_JITTER} from "./speech-timing";
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
  // The jittered value of the right constant: which RULE fired is the point,
  // and the exact number moves with the words now. See "no reel repeats a pause".
  assert.equal(parts[0].gapMs, jitter(GAP.payoff, parts[0].text), "no beat before the payoff");
  assert.ok(GAP.payoff > GAP.sentence && GAP.payoff > GAP.question, "the payoff gap is not the longest");
});

/** A gap before a long final sentence is a stall, not a beat. */
test("a long closing sentence gets an ordinary gap", () => {
  // A FIXED length, not PAYOFF_MAX_WORDS + n. Deriving the fixture from the
  // constant made the test scale with it, so raising the ceiling to 80 left
  // this green — the mutation moved the goalposts and the test followed.
  const long = Array.from({ length: 20 }, (_, i) => `word${i}`).join(" ");
  const parts = phrases(`Something short first. ${long}.`);
  assert.equal(parts[0].gapMs, jitter(GAP.sentence, parts[0].text),
    `${PAYOFF_MAX_WORDS}-word ceiling not applied`);
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
  assert.equal(parts[0].gapMs, jitter(GAP.question, parts[0].text));
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOMEWHERE FOR THE TENSION TO SIT. "No pausing for suspense."
 *
 * `payoff` only ever fired before the LAST phrase of a reel, so a script that
 * builds to something in the middle — the shape of every good one — got the
 * same 200ms clause gap at the reveal as between two ordinary clauses.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a short line after a long one gets a real pause, wherever it falls", () => {
  const list = phrases(
    "Every food here gives you the same thirty grams of protein. Thirty-one pence. And it goes on.",
  );
  assert.equal(list.length, 3);
  assert.equal(list[0].gapMs, jitter(GAP.reveal, list[0].text),
    `the reveal got ${list[0].gapMs}ms — the same as any other sentence break`);
  assert.ok(GAP.reveal > GAP.sentence, "the reveal pause is no longer than an ordinary one");
});

/** A run of short lines is a stutter, not suspense. */
test("short lines in a row do not each get a suspense pause", () => {
  for (const p of phrases("Same protein. Same day. Same shop. Big difference.").slice(0, -1)) {
    assert.notEqual(p.gapMs, GAP.reveal, `"${p.text}" was treated as a setup for a reveal`);
  }
});

test("the reveal pause is long enough to hear and short enough to hold", () => {
  assert.ok(GAP.reveal >= 800, `${GAP.reveal}ms is not heard as deliberate`);
  assert.ok(GAP.reveal <= 1400, `${GAP.reveal}ms is long enough for a thumb to move`);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PAUSE IS ONLY A PAUSE RELATIVE TO THE ONES AROUND IT.
 *
 * "The voice is putting me to sleep." Every gap in the table had been widened
 * at once after an earlier "too fast paced", which left a deliberate pause
 * before a punchline only 1.7x an ordinary sentence break — close enough that
 * the device stopped registering as one, and the reel just got slower.
 *
 * This guards the SHAPE rather than the values, so the numbers can still be
 * argued with: what may not happen again is every gap being moved together
 * until the contrast is gone.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the dramatic pauses stand well clear of the routine ones", () => {
  assert.ok(GAP.payoff >= GAP.sentence * 2.5,
    `a payoff pause is ${(GAP.payoff / GAP.sentence).toFixed(1)}x an ordinary sentence break — not heard as a device`);
  assert.ok(GAP.reveal >= GAP.sentence * 2.5,
    `a reveal pause is ${(GAP.reveal / GAP.sentence).toFixed(1)}x an ordinary sentence break — not heard as a device`);
  assert.ok(GAP.clause < GAP.sentence && GAP.sentence < GAP.question,
    "the routine gaps are no longer in order");
});

/**
 * Dead air is most of what "slow" is, and it is the one thing here that is
 * spent rather than earned: a reel has thirty seconds and every millisecond of
 * silence between two ordinary clauses is one not spent saying something.
 *
 * Measured on the standards narration as it shipped: 96 words per minute and
 * 37% of the reel silent, against 180-220 wpm for the register this is aiming
 * at. See scripts/measure-excitement.py.
 */
test("an ordinary sentence break does not cost half a second", () => {
  assert.ok(GAP.sentence <= 350, `${GAP.sentence}ms between two ordinary sentences reads as a stall`);
  assert.ok(GAP.clause <= 200, `${GAP.clause}ms inside one sentence is a stutter the ear hears as hesitation`);
});

// ═══════════════════════════════════════════════════════════════════════════
// "VOICE SOUNDS VERY ROBOTIC", with every measured axis in range.
//
// Measured on a finished reel, the gaps between its nine phrases were
// 900, 360, 1150, 900, 2660, 900, 2760, 360 — 900 three times and 360 twice,
// identical to the millisecond, because they come from a table of five
// constants. Exact repetition is the most mechanical thing a rhythm can do,
// and this file's own opening asks for the opposite.
// ═══════════════════════════════════════════════════════════════════════════

test("the same words always get the same pause", () => {
  assert.equal(jitter(GAP.sentence, "Same bar."), jitter(GAP.sentence, "Same bar."));
  /**
   * DERIVED, NOT RANDOM. A random jitter would make two recordings of one
   * script differ, which breaks the caption-sync check and every comparison
   * between takes.
   */
  const twice = [jitter(GAP.payoff, "Means nothing."), jitter(GAP.payoff, "Means nothing.")];
  assert.equal(twice[0], twice[1]);
});

test("two phrases do not get the same pause", () => {
  /** Consecutive lines in these scripts are often nearly identical. */
  assert.notEqual(jitter(GAP.sentence, "Means nothing."), jitter(GAP.sentence, "Means everything."));
  assert.notEqual(jitter(GAP.sentence, "a"), jitter(GAP.sentence, "b"));
});

test("no reel repeats a pause exactly", () => {
  for (const { id } of SCRIPTS) {
    const script = reelScript(id, "");
    if (!script) continue;
    const gaps: number[] = [];
    for (const b of script.beats) {
      if (!b.say.trim()) continue;
      for (const p of phrases(b.say)) if (p.gapMs > 0) gaps.push(p.gapMs);
    }
    assert.equal(new Set(gaps).size, gaps.length,
      `${id} pauses for the same length twice: ${gaps.join(", ")}`);
  }
});

test("the jitter moves a gap without changing what it is", () => {
  for (const base of [GAP.clause, GAP.sentence, GAP.question, GAP.payoff, GAP.reveal]) {
    for (const text of ["one", "two", "three", "Means nothing.", "£0.31 from red lentils."]) {
      const got = jitter(base, text);
      assert.ok(Math.abs(got - base) <= Math.ceil(base * GAP_JITTER),
        `${got}ms is more than ${GAP_JITTER * 100}% off ${base}ms`);
      assert.ok(got > 0, "a jittered gap became nothing");
    }
  }
});

/** A payoff must still outrank an ordinary break at every jittered extreme. */
test("jitter never lets a routine pause overtake a dramatic one", () => {
  const widest = (n: number) => n * (1 + GAP_JITTER);
  const narrowest = (n: number) => n * (1 - GAP_JITTER);
  assert.ok(narrowest(GAP.payoff) > widest(GAP.sentence) * 1.5,
    "a jittered sentence break can reach a jittered payoff pause");
  assert.ok(narrowest(GAP.reveal) > widest(GAP.question),
    "a jittered question can reach a jittered reveal");
});

test("a phrase with no pause after it still has none", () => {
  assert.equal(jitter(0, "the last phrase of a beat"), 0);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A LINE OF NUMBERS IS LONGER THAN IT LOOKS, AND THE PAUSES DEPEND ON IT.
 *
 * "100kg at 60kg bodyweight is exceptional." is six written tokens and nine
 * spoken words. Counted as six it was a short punchline, so the line before it
 * got a payoff pause it had not earned, and it was too short to be a setup, so
 * the reveal after it lost one.
 *
 * The fourth place this fault appeared. It is guarded here so there is not a
 * fifth.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a line of numbers is measured by what it takes to say", () => {
  const written = "100kg at 60kg bodyweight is exceptional.";
  assert.ok(written.split(/\s+/).length <= PAYOFF_MAX_WORDS,
    "this line is no longer short enough written to make the point");

  /**
   * Followed by a short line, so if this one counted as a punchline the gap
   * BEFORE it would be a payoff pause. It should be an ordinary break.
   */
  const list = phrases(`Nothing at all happens here first. ${written} Same bar.`);
  const before = list[0];
  assert.notEqual(before.gapMs, jitter(GAP.payoff, before.text),
    `a nine-word line was treated as a punchline, so "${before.text}" got a payoff pause`);
});

test("a numeric line is long enough to set up a reveal", () => {
  /**
   * THREE PHRASES, because the payoff branch is checked first and fires when
   * the short line is also the LAST one. A two-phrase version of this tested
   * the payoff rule and reported the reveal rule broken — the script it is
   * taken from has three.
   */
  const list = phrases("100kg at 60kg bodyweight is exceptional. At 120kg, novice. Same bar.");
  assert.equal(list[0].gapMs, jitter(GAP.reveal, list[0].text),
    `the setup before a reveal got ${list[0].gapMs}ms — counted as six words, not nine`);
});
