import { test } from "node:test";
import assert from "node:assert/strict";
import { POST_SIZES, sizeOf, svgDimensions, type PostSize } from "./post-size";
import { buildDrillCardSvg } from "./drill-card";
import { buildDemoCardSvg, DEMO_SCREENS } from "./demo-card";
import { SKILL_DRILLS } from "./skills";

const drill = SKILL_DRILLS[0];

test("every size is 1080 wide, and only the height moves", () => {
  for (const s of POST_SIZES) {
    assert.equal(s.w, 1080, `${s.id} is not Instagram's ingest width`);
    assert.ok(s.h >= 1080);
  }
  assert.deepEqual(POST_SIZES.map((s) => s.h), [1080, 1350, 1920], "1:1, 4:5 and 9:16");
});

test("an unknown size throws rather than quietly publishing a square", () => {
  assert.throws(() => sizeOf("reel" as PostSize), /unknown post size/);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PREVIEW IS THE SVG AND THE EXPORT IS A CANVAS, SO THEY CAN DISAGREE.
 *
 * rasterise() took one `size` and set canvas width AND height from it. Every
 * card was square, so it was correct — and would have silently squashed the
 * first portrait card into a square, with a preview that looked right the
 * whole time. svgDimensions is what stops the two drifting.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the canvas size is read from the card, not assumed", () => {
  for (const size of POST_SIZES) {
    const svg = buildDrillCardSvg({ drill, sportLabel: "Football", size: size.id });
    assert.deepEqual(svgDimensions(svg), { w: size.w, h: size.h }, `${size.id} drill card`);

    const demo = buildDemoCardSvg({ screen: DEMO_SCREENS[0].id, size: size.id });
    assert.deepEqual(svgDimensions(demo), { w: size.w, h: size.h }, `${size.id} demo card`);
  }
  assert.throws(() => svgDimensions("<svg></svg>"), /no width\/height/);
});

/**
 * Nothing may be drawn outside the canvas — off-card content is invisible.
 *
 * The y values are resolved THROUGH the translate. The card centres its block
 * with `<g transform="translate(0, n)">`, and a check that read raw attributes
 * would measure the pre-transform layout: it would pass while the card
 * overflowed, which is the bug it exists to catch.
 */
function drawnAt(svg: string): number[] {
  const ys: number[] = [];
  let offset = 0;
  for (const line of svg.split("\n")) {
    const g = /<g transform="translate\(\s*[-\d.]+\s*,\s*(-?[\d.]+)\s*\)"/.exec(line);
    if (g) offset = Number(g[1]);
    if (/^\s*<\/g>/.test(line)) offset = 0;
    for (const m of line.matchAll(/\by="(-?\d+(?:\.\d+)?)"/g)) {
      const h = /\bheight="(\d+(?:\.\d+)?)"/.exec(line);
      // A rect's y is its TOP; the bottom is what can fall off the card.
      ys.push(Number(m[1]) + offset + (h ? Number(h[1]) : 0));
    }
  }
  return ys;
}

test("the bounds check sees through the transform", () => {
  const shifted = '<g transform="translate(0, 500)">\n  <text y="100"/>\n  </g>';
  assert.deepEqual(drawnAt(shifted), [600], "a translated element was measured where it is not");
  assert.deepEqual(drawnAt('<rect y="10" height="40"/>'), [50], "a rect is measured by its bottom");
});

test("no card draws past its own bottom edge", () => {
  for (const size of POST_SIZES) {
    for (const style of ["drill", "cue"] as const) {
      for (const d of SKILL_DRILLS) {
        const svg = buildDrillCardSvg({ drill: d, sportLabel: "Football", style, size: size.id });
        const ys = drawnAt(svg);
        const worst = Math.max(...ys);
        assert.ok(worst <= size.h, `${d.id} ${style} ${size.id}: drawn at y=${worst} on a ${size.h}px card`);
        assert.ok(Math.min(...ys) >= 0, `${d.id} ${style} ${size.id}: drawn above the top edge`);
      }
    }
  }
});

/** And no hole in the middle, which is what the centring is for. */
test("a story card is not two halves with a gap between them", () => {
  for (const d of SKILL_DRILLS) {
    const svg = buildDrillCardSvg({ drill: d, sportLabel: "Football", size: "story" });
    const ys = drawnAt(svg).filter((y) => y > 200 && y < 1800).sort((a, b) => a - b);
    let worstGap = 0;
    for (let i = 1; i < ys.length; i++) worstGap = Math.max(worstGap, ys[i] - ys[i - 1]);
    assert.ok(worstGap < 260, `${d.id}: a ${Math.round(worstGap)}px hole in the middle of the card`);
  }
});
