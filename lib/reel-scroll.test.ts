import { test } from "node:test";
import assert from "node:assert/strict";
import { DRIFT_PER_BEAT, driftEnd, driftTarget } from "./reel-scroll";

/**
 * /cheapest-protein/ as it actually is: a screen of 960, a document long
 * enough that dividing it by two put the shot three screens past the table the
 * voiceover was describing.
 */
const LONG = { scrollable: 6_000, viewport: 960 };

test("a long page drifts by the screen, not by the document", () => {
  const end = driftTarget({ ...LONG, from: 0, step: 2, steps: 2 });
  assert.equal(end, Math.round(960 * DRIFT_PER_BEAT), "the drift is measured against the document again");
  assert.ok(end < LONG.viewport, "a whole screen scrolled past in one beat");
  // The old behaviour, for contrast: half the document per caption.
  assert.ok(end < LONG.scrollable / 4, `${end}px is still most of the way down a long page`);
});

test("a short page and a long one move at the same speed", () => {
  const short = driftTarget({ scrollable: 900, viewport: 960, from: 0, step: 2, steps: 2 });
  const long = driftTarget({ ...LONG, from: 0, step: 2, steps: 2 });
  assert.equal(short, long, "how far the shot moves depends on how long the page is");
});

test("captions within a beat move evenly", () => {
  const at = (step: number) => driftTarget({ ...LONG, from: 0, step, steps: 4 });
  const steps = [at(1), at(2), at(3), at(4)];
  assert.deepEqual(steps, [...steps].sort((a, b) => a - b), "the drift goes backwards");
  const gaps = [steps[1] - steps[0], steps[2] - steps[1], steps[3] - steps[2]];
  for (const g of gaps) assert.ok(Math.abs(g - gaps[0]) <= 1, `uneven: ${gaps.join(", ")}`);
});

/**
 * Two beats on one screen is the COMMON case — most scripts hold a page for
 * two or three. Restarting from the top made the shot jump backwards on every
 * one of them.
 */
test("a second beat on the same screen carries on rather than jumping back", () => {
  const first = driftEnd({ ...LONG, from: 0 });
  const second = driftTarget({ ...LONG, from: first, step: 2, steps: 2 });
  assert.ok(second > first, `the second beat scrolled back to ${second} from ${first}`);
  assert.equal(second, Math.round(first + 960 * DRIFT_PER_BEAT));
});

test("it never scrolls past the bottom", () => {
  const at = driftTarget({ scrollable: 100, viewport: 960, from: 90, step: 1, steps: 1 });
  assert.equal(at, 100);
  assert.ok(at <= 100);
});

test("a page with nothing to scroll is left alone", () => {
  assert.equal(driftTarget({ scrollable: 0, viewport: 960, from: 0, step: 1, steps: 1 }), 0);
  // Negative scrollable (a viewport taller than the document) is not a scroll up.
  assert.equal(driftTarget({ scrollable: -50, viewport: 960, from: 0, step: 1, steps: 1 }), 0);
  assert.equal(driftTarget({ scrollable: 500, viewport: 0, from: 40, step: 1, steps: 1 }), 40);
});
