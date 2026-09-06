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
