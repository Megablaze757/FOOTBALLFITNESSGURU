// =============================================================================
// WHERE THE VOICE BREATHES.
//
// ═══════════════════════════════════════════════════════════════════════════
// "ALL SOUND TOO ROBOTIC" — "LIKE NOT HAVING PAUSES AND STUFF LIKE A HUMAN."
//
// That is a more precise diagnosis than it looks, and it is not really about
// the voice model. Hand a text-to-speech engine a paragraph and it produces
// one continuous run at a near-uniform rhythm: the gaps it leaves at full
// stops are short, equal, and the same every time. People do not talk like
// that. They leave a beat before the thing they want you to hear, and shorter
// ones everywhere else, and the VARIATION is what the ear reads as human.
//
// So the line is synthesised phrase by phrase and the silences are placed
// here, deliberately, at lengths that differ by what the punctuation is doing
// and by where the phrase sits in the line. The longest gap in any line is the
// one before the last thing said, because that is the one a person leaves.
//
// The research points the same way: expressive intonation and modulation
// contribute more to perceived engagement than raw speaking speed. Rhythm IS
// modulation, and it is the part a small offline model can be made to do well.
//
// Pure, and separate from anything that makes a sound, because the interesting
// part is where the gaps go and a wav file is an expensive place to audition
// that.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

/**
 * Silences, in milliseconds.
 *
 * Short enough that nothing drags, different enough from each other that the
 * rhythm is not a metronome. These are the numbers to argue with if a reel
 * sounds rushed or slow — everything else here is about WHICH one applies.
 */
/**
 * Widened after "too fast paced". Every one of these was the shortest pause
 * that still registered as a pause; a reel needs the pause a listener would
 * take to LOOK at what is being described, which is longer than the one they
 * need to hear the end of a clause.
 */
export const GAP = {
  /** Inside a sentence. Barely a pause; enough to stop two clauses running on. */
  clause: 260,
  /** Between sentences. */
  sentence: 540,
  /** After a question. Longer, because a question asks for a moment. */
  question: 700,
  /**
   * Before the last thing said.
   *
   * The one people actually notice, and the one a text-to-speech engine never
   * leaves on its own. A punchline arriving 0.7s after the setup lands; the
   * same words with a 0.4s gap are a list.
   */
  payoff: 900,
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * THE BEAT BEFORE A REVEAL. "No pausing for suspense."
   *
   * `payoff` only ever fired before the LAST phrase of a reel, so a reel that
   * builds to a number in the middle — which is the shape of every good one —
   * got the same 200ms clause gap there as it got between two ordinary
   * clauses. There was nowhere for the tension to sit.
   *
   * A silence before the reveal is the most-used device in retention editing
   * for a reason: it is the moment a viewer stops scrolling to find out. Long
   * enough to be heard as deliberate, short enough that a thumb does not move
   * — this is the top of that range, not past it.
   * ═══════════════════════════════════════════════════════════════════════
   */
  reveal: 1_150,
} as const;

/** A punchline is short. Longer than this and the gap before it is a stall. */
export const PAYOFF_MAX_WORDS = 8;

/**
 * How much setup has to come before a short line for it to read as a reveal
 * rather than as one more short line. Below this the pause is a stutter.
 */
export const REVEAL_MIN_SETUP_WORDS = 7;

export interface Phrase {
  text: string;
  /** Silence AFTER this phrase. Zero on the last one — the beat ends it. */
  gapMs: number;
}

/**
 * Split a line into the pieces that get spoken separately.
 *
 * SENTENCE ENDINGS ONLY, not every comma. A text-to-speech engine handles a
 * comma inside a phrase perfectly well, and cutting there produces a
 * stop-start delivery that is worse than the flat one it replaced. The gaps
 * worth controlling are the ones between whole thoughts.
 */
export function phrases(line: string): Phrase[] {
  const text = String(line ?? "").trim();
  if (!text) return [];

  /**
   * A full stop BETWEEN DIGITS is not the end of a sentence.
   *
   * "£0.31 from red lentils" is one phrase, and splitting it gives "£0." and
   * "31 from red lentils" — a voice saying "nought pounds" and stopping dead.
   * Every price in this app is written that way, so this is the common case.
   *
   * WHAT PROTECTS IT IS `(?:\s+|$)`, not a lookbehind. A first version had
   * `(?<![0-9])` as well, which survived every mutation because it never did
   * anything — and was worse than nothing: it also refused to split "It cost
   * £4. Then we left.", where the sentence genuinely does end on a digit. The
   * requirement that the punctuation be followed by whitespace or the end of
   * the line is the whole guard, and it is the correct one.
   */
  const parts = text
    .split(/([.!?]+)(?:\s+|$)/)
    .filter((p) => p !== undefined && p !== "");

  /** Re-attach the punctuation that the split captured. */
  const built: string[] = [];
  for (const part of parts) {
    if (/^[.!?]+$/.test(part) && built.length) built[built.length - 1] += part;
    else built.push(part.trim());
  }
  /**
   * A phrase has to contain something SAYABLE.
   *
   * The punctuation re-attaches to the phrase before it — but when there is no
   * phrase before it, as in a line of "." or "...", it became a phrase of its
   * own and the voice was handed a full stop to pronounce. Requiring a letter
   * or a digit is the whole check.
   */
  const spoken = built.map((p) => p.trim()).filter((p) => /[a-z0-9]/i.test(p));
  if (!spoken.length) return [];

  return spoken.map((phrase, i) => {
    const last = i === spoken.length - 1;
    if (last) return { text: phrase, gapMs: 0 };

    const next = spoken[i + 1];
    const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
    const nextIsLast = i === spoken.length - 2;
    const nextIsShort = words(next) <= PAYOFF_MAX_WORDS;
    if (nextIsLast && nextIsShort) return { text: phrase, gapMs: GAP.payoff };

    /**
     * A SHORT LINE AFTER A LONG ONE IS A REVEAL, wherever it falls.
     *
     * That shape — build, then a snap — is what a script does when it is about
     * to land something, and it used to be given the same gap as any other
     * sentence break. Requiring the CURRENT phrase to be long is what stops
     * this firing on a run of short lines, where it would read as a stutter
     * rather than suspense.
     */
    if (nextIsShort && words(phrase) >= REVEAL_MIN_SETUP_WORDS) {
      return { text: phrase, gapMs: GAP.reveal };
    }

    if (phrase.endsWith("?")) return { text: phrase, gapMs: GAP.question };
    if (/[.!]$/.test(phrase)) return { text: phrase, gapMs: GAP.sentence };
    return { text: phrase, gapMs: GAP.clause };
  });
}

/**
 * How long the silences add up to.
 *
 * The caller needs this before it synthesises anything: the beat has to be
 * long enough for the words AND the breathing, and finding out afterwards
 * means a voice that runs over the cut.
 */
export function totalGapMs(list: readonly Phrase[]): number {
  return list.reduce((n, p) => n + p.gapMs, 0);
}
