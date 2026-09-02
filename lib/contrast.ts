/**
 * WCAG contrast, so a palette can be checked rather than eyeballed.
 *
 * The dark theme's colours were measured by hand once and the ratios written
 * into a comment in tailwind.config.ts. That was right, and it is a snapshot:
 * it cannot tell anybody that the value they just changed dropped below the
 * line. A second theme doubles the surface area for exactly that mistake, so
 * the measurement becomes a function and the ratios become a test.
 *
 * Formulae are WCAG 2.1: relative luminance with the sRGB transfer curve, and
 * (L1 + 0.05) / (L2 + 0.05).
 */

export interface Rgb { r: number; g: number; b: number }

export function parseHex(hex: string): Rgb {
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`not a hex colour: ${hex}`);
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** The sRGB channel transfer curve WCAG specifies. */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(colour: Rgb | string): number {
  const { r, g, b } = typeof colour === "string" ? parseHex(colour) : colour;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: Rgb | string, b: Rgb | string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * What a semi-transparent colour actually looks like once it is painted.
 *
 * Most of this app's surfaces are a tint over the page rather than a solid —
 * `bg-white/[0.04]` and friends, 582 of them — so measuring the token against
 * the page colour would measure a colour nobody ever sees.
 */
export function over(top: Rgb | string, bottom: Rgb | string, alpha: number): Rgb {
  const t = typeof top === "string" ? parseHex(top) : top;
  const b = typeof bottom === "string" ? parseHex(bottom) : bottom;
  const mix = (x: number, y: number) => Math.round(x * alpha + y * (1 - alpha));
  return { r: mix(t.r, b.r), g: mix(t.g, b.g), b: mix(t.b, b.b) };
}

/** AA for normal text. Large text is 3:1, and nothing here relies on that. */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;

export function passesAA(ratio: number, large = false): boolean {
  return ratio >= (large ? AA_LARGE : AA_NORMAL);
}

/** "4.76" — two decimals, which is how the config's comments already read. */
export const ratio = (n: number) => n.toFixed(2);
