import { test } from "node:test";
import assert from "node:assert/strict";
import { gaugeAngle, polar, GAUGE_START_DEG, GAUGE_END_DEG } from "./gauge";

// The gauge is drawn at cx/cy 100,100 with r 80 into a viewBox 200 wide and 124
// tall. The needle is slightly shorter than the arc.
const CX = 100, CY = 100, R = 80, NEEDLE_R = R - 8, VIEWBOX_H = 124, VIEWBOX_W = 200;

test("the needle sweeps left to right, not top to bottom", () => {
  // The component's comment always said "0 (left) -> 100 (right)". The code did
  // `-90 + pct * 180`, which is up -> right -> down. Those three assertions are
  // the whole intent, and the old maths failed all of them.
  const at = (score: number) => polar(CX, CY, NEEDLE_R, gaugeAngle(score));

  const zero = at(0);
  assert.ok(zero.x < CX - 50, `score 0 must point LEFT, got x=${zero.x}`);
  assert.ok(Math.abs(zero.y - CY) < 1, `score 0 must be level with the pivot, got y=${zero.y}`);

  const half = at(50);
  assert.ok(Math.abs(half.x - CX) < 1, `score 50 must point straight UP, got x=${half.x}`);
  assert.ok(half.y < CY - 50, `score 50 must point UP, got y=${half.y}`);

  const full = at(100);
  assert.ok(full.x > CX + 50, `score 100 must point RIGHT, got x=${full.x}`);
  assert.ok(Math.abs(full.y - CY) < 1, `score 100 must be level with the pivot, got y=${full.y}`);
});

test("nothing the gauge draws escapes the canvas", () => {
  /**
   * THE BUG THE USER ACTUALLY SAW. At a readiness of 81 the old maths put the
   * needle tip at (140, 159) in a viewBox 124 tall — pointing down and to the
   * right, off the bottom of the canvas and straight through the number drawn
   * underneath. It read as "the line overlaps the number"; the needle was
   * escaping the gauge entirely.
   *
   * Stroke width is 14, so the arc reaches 7 either side of its centre line.
   */
  const PAD = 7;
  for (let score = 0; score <= 100; score++) {
    for (const [label, radius] of [["needle", NEEDLE_R], ["arc", R]] as const) {
      const p = polar(CX, CY, radius, gaugeAngle(score));
      assert.ok(
        p.y - PAD >= 0 && p.y + PAD <= VIEWBOX_H,
        `score ${score}: ${label} at y=${p.y.toFixed(1)} leaves the ${VIEWBOX_H}-tall viewBox`
      );
      assert.ok(
        p.x - PAD >= 0 && p.x + PAD <= VIEWBOX_W,
        `score ${score}: ${label} at x=${p.x.toFixed(1)} leaves the ${VIEWBOX_W}-wide viewBox`
      );
    }
  }
});

test("the sweep is a half turn, so the arc never takes the long way round", () => {
  // `arc()` sets the large-arc flag from the angular distance. At exactly 180
  // it must stay 0 — a 1 here would draw the semicircle the wrong way round.
  assert.equal(GAUGE_END_DEG - GAUGE_START_DEG, 180);
  assert.equal(gaugeAngle(0), GAUGE_START_DEG);
  assert.equal(gaugeAngle(100), GAUGE_END_DEG);
  // Out-of-range scores must clamp rather than spin the needle past the ends.
  assert.equal(gaugeAngle(-20), GAUGE_START_DEG);
  assert.equal(gaugeAngle(140), GAUGE_END_DEG);
});
