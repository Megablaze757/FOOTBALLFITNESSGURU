/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE COLOURED WORD PER CAPTION, AND WHY IT IS NOT DECORATION.
 *
 * The most-copied device in high-performing short-form captions is a white
 * line with the word that matters in a bright accent. It is copied because it
 * works, and it works for a reason that predates the format: colour is one of
 * the classic PRE-ATTENTIVE features in visual search — a uniquely coloured
 * item is located in roughly constant time regardless of how many other items
 * are on screen, without the viewer scanning for it.
 *
 * On a reel that matters twice over. Most of the audience has the sound off,
 * so the caption is the content; and a caption is on screen for under two
 * seconds, so the eye has one movement to spend. Colouring the figure means
 * that movement lands on "£0.31" rather than on "from".
 *
 * WHAT GETS COLOURED IS THE FIGURE, and nothing else. Highlighting a word
 * because it feels important is how every line ends up with three coloured
 * words and the device stops meaning anything. These reels are about numbers:
 * a price, a weight, a multiple. That is an objective test, and it is also the
 * thing a viewer would screenshot.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** A piece of a caption, and whether it is the bit to colour. */
export interface Run {
  text: string;
  key: boolean;
}

/**
 * A figure worth the eye landing on.
 *
 * Deliberately narrow. A bare "2" in "two or three sets" is not what this is
 * for — the token has to carry a unit, a currency, or a multiplier, which is
 * what makes it a fact rather than a word.
 */
const FIGURE = /^(?:[£$€]\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?(?:g|kg|ml|l|kcal|%|x|×)|\d[\d,]*(?:\.\d+)?)$/i;

/** Punctuation clinging to a token, which should keep the colour with it. */
const STRIP = /^[("'‘“]+|[)"'.,:;!?’”]+$/g;

/**
 * The words that turn a bare number into a fact.
 *
 * ONE LIST, used both to decide whether a number is a figure and to pull the
 * unit into the colour with it. They were two lists and they disagreed —
 * "sets" was in one and not the other — so "3 sets" coloured the 3 and left
 * the word white, which is the exact split this is meant to avoid.
 */
const UNIT_WORD = /^(?:grams?|kilos?|kg|ml|litres?|pence|pounds?|calories|kcal|percent|times|minutes?|seconds?|reps?|sets?)\b/i;

const bare = (token: string) => token.replace(STRIP, "");

/**
 * Whether a single token is a figure.
 *
 * Deliberately narrow. A bare "2" in "two or three sets" is not what this is
 * for — the token has to carry a unit, a currency or a multiplier, which is
 * what makes it a fact rather than a word.
 */
function isFigure(token: string, next: string | undefined): boolean {
  const word = bare(token);
  if (!word || !FIGURE.test(word)) return false;
  // A number with a unit stuck to it, a price, or a multiplier: always.
  if (/[£$€%]|(?:g|kg|ml|l|kcal|x|×)$/i.test(word)) return true;
  // A bare number needs a unit following it. lib/spoken-numbers.ts leaves the
  // caption in numerals while the voice says the words, so "30" and "grams"
  // arrive as separate tokens.
  return UNIT_WORD.test(bare(next ?? ""));
}

export function emphasise(caption: string): Run[] {
  const text = String(caption ?? "");
  if (!text.trim()) return [];

  const tokens = text.split(/(\s+)/);

  /**
   * THE LAST FIGURE, and only that one.
   *
   * "The same 30 grams costs £3.19 at the other end" has two, and colouring
   * both splits the one eye movement a caption gets between them. In English
   * the payload arrives at the end of the sentence — the quantity is the
   * setup, the price is the point — so the last figure is the one worth
   * landing on. A line with three coloured words has none.
   */
  let mark = -1;
  for (let i = 0; i < tokens.length; i += 1) {
    if (!tokens[i].trim()) continue;
    const next = tokens.slice(i + 1).find((t) => t.trim() !== "");
    if (isFigure(tokens[i], next)) mark = i;
  }

  const runs: Run[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (i !== mark) { push(runs, tokens[i], false); continue; }

    push(runs, tokens[i], true);
    /**
     * The unit comes with it. Colouring "30" and leaving "grams" white splits
     * the fact across two colours, which is worse than not colouring it.
     */
    const next = tokens.slice(i + 1).find((t) => t.trim() !== "");
    if (next && UNIT_WORD.test(bare(next))) {
      const at = tokens.indexOf(next, i + 1);
      for (let j = i + 1; j <= at; j += 1) push(runs, tokens[j], true);
      i = at;
    }
  }
  return runs.filter((r) => r.text !== "");
}

function push(runs: Run[], text: string, key: boolean): void {
  const last = runs[runs.length - 1];
  if (last && last.key === key) last.text += text;
  else runs.push({ text, key });
}

/** Whether a caption has anything worth colouring. */
export const hasFigure = (caption: string): boolean => emphasise(caption).some((r) => r.key);
