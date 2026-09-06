/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CAPTIONS THAT BREAK WHERE A PERSON WOULD BREATHE.
 *
 * The first chunker cut every four words and counted nothing else. On a real
 * reel that produced:
 *
 *     "costs £3.19 at the" / "other end."
 *     "So the plan it" / "builds you has a" / "number on it before" / "you shop."
 *
 * "builds you has a" is not a phrase. It is four consecutive words. A caption
 * ending on "the", "a" or "at" makes the reader hold an incomplete thought
 * across a cut, and on a reel the cut is the moment attention is cheapest to
 * lose — which is the one thing burned-in captions exist to prevent.
 *
 * So: break at punctuation first, then at a conjunction, then anywhere — and
 * never leave a function word stranded at the end of a line.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Two lines of roughly this width is what fits across a 1080px reel at a size
 * that is readable without the viewer leaning in. Characters and not words,
 * because "a" and "personalised" are not the same amount of reading.
 */
export const MAX_LINE_CHARS = 42;

/** A hard ceiling regardless of how short the words are. */
export const MAX_LINE_WORDS = 7;

/**
 * Words that may not END a caption.
 *
 * All of them open something they do not finish: an article wants its noun, a
 * preposition wants its object, a conjunction wants its clause. Deliberately
 * NOT a general stop-word list — "you", "it" and "me" close a phrase perfectly
 * well ("the plan it builds you") and stranding them is not the problem.
 */
const STICKY = new Set([
  "a", "an", "the",
  "and", "but", "or", "nor", "so", "yet", "as", "if", "than", "that", "because",
  "of", "to", "in", "on", "at", "by", "for", "from", "with", "into", "onto",
  "over", "under", "about", "per", "up", "off", "out", "through", "between",
  "is", "are", "was", "were", "be", "been", "am",
  "has", "have", "had", "will", "would", "can", "could", "should", "must",
  "may", "might", "do", "does", "did",
  "your", "my", "our", "their", "his", "her", "its",
  "this", "these", "those", "every", "each", "no", "not",
]);

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const stickyEnd = (line: string) => {
  const last = words(line).at(-1) ?? "";
  return STICKY.has(last.toLowerCase().replace(/[^a-z']/g, ""));
};

/**
 * Sentences, using the same rule as lib/speech-timing.ts: punctuation counts
 * only when whitespace or the end of the line follows it, so "£0.31" stays one
 * word and does not become "£0." and "31".
 */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => /[a-z0-9]/i.test(s));
}

/** Whether a word carries punctuation that a reader would pause on. */
const breakAfter = (w: string) => /[,;:—–]$/.test(w);

/**
 * One sentence into lines that fit, preferring the latest natural break that
 * still fits over an arbitrary cut at the limit.
 */
function fitSentence(sentence: string, maxChars: number, maxWords: number): string[] {
  const ws = words(sentence);
  const lines: string[] = [];
  let i = 0;

  while (i < ws.length) {
    // How many words fit at all.
    let end = i;
    let len = 0;
    while (end < ws.length && end - i < maxWords) {
      const next = len === 0 ? ws[end].length : len + 1 + ws[end].length;
      if (next > maxChars && end > i) break;
      len = next;
      end += 1;
    }

    /**
     * PUNCTUATION BEATS THE LIMIT. If a comma falls inside what fits, break
     * there instead — a shorter line that ends on a real pause reads better
     * than a full one that ends mid-clause.
     */
    let cut = end;
    for (let j = end - 1; j > i; j -= 1) {
      if (breakAfter(ws[j])) { cut = j + 1; break; }
    }

    /**
     * Otherwise, do not stop on a word that opens something. Walk back until
     * the line ends on a word that can end one — but never back past the first
     * word, which would make no progress and loop forever.
     */
    if (cut === end) {
      while (cut - 1 > i && stickyEnd(ws.slice(i, cut).join(" "))) cut -= 1;
    }

    lines.push(ws.slice(i, cut).join(" "));
    i = cut;
  }

  /**
   * A ONE-WORD LAST LINE is a flash of "end." on its own. Merge it back even
   * if that overruns the width slightly — a line two characters too long is
   * invisible, and a single word alone on screen is not.
   */
  if (lines.length > 1 && words(lines[lines.length - 1]).length === 1) {
    const orphan = lines.pop() as string;
    lines[lines.length - 1] += ` ${orphan}`;
  }
  return lines;
}

/**
 * A spoken line into captions, one per natural break.
 *
 * Sentences are never merged: the voice pauses between them (lib/speech-timing
 * puts a real gap there), and a caption spanning the pause is on screen saying
 * nothing for a third of a second.
 */
export function captionLines(
  text: string,
  maxChars: number = MAX_LINE_CHARS,
  maxWords: number = MAX_LINE_WORDS,
): string[] {
  const out: string[] = [];
  for (const sentence of sentences(String(text ?? ""))) {
    out.push(...fitSentence(sentence, Math.max(1, maxChars), Math.max(1, maxWords)));
  }
  return out;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HOW LONG A CAPTION HAS TO BE ON SCREEN. "TOO FAST PACED."
 *
 * This was a flat 450ms, which is not a reading speed — it is a number below
 * every published one. The reel that prompted the complaint held four
 * consecutive captions for 767ms each.
 *
 * The broadcast standards agree closely and none of them is anywhere near
 * 450ms. Netflix's timed-text guide caps English at 17 characters per second
 * for adults and sets a MINIMUM DURATION of 5/6 of a second; the BBC's
 * subtitle guidelines target 160-180 words per minute. Both assume the viewer
 * can also HEAR the line. On a reel, most of the audience has the sound off —
 * the caption is not an aid to the audio, it IS the content — so this uses the
 * conservative end and adds the time the eye needs to find new text at all.
 *
 * Duration therefore depends on LENGTH. A flat floor gives "Same protein." and
 * "Every recipe in here is priced" the same time, and one of them is twice the
 * reading.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Characters per second. Netflix allows 17 with audio; this is read on mute. */
export const CAPTION_CPS = 15;

/** Finding new text on screen costs this before any of it is read. */
export const CAPTION_ACQUIRE_MS = 300;

/** An absolute floor, whatever the length. Netflix's is 833ms. */
export const MIN_CAPTION_MS = 1_000;

/** How long this particular caption needs. */
export function captionReadMs(text: string): number {
  const chars = String(text ?? "").trim().length;
  return Math.max(MIN_CAPTION_MS, Math.round(CAPTION_ACQUIRE_MS + (chars / CAPTION_CPS) * 1000));
}
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A BEAT LASTS AT LEAST AS LONG AS ITS CAPTIONS TAKE TO READ.
 *
 * Beats were timed to the SPEECH alone, so a line that takes three seconds to
 * say and five to read got three — and every caption in it was cut to a little
 * over half the time a person needs. "Too fast paced" was not a preference; it
 * was eleven captions out of eleven under their own reading time.
 *
 * The shot simply holds a moment longer after the voice stops, which is what
 * an editor does at exactly this point anyway: the viewer is looking at a
 * screen they have never seen, and the pause is when they actually look at it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function beatFloorMs(say: string): number {
  return captionLines(say).reduce((n, line) => n + captionReadMs(line), 0);
}
