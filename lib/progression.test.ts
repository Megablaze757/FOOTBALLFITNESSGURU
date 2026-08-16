import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reviewBlock } from "./progression";
import { rpeOf, prescribedEffort } from "./effort";
import { buildProgram } from "./coach";
import type { TrainingLog } from "./types";

/**
 * "Nothing reads your training log."
 *
 * The block counter was the only thing that moved: block two added 8%, block
 * three another 8%, whether the athlete completed twelve sessions out of twelve
 * or four, and whether they finished feeling strong or wrecked. That fails in
 * the direction that costs people — the athlete who missed half the block gets
 * handed MORE work, which is the surest way to make them miss the next one.
 */

const plan = buildProgram({ painMap: {}, goal: "strength", sport: "gym", focus: "aesthetics", daysPerWeek: 4 });
const total = plan.weeks.reduce((n, w) => n + w.sessions.length, 0);
const ids = plan.weeks.flatMap((w) => w.sessions.map((s) => `w${w.week}d${s.day}`));

const logs = (n: number, intensity: number): TrainingLog[] =>
  Array.from({ length: n }, (_, i) => ({
    log_date: `2026-08-${String(i + 1).padStart(2, "0")}`,
    intensity, total_minutes: 60, drills: [],
  })) as unknown as TrainingLog[];

test("finishing the block and rating it as written earns more work", () => {
  const r = reviewBlock(plan, ids, logs(12, 7));
  assert.equal(r.verdict, "push");
  assert.ok(r.volumeScale > 1.05, `scale ${r.volumeScale}`);
  assert.match(r.headline, new RegExp(`${total} of ${total}`));
});

test("a block they did not get through repeats at the same dose", () => {
  // Adding volume on top of a block somebody could not finish is how you make
  // them miss the next one too.
  const r = reviewBlock(plan, ids.slice(0, 4), logs(4, 7));
  assert.equal(r.verdict, "repeat");
  assert.equal(r.volumeScale, 1);
  assert.match(r.headline, /same dose/i);
});

test("rating it harder than written backs the next block off, even at full attendance", () => {
  /**
   * ORDER MATTERS. An athlete can complete every session of a block that is too
   * hard for them — that is what "too hard" looks like from the outside, right
   * up until it stops. Checking attendance first would read a full record as
   * permission to add more, in the one case where adding more is dangerous.
   */
  const r = reviewBlock(plan, ids, logs(12, 9.5));
  assert.equal(r.effort, "too_hard");
  assert.equal(r.verdict, "back_off");
  assert.ok(r.volumeScale < 1, `scale ${r.volumeScale}`);

  /**
   * THE CASE THAT ACTUALLY SEPARATES THE TWO ORDERS. At full attendance both
   * orderings reach back_off, so a test using only that would pass with the
   * checks the wrong way round — which is exactly what happened when this was
   * verified by reintroducing the bug.
   *
   * Missed sessions AND rating them brutal is the athlete who is drowning in
   * the block. Adherence-first reads the misses and repeats the same dose;
   * effort-first reduces it, which is the right answer.
   */
  const struggling = reviewBlock(plan, ids.slice(0, 3), logs(4, 9.5));
  assert.equal(struggling.verdict, "back_off",
    "somebody missing sessions AND rating them 9.5 should get LESS work, not the same again");
  assert.ok(struggling.volumeScale < 1);
});

test("most of it done lands between the two", () => {
  const r = reviewBlock(plan, ids.slice(0, Math.round(total * 0.7)), logs(8, 7));
  assert.equal(r.verdict, "hold");
  assert.ok(r.volumeScale > 1 && r.volumeScale < 1.08);
});

test("strength is reported, not used to decide", () => {
  // It moves for reasons this function cannot see, and a block that added
  // muscle without adding kilos is not a failed block.
  const rising: TrainingLog[] = [
    { log_date: "2026-08-01", intensity: 7, total_minutes: 60, drills: [{ name: "Bench Press", sets: 3, reps: 8, load_kg: 60 }] },
    { log_date: "2026-08-02", intensity: 7, total_minutes: 60, drills: [{ name: "Barbell Row", sets: 3, reps: 8, load_kg: 60 }] },
    { log_date: "2026-08-08", intensity: 7, total_minutes: 60, drills: [{ name: "Bench Press", sets: 3, reps: 8, load_kg: 70 }] },
    { log_date: "2026-08-09", intensity: 7, total_minutes: 60, drills: [{ name: "Barbell Row", sets: 3, reps: 8, load_kg: 70 }] },
  ] as unknown as TrainingLog[];
  const up = reviewBlock(plan, ids, rising);
  assert.equal(up.gotStronger, true);
  assert.match(up.headline, /went up/);

  // Same attendance, no load logged at all: it says nothing rather than
  // guessing.
  assert.equal(reviewBlock(plan, ids, logs(12, 7)).gotStronger, null);
});

test("no logs at all is not a verdict of failure", () => {
  // Somebody who ticked sessions off without logging effort has told us about
  // attendance and nothing else. effortCheck returns "unknown" below three
  // logged sessions and must not be read as "too hard".
  const r = reviewBlock(plan, ids, []);
  assert.equal(r.effort, "unknown");
  assert.equal(r.verdict, "push", "full attendance with no effort data should still count as done");
});

test("an empty or missing block does not crash or invent progress", () => {
  const r = reviewBlock(null, null, null);
  assert.equal(r.adherence, 0);
  assert.equal(r.verdict, "repeat");
  assert.equal(r.volumeScale, 1);
});

test("the coach page uses the review rather than the block counter", () => {
  /**
   * THE SEAM. reviewBlock being correct is worth nothing if the button that
   * builds the next block still multiplies by the counter — which is exactly
   * the shape of the mistake this session already found once, where the volume
   * corrections were computed and then applied to a plan nobody received.
   */
  const src = readFileSync(new URL("../app/(app)/coach/page.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /reviewBlock\(/, "the finished block is never reviewed");
  assert.match(src, /volumeScale: review\.volumeScale/, "the next block still ignores how the last one went");
  assert.ok(!/program\.block \* 8/.test(src), "the block-complete card still quotes a number off the counter");
});

test("reps in reserve is read as effort, so the block is judged by its lifts", () => {
  /**
   * A REGRESSION THIS FILE CAUGHT. The hypertrophy engine prescribes effort as
   * "leave 2 in the tank" rather than "RPE 8" — same scale, plainer words. But
   * rpeOf only understood the jargon, so the moment that shipped every lift
   * became invisible to prescribedEffort and the only drills still carrying an
   * RPE string were the cardio finishers.
   *
   * The block was then judged by its warm-down: an athlete reporting a
   * reasonable 7 against a block written at 7 was told they were training far
   * too hard — and this function was about to start shrinking blocks that were
   * landing exactly right because of it.
   */
  assert.equal(rpeOf("leave 2 in the tank"), 8);
  assert.equal(rpeOf("102.5kg · leave 3 in the tank"), 7);
  assert.equal(rpeOf("to failure"), 10);
  assert.equal(rpeOf("RPE 8"), 8, "the original form still works");
  assert.equal(rpeOf("3 × 12"), null, "a set count is not an effort");

  // And end to end: a hypertrophy block is written at a real effort again.
  assert.ok((prescribedEffort(plan) ?? 0) >= 6, `block reads as RPE ${prescribedEffort(plan)}`);
});
