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
  expressionFor,
  shapeExpression,
  EXAGGERATION_MIN,
  EXAGGERATION_MAX,
  CFG_MIN,
  CFG_MAX,
  REFERENCE_VOICE,
  REFERENCE_LINE,
  REFERENCE_WAV,
  type Role,
} from "./speech-prosody";
import { APP_NAME } from "./signup-link";

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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE KNOB KOKORO DOES NOT HAVE.
 *
 * "It needs to feel excited, grab the audience's attention, not just talking
 * at you like it's reading off a script."
 *
 * Rate and loudness are everything Kokoro exposes and its pitch variability
 * tops out around 4.35 semitones however it is tuned. Chatterbox measured
 * 5.4-6.2 on the same two lines with the same tracker, on every setting.
 *
 * What these guard is the SPREAD, because that is the part with a reason
 * behind it: a listener hears CHANGE, and the exact heat of the read is a
 * judgement for whoever publishes the reels. Same argument as RATE and GAIN.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a reel is not delivered at one setting from end to end", () => {
  const roles: Role[] = ["hook", "setup", "figure", "payoff"];
  const ex = roles.map((r) => expressionFor(r).exaggeration);
  const cfg = roles.map((r) => expressionFor(r).cfg);

  assert.ok(new Set(ex).size > 1, "every phrase is equally emphatic, which is the flatness being complained about");
  assert.ok(new Set(cfg).size > 1, "every phrase is paced identically");

  const at = (r: Role) => expressionFor(r);
  assert.ok(at("hook").exaggeration > at("setup").exaggeration,
    "the hook is no more emphatic than the connective material it is competing with");
  assert.ok(at("payoff").exaggeration > at("setup").exaggeration,
    "the line people remember is delivered like a subordinate clause");

  /** Lower cfg_weight is LOOSER AND QUICKER, so the hook and payoff sit under it. */
  assert.ok(at("hook").cfg < at("setup").cfg, "the hook is read as tightly as the setup");
  assert.ok(at("payoff").cfg < at("setup").cfg, "the payoff is read as tightly as the setup");
});

/**
 * Chatterbox accepts 0.25-2.0 for exaggeration, and past about 1.2 it stops
 * sounding like a read at all. A base the caller sets from an environment
 * variable can be anything, so the offsets must not carry it out of range.
 */
test("an extreme base is clamped rather than passed through", () => {
  for (const base of [0, -5, 5, 100]) {
    for (const role of ["hook", "setup", "figure", "payoff"] as Role[]) {
      const { exaggeration, cfg } = expressionFor(role, base, base);
      assert.ok(exaggeration >= EXAGGERATION_MIN && exaggeration <= EXAGGERATION_MAX,
        `base ${base} gave ${role} an exaggeration of ${exaggeration}`);
      assert.ok(cfg >= CFG_MIN && cfg <= CFG_MAX, `base ${base} gave ${role} a cfg of ${cfg}`);
    }
  }
});

/**
 * OFFSETS, NOT ABSOLUTES, so that picking a hotter read moves all four
 * together. A table of absolute values would have to be retyped four times
 * every time somebody listened and wanted more, and three of the four would
 * eventually be forgotten.
 */
test("raising the base moves every role and keeps the contrast", () => {
  const roles: Role[] = ["hook", "setup", "figure", "payoff"];
  const cool = roles.map((r) => expressionFor(r, 0.4).exaggeration);
  const hot = roles.map((r) => expressionFor(r, 0.7).exaggeration);

  for (const [i, role] of roles.entries()) {
    assert.ok(hot[i] > cool[i], `${role} did not move with the base`);
  }
  const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
  assert.ok(Math.abs(spread(hot) - spread(cool)) < 1e-9,
    "the contrast between roles changed with the level, so a hotter read is also a flatter one");
});

/** The flat list across the whole reel, for the same reason shapeRates takes one. */
test("expression is shaped across the reel, not per beat", () => {
  const phrases = ["You slept three hours.", "Every training app you own.", "It costs £0.31.", "PocketAthlete, free."];
  const shaped = shapeExpression(phrases);
  assert.equal(shaped.length, phrases.length);
  assert.deepEqual(shaped[0], expressionFor("hook"), "the first phrase of the reel is not the hook");
  assert.deepEqual(shaped[3], expressionFor("payoff"), "the last phrase of the reel is not the payoff");
  assert.deepEqual(shaped[2], expressionFor("figure"), "a phrase carrying a price is not read as a figure");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO ENGINES, ONE CONTRACT.
 *
 * scripts/chatterbox-say.py says it uses "the same contract as kokoro-say.py,
 * deliberately: a JSON job on stdin, one JSON line per phrase on stdout,
 * <out>/<n>.wav on disk" — so that the recorder does not have to know which it
 * is talking to beyond building the job.
 *
 * That is a claim in a comment about a file it is not in, which is the kind
 * that rots quietly and is then discovered by a three-minute recording run
 * failing on a runner. The recorder parses both the same way; if one of them
 * stops printing `ms`, the reel is timed off undefined.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("both say-scripts read the same job and print the same answer", () => {
  const kokoro = readFileSync("scripts/kokoro-say.py", "utf8");
  const chatterbox = readFileSync("scripts/chatterbox-say.py", "utf8");

  for (const [name, src] of [["kokoro", kokoro], ["chatterbox", chatterbox]] as const) {
    assert.match(src, /job = json\.load\(sys\.stdin\)/, `${name}-say.py no longer reads a job on stdin`);
    assert.match(src, /job\["phrases"\]/, `${name}-say.py no longer reads the phrases`);
    assert.match(src, /f"\{job\['out'\]\}\/\{index\}\.wav"/, `${name}-say.py no longer writes <out>/<n>.wav`);
    /** All three keys: the recorder reads every one of them off each line. */
    for (const key of ["index", "path", "ms"]) {
      assert.match(src, new RegExp(`"${key}":`), `${name}-say.py stopped printing ${key}`);
    }
    assert.match(src, /flush=True/, `${name}-say.py buffers its output, so a long reel looks hung`);
  }
});

/**
 * A reference clip clones a speaker, and the only person whose voice may be
 * cloned to advertise this app is somebody who agreed to it. Kept as a note in
 * the file that does the cloning rather than only in a conversation.
 */
test("the reference clip carries the consent note with it", () => {
  const src = readFileSync("scripts/chatterbox-say.py", "utf8");
  assert.match(src, /consent/i, "nothing in the cloning path says whose voice may be used");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STDOUT IS THE ANSWER CHANNEL AND THE LIBRARIES DO NOT KNOW THAT.
 *
 * The first Chatterbox run on a runner died with:
 *
 *     SyntaxError: Unexpected token 'l', "loaded Per"... is not valid JSON
 *
 * Loading the model prints its progress to stdout; the recorder parses every
 * stdout line as JSON, because that is what the channel is for. One line of
 * library chatter and a three-minute recording run is gone.
 *
 * The fix is to take the real stdout BEFORE importing anything and point
 * sys.stdout at stderr, so a library that prints ends up in the run log where
 * it belongs. Ordering is the whole trick and it is invisible: move the
 * capture below the imports and it still runs, still passes a smoke test, and
 * still loses a run the first time a dependency is chattier than today's.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("chatterbox keeps its libraries off the answer channel", () => {
  const src = readFileSync("scripts/chatterbox-say.py", "utf8");

  const capture = src.indexOf("ANSWER = sys.stdout");
  const silence = src.indexOf("sys.stdout = sys.stderr");
  const firstHeavyImport = src.indexOf("from chatterbox.tts import");
  const answer = src.indexOf("file=ANSWER");

  assert.ok(capture > 0, "the real stdout is never taken, so redirecting it loses the answers too");
  assert.ok(silence > capture, "stdout is pointed at stderr before the answer channel is saved");
  assert.ok(silence < firstHeavyImport,
    "chatterbox is imported before stdout is protected, so anything it prints at import time still lands on the answer channel");
  assert.ok(answer > 0, "the per-phrase answers no longer go to the captured stdout");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A BRITISH MALE VOICE FOR A BRITISH FOOTBALL AUDIENCE.
 *
 * "The voice doesn't reach our target audience." It did not: it had been
 * chosen by one measurement — pitch variability — with nothing in it about who
 * was listening. The app is British throughout and the content is football
 * drills and barbell standards; the published profile is a young adult male
 * read, energetic, with a recognisable accent.
 *
 * Kokoro has the British male voices and no expression control; Chatterbox has
 * the expression control and one speaker who is neither. So one speaks the
 * reference and the other performs it — and nobody's actual voice is cloned,
 * which is the only version of this that needs no consent from anybody.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the reference voice is British, male, and not a person", () => {
  assert.match(REFERENCE_VOICE, /^bm_/,
    `${REFERENCE_VOICE} is not one of Kokoro's British male voices, which is what the audience research chose`);
  assert.ok(REFERENCE_LINE.split(/[.!?]/).filter((p) => p.trim()).length >= 3,
    "the reference is one sentence — a cloner has little to work with, and the voice wobbles between phrases");
  assert.ok(REFERENCE_LINE.includes(APP_NAME), "the reference is not in the register it will be performing");
});

/**
 * ORDERING AGAIN, AND INVISIBLE AGAIN. A recorded human reference is better
 * than any synthesised one and answers the consent question by existing — so
 * an explicit prompt has to win. Built first and then overwritten would still
 * produce a reel, using the wrong voice, silently.
 */
/**
 * The committed clip and the reasoning written next to the measurements have
 * to stay in step. They live in different files and different languages, and
 * the failure mode is silent: the reels would clone a voice nobody chose while
 * every comment described a different one.
 */
test("the reference file was made by the voice the measurements chose", () => {
  const script = readFileSync("scripts/make-voice-reference.py", "utf8");
  assert.match(script, new RegExp(`VOICE = "${REFERENCE_VOICE}"`),
    `make-voice-reference.py does not use ${REFERENCE_VOICE}, so the committed clip is a different voice from the documented one`);
  /** Same words, so the clip is in the register it will be performing. */
  for (const sentence of REFERENCE_LINE.split(/(?<=[.!?])\s+/).filter(Boolean)) {
    assert.ok(script.includes(sentence.trim()),
      `the reference clip does not say "${sentence.trim()}"`);
  }
  assert.match(script, new RegExp(REFERENCE_WAV.replace(/[/.]/g, "\\$&")),
    "the generator writes somewhere other than where the recorder reads");
});

/** And the clip has to actually be there, since nothing rebuilds it. */
test("the reference clip is committed, not assumed", () => {
  const wav = readFileSync(REFERENCE_WAV);
  assert.ok(wav.length > 100_000, `${REFERENCE_WAV} is ${wav.length} bytes — too short to clone a voice from`);
  assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF", "the reference is not a wav");
});

/**
 * ORDERING, AND INVISIBLE. A recorded human reference is better than any
 * synthesised one and answers the consent question by existing — so an
 * explicit prompt has to win. Defaulted first and then overridden would still
 * produce a reel, in the wrong voice, silently.
 */
test("a supplied reference wins over the committed one", () => {
  const src = readFileSync("scripts/record-reel.mts", "utf8");
  assert.match(src, /prompt: process\.env\.REEL_VOICE_PROMPT \|\| REFERENCE_WAV/,
    "a recorded reference no longer takes precedence over the committed one");
  assert.doesNotMatch(readFileSync("scripts/chatterbox-say.py", "utf8"), /from kokoro_onnx import/,
    "chatterbox-say.py imports Kokoro again — the two will not install into one environment");
});
