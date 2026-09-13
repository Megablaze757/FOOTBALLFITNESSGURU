import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CHROME, SAFE, FRAME_W, FRAME_H, CAPTION_BOTTOM_FRACTION, outsideSafeZone, cssPx,
  RECORD_W, RECORD_SCALE,
} from "./safe-zone";

const OVERLAY = readFileSync("scripts/reel-overlay.js", "utf8");

/** `padding:0 <right>px <bottom><unit> <left>px` off the caption layer. */
function captionPadding() {
  const m = OVERLAY.match(/padding:0 (\d+)px ([\d.]+)(vh|%) (\d+)px/);
  assert.ok(m, "the caption layer's padding is no longer where this can read it");
  return { right: Number(m![1]), bottom: Number(m![2]), unit: m![3], left: Number(m![4]) };
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
  const px = (bottom / 100) * FRAME_H;
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
  assert.ok(right >= cssPx(CHROME.right),
    `${right}px CSS is ${right * 2}px of frame, inside the ${CHROME.right}px action rail`);
  assert.ok(left >= cssPx(CHROME.left),
    `${left}px CSS is ${left * 2}px of frame, inside the ${CHROME.left}px left margin`);
});

/**
 * The hook is the first 1.6 seconds and the largest type in the reel, so it is
 * the worst thing to lose an edge of. It had its own 30px padding, which was
 * the same defect in a second place.
 */
test("the hook clears the action rail too", () => {
  const m = OVERLAY.match(/top:42%;[^"]*"\s*\n?[^"]*"padding:0 (\d+)px 0 (\d+)px/)
    ?? OVERLAY.match(/padding:0 (\d+)px 0 (\d+)px/);
  assert.ok(m, "the hook's padding is no longer where this can read it");
  assert.ok(Number(m![1]) >= cssPx(CHROME.right),
    `the hook pads ${m![1]}px CSS on the right, inside the ${CHROME.right}px rail`);
  assert.ok(Number(m![2]) >= cssPx(CHROME.left), "the hook runs into the left edge");
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
  assert.equal((RECORD_W - left - right) * RECORD_SCALE, FRAME_W - CHROME.left - CHROME.right);
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
