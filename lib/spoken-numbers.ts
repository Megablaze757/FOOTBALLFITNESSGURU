/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THE VOICE SAYS IS NOT WHAT THE CAPTION SHOWS.
 *
 * The narration was handed "£0.31" and "30g" verbatim. A speech model given a
 * currency symbol and a decimal point does something defensible and wrong —
 * "pound zero point three one" — and every price in this app is written that
 * way, so it happened in every reel, on the exact words the reel is about.
 *
 * On screen the numeral is right: it is scanned, not read, and "£0.31" is
 * faster to take in than "thirty-one pence". Out loud the words are right.
 * They are the same fact in two notations, so this converts one to the other
 * rather than making anybody write both.
 *
 * British throughout — the app prices in pounds and weighs in grams.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** Up to 9,999, which is far above anything this app puts in a sentence. */
export function words(n: number): string {
  const v = Math.floor(Math.abs(n));
  if (v < 20) return ONES[v];
  if (v < 100) {
    const t = TENS[Math.floor(v / 10)];
    const r = v % 10;
    return r ? `${t}-${ONES[r]}` : t;
  }
  if (v < 1000) {
    const h = `${ONES[Math.floor(v / 100)]} hundred`;
    const r = v % 100;
    // "and" is how it is said here, and the voice pauses correctly on it.
    return r ? `${h} and ${words(r)}` : h;
  }
  const th = `${words(Math.floor(v / 1000))} thousand`;
  const r = v % 1000;
  return r ? `${th} ${words(r)}` : th;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Money, the way somebody reads it aloud.
 *
 * Under a pound is pence and never "zero pounds". Over a pound with pence is
 * "three pounds nineteen" rather than "three pounds and nineteen pence" —
 * shorter, and what anybody actually says.
 */
function money(pounds: number, pence: number): string {
  if (pounds === 0) return `${words(pence)} ${plural(pence, "penny", "pence")}`;
  const whole = `${words(pounds)} ${plural(pounds, "pound", "pounds")}`;
  if (pence === 0) return whole;
  // "three pounds oh five", because "three pounds five" is £3.50 to the ear.
  return pence < 10 ? `${whole} oh ${words(pence)}` : `${whole} ${words(pence)}`;
}

/**
 * A line of script into something a speech model reads correctly.
 *
 * Order matters: money before bare numbers, or "£3.19" loses its symbol to the
 * decimal rule and becomes "pound three point one nine".
 */
export function spokenForm(text: string): string {
  let out = String(text ?? "");

  // £3.19 / £0.31 / £12
  out = out.replace(/£\s*([0-9]{1,4})(?:\.([0-9]{1,2}))?/g, (_m, p: string, c?: string) => {
    const pence = c ? Number(c.length === 1 ? `${c}0` : c) : 0;
    return money(Number(p), pence);
  });

  // 30g, 375ml, 20kg — the unit spelled out, because "g" is read as a letter.
  const UNITS: Record<string, [string, string]> = {
    g: ["gram", "grams"], kg: ["kilo", "kilos"], ml: ["millilitre", "millilitres"],
    l: ["litre", "litres"], cm: ["centimetre", "centimetres"], kcal: ["calorie", "calories"],
  };
  out = out.replace(/\b([0-9]{1,4})\s*(kcal|kg|ml|cm|g|l)\b/g, (_m, n: string, u: string) => {
    const [one, many] = UNITS[u];
    const v = Number(n);
    return `${words(v)} ${plural(v, one, many)}`;
  });

  // 10.2× / 10x — a multiplier, not a number and a letter.
  // `x\b` and NOT `[×x]\b`: × is not a word character, so a trailing \b
  // demanded a letter after it and "10.2×" at the end of a line never matched.
  out = out.replace(/\b([0-9]+)(?:\.([0-9]+))?\s*(?:×|x\b)/gi, (_m, w: string, f?: string) =>
    f ? `${words(Number(w))} point ${f.split("").map((d) => words(Number(d))).join(" ")} times`
      : `${words(Number(w))} times`);

  // 25% — "percent", not "per cent sign".
  out = out.replace(/\b([0-9]{1,3})\s*%/g, (_m, n: string) => `${words(Number(n))} percent`);

  // Anything left that is a bare number a model would spell digit by digit.
  out = out.replace(/(?<![\w.])([0-9]{1,4})(?![\w.])/g, (_m, n: string) => words(Number(n)));

  return out;
}
