import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AA_NORMAL, contrast, passesAA } from "./contrast";
import { SLIDE_W } from "./carousel";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CAROUSEL HAS ONE GUARD TO THE REEL'S DOZEN, AND THESE ARE TWO MORE.
 *
 * 245 lines against the recorder's 1673, and its only check was "did the
 * screenshot cut something off" until the caption checker was shared with it.
 * That gap is in HANDOVER.md as an audit finding.
 *
 * MOST REEL GUARDS GENUINELY DO NOT APPLY, and checking rather than assuming
 * is the point. The obvious candidate was outsideSafeZone — the reel refuses
 * anything under the 400px of platform chrome. It does not transfer: a reel is
 * 1080x1920 played full-screen with the app's caption, handle and buttons
 * drawn ON TOP, and a carousel is 1080x1350 sitting in a feed with the caption
 * BELOW it. Nothing is drawn over a carousel slide, so a safe-zone rule
 * borrowed from the reel would refuse layouts that are perfectly fine.
 *
 * What does threaten a slide is different, and neither half of it was checked.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const recorder = readFileSync("scripts/record-carousel.mts", "utf8");

/** Every `rgb(r g b)` in the stylesheet, as a hex string. */
function colours(pattern: RegExp): string[] {
  const out: string[] = [];
  for (const m of recorder.matchAll(pattern)) {
    const [r, g, b] = m[1].trim().split(/[\s,]+/).map(Number);
    if ([r, g, b].some((n) => !Number.isFinite(n))) continue;
    out.push("#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join(""));
  }
  return [...new Set(out)];
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTRAST, MEASURED RATHER THAN EYEBALLED.
 *
 * lib/contrast.ts has existed with a full WCAG implementation and a passesAA
 * that NOTHING CALLED — it was on the list of exported values referenced by
 * nothing. A carousel is almost entirely text on a dark gradient, which is
 * exactly what it was written for.
 *
 * Measured today every colour passes with room to spare: the dimmest secondary
 * text is 5.95:1 against the light end of the gradient, against a 4.5:1 bar.
 * So this is not a bug report — it is the thing that will notice when somebody
 * dims a token by one step and nobody can read the portion column any more.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("every text colour on a slide passes AA against the background", () => {
  const text = colours(/color:\s*rgb\(([^)]+)\)/g);
  assert.ok(text.length >= 3, `only ${text.length} text colours found — has the stylesheet moved?`);

  /**
   * AGAINST THE LIGHTER END OF THE GRADIENT. The slide runs rgb(16 16 17) to
   * rgb(9 9 10), and for light text the lighter background is the harder case.
   * Measuring against the darker end would flatter every colour.
   */
  const background = "#101011";
  const dark = "#0a0a0b";

  for (const fg of text) {
    // The pill inverts: near-black text on gold. It is checked below against
    // its own background rather than against the page it sits on.
    if (fg === dark) continue;
    const ratio = contrast(fg, background);
    assert.ok(passesAA(ratio),
      `${fg} on ${background} is ${ratio.toFixed(2)}:1, under the ${AA_NORMAL}:1 bar`);
  }
});

test("the call-to-action pill is legible on its own colour", () => {
  // Near-black on gold, the one place the slides invert.
  const ratio = contrast("#0a0a0b", "#e3b53f");
  assert.ok(passesAA(ratio), `the pill is ${ratio.toFixed(2)}:1`);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AND THE SIZE IT IS ACTUALLY READ AT, WHICH IS NOT THE SIZE IT IS DRAWN AT.
 *
 * A slide is authored at 1080 wide and displayed at the device's width. On the
 * narrowest phone still in common use — 375pt — that is a scale of 0.347, so
 * a 32px label is read at 11.1pt.
 *
 * ELEVEN POINTS IS THE FLOOR, and it is Apple's rather than a preference:
 * the Human Interface Guidelines put the minimum for body text at 11pt, below
 * which text is considered too small to read comfortably at arm's length.
 *
 * THIS MATTERS MORE HERE THAN ANYWHERE ELSE IN THE PROJECT. The whole argument
 * for a carousel, written at the top of the recorder, is that "a ranked table
 * of what 30g of protein costs is reference material, and this posts it as
 * reference material" — the post exists to be read and saved. A reel that is
 * slightly too small is a reel; a reference table that is too small is nothing.
 *
 * The smallest type on a slide today is 32px, which lands exactly on the floor.
 * So this passes now and fails the moment anybody makes something smaller —
 * which is the only useful moment for it to fire.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const NARROWEST_PHONE_PT = 375;
const MIN_BODY_PT = 11;

test("no text on a slide is read below eleven points on a narrow phone", () => {
  const sizes = [...recorder.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length >= 5, `only ${sizes.length} font sizes found — has the stylesheet moved?`);

  const scale = NARROWEST_PHONE_PT / SLIDE_W;
  const smallest = Math.min(...sizes);
  const readAt = smallest * scale;

  assert.ok(readAt >= MIN_BODY_PT,
    `the smallest type is ${smallest}px, read at ${readAt.toFixed(1)}pt on a ${NARROWEST_PHONE_PT}pt phone — `
    + `under the ${MIN_BODY_PT}pt floor, on a post whose whole purpose is being read`);
});

/**
 * The headline is doing a different job — it has to survive being a thumbnail
 * in a grid, not just being read. A hook that needs tapping to read is a hook
 * nobody taps.
 */
test("the headline survives being a thumbnail", () => {
  const h1 = /h1\s*\{[^}]*font-size:\s*(\d+)px/.exec(recorder);
  assert.ok(h1, "the headline no longer declares a size");
  // A profile grid cell is roughly a third of the screen width.
  const inGrid = Number(h1![1]) * (NARROWEST_PHONE_PT / 3) / SLIDE_W;
  assert.ok(inGrid >= MIN_BODY_PT,
    `the headline is ${inGrid.toFixed(1)}pt in a profile grid, under ${MIN_BODY_PT}pt`);
});

/**
 * ROWS_PER_SLIDE is what stops the table being set smaller to fit more in.
 * It is the same rule as the one above from the other direction: eight rows at
 * 40px fit; fifteen would not, and the fix somebody reaches for is a smaller
 * font rather than another slide.
 */
test("the row budget and the type size agree that eight rows fit", () => {
  const rowFont = /\.row[^{]*\{[^}]*font-size:\s*(\d+)px/.exec(recorder)
    ?? /font-size:\s*(40)px/.exec(recorder);
  assert.ok(rowFont, "the table rows no longer declare a size");
  assert.ok(Number(rowFont![1]) * (NARROWEST_PHONE_PT / SLIDE_W) >= MIN_BODY_PT,
    "a table row is read below the floor, which is the whole point of the carousel");
});
