import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CHROME, SAFE, FRAME_W, FRAME_H, CAPTION_BOTTOM_FRACTION, outsideSafeZone,
} from "./safe-zone";

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
  const css = readFileSync("scripts/reel-overlay.js", "utf8");
  const m = css.match(/padding:0 \d+px ([\d.]+)(vh|%)\b/);
  assert.ok(m, "the caption's bottom padding is no longer where this can check it");
  assert.notEqual(m![2], "%",
    "percentage padding resolves against WIDTH — this is the bug that shipped a caption "
    + "243px off the bottom when it meant 422");
  assert.equal(m![2], "vh");
  const px = (Number(m![1]) / 100) * FRAME_H;
  assert.ok(px >= CHROME.bottom,
    `${m![1]}vh is ${Math.round(px)}px, under the ${CHROME.bottom}px the platform draws over`);
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
