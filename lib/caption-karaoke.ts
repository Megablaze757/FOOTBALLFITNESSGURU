// =============================================================================
// WORD-BY-WORD CAPTIONS, AND WHEN EACH WORD LIGHTS UP.
//
// ═══════════════════════════════════════════════════════════════════════════
// "CAPTIONS SHOULD BE BRIGHT — RESEARCH."
//
// The caption was a static chunk of white text with one word coloured at the
// end. The measured alternative is a word-by-word highlight — the active word
// changes colour as it is spoken — which is reported to carry a 12-25% lift in
// average watch time on exactly this kind of clip. The reason given is that it
// removes the guesswork about pacing: the viewer never has to decide how far
// through a line the voice is, so reading costs nothing and they keep watching
// instead of re-reading.
//
// The colour advice is specific and this follows it: a COLOUR SHIFT rather
// than an underline or a box, and a high-saturation yellow rather than a
// muted one, because that is what stays legible over whatever the app happens
// to be showing behind it.
//
// ─────────────────────────────────────────────────────────────────────────
// WHY THE TIMING IS ESTIMATED AND THAT IS FINE.
//
// Kokoro returns audio for a phrase, not timestamps for its words, so a real
// forced alignment would mean a second model. Time is shared out by the LENGTH
// of each word instead, which is a good proxy in English and — crucially —
// wrong in a way nobody can see: the highlight leading or trailing the voice
// by 60ms inside one phrase is invisible, while the phrase boundaries, which
// ARE measured, stay exact.
//
// A floor stops the short words flashing past unreadably, which is the one
// failure a viewer would notice.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

import { emphasise } from "./caption-emphasis";

/**
 * The shortest a single word may hold the highlight.
 *
 * Below about this, "a" and "of" strobe rather than read — the eye cannot
 * land on something that is gone in two frames at 25fps.
 */
export const MIN_WORD_MS = 90;

export interface WordSpan {
  text: string;
  /** Milliseconds from the start of this caption. */
  at: number;
  ms: number;
}

/**
 * Length, not syllables.
 *
 * A syllable count is more accurate and needs a dictionary; character count
 * tracks it closely enough for a highlight and cannot be wrong about a word it
 * has never seen. The +1 stops a one-character word getting a share of zero.
 */
const weightOf = (word: string) => word.replace(/[^\p{L}\p{N}]/gu, "").length + 1;

/**
 * When each word of a caption should light up.
 *
 * Total duration is preserved exactly: the last word always ends on `ms`, so
 * a highlight can never outlive the caption it belongs to and leave a word
 * lit after the line has gone.
 */
export function wordSpans(text: string, ms: number): WordSpan[] {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  if (!words.length || !(ms > 0)) return [];

  const weights = words.map(weightOf);
  const total = weights.reduce((a, b) => a + b, 0);

  /**
   * The floor is applied FIRST and the rest shared out by weight, rather than
   * clamping afterwards. Clamping afterwards adds time the caption does not
   * have, and the overrun lands on the last word — so a line of short words
   * ended with one word held long after the voice had moved on.
   */
  const floor = Math.min(MIN_WORD_MS, ms / words.length);
  const spare = Math.max(0, ms - floor * words.length);

  /**
   * BOUNDARIES ARE ROUNDED, WIDTHS ARE DERIVED FROM THEM.
   *
   * Rounding `at` and `ms` separately let a word start one millisecond away
   * from where the previous one ended — invisible on screen and a gap the
   * page would have to paper over, so it is not allowed to exist. Each width
   * is the distance between two rounded edges, which makes the spans exactly
   * contiguous and their sum exactly `ms` by construction.
   */
  const edges = [0];
  let at = 0;
  words.forEach((word, i) => {
    at += floor + (spare * weights[i]) / total;
    edges.push(i === words.length - 1 ? ms : Math.round(at));
  });
  return words.map((text, i) => ({ text, at: edges[i], ms: edges[i + 1] - edges[i] }));
}

/**
 * Which word is lit at a given moment, or -1 before the first one.
 *
 * Used by the tests rather than the page — the page is handed the spans and
 * sets a timer per word, because a reel is drawn by a browser that is also
 * doing a screen recording and a per-frame poll is work it does not need.
 */
export function litAt(spans: readonly WordSpan[], ms: number): number {
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    if (ms >= spans[i].at) return i;
  }
  return -1;
}

export interface KaraokeWord extends WordSpan {
  /** The figure the line is about, coloured from the moment it appears. */
  key: boolean;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO KINDS OF EMPHASIS, DOING DIFFERENT JOBS.
 *
 * The figure is coloured for the whole time the caption is up, because colour
 * is located pre-attentively — the eye finds it without scanning, which is the
 * one movement a caption gets when it is on screen for under two seconds.
 *
 * The moving highlight is about PACING, not importance: it tells the viewer
 * where the voice is so reading costs nothing. Those are different jobs and
 * they are allowed to overlap — when the sweep reaches the figure, the word is
 * simply already the colour it is about to become, which reads as the
 * highlight arriving rather than as a clash.
 *
 * The active word also grows very slightly. Colour alone would be ambiguous on
 * the one word that is permanently coloured.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function karaokeWords(text: string, ms: number): KaraokeWord[] {
  const spans = wordSpans(text, ms);
  /**
   * The key flag comes from emphasise, so there is ONE rule about which figure
   * is coloured and it is the tested one. Matching by text would colour every
   * copy of a repeated word; matching by position cannot.
   */
  const keyed = emphasise(text).filter((r) => r.text.trim()).map((r) => r.key);
  return spans.map((s, i) => ({ ...s, key: keyed[i] ?? false }));
}
