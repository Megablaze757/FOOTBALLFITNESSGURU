import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DRIFT_PER_BEAT, closingDrift, driftEnd, driftTarget } from "./reel-scroll";
import { SCRIPTS, reelScript, type ScriptId } from "./reel-script";
import { reelPlan } from "./reel-plan";

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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LOOP THE SCRIPTS PAY FOR.
 *
 * Five of the seven scripts end on the screen they opened on, and
 * lib/reel-script.ts records what that costs: two other reels go without it
 * because coming back would push them past MAX_ONE_ROUTE_SHARE. Simulated
 * against the recorder's own drift, every one of those five ended 720px down a
 * 960px viewport while the first frame sits at 0 — the right page at the wrong
 * place, which loops no better than the wrong page.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the closing beat arrives back at the framing it opened on", () => {
  assert.equal(closingDrift({ from: 720, step: 4, steps: 4 }), 0,
    "the last caption of the reel does not land on the opening frame");
});

test("the closing beat is still moving on the way there", () => {
  const from = 720;
  const seen = [1, 2, 3, 4].map((step) => closingDrift({ from, step, steps: 4 }));
  assert.deepEqual(seen, [540, 360, 180, 0]);
  /** Downward all the way — a scroll that jitters back and forth reads as broken. */
  for (let i = 1; i < seen.length; i += 1) {
    assert.ok(seen[i] < seen[i - 1], `the closing drift went backwards at caption ${i + 1}`);
  }
});

test("a closing beat that starts at the top stays there", () => {
  for (const step of [1, 2, 3]) assert.equal(closingDrift({ from: 0, step, steps: 3 }), 0);
});

test("a single-caption closing beat still lands at 0", () => {
  assert.equal(closingDrift({ from: 900, step: 1, steps: 1 }), 0);
});

/** steps is a count off a plan, and 0 captions must not divide by zero. */
test("a closing beat with no captions is not a division by zero", () => {
  assert.equal(closingDrift({ from: 500, step: 0, steps: 0 }), 500);
  assert.ok(Number.isFinite(closingDrift({ from: 500, step: 1, steps: 0 })));
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WALKED OVER THE REAL SCRIPTS, BECAUSE THE ARITHMETIC WAS NEVER THE PROBLEM.
 *
 * driftTarget was correct in itself the whole time. What nobody had done was
 * follow it across a whole reel and ask where the last frame lands — and the
 * answer, on all five reels written to loop, was 720px from the frame they
 * opened on. This walks the beats the way the recorder drives them: a route
 * change reloads the document at 0, captions drift within a beat, and the
 * closing beat glides back.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("every reel written to loop ends on the frame it opened on", () => {
  const viewport = 960;
  const scrollable = 5_000;
  let looping = 0;
  for (const meta of SCRIPTS) {
    const script = reelScript(meta.id as ScriptId, "");
    if (!script) continue;
    const plan = reelPlan(script);
    const last = plan.steps[plan.steps.length - 1];
    let at = 0;
    let route = "";
    for (const step of plan.steps) {
      if (step.route !== route) { at = 0; route = step.route; }
      let from = at;
      for (let i = 0; i < step.captions.length; i += 1) {
        from = step === last
          ? closingDrift({ from, step: i + 1, steps: step.captions.length })
          : driftTarget({ from, scrollable, viewport, step: i + 1, steps: step.captions.length });
      }
      at = from;
    }
    if (plan.steps[0].route !== last.route) continue;
    looping += 1;
    assert.equal(at, 0,
      `${meta.id} opens and closes on ${last.route} but ends ${at}px down it, so the picture jumps`);
  }
  /** The count itself, or a script losing its loop would quietly empty this. */
  assert.ok(looping >= 5, `only ${looping} scripts still loop; five did when this was written`);
});

test("the recorder glides the closing beat back rather than onward", () => {
  const rec = readFileSync("scripts/record-reel.mts", "utf8");
  assert.match(rec, /closingDrift/, "the recorder never uses the closing drift");
  assert.match(rec, /plan\.steps\[plan\.steps\.length - 1\]/,
    "nothing identifies the closing beat, so every beat drifts the same way");
  /** Ordinary beats must still drift onward — this replaces one beat, not all. */
  assert.match(rec, /driftTarget\(\{ \.\.\.page_/, "the ordinary drift is gone");
});
