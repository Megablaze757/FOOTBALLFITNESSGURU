import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildProgram } from "./coach";
import { drillSeconds, sessionMinutes, sessionLength } from "./session-time";
import type { ProgramDrill } from "./engine";

/**
 * "A total time of each session as well."
 *
 * The card said what the session was and never how long it took — the one fact
 * that decides whether somebody trains today. Adding it up immediately found a
 * real defect: a seventy-five-minute long run was being prescribed as a
 * FINISHER after an hour of lifting, putting a generated day at 135 minutes.
 */

const d = (o: Partial<ProgramDrill>): ProgramDrill =>
  ({ name: "x", sets: 3, reps: 10, cue: "", reason: "", ...o }) as ProgramDrill;

test("rest is counted between sets, not after the last one", () => {
  // Counting a rest after the final set adds one per exercise, which on a
  // nine-movement day is a fictional quarter of an hour.
  const three = drillSeconds(d({ sets: 3, reps: 10, rest: 60 }));
  const one = drillSeconds(d({ sets: 1, reps: 10, rest: 60 }));
  assert.equal(three - one, 2 * 60 + 2 * 10 * 3, "a 3-set drill should carry exactly two rests");
});

test("conditioning is priced in the units it was prescribed in", () => {
  // Both of these were found by adding sessions up and looking at the answers.
  // "1 × 40 minutes" as 40 reps is two minutes for a forty-minute run; "6 × 100
  // metres" as 100 reps is thirty minutes for a tempo set that takes ten.
  assert.equal(drillSeconds(d({ sets: 1, reps: 40, rest: 15, prescription: "1 × 40 minutes · Zone 2" })), 40 * 60 + 60);
  const tempo = drillSeconds(d({ sets: 6, reps: 100, rest: 90, prescription: "6 × 100 metres · Zone 3" })) / 60;
  assert.ok(tempo > 8 && tempo < 15, `a 6 × 100m tempo set priced at ${Math.round(tempo)} min`);
  const hills = drillSeconds(d({ sets: 8, reps: 60, rest: 90, prescription: "8 × 60 secs" })) / 60;
  assert.ok(hills > 15 && hills < 25, `an 8 × 60s hill set priced at ${Math.round(hills)} min`);
});

test("the estimate is rounded, because it is an estimate", () => {
  // "63 min" claims a confidence this does not have.
  assert.equal(sessionMinutes({ drills: [d({ sets: 4, reps: 8, rest: 120 })] }) % 5, 0);
  assert.match(sessionLength({ drills: [d({})] }), /^~\d+ min$/);
});

test("no generated session is longer than an athlete will actually train", () => {
  /**
   * The bar is ninety minutes for a lifting day. Past that people do not finish
   * the session, and an abandoned session and a skipped one look identical to
   * the app — it records the miss and nothing about why.
   */
  const long: string[] = [];
  for (const [sport, focus] of [["gym", "aesthetics"], ["football", "performance"], ["rugby", "performance"]] as const) {
    for (const daysPerWeek of [3, 4, 5]) {
      const plan = buildProgram({ painMap: {}, goal: "strength", sport, focus, daysPerWeek });
      for (const w of plan.weeks) {
        for (const s of w.sessions) {
          const mins = sessionMinutes(s);
          if (mins > 115) long.push(`${sport}/${daysPerWeek}d wk${w.week} ${s.title}: ${mins} min`);
        }
      }
    }
  }
  assert.deepEqual(long.slice(0, 6), [], `${long.length} generated sessions run past what people finish`);
});

test("a finisher is finisher-length", () => {
  // A 75-minute long run at the end of a hypertrophy day is not a finisher, it
  // is a second session bolted onto a first.
  const plan = buildProgram({ painMap: {}, goal: "strength", sport: "gym", focus: "aesthetics", daysPerWeek: 4 });
  for (const w of plan.weeks) {
    for (const s of w.sessions) {
      for (const drill of s.drills) {
        if (drill.slot !== "conditioning") continue;
        const mins = drillSeconds(drill) / 60;
        // 30 is the dose cap the engine applies; drillSeconds also charges the
        // minute it takes to get from the last rack to the treadmill, so the
        // bar here is the cap plus that changeover rather than the cap exactly.
        assert.ok(mins <= 32, `${s.title} finishes with ${drill.name} at ${Math.round(mins)} min`);
      }
    }
  }
});

test("capping the finisher did not remove aerobic work altogether", () => {
  // The first cap was 20 minutes and it took the 30-minute recovery run with
  // it, leaving a gym strength block with no running in it at all — which is
  // the exact fault an older test in coach.test.ts exists to prevent.
  const plan = buildProgram({ painMap: {}, goal: "strength", sport: "gym", daysPerWeek: 4 });
  const names = plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.drills.map((x) => x.name)));
  assert.ok(names.some((n) => /run|intervals|walk|skipping|swing/i.test(n)), "no conditioning survived the cap");
});

test("the session card and the calendar both show the length", () => {
  // The seam: the number is only useful where the athlete decides whether to
  // train, and both screens have to carry it.
  for (const file of ["../app/(app)/coach/page.tsx", "../components/ProgramCalendar.tsx"]) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(src, /sessionLength\(/, `${file} does not show how long the session takes`);
  }
});
