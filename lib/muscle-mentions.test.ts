import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyMention, readMentions, sentencesAbout, taggable } from "./muscle-mentions";
import { EXERCISES } from "./exercises";
import { readFileSync } from "node:fs";
import type { Exercise } from "./exercises";

/**
 * A fixture that ACTUALLY APPLIES its argument.
 *
 * The first version never spread `over` — it only used it in a type cast — so
 * every fixture was the same default and four tests were asserting things
 * about an exercise called "Thing". A helper that ignores its own argument
 * fails loudly here and would fail silently anywhere it happened to agree.
 */
const make = (over: Partial<Exercise>): Exercise => ({
  id: "x", name: "Thing", category: "Strength", demo: "push", equipment: "None",
  muscles: ["Quads"], tempo: "Controlled", cues: [], why: "", description: "",
  difficulty: "beginner",
  ...over,
} as Exercise);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TAGGING ON A BARE MENTION WOULD PUBLISH SOMETHING UNTRUE.
 *
 * "Grip" appears 43 times in the catalogue and "lower back" 38, and the great
 * majority are cues telling you to keep the load OUT of that place. A tag
 * built from the mention alone puts the deadlift on the lower-back hub as an
 * exercise that trains the lower back — wrong content on a page built to
 * answer a question, which is worse than a thin page.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a cue telling you to protect a muscle is never read as training it", () => {
  for (const sentence of [
    "Keep your lower back neutral throughout.",
    "Without arching your lower back.",
    "Don't hyperextend the lower back to fake more range.",
    "Rotate from the ribcage, not the lower back.",
    "Avoid rounding the lower back.",
    "The bench takes the lower back out of it.",
    "If you feel it in your lower back, tuck the pelvis harder.",
    "Dumbbells keep the load closer, which is easier on the lower back.",
    "It punishes a rounded lower back.",
    "Nothing sits on your lower back.",
  ]) {
    assert.equal(classifyMention(sentence, "lower back"), "protects", sentence);
  }
});

test("a sentence saying what a movement works is read as training", () => {
  for (const sentence of [
    "Trains the obliques and rotational core.",
    "Direct work for the upper back and traps.",
    "Strengthens the adductors and groin.",
    "It builds strength through the adductors.",
    "A small movement targeting the obliques.",
  ]) {
    assert.equal(classifyMention(sentence, sentence.match(/obliques|upper back|adductors/)![0]), "trains", sentence);
  }
});

/**
 * The bar RESTS on the upper back; the squat does not train it. Both of these
 * sentences also contain a coaching verb, which is why a rule looking only for
 * verbs called the back squat and the lunge upper-back exercises.
 */
test("equipment resting on a muscle is not training it", () => {
  for (const sentence of [
    "With the bar racked on your upper back, brace your core and sit down.",
    "Bar on the upper back, step forward into a long stride.",
    "Keep the dumbbells against your chest and squeeze the glutes.",
  ]) {
    const muscle = sentence.match(/upper back|chest/)![0];
    assert.equal(classifyMention(sentence, muscle), "holds", sentence);
  }
});

/** "The load on the glutes" is training. Only KIT sitting somewhere is not. */
test("a load on a muscle is still training it", () => {
  assert.equal(classifyMention("It puts the load on the glutes rather than the quads.", "glutes"), "trains");
});

test("a mention with nothing around it is left for a person", () => {
  assert.equal(classifyMention("Three sets of ten, glutes.", "glutes"), "unclear");
  assert.equal(classifyMention("", "glutes"), "unclear");
  assert.equal(classifyMention("Nothing about it here.", "glutes"), "unclear");
});

test("only sentences that actually name the muscle are considered", () => {
  const text = "Sit between your hips. Trains the obliques hard. Stand up.";
  assert.deepEqual(sentencesAbout(text, "obliques"), ["Trains the obliques hard."]);
  assert.deepEqual(sentencesAbout(text, "glutes"), []);
});

// --- reading a whole entry ---------------------------------------------------

test("an exercise already tagged is never a candidate", () => {
  const all = [make({ id: "a", name: "Russian Twist", muscles: ["Obliques"], why: "Trains the obliques." })];
  assert.deepEqual(readMentions(all, "Obliques"), []);
});

/**
 * A name is the strongest signal there is — nobody names a movement after the
 * thing they are trying to keep out of it.
 */
test("a movement named after the muscle trains it", () => {
  const all = [make({ id: "a", name: "Glute bridge", muscles: ["Hamstrings"] })];
  assert.deepEqual(readMentions(all, "glute"), [
    { id: "a", name: "Glute bridge", kind: "trains", evidence: "Glute bridge" },
  ]);
});

/**
 * ...except where the word is a HAND POSITION. Thirteen of the grip
 * "candidates" were "Close Grip Bench Press" and its relatives, and a title is
 * where this word is least likely to mean the muscle.
 */
test("a grip in a name is a hand position, not a muscle", () => {
  for (const name of [
    "Close Grip Bench Press", "Neutral Grip Pull Ups", "Wide Grip Lat Pulldown",
    "Reverse Grip Row", "Mixed Grip Deadlift",
  ]) {
    const found = readMentions([make({ id: "a", name, muscles: ["Chest"] })], "grip");
    assert.ok(
      !found.some((m) => m.kind === "trains"),
      `${name} was read as training the grip`,
    );
  }
});

/** One warning outweighs any number of enthusiastic sentences about something
 *  else in the same entry. */
test("a protective sentence settles the whole entry", () => {
  const all = [make({
    id: "a", name: "Barbell hip thrust", muscles: ["Glutes"],
    why: "Loads the glutes hard through a full range.",
    cues: ["Drive through the heels", "Don't hyperextend the lower back"],
  })];
  const found = readMentions(all, "lower back");
  assert.equal(found[0]?.kind, "protects", JSON.stringify(found));
});

/**
 * A positional clause is a fallback, not a veto. The bar sitting on your upper
 * back and the movement training it are not mutually exclusive — and an entry
 * that says so explicitly is telling you something the setup clause cannot
 * override.
 */
test("an explicit training sentence beats a positional one in the same entry", () => {
  const all = [make({
    id: "a", name: "Thing", muscles: ["Quads"],
    why: "Bar on the upper back, step forward.",
    cues: ["Direct work for the upper back and traps."],
  })];
  const found = readMentions(all, "upper back");
  assert.equal(found[0]?.kind, "trains", JSON.stringify(found));
  assert.match(found[0].evidence, /Direct work/);
});

/** With no training sentence, the positional reading stands. */
test("a positional mention on its own is not training", () => {
  const all = [make({ id: "a", name: "Thing", muscles: ["Quads"], why: "Bar on the upper back, step forward." })];
  assert.equal(readMentions(all, "upper back")[0]?.kind, "holds");
});

test("the evidence is the sentence it was read from, so it can be judged", () => {
  const all = [make({ id: "a", name: "Side Crunch", muscles: ["Abs"], why: "A small movement targeting the obliques." })];
  assert.equal(readMentions(all, "obliques")[0].evidence, "A small movement targeting the obliques.");
});

// --- against the real catalogue ----------------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CASES THAT WERE ACTUALLY WRONG, PINNED.
 *
 * Every one of these was produced by an earlier version of this file and found
 * by reading its output rather than by reasoning about it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the entries this got wrong before, it gets right now", () => {
  const wrong: [string, string][] = [
    ["Barbell back squat", "Upper back"],   // the bar rests there
    ["Barbell Lunge", "Upper back"],        // so does this one
    ["Barbell Front Squat", "Upper back"],  // "punishes a rounded upper back"
    ["Chest Supported Dumbbell Row", "Lower back"], // "takes the lower back out"
    ["Dumbbell Deadlift", "Lower back"],    // "easier on the lower back"
    ["Glute bridge", "Lower back"],         // "if you feel it in your lower back"
    ["Close Grip Bench Press", "Grip"],     // a hand position
  ];
  for (const [name, muscle] of wrong) {
    const found = taggable(EXERCISES, muscle).find((m) => m.name === name);
    assert.equal(found, undefined, `${name} is still offered as training the ${muscle}`);
  }
});

test("the entries that genuinely do train these muscles are still offered", () => {
  const right: [string, string][] = [
    ["Russian Twist", "Obliques"],
    ["Side Crunch", "Obliques"],
    ["Copenhagen plank", "Groin"],
    ["Face Pull", "Rear delts"],
    ["Dumbbell Shrug", "Upper back"],
  ];
  for (const [name, muscle] of right) {
    assert.ok(
      taggable(EXERCISES, muscle).some((m) => m.name === name),
      `${name} is no longer offered for the ${muscle} — the rules have got too strict`,
    );
  }
});

/**
 * The number that matters. Reading context turns 150 bare mentions into a
 * shortlist a person can actually work through — and a shortlist is the point:
 * the evidence is shown BECAUSE the rule can still be wrong.
 */
test("reading the context removes most of the noise, and keeps some signal", () => {
  const muscles = ["Lower back", "Grip", "Hands", "Upper back", "Obliques", "Adductors", "Rear delts", "Groin"];
  let raw = 0;
  let offered = 0;
  for (const muscle of muscles) {
    raw += readMentions(EXERCISES, muscle).length;
    offered += taggable(EXERCISES, muscle).length;
  }
  assert.ok(raw > 100, `only ${raw} raw mentions — has the catalogue changed shape?`);
  assert.ok(offered > 0, "nothing at all is offered, so this closes no gaps");
  assert.ok(offered < raw / 4, `${offered} of ${raw} offered — the rules have stopped filtering`);
});

/**
 * The panel has to show the EVIDENCE, not just a count.
 *
 * "1 existing exercise already mentions this" is a number somebody has to go
 * and find. And the sentence is what makes the list trustworthy: this is a
 * shortlist for a person, not an autopilot, and hiding the reason would ask
 * them to take a regex's word for it.
 */
test("the admin panel shows what to retag and why", () => {
  const src = readFileSync("components/ContentEngine.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
  assert.match(src, /taggable\(EXERCISES, g\.name\)/, "the gaps list still shows only a count");
  assert.match(src, /m\.evidence/, "it names entries without showing why, so nobody can check it");
});

/** content-gaps must not go back to counting bare mentions. */
test("the gap count is the classified one, not every occurrence", () => {
  const src = readFileSync("lib/content-gaps.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.match(src, /return taggable\(all, name\)\.length;/,
    "mentionsButUntagged counts raw occurrences again — most of which say the opposite");
  assert.ok(!/pattern\.test\(`\$\{e\.name\}/.test(src), "the old bare-mention scan is back");
});
