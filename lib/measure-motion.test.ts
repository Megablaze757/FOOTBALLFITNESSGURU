import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AN INSTRUMENT NOTHING RUNS IS A FILE, NOT A MEASUREMENT.
 *
 * This project has a documented habit of building the thing and not wiring it
 * up. DATA_ROUTE_PAINT_MS was declared, documented as a standard, and read by
 * nothing for months. lib/reel-music.ts built a whole ducking chain that was
 * never mixed because an input defaulted to "". The caption file was written,
 * uploaded nowhere, and filtered out on arrival.
 *
 * scripts/measure-motion.py is the picture's equivalent of
 * measure-excitement.py, and the first time it was pointed at a finished file
 * it found every reel this project has made has ZERO cuts and is 90-94% still
 * frames. That is worth knowing on every run, not once.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const workflow = readFileSync(".github/workflows/record-reels.yml", "utf8");
const script = readFileSync("scripts/measure-motion.py", "utf8");

test("the recorder measures the finished file, not just makes it", () => {
  assert.match(workflow, /python3 scripts\/measure-motion\.py reels\/\*\.mp4/,
    "the motion instrument is not run on the reels, so it measures nothing");
});

/**
 * "A broken instrument is worse than none, because its output gets believed."
 * That sentence is in three files here, and it was earned: this project has
 * shipped three audio metrics that were confidently wrong, and one earlier
 * attempt at THIS measurement — a mean pixel change — rewarded a single big
 * fade over sustained activity.
 */
test("it self-tests in the run, before it is believed", () => {
  const step = workflow.slice(workflow.indexOf("Measure how much the picture moves"));
  const selfTest = step.indexOf("measure-motion.py --self-test");
  const measure = step.indexOf("measure-motion.py reels/*.mp4");
  assert.ok(selfTest >= 0, "the instrument is used without checking it still works");
  assert.ok(selfTest < measure, "it measures the reels before checking itself");
});

test("the self-test separates a moving camera from an edit", () => {
  // The one that matters. A measure that cannot tell a pan from a cut would
  // call the slow drift down a page "fast cutting" and congratulate the reel
  // that is putting people to sleep.
  assert.match(script, /a continuous pan is not counted as cutting/);
  assert.match(script, /a continuous pan does report motion/);
});

/**
 * A cut is a new shot, not movement. Averaging the cut frames into "motion"
 * makes a slideshow of stills measure as the most kinetic thing on the feed —
 * which is the exact failure mode of the metric this replaced.
 */
test("cuts are excluded from the motion figure", () => {
  assert.match(script, /moving = diff\[~cuts\]/,
    "motion is measured over the cut frames too, so a slideshow reads as kinetic");
});

/**
 * The mean hides one long hold among otherwise lively footage, and the hold is
 * the thing somebody leaves during. `standards` measured 10.4 seconds of one
 * unchanging picture inside a 27.7-second reel, and its still SHARE — 93% —
 * is no worse than any other reel's.
 */
test("it reports the longest hold, not only the average", () => {
  assert.match(script, /longest_still_s/,
    "only the mean is reported, so one long hold is invisible");
});

test("the thresholds are an order of magnitude above the noise floor", () => {
  const num = (name: string) => {
    const m = new RegExp(`^${name} = ([0-9.]+)`, "m").exec(script);
    assert.ok(m, `measure-motion.py no longer defines ${name}`);
    return Number(m![1]);
  };
  // Compression noise on a still frame reaches about 0.002. A still threshold
  // at or under that would report every reel as constantly moving.
  assert.ok(num("STILL_THRESHOLD") >= 0.01, "the still threshold is down in the compression noise");
  // And a cut has to be well clear of a page scrolling at reel speed, or every
  // drift would be counted as an edit and the finding would invert.
  assert.ok(num("CUT_THRESHOLD") > num("STILL_THRESHOLD") * 5,
    "a cut is not clearly separated from movement");
});
