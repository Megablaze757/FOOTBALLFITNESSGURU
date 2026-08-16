import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blockShape } from "./deload";
import { buildProgram } from "./coach";
import { auditWeek } from "./muscle-volume";

/**
 * "The deload is always week 4 — regardless of ACWR, readiness history, or
 * whether you actually need one."
 *
 * That makes it a calendar entry rather than a decision. The athlete who
 * finishes a hard block, takes no break and starts the next one carrying a load
 * spike and a run of amber mornings gets three more weeks of accumulation
 * before anything comes down — and that is exactly the athlete a deload is for.
 * Both numbers are already measured and shown; neither was used here.
 */

test("a fresh athlete gets the standard four-week block, and is told nothing", () => {
  // Advice that appears on every plan is advice people stop reading.
  const s = blockShape({ acwr: 1.0, recentReadiness: ["Green", "Green", "Yellow"] });
  assert.equal(s.weeks, 4);
  assert.equal(s.deloadWeek, 4);
  assert.equal(s.reason, null);
});

test("a load spike shortens the block", () => {
  const s = blockShape({ acwr: 1.8, recentReadiness: ["Green"] });
  assert.equal(s.weeks, 3);
  assert.match(s.reason!, /80% above/);
});

test("so does a run of bad mornings, with the load flat", () => {
  // The two signals are independent: somebody can be sleeping badly and hurting
  // without their training load having moved at all.
  const s = blockShape({ acwr: 1.05, recentReadiness: ["Red", "Red", "Yellow", "Green"] });
  assert.equal(s.weeks, 3);
  assert.match(s.reason!, /red mornings/);
});

test("the reason is framed as a block built for them, not a punishment", () => {
  const s = blockShape({ acwr: 1.9, recentReadiness: ["Red", "Red"] });
  assert.match(s.reason!, /the work is the same/i);
  assert.ok(!/cannot|failed|behind|too weak/i.test(s.reason!), s.reason!);
});

test("a short block drops the PEAK week, never the deload", () => {
  /**
   * The whole point is that the week where the work is absorbed arrives
   * sooner. A three-week block that dropped the deload would be the opposite
   * of what was asked for — more accumulation, no recovery.
   */
  for (const [sport, focus] of [["gym", "aesthetics"], ["football", "performance"]] as const) {
    const plan = buildProgram({ painMap: {}, goal: "strength", sport, focus, daysPerWeek: 4, blockWeeks: 3 });
    assert.equal(plan.weeks.length, 3, `${sport}: block is not three weeks`);
    assert.equal(plan.weeks[plan.weeks.length - 1].intensity, "Deload", `${sport}: last week is not the deload`);
    assert.deepEqual(plan.weeks.map((w) => w.week), [1, 2, 3], `${sport}: weeks are not renumbered`);
    assert.ok(!plan.weeks.some((w) => w.theme === "Peak"), `${sport}: kept the peak week`);
  }
});

test("a short block is still a properly dosed block", () => {
  // Shortening it must not hollow out the weeks that remain.
  const plan = buildProgram({ painMap: {}, goal: "strength", sport: "gym", focus: "aesthetics", daysPerWeek: 4, blockWeeks: 3 });
  for (const w of plan.weeks) {
    const audit = auditWeek(w);
    assert.deepEqual(audit.neglected, [], `week ${w.week}: ${audit.neglected.join(", ")}`);
    assert.deepEqual(audit.excessive, [], `week ${w.week}: ${audit.excessive.join(", ")}`);
  }
});

test("four weeks is still the default when nobody says otherwise", () => {
  const plan = buildProgram({ painMap: {}, goal: "strength", sport: "gym", focus: "aesthetics", daysPerWeek: 4 });
  assert.equal(plan.weeks.length, 4);
  assert.equal(plan.weeks[3].intensity, "Deload");
});

test("the coach page actually asks for the shape", () => {
  // The seam. blockShape being right is worth nothing if the button that builds
  // the next block still hardcodes four weeks.
  const src = readFileSync(new URL("../app/(app)/coach/page.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /blockShape\(/, "the next block's length is never decided");
  assert.match(src, /blockWeeks: shape\.weeks/, "the shape is computed and then not used");
});
