/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A TEXT-TO-SPEECH VOICE READS AS MONOTONE, AND WHAT CAN BE DONE ABOUT IT.
 *
 * "The voice feels monotone and unhuman." It measurably was, twice over.
 *
 * ONE: THE VOICE ITSELF. Pitch variability — the standard deviation of F0 in
 * semitones — is the strongest single correlate of how expressive a speaker
 * sounds. Under about 2 semitones reads as monotone; animated speech sits
 * around 4-6. Measured across all eight of Kokoro's British voices on a real
 * line from the script, bf_emma — the voice this project had been using —
 * came LAST at 2.20 semitones. bf_alice reaches 3.96 on the same line, and
 * also carries the most energy in the 400Hz-6kHz band a phone speaker can
 * actually reproduce (44.0% against bm_lewis's 36.0%, which scored higher on
 * pitch alone). See scripts/measure-voice.py — the measurement is checked in.
 *
 * TWO: EVERY PHRASE READ AT THE SAME SPEED. A person does not. Emphasis slows
 * and lengthens; connective material speeds up; the line before a payoff slows
 * right down and the payoff itself is deliberate. A constant rate is heard as
 * flat even when the pitch contour is fine, because tempo is the other half of
 * prosody.
 *
 * This module is the second half. It cannot change F0 — kokoro-onnx exposes no
 * pitch control — but rate is per-call, so each phrase can be spoken at the
 * speed its job needs.
 *
 * MEASURED END TO END on the demo-cost reel's own phrases:
 *
 *   before   bf_emma, one rate for everything    F0 SD 2.11 st
 *   after    bf_alice, a rate per phrase         F0 SD 4.42 st
 *
 * 2.1x the pitch variation, from under the monotone threshold to inside the
 * animated range — and tempo that changes four times instead of never.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Measured most expressive of the British voices that also survives a phone speaker. */
export const VOICE = "bf_alice";

/**
 * The baseline. Explainer voiceover is read slightly under natural pace: the
 * listener is also reading captions and looking at a screen they have never
 * seen, and both cost time the speaker has to give back.
 */
export const BASE_SPEED = 0.94;

/** What a phrase is doing, which is what decides how fast it is said. */
export type Role = "hook" | "setup" | "figure" | "payoff";

/**
 * Rate per role, as a multiplier on BASE_SPEED.
 *
 * The spread matters more than the exact values: a listener hears CHANGE, and
 * a reel whose every phrase is 0.94 has none to hear. Kept inside ±12% because
 * past that the voice stops sounding like one person.
 */
export const RATE: Record<Role, number> = {
  /** It has to land, and it is competing with a thumb. */
  hook: 0.92,
  /** Connective material. Slightly quicker: it is not the point. */
  setup: 1.04,
  /** A number needs time to be heard as a number rather than a noise. */
  figure: 0.93,
  /** The line people remember. Slowest thing in the reel. */
  payoff: 0.88,
};

/** Anything a listener has to hold in their head: money, weights, multiples. */
const HAS_FIGURE = /[£$€]|\b\d|\bper cent\b|\bpercent\b|\btimes\b|\bpence\b|\bpounds?\b|\bgrams?\b/i;

/**
 * What each phrase of a beat is doing.
 *
 * FIRST AND LAST ARE SPECIAL and the middle is decided by content. The first
 * phrase of the whole reel is the hook; the last phrase of the whole reel is
 * the payoff; a phrase carrying a figure is a figure; everything else is
 * setup.
 */
export function roleOf(index: number, total: number, text: string): Role {
  if (total <= 0) return "setup";
  if (index === 0) return "hook";
  if (index === total - 1) return "payoff";
  return HAS_FIGURE.test(text) ? "figure" : "setup";
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOUDNESS PER ROLE. THE DIMENSION PITCH COULD NOT REACH.
 *
 * "The voice has no excitement." Pitch variability had already gone from 2.11
 * to 4.35 semitones, which is where Kokoro tops out — measured across six
 * punctuation styles and three voices, everything lands between 3.6 and 4.5,
 * so rewriting the script with exclamation marks changes nothing.
 *
 * VOLUME had never been touched, and measuring it found the flatness. Across
 * all 21 phrases of all four reels, the level Kokoro speaks a phrase at varies
 * by a standard deviation of 0.30 dB — a total range of 1.01 dB from the
 * quietest line to the loudest. The model says every sentence at the same
 * volume. A person does not: the point of a sentence is habitually several
 * decibels above the clause that set it up, and that contrast is most of what
 * "excitement" is.
 *
 * (Measuring the whole track instead says 7.2 dB and looks healthy. That
 * number is syllable-to-syllable movement WITHIN each phrase, which is large
 * and which the model does well. It hides the thing that was wrong.)
 *
 * ATTENUATION ONLY — nothing here may be above zero. Kokoro already peaks at
 * 1.02 of full scale, so a positive gain has nowhere to go but into the clamp:
 * measured, every boosted variant pegged samples at full scale. The spread is
 * cut downward from a ceiling of 0 and the assembled track is brought back up
 * to level in one pass afterwards — see `normalised` in lib/wav.ts.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const GAIN: Record<Role, number> = {
  /** Near the top: it has to cut through whatever was playing before it. */
  hook: -1,
  /** Connective material, and stepping back is what makes the rest step up. */
  setup: -7,
  /** A number said at the same volume as "and" is a number nobody keeps. */
  figure: -1.5,
  /** The line people remember, and the loudest thing in the reel. */
  payoff: 0,
};

/**
 * The quietest a line may be laid, relative to the loudest.
 *
 * Read speech runs 4-6 dB of phrase-to-phrase variation and animated delivery
 * 8-12. This sits at the join. Wider was measured and is available; it buys
 * more contrast at the cost of a setup line that is genuinely quiet on a phone
 * speaker in a noisy room, which is where these are watched.
 */
export const GAIN_RANGE_DB = 7;

/** The loudness to speak one phrase at, in dB relative to as-synthesised. */
export function gainFor(role: Role): number {
  return GAIN[role];
}

/** Every phrase of a reel, with the loudness each should be spoken at. */
export function shapeGains(phrases: readonly string[]): number[] {
  return phrases.map((text, i) => gainFor(roleOf(i, phrases.length, text)));
}

/** The speed to hand the synthesiser for one phrase. */
export function speedFor(role: Role, base = BASE_SPEED): number {
  return Math.round(base * RATE[role] * 1000) / 1000;
}

/**
 * Every phrase of a reel, with the speed each should be spoken at.
 *
 * Takes the FLAT list across all beats rather than per beat: "first" and
 * "last" mean first and last of the reel, and a hook that resets on every beat
 * is four hooks and no reel.
 */
export function shapeRates(phrases: readonly string[], base = BASE_SPEED): number[] {
  return phrases.map((text, i) => speedFor(roleOf(i, phrases.length, text), base));
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE DIMENSION KOKORO DOES NOT HAVE, AND THE ONE THE COMPLAINT IS ABOUT.
 *
 * "It needs to feel excited, grab the audience's attention, not just talking
 * at you like it's reading off a script."
 *
 * Rate and loudness above are everything Kokoro exposes, and the note at the
 * top of this file records where that ran out: pitch variability tops out
 * around 4.35 semitones however it is tuned, measured across six punctuation
 * styles and three voices. Excitement is not a knob that model has.
 *
 * Chatterbox does have one. Measured on the readiness hook, same tracker, same
 * two lines:
 *
 *   Kokoro, as it ships          F0 SD 4.13 st   range 14.65 st   7.84s
 *   Chatterbox ex0.5 cfg0.5      F0 SD 6.17 st   range 19.08 st   6.98s
 *   Chatterbox ex0.7 cfg0.3      F0 SD 5.77 st   range 16.99 st   7.62s
 *   Chatterbox ex0.9 cfg0.3      F0 SD 5.39 st   range 17.32 st   6.06s
 *
 * Every setting clears Kokoro's ceiling on both measures and says the same
 * words in less time, which is itself part of sounding excited.
 *
 * WHAT THE NUMBERS DO NOT SETTLE. Exaggeration barely moves F0 SD — 5.4 to
 * 6.2 and not even in order — so it changes the CHARACTER of a read rather
 * than its measurable spread. The level is a judgement and belongs to whoever
 * is publishing the reels; the SPREAD below is the part with a reason.
 *
 * THE SPREAD, not the level, is why this is a table. Same argument as RATE and
 * GAIN: a listener hears CHANGE, and a reel whose every phrase is delivered at
 * one setting has none to hear. Offsets rather than absolutes so that picking
 * a different overall level moves all four together and keeps the contrast.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** How emphatic a read is overall. Chatterbox's own default is 0.5. */
export const EXAGGERATION_BASE = 0.5;

/** Chatterbox accepts 0.25 to 2.0; past about 1.2 it stops sounding like a read. */
export const EXAGGERATION_MIN = 0.25;
export const EXAGGERATION_MAX = 1.2;

export const EXAGGERATION_OFFSET: Record<Role, number> = {
  /** It is competing with a thumb, and it gets one and a half seconds. */
  hook: 0.25,
  /** Stepping back is what makes everything else step up. */
  setup: -0.05,
  /** A number wants weight rather than heat. */
  figure: 0.1,
  /** The line people remember. */
  payoff: 0.3,
};

/**
 * Chatterbox's classifier-free-guidance weight: how closely it sticks to a
 * flat reading of the text. LOWER IS LOOSER AND QUICKER, which is why the hook
 * and the payoff sit under the base and the connective material sits above it.
 */
export const CFG_BASE = 0.5;
export const CFG_MIN = 0.2;
export const CFG_MAX = 0.9;

export const CFG_OFFSET: Record<Role, number> = {
  hook: -0.15,
  setup: 0.05,
  figure: 0.1,
  payoff: -0.1,
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n * 1000) / 1000));

/** How emphatically to speak one phrase, and how loosely. */
export function expressionFor(
  role: Role,
  base = EXAGGERATION_BASE,
  cfgBase = CFG_BASE,
): { exaggeration: number; cfg: number } {
  return {
    exaggeration: clamp(base + EXAGGERATION_OFFSET[role], EXAGGERATION_MIN, EXAGGERATION_MAX),
    cfg: clamp(cfgBase + CFG_OFFSET[role], CFG_MIN, CFG_MAX),
  };
}

/**
 * Every phrase of a reel, with how emphatically each should be said.
 *
 * The FLAT list across all beats, for the same reason shapeRates takes one:
 * "first" and "last" mean first and last of the reel, and a hook that resets
 * on every beat is four hooks and no reel.
 */
export function shapeExpression(
  phrases: readonly string[],
  base = EXAGGERATION_BASE,
  cfgBase = CFG_BASE,
): { exaggeration: number; cfg: number }[] {
  return phrases.map((text, i) => expressionFor(roleOf(i, phrases.length, text), base, cfgBase));
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A YOUNG BRITISH MALE VOICE, BUILT RATHER THAN BORROWED.
 *
 * "The voice doesn't reach our target audience." It did not, and the reason
 * was that the voice had been chosen by one measurement — pitch variability —
 * with nothing in it about who was listening.
 *
 * WHO IS LISTENING. The app is British throughout: pounds, UK supermarket
 * shelf prices, "programme", football positions. The content is football
 * drills and barbell standards. The published profile for that audience is a
 * young adult male read, energetic, "motivating without shouting", with tight
 * rhythmic pacing and dynamic inflection — and a recognisable accent is named
 * as a success factor for UK creators specifically.
 *   — voiceovers.co.uk/character/sports
 *   — modash.io/find-influencers/tiktok/united-kingdom/football
 *
 * What shipped was bf_alice: British, expressive, and female.
 *
 * WHY A HYBRID. Kokoro has four British male voices and no expression
 * control. Chatterbox has the expression control and one speaker, who is
 * neither British nor young. Neither is the answer alone — so Kokoro speaks a
 * reference passage and Chatterbox performs it. Kokoro supplies the accent,
 * the gender and the timbre; Chatterbox supplies the pitch range and the
 * emphasis. Both are permissively licensed for commercial use, and no human's
 * voice is involved, so there is no consent to obtain and nobody to
 * impersonate.
 *
 * MEASURED ON A WHOLE NARRATION, and that matters more than it sounds. On a
 * single line bm_george led at 6.22 semitones and bm_lewis trailed at 6.05.
 * Across all six lines of the readiness reel the order REVERSES:
 *
 *   bf_alice, as it ships    F0 SD 3.94 st   range 13.61 st   median 222 Hz
 *   hybrid bm_george         F0 SD 4.04 st   range 14.91 st   median 138 Hz
 *   hybrid bm_lewis          F0 SD 5.17 st   range 16.76 st   median 126 Hz
 *
 * One line was thin evidence and it pointed at the wrong voice. The gains are
 * also smaller over a reel than over a line — +31% on pitch variation rather
 * than the +50% a single sentence suggested — which is the honest number.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const REFERENCE_VOICE = "bm_lewis";

/**
 * What the reference says.
 *
 * The app's OWN words, at length: a cloner has more to work with from three
 * varied sentences than from one, and using the script's own register means
 * the reference is the thing being performed rather than a sample of
 * something else.
 */
export const REFERENCE_LINE = "Every other training app hands you the session it planned on Sunday. "
  + "PocketAthlete asks how you slept first. Two taps: bad night, wrecked legs. "
  + "It scores you out of a hundred, and then it rebuilds today to match.";
