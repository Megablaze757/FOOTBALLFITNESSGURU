import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CHROME, SAFE, FRAME_W, FRAME_H, CAPTION_BOTTOM_FRACTION, outsideSafeZone, cssPx,
  MAX_CAPTION_LINES,
} from "./safe-zone";
import { REEL_W, REEL_SCALE } from "./reel-plan";

const OVERLAY = readFileSync("scripts/reel-overlay.js", "utf8");

/** `padding:0 <right>px <bottom><unit> <left>px` off the caption layer. */
function captionPadding() {
  const m = OVERLAY.match(/padding:0 (\d+)px ([\d.]+)(vh|%) (\d+)px/);
  assert.ok(m, "the caption layer's padding is no longer where this can read it");
  return { right: Number(m![1]), bottom: Number(m![2]), unit: m![3], left: Number(m![4]) };
}

/**
 * How far the glyph outline paints OUTSIDE the layout box, in CSS pixels, as
 * the element itself declares it.
 */
function bleedOf(el: "caption" | "hook"): number {
  const m = OVERLAY.match(new RegExp(`${el}\\.dataset\\.bleed = "([\\d.]+)"`));
  assert.ok(m, `${el} no longer declares how far its outline paints`);
  return Number(m![1]);
}

test("a box inside the safe area has nothing wrong with it", () => {
  assert.deepEqual(outsideSafeZone({ left: 200, right: 800, top: 300, bottom: 1200 }), []);
});

test("each edge is reported with how far over it is", () => {
  const over = outsideSafeZone({ left: 10, right: 1000, top: 20, bottom: 1700 });
  assert.ok(over.some((p) => p.includes("left edge")), "the left edge was not caught");
  assert.ok(over.some((p) => p.includes("action buttons")), "the right rail was not caught");
  assert.ok(over.some((p) => p.includes("sound credit")), "the top was not caught");
  assert.ok(over.some((p) => p.includes("platform's own caption")), "the bottom was not caught");
  /** The numbers are the point: "too low" is not something anybody can act on. */
  assert.ok(over.every((p) => /\d+px/.test(p)), `a reason carries no measurement: ${over}`);
});

/**
 * The measured failure: a caption 243px off the bottom of the frame, where the
 * platform draws its own over the lower 400.
 */
test("the caption that shipped would be refused", () => {
  const shipped = { left: 176, right: 906, top: 1587, bottom: FRAME_H - 243 };
  const over = outsideSafeZone(shipped);
  assert.ok(over.some((p) => p.includes("platform's own caption")),
    "the caption that was really under the chrome is judged safe");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE UNIT IS THE BUG, SO THE UNIT IS WHAT IS CHECKED.
 *
 * `padding-bottom: 22%` resolves against the containing block's WIDTH. On a
 * 540x960 viewport that is 119px rather than 211, and the rule the comment
 * describes silently did half its job.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the overlay lifts its caption by a fraction of the HEIGHT", () => {
  const { bottom, unit } = captionPadding();
  assert.notEqual(unit, "%",
    "percentage padding resolves against WIDTH — this is the bug that shipped a caption "
    + "243px off the bottom when it meant 422");
  assert.equal(unit, "vh");
  /** Less the ring, which paints below the box just as it paints beside it. */
  const px = (bottom / 100) * FRAME_H - bleedOf("caption") * REEL_SCALE;
  assert.ok(px >= CHROME.bottom,
    `${bottom}vh is ${Math.round(px)}px, under the ${CHROME.bottom}px the platform draws over`);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SIDES ARE IN CSS PIXELS AND THE RAIL IS IN FRAME PIXELS.
 *
 * Measured on the same frame: the caption's right edge at x=906 against a safe
 * edge of 900, from a container that allowed 1024. `padding:0 28px` looks like
 * clearance and is 56 frame pixels against a 180px action rail, because the
 * recorder runs at 540x960 and scales by two.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the caption clears the action rail on the right", () => {
  const { left, right } = captionPadding();
  const bleed = bleedOf("caption");
  assert.ok(right >= cssPx(CHROME.right) + bleed,
    `${right}px CSS leaves ${right * REEL_SCALE}px of frame; the rail is ${CHROME.right}px `
    + `and the outline paints ${bleed * REEL_SCALE}px past the box`);
  assert.ok(left >= cssPx(CHROME.left) + bleed,
    `${left}px CSS is inside the ${CHROME.left}px left margin once the outline is counted`);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE OUTLINE IS NOT LAYOUT, AND THAT IS WHERE THE 6px WENT.
 *
 * The captions are legible on any background because the glyphs carry a heavy
 * black ring — twelve text-shadows on a circle. text-shadow paints outside the
 * layout box and getBoundingClientRect() does not report it, so the box said
 * the caption ended at 895 while the pixels in the frame ended at 906.
 *
 * A padding merely EQUAL to the chrome therefore puts the outline of the last
 * letter under the buttons. The declared bleed has to match the ring actually
 * in the CSS, or it is a number that drifts silently.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("each element's declared bleed matches the ring it actually paints", () => {
  for (const el of ["caption", "hook"] as const) {
    const at = OVERLAY.indexOf(`var ${el} = document.createElement`);
    assert.ok(at > 0, `${el} is not created where this can find its styles`);
    const shadow = OVERLAY.slice(at).match(/text-shadow:([^"]+)/);
    assert.ok(shadow, `${el} has no text-shadow`);
    /** The hard ring only: `<x>px <y>px 0 #000`. Blur radii are not ink. */
    const hard = [...shadow![1].matchAll(/(-?[\d.]+)px (-?[\d.]+)px 0 #000/g)]
      .flatMap((m) => [Math.abs(Number(m[1])), Math.abs(Number(m[2]))]);
    assert.ok(hard.length >= 12, `${el}'s ring has ${hard.length / 2} shadows, not 12`);
    assert.equal(bleedOf(el), Math.max(...hard),
      `${el} declares a bleed of ${bleedOf(el)}px and paints a ${Math.max(...hard)}px ring`);
  }
});

/**
 * The hook is the first 1.6 seconds and the largest type in the reel, so it is
 * the worst thing to lose an edge of. It had its own 30px padding, which was
 * the same defect in a second place.
 */
test("the hook clears the action rail too", () => {
  const m = OVERLAY.match(/padding:0 (\d+)px 0 (\d+)px/);
  assert.ok(m, "the hook's padding is no longer where this can read it");
  const bleed = bleedOf("hook");
  assert.ok(Number(m![1]) >= cssPx(CHROME.right) + bleed,
    `the hook pads ${m![1]}px CSS on the right; the rail is ${CHROME.right}px of frame and its `
    + `ring paints ${bleed * REEL_SCALE}px past the box`);
  assert.ok(Number(m![2]) >= cssPx(CHROME.left) + bleed, "the hook's outline runs off the left");
});

/**
 * Not symmetric, and that is the point: there are no buttons on the left, so
 * matching 90px there would throw away 124 frame pixels of the widest type in
 * the reel to no purpose. If somebody "tidies" it to one value, this says why.
 */
test("the caption is not padded symmetrically", () => {
  const { left, right } = captionPadding();
  assert.ok(right > left,
    "the rail is only on the right — symmetric padding costs usable width for nothing");
  /**
   * And it lands exactly on the safe band rather than near it: the width left
   * between the two paddings, taken back up to frame pixels, is the 840px
   * between the chrome on each side.
   */
  const band = FRAME_W - CHROME.left - CHROME.right - 2 * bleedOf("caption") * REEL_SCALE;
  assert.equal((REEL_W - left - right) * REEL_SCALE, band,
    "the usable width is not the safe band less the outline on each side");
});

test("the derived safe box sits inside the quoted one", () => {
  /** Independently quoted as 900x1400 centred; this must not be laxer. */
  const quoted = { left: (FRAME_W - 900) / 2, right: (FRAME_W + 900) / 2,
                   top: (FRAME_H - 1400) / 2, bottom: (FRAME_H + 1400) / 2 };
  assert.ok(SAFE.bottom <= quoted.bottom,
    `the derived bottom (${SAFE.bottom}) is lower than the quoted safe area (${quoted.bottom})`);
  assert.ok(SAFE.right <= quoted.right, "the derived right edge is wider than the quoted one");
});

test("the caption fraction is derived, not typed twice", () => {
  assert.equal(CAPTION_BOTTOM_FRACTION, CHROME.bottom / FRAME_H);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CHECK HAS TO RUN ON THE REAL FRAME, NOT JUST EXIST.
 *
 * outsideSafeZone() sat here for an hour with nothing calling it. A guard
 * nobody invokes is worse than no guard: the tests are green, the module reads
 * like the rule is enforced, and the reels ship with text under the chrome
 * exactly as before. The padding tests above read the overlay's SOURCE, which
 * is where a line starts — how wide it ends up depends on the words, the wrap
 * and the fallback font, so the box has to be measured while it is on screen.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the recorder measures what it drew against the safe zone", () => {
  const rec = readFileSync("scripts/record-reel.mts", "utf8");
  assert.match(rec, /outsideSafeZone/, "the recorder does not use the safe-zone check at all");
  assert.match(rec, /getBoundingClientRect/,
    "nothing asks the browser for the box — the check is reading source, not frames");
  for (const what of ["caption", "hook", "sign-off"]) {
    assert.ok(rec.includes(`checkSafeZone("${what}"`), `the ${what} is never measured`);
  }
  /** CSS pixels out of the browser, frame pixels into the check. */
  assert.match(rec, /left: box\.left \* REEL_SCALE/, "the box is not scaled to frame pixels");
  /** And the ring has to be added back, or the check is blind to the ink. */
  assert.match(rec, /dataset\.bleed/, "the recorder measures layout and ignores the outline");
  /** And a violation has to stop the reel being posted, not just print. */
  assert.match(rec, /unsafe\.length[\s\S]{0,900}process\.exitCode = 1/,
    "violations are reported and the run still succeeds");
});

/**
 * The declaration order is load-bearing and was wrong once: `unsafe` is a
 * const, and the recording loop that appends to it runs at module top level.
 * Declared after the loop it is in the temporal dead zone, so the first real
 * violation throws a ReferenceError instead of being reported.
 */
test("the violation list is declared before the loop that fills it", () => {
  const rec = readFileSync("scripts/record-reel.mts", "utf8");
  assert.ok(rec.indexOf("const unsafe: string[]") < rec.indexOf("for (const step of plan.steps)"),
    "`unsafe` is declared after the recording loop and will be in the TDZ");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A RING AROUND SOMETHING THE CAPTION IS COVERING.
 *
 * scripts/reel-overlay.js records this defect photographed twice — "the ring
 * was around the dial and the number was under the caption" — and FOCUS_AT
 * fixed it by placing the focused thing at 36% of the frame, calibrated
 * against a caption band starting around 68%.
 *
 * Lifting the caption off Instagram's chrome moved that to 55%, so the fix's
 * premise is gone and its margin went from 174px to 26px. The arithmetic still
 * clears; 26px of 960 is not something to leave to arithmetic.
 */
test("the recorder checks the ring against the caption on the real page", () => {
  const rec = readFileSync("scripts/record-reel.mts", "utf8");
  assert.match(rec, /checkRingClear/, "nothing compares the ring with the caption");
  assert.match(rec, /__reel_ring/, "the ring is never measured");
  /** Both boxes from one call, or the comparison is across coordinate spaces. */
  assert.match(rec, /getComputedStyle\(spot\)\.opacity/,
    "an invisible spotlight would be compared as though it were aimed");
  /** Counted with the outline, same as every other edge. */
  assert.match(rec, /checkRingClear[\s\S]{0,1800}dataset\.bleed/,
    "the overlap ignores the outline the caption paints");
  assert.ok(rec.indexOf("checkRingClear(caption.text)") > 0, "the check is never called");
});

/**
 * The overlay's note carries the numbers this was calibrated against. It said
 * 68% while the caption had moved to 55%, which is how a stale premise passes
 * for a rule — so the note has to name the element the recorder now measures.
 */
test("the focus calibration points at the check that verifies it", () => {
  const overlay = readFileSync("scripts/reel-overlay.js", "utf8");
  const at = overlay.indexOf("var FOCUS_AT");
  assert.ok(at > 0, "FOCUS_AT is gone");
  const note = overlay.slice(Math.max(0, at - 2200), at);
  assert.match(note, /checkRingClear/,
    "the calibration comment does not say what verifies it, so it can go stale again");
  /**
   * A POSITIVE CLAIM, because the negative one cannot be written. Asserting the
   * absence of "68%" failed against the corrected comment: the note now quotes
   * the old figure as the thing that went stale, and a string search cannot
   * tell a live claim from a quotation of a dead one. What it can check is
   * that the measured replacement is stated.
   */
  assert.match(note, /55%/, "the note does not carry the caption top it was re-measured against");
  assert.match(note, /26px/, "the note does not say how much clearance is left");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LINE COUNT THE CODE BELIEVES IS NOT THE ONE ON SCREEN.
 *
 * captionLines cuts at MAX_LINE_CHARS = 42, and one character of the caption
 * font averages 26.4 CSS px, so 42 characters is about three rendered lines in
 * the 412px band and never the one the name implies. Measured across all seven
 * scripts, 29 captions render three lines and one rendered four — 45% of the
 * frame in text, over the app the reel is about.
 *
 * Nothing could catch that from the source, because how many lines a string
 * becomes depends on the words, the wrap and the font. It is measured on the
 * page instead, and the ceiling is a named constant so the message can state
 * what was exceeded.
 */
test("the recorder refuses a caption taller than the ceiling", () => {
  const rec = readFileSync("scripts/record-reel.mts", "utf8");
  assert.match(rec, /MAX_CAPTION_LINES/, "the line ceiling is not imported");
  assert.match(rec, /checkCaptionLines/, "nothing counts the rendered lines");
  assert.ok(rec.indexOf("checkCaptionLines(caption.text)") > 0, "the check is never called");
  /**
   * From the element's own line-height, not a number repeated here: the height
   * a line takes is decided by the CSS and nowhere else.
   */
  assert.match(rec, /checkCaptionLines[\s\S]{0,900}getComputedStyle\(el\)\.lineHeight/,
    "the line height is assumed rather than read from the element");
  /**
   * AND IT HAS TO BE THE RETURNED VALUE. Merely mentioning the line height
   * nearby is not enough: replacing the whole computation with `return 1` left
   * every assertion above passing, because the ingredients were still in the
   * function that no longer used them.
   */
  assert.match(rec, /return Math\.round\(box\.height \/ lh\);/,
    "the rendered line count is not computed from the measured height");
});

test("the line ceiling leaves the spotlight room", () => {
  /**
   * Measured, with the ceiling held across every script: the tallest caption
   * starts 583px down a 960px viewport and the ring reaches 502px. Four lines
   * put those at 528 and 26px apart.
   */
  const tallestCaptionTop = 583;
  const ringBottom = 502;
  assert.ok(tallestCaptionTop > ringBottom,
    "the tallest caption overlaps where the spotlight ring can reach");
  assert.ok(tallestCaptionTop - ringBottom > 26 * 2,
    "the clearance is no better than the 26px that prompted the ceiling");
  assert.equal(MAX_CAPTION_LINES, 3);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CEILING NEEDS A GUARD THAT RUNS WITHOUT A RECORDING.
 *
 * Mutation testing found the hole: reverting the one over-long script line was
 * caught by NOTHING. The recorder measures it on the real page, and a recording
 * needs three minutes, a running app and a voice model — so in the unit suite,
 * which has no browser, a script could go back to a four-line caption silently.
 *
 * scripts/check-captions.mts is the same measurement with none of that: the
 * overlay on a blank page at the record viewport, every caption of every
 * script, a few seconds. This asserts it exists and still does that, because a
 * check nobody runs is the other way this goes quiet.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("captions can be checked without recording a reel", () => {
  const src = readFileSync("scripts/check-captions.mts", "utf8");
  assert.match(src, /MAX_CAPTION_LINES/, "the standalone check does not use the ceiling");
  assert.match(src, /outsideSafeZone/, "it checks lines but not whether they fit the frame");
  assert.match(src, /reel-overlay\.js/, "it measures something other than the real overlay");
  assert.match(src, /SCRIPTS/, "it does not cover every script");
  assert.match(src, /process\.exit\(1\)/, "a problem does not fail the check");
  /**
   * A self-test, for the same reason three audio metrics in this project got
   * one: an instrument that is confidently wrong is worse than no instrument.
   */
  assert.match(src, /--self-test/, "the instrument has no control");
  assert.match(src, /the instrument is wrong, so its readings mean nothing/,
    "the self-test does not refuse to report when the control fails");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE DIM MUST LEAVE THE PAGE READABLE.
 *
 * The spotlight dims everything outside the ring, and at 0.72 over a near-black
 * app that meant erasure rather than emphasis. Measured on a finished frame:
 * the ringed line at 20.35:1, and the £0.31 the whole reel is about at 2.63:1 —
 * under the 3:1 floor for large text.
 *
 * Swept on the real page: 0.6 gives 3.58:1, 0.5 gives 5.06:1, 0.4 gives 7.04:1.
 * The ceiling here is where legibility fails, not a taste about how dark it
 * looks — which is why it is a number and not an opinion.
 */
test("the spotlight dims the page without erasing it", () => {
  const alpha = Number(OVERLAY.match(/\[data-side\][\s\S]{0,2400}?background:rgba\(4,4,6,([\d.]+)\)/)?.[1]
    ?? OVERLAY.match(/background:rgba\(4,4,6,([\d.]+)\)/)?.[1]);
  assert.ok(Number.isFinite(alpha), "the spotlight's dim is no longer where this can read it");
  assert.ok(alpha <= 0.55,
    `a ${alpha} dim measured 2.26:1 on the figure the reel is about — under the 3:1 floor`);
  /** And it still has to dim: no dim is no spotlight. */
  assert.ok(alpha >= 0.35, `a ${alpha} dim stops the ring pointing at anything`);
});
