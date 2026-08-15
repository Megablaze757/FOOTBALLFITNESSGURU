import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  currentPain, painConfidence, painAgeNote, painIsFading, daysBetween,
  PAIN_FRESH_DAYS, PAIN_STALE_DAYS,
} from "./pain";

test("a report made today is taken at face value", () => {
  const p = currentPain({ knee_left: 7, ankle_right: 4 }, "2026-08-15", "2026-08-15");
  assert.deepEqual(p, { knee_left: 7, ankle_right: 4 });
});

test("it stays at face value for the whole fresh window", () => {
  for (let d = 0; d <= PAIN_FRESH_DAYS; d++) {
    const today = new Date(Date.UTC(2026, 7, 15) + d * 86_400_000).toISOString().slice(0, 10);
    assert.deepEqual(currentPain({ knee_left: 7 }, "2026-08-15", today), { knee_left: 7 }, `day ${d}`);
  }
});

/**
 * THE BUG. A knee marked in March kept shaping programmes in April, because a
 * stale 7/10 and a current 7/10 were the same value.
 */
test("a report old enough stops counting entirely", () => {
  assert.deepEqual(currentPain({ knee_left: 7 }, "2026-03-01", "2026-08-15"), {},
    "a five-month-old knee is still driving the programme");
  const exactly = new Date(Date.UTC(2026, 7, 15) - PAIN_STALE_DAYS * 86_400_000).toISOString().slice(0, 10);
  assert.deepEqual(currentPain({ knee_left: 7 }, exactly, "2026-08-15"), {}, "the boundary day still counts");
});

test("in between, it fades rather than falling off a cliff", () => {
  const at = (age: number) => {
    const then = new Date(Date.UTC(2026, 7, 15) - age * 86_400_000).toISOString().slice(0, 10);
    return currentPain({ knee_left: 8 }, then, "2026-08-15").knee_left ?? 0;
  };
  const series = [0, 3, 5, 7, 9, 11, 13, 14].map(at);
  // Monotonically non-increasing, starts at full, ends at nothing.
  assert.equal(series[0], 8);
  assert.equal(series[series.length - 1], 0);
  for (let i = 1; i < series.length; i++) {
    assert.ok(series[i] <= series[i - 1], `pain went UP with age: ${series.join(", ")}`);
  }
  // And it is a real taper, not a two-step.
  assert.ok(new Set(series).size >= 4, `barely fades at all: ${series.join(", ")}`);
});

/**
 * The engine treats >= 4 as sore. Rounding matters at exactly the point where
 * an injury stops steering the programme, so it is asserted rather than left to
 * whichever way the arithmetic happens to fall.
 */
test("a 7 stays 'sore' to the engine until roughly halfway through the taper", () => {
  const at = (age: number) => {
    const then = new Date(Date.UTC(2026, 7, 15) - age * 86_400_000).toISOString().slice(0, 10);
    return currentPain({ knee_left: 7 }, then, "2026-08-15").knee_left ?? 0;
  };
  // The engine treats >= 4 as sore, so this is the day a knee stops steering
  // the programme. Whole days only — a half-day fixture rounds unpredictably.
  assert.equal(at(8), 4, "still sore at 8 days");
  assert.equal(at(9), 3, "below the engine's threshold at 9 days");
});

test("no check-in is no information, not no pain", () => {
  assert.deepEqual(currentPain({ knee_left: 7 }, null, "2026-08-15"), {});
  assert.deepEqual(currentPain(null, "2026-08-15", "2026-08-15"), {});
  assert.deepEqual(currentPain(undefined, undefined, "2026-08-15"), {});
});

test("zeroes and rubbish never become an injury", () => {
  assert.deepEqual(currentPain({ knee_left: 0, ankle: -3, hip: NaN }, "2026-08-15", "2026-08-15"), {});
});

test("a future-dated check-in reads as today rather than as negative age", () => {
  // A device clock askew must not produce confidence above 1 or a negative age.
  assert.equal(daysBetween("2026-08-20", "2026-08-15"), 0);
  assert.equal(painConfidence(daysBetween("2026-08-20", "2026-08-15")), 1);
});

test("confidence is 1 while fresh and 0 once stale, never outside that", () => {
  for (let age = 0; age <= 40; age++) {
    const c = painConfidence(age);
    assert.ok(c >= 0 && c <= 1, `confidence ${c} at ${age} days`);
  }
  assert.equal(painConfidence(0), 1);
  assert.equal(painConfidence(PAIN_FRESH_DAYS), 1);
  assert.equal(painConfidence(PAIN_STALE_DAYS), 0);
  assert.equal(painConfidence(99), 0);
});

test("the discount explains itself rather than happening quietly", () => {
  assert.equal(painAgeNote("2026-08-15", "2026-08-15"), null, "no note while it is fresh");
  assert.equal(painIsFading("2026-08-15", "2026-08-15"), false);

  const fading = painAgeNote("2026-08-07", "2026-08-15");
  assert.match(fading ?? "", /8 days ago/);
  assert.match(fading ?? "", /easing off/);
  assert.equal(painIsFading("2026-08-07", "2026-08-15"), true);

  const gone = painAgeNote("2026-06-01", "2026-08-15");
  assert.match(gone ?? "", /no longer shaping/);
  assert.equal(painIsFading("2026-06-01", "2026-08-15"), false, "expired is not 'fading'");
});

/**
 * THE REGRESSION GUARD, and worth being exact about which screens were broken.
 *
 * Most check-in queries ask for TODAY's row (`eq("check_in_date", today)`), and
 * those were never at risk — home, the check-in itself and the plan page all do
 * that. Two screens took the most recent check-in whatever its date:
 *
 *   injury      relevantInjuryProtocols() on an unfiltered map, so the rehab
 *               protocols shown were for whatever you last reported, months ago
 *   train/view  the pain map is fed to the video analysis, which weights its
 *               verdict by where you hurt
 *
 * The plan page is included below as a guard rather than a fix: it reads only
 * today's check-in, so aging it changes nothing today, and it is the single
 * place where widening that query later would silently reintroduce this.
 */
test("every screen that feeds pain to the engine ages it first", () => {
  const files = [
    "../app/(app)/coach/page.tsx",
    "../app/(app)/train/view/page.tsx",
    "../app/(app)/injury/page.tsx",
  ];
  for (const f of files) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.match(src, /currentPain\(/,
      `${f} reads a raw pain_map, so a report from months ago still shapes training there`);
  }
});
