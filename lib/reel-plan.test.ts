import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHUNK_WORDS, HOOK_MS, REEL_H, REEL_RATIO, REEL_SCALE, REEL_W,
  captionChunks, captionsFor, reelPlan, srt, srtTime, type PlannableScript,
} from "./reel-plan";

const script: PlannableScript = {
  id: "demo",
  hook: "Is your bench press any good?",
  beats: [
    { at: 0, ms: 3_000, route: "/a", action: "one", say: "One two three four five six" },
    { at: 3_000, ms: 2_000, route: "/b", action: "two", say: "" },
    { at: 5_000, ms: 4_000, route: "/c", action: "three", say: "Seven eight nine" },
  ],
  totalMs: 9_000,
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE MISTAKE THIS CONSTANT EXISTS TO PREVENT.
 *
 * The first recording was made at 430x932 — the iPhone Pro Max viewport — and
 * called 9:16 because it is phone-shaped. 430/932 is 0.461. Every platform
 * letterboxes anything narrower than 0.5625, so those reels would have shipped
 * with bars down the sides for a reason nobody would have thought to check.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the frame is exactly 9:16, and records at the native size", () => {
  assert.equal(REEL_W / REEL_H, REEL_RATIO, `${REEL_W}x${REEL_H} is ${REEL_W / REEL_H}, not 9:16`);
  assert.equal(REEL_W * REEL_SCALE, 1080, "not 1080 wide, so the platform rescales it");
  assert.equal(REEL_H * REEL_SCALE, 1920, "not 1920 tall, so the platform rescales it");
});

test("words arrive in readable groups", () => {
  assert.deepEqual(captionChunks("one two three four five six"), ["one two three four", "five six"]);
  assert.deepEqual(captionChunks("one two three"), ["one two three"]);
  assert.deepEqual(captionChunks(""), []);
  assert.deepEqual(captionChunks("   "), []);
  for (const chunk of captionChunks("a b c d e f g h i j k l")) {
    assert.ok(chunk.split(" ").length <= CHUNK_WORDS, chunk);
  }
});

/** A lone word on screen for a quarter of a second reads as a glitch. */
test("a single trailing word is never left on its own", () => {
  const chunks = captionChunks("one two three four five");
  assert.deepEqual(chunks, ["one two three four five"]);
  assert.ok(!chunks.some((c) => c.split(" ").length === 1), chunks.join(" | "));
});

test("captions fill their beat exactly, with no gap at the end", () => {
  for (const words of [1, 2, 5, 7, 9, 13, 20]) {
    const say = Array.from({ length: words }, (_, i) => `w${i}`).join(" ");
    const beat = { at: 1_234, ms: 3_333, say };
    const captions = captionsFor(beat);
    assert.equal(captions[0].at, beat.at, `${words} words: starts late`);
    const end = captions[captions.length - 1];
    assert.equal(end.at + end.ms, beat.at + beat.ms, `${words} words: ends early — a blank frame reads as a stall`);
    for (let i = 1; i < captions.length; i++) {
      assert.equal(captions[i].at, captions[i - 1].at + captions[i - 1].ms, `${words} words: gap before ${i}`);
    }
  }
});

test("a silent beat produces no captions rather than an empty one", () => {
  assert.deepEqual(captionsFor({ at: 0, ms: 2_000, say: "" }), []);
});

test("a plan keeps every beat, in order, with absolute timings", () => {
  const plan = reelPlan(script);
  assert.deepEqual(plan.steps.map((s) => s.index), [0, 1, 2]);
  assert.deepEqual(plan.steps.map((s) => s.route), ["/a", "/b", "/c"]);
  assert.equal(plan.totalMs, 9_000);
  assert.equal(plan.steps[2].captions[0].at, 5_000, "captions are timed within the beat, not from the start");
});

/** A hook still up when the second screen arrives hides the cut it earned. */
test("the hook never outlasts the first beat", () => {
  assert.equal(reelPlan(script).hookMs, Math.min(HOOK_MS, 3_000));
  const short = { ...script, beats: [{ ...script.beats[0], ms: 900 }, ...script.beats.slice(1)] };
  assert.equal(reelPlan(short).hookMs, 900);
});

// --- the caption file --------------------------------------------------------

/**
 * A COMMA before the milliseconds. A full stop is WebVTT, and a player handed
 * the wrong one shows no captions and reports nothing — the silent failure
 * this format is famous for.
 */
test("SRT timecodes are the shape SRT wants", () => {
  assert.equal(srtTime(0), "00:00:00,000");
  assert.equal(srtTime(1_234), "00:00:01,234");
  assert.equal(srtTime(61_000), "00:01:01,000");
  assert.equal(srtTime(3_661_007), "01:01:01,007");
  assert.equal(srtTime(-50), "00:00:00,000");
  assert.match(srtTime(1_500), /,/, "a full stop here is WebVTT and shows no captions at all");
});

test("the caption file is numbered from one and separated by blank lines", () => {
  const text = srt(reelPlan(script));
  const blocks = text.trim().split("\n\n");
  assert.equal(blocks.length, captionsFor(script.beats[0]).length + captionsFor(script.beats[2]).length);
  blocks.forEach((block, i) => {
    const [index, times] = block.split("\n");
    assert.equal(index, String(i + 1), "SRT indices must run 1,2,3 or players stop at the gap");
    assert.match(times, /^\d\d:\d\d:\d\d,\d\d\d --> \d\d:\d\d:\d\d,\d\d\d$/, times);
  });
});

test("a reel with nothing to say still produces a valid, empty caption file", () => {
  const silent = { ...script, beats: script.beats.map((b) => ({ ...b, say: "" })) };
  assert.equal(srt(reelPlan(silent)).trim(), "");
});
