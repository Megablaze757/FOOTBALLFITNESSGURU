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
 *
 * HISTORY, NOT CURRENT SETTINGS. bf_alice is no longer the voice and 0.94 is
 * no longer the rate — see the note above VOICE below, which records what
 * measuring the three axes this one never looked at turned up. The reasoning
 * here still holds; it was just incomplete.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * "THE VOICE IS PUTTING ME TO SLEEP IT NEEDS TO BE EXCITING."
 *
 * It measurably was, and the reason is that every voice decision in this file
 * had been made on ONE axis — pitch variability — because that was the only
 * axis anyone had built an instrument for. Measuring the shipped narration of
 * all four reels on the axes nobody had:
 *
 *   pace          122 wpm    energetic short-form is 180-220
 *   dead air       35%       over a third of the reel is silence
 *   articulation  187 wpm    the speaking itself, pauses removed
 *   pitch SD      4.92 st    healthy, and the one that was optimised
 *
 * The one axis that was measured is the one axis that was fine. A reel that
 * says 122 words a minute and is silent 35% of the time is not a matter of
 * taste; it is half the rate of the register it is aiming at.
 *
 * WHAT CHANGED. Four British male voices, three speeds, measured across all
 * four reels rather than one line — the mistake this file already records
 * making twice. bm_fable at 1.42 against Chatterbox as it shipped:
 *
 *                        dead%   wpm   artic   F0 SD   dyn    length
 *   Chatterbox bm_lewis    35    122    187     4.92   9.8    23.4s
 *   Kokoro bm_fable 1.42   19    164    201     4.87   9.8    17.4s
 *
 * Dead air nearly halved, pace up a third, articulation inside the band — and
 * pitch variability and dynamic contrast UNCHANGED, which is the part that
 * makes this a straight win rather than a trade. It also gives six seconds
 * back in a thirty-second format.
 *
 * bm_fable was available the whole time and was passed over because the choice
 * was made on a single line, where it came second. Across four narrations it
 * leaves less than half the dead air of any other voice here. That is the same
 * error as the bm_george/bm_lewis reversal recorded further down this file,
 * made a third time, and the lesson is now a rule: a voice is chosen on whole
 * narrations or it is not chosen.
 *
 * WHAT IT COSTS, honestly: Chatterbox keeps a wider measured pitch RANGE
 * (16.3 against 14.5 semitones) and about twice the rate of upward pitch
 * movement. Both of those are the two measures most sensitive to tracker
 * jitter, and Chatterbox's track is the noisier of the two, so some of that
 * gap is instrument rather than voice. It is not none of it.
 *
 * See scripts/measure-excitement.py, which is checked in and self-tests.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const VOICE = "bm_fable";

/**
 * The baseline.
 *
 * Was 0.94 — "explainer voiceover is read slightly under natural pace" — which
 * is true of an explainer somebody chose to sit down and watch and false of
 * something competing with a thumb. At 1.42 the four reels average 201 words a
 * minute of articulation, which is the middle of the energetic short-form
 * band; 1.5 reaches 209 and 1.35 reaches 190, and all three are defensible.
 *
 * NOT A RESAMPLE. Kokoro's speed drives its duration predictor, so the median
 * pitch is 125Hz at 1.42 and 128Hz at 0.94 — it speaks faster rather than
 * playing back faster, which is the difference between a person hurrying and
 * a tape running fast.
 */
export const BASE_SPEED = 1.30;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * "FEELS A BIT ROBOTIC AND TOO HIGH PITCHED. I WANT VOICE TO FEEL RELATABLE."
 *
 * The pitch complaint is a regression this file caused. Choosing bm_fable on
 * pace and dead air moved the median from bm_lewis's 96Hz to 125Hz, and
 * nothing in that decision was looking at pitch HEIGHT — only at pitch
 * VARIABILITY, which is a different number that happened to be the one with an
 * instrument attached. 125Hz is at the top of the male range.
 *
 * WHY NOT JUST GO BACK TO bm_lewis. Because it is the least expressive voice
 * here, and "robotic" is the other half of the same sentence:
 *
 *                                   dead%   artic   F0 SD    Hz   phone band
 *   bm_lewis 1.26, natively low        26     205    4.01    97       48.3%
 *   bm_fable 1.42, as shipped          17     189    4.95   123       41.1%
 *   bm_fable 1.30, -4st, +5dB shelf    19     179    5.01   104       41.4%
 *
 * Shifting bm_fable down gets the pitch bm_lewis has while KEEPING the
 * expression and the low dead air that made it worth choosing. rubberband
 * shifts with formants preserved, so it is a lower voice rather than a slowed
 * tape, and it changes the duration by a measured 0.0ms — captions stay in
 * sync to the millisecond.
 *
 * THE SHELF IS NOT A TONE PREFERENCE, IT IS PUTTING BACK WHAT THE SHIFT TOOK.
 * Moving everything down 4 semitones moves energy out of the 400Hz-6kHz band a
 * phone speaker can actually reproduce — measured, 41.1% falls to 34.9%, and a
 * reel is watched on a phone. A high shelf restores it to 41.4%, which is where
 * it started. Without this the voice is lower AND thinner, and thin is most of
 * what "robotic" sounds like.
 *
 * Speed comes down with it, 1.42 to 1.30: articulation 189 to 179 words a
 * minute, still inside the energetic band and no longer the top of it. The
 * previous pass had drill running at 237.
 * ═══════════════════════════════════════════════════════════════════════════
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A TARGET TO REACH, NOT A SHIFT TO APPLY. "IT SOUNDS LIKE THE TERMINATOR."
 *
 * This was PITCH_SEMITONES = -4, a constant measured against Kokoro's bm_fable
 * at 125Hz and then applied to every engine. Chatterbox clones bm_lewis and
 * arrives at 94Hz already — so the same shift took it to 75Hz, which is below
 * the adult male range entirely, and stacking a formant-preserving shift under
 * a time-stretch cost 1.5dB of harmonic-to-noise ratio on top:
 *
 *                          HNR        median
 *   Chatterbox raw       -1.40 dB      94 Hz
 *   + the -4st shift     -2.09 dB      75 Hz   <- under the male range
 *   + the shelf          -2.59 dB      75 Hz
 *   + the tempo          -2.90 dB      76 Hz
 *   tempo alone          -1.75 dB      95 Hz
 *
 * Deep and metallic at once, which is what that description is.
 *
 * The fault is expressing the INTENT as a shift. What was ever wanted is a
 * voice around 105Hz — mid-range for an adult man, low enough to answer "too
 * high pitched", high enough to keep the energy a phone speaker reproduces.
 * So that is what is written down, and each engine's correction is derived
 * from where it actually starts. An engine already in range gets nothing done
 * to it, which is the only way to be sure the processing cannot make it worse.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const VOICE_TARGET_HZ = 105;

/**
 * Where each engine's voice sits before anything is done to it, measured.
 * Kokoro is bm_fable at BASE_SPEED; Chatterbox is the committed reference clip.
 */
export const NATIVE_HZ: Record<string, number> = { kokoro: 126, chatterbox: 94 };

/**
 * Close enough to leave alone.
 *
 * A shift of under a semitone is inaudible and still costs harmonic detail, so
 * inside this band the honest correction is none. Chatterbox at 94Hz is 1.9
 * semitones under the target and gets nothing, because a voice that is already
 * too LOW must never be pushed lower.
 */
export const PITCH_DEADBAND_ST = 1.5;

/** How far this engine must move to reach the target, in semitones. */
export function pitchShiftFor(engine: string): number {
  const from = NATIVE_HZ[engine];
  if (!from) return 0;
  const semitones = 12 * Math.log2(VOICE_TARGET_HZ / from);
  /**
   * ONLY DOWNWARD, and only when it is worth doing. Raising a synthesised
   * voice thins it, and the complaint that started this was that it was too
   * high — there is no case here for shifting up.
   */
  if (semitones >= -PITCH_DEADBAND_ST) return 0;
  return Math.round(semitones * 100) / 100;
}

/** The ratio rubberband wants. 1 means leave the voice alone. */
export function pitchRatioFor(engine: string): number {
  const semitones = pitchShiftFor(engine);
  return semitones ? Math.round(2 ** (semitones / 12) * 1e5) / 1e5 : 1;
}

/**
 * The shelf exists ONLY to put back what a shift takes away.
 *
 * Dropping a voice moves energy out of the 400Hz-6kHz band a phone reproduces.
 * An engine that is not shifted has lost nothing, and a shelf on top of it is
 * a tone preference nobody asked for — measured, it cost another 0.5dB of HNR.
 */
export const SHELF_HZ = 1_000;
export const SHELF_DB = 5;
export function shelfDbFor(engine: string): number {
  return pitchShiftFor(engine) ? SHELF_DB : 0;
}

export const CHATTERBOX_TEMPO = 1.18;

/** What a phrase is doing, which is what decides how fast it is said. */
export type Role = "hook" | "setup" | "figure" | "payoff";

/**
 * Rate per role, as a multiplier on BASE_SPEED.
 *
 * The spread matters more than the exact values: a listener hears CHANGE, and
 * a reel whose every phrase is spoken at BASE_SPEED has none to hear. Kept
 * inside ±12% because past that the voice stops sounding like one person.
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AND IT IS A FILE IN THE REPOSITORY, NOT A BUILD STEP.
 *
 * The first version had the recorder synthesise this on every run, which is a
 * dependency conflict rather than a convenience: kokoro-onnx 0.6.1 and
 * chatterbox-tts will not install into one environment — pkuseg fails to build
 * for want of numpy — and left unpinned they resolve to a Kokoro whose
 * constructor reads the voices .bin as JSON and dies on byte 0xff. Two
 * three-minute runs to find that out.
 *
 * The reference is deterministic and half a megabyte. Building it every time
 * bought nothing and coupled two models that have no business sharing a
 * process.
 *
 * Committing it also makes the voice REVIEWABLE. Anybody can play the file and
 * hear exactly what the reels are cloning, which is not true of a decision
 * that exists only as a model name in a config.
 *
 * Regenerate with scripts/make-voice-reference.py. A test keeps that script's
 * voice and words in step with the constants above, so the file on disk and
 * the reasoning written next to the measurements cannot drift apart.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const REFERENCE_WAV = "assets/reel-voice-reference.wav";
