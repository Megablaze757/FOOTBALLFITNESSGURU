import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildProgram } from "./coach";
import { drillSeconds, prescribedDurationMinutes, sessionMinutes, sessionLength } from "./session-time";
import {
  ACTIVE_REST_MAX_MINUTES,
  sessionBudgetMinutes,
} from "./session-budget";
import type { GoalType, ProgramDrill, TrainingFocus } from "./engine";
import type { SportId } from "./exercises";

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

test("a coaching note that mentions minutes is not priced as a timed exercise", () => {
  const note = d({
    sets: 1,
    reps: 1,
    prescription: "Every long run over 90 minutes",
    slot: "skill",
  });
  assert.ok(drillSeconds(note) < 2 * 60, "a fuelling reminder became a 90-minute exercise");
});

test("runner estimates use the whole session, not one interval or an invented pace", () => {
  const plan = buildProgram({ painMap: {}, goal: "endurance", sport: "running", daysPerWeek: 5, weeklyKm: 50 });
  const sessions = plan.weeks[0].sessions;
  const interval = sessions.find((s) => /interval/i.test(s.title));
  const distance = sessions.find((s) => /easy run/i.test(s.title));
  // The run itself. A hard day now opens with a warm-up and carries supporting
  // strength afterwards, so drills[0] is a glute bridge with no duration at all.
  const runIn = (s: typeof interval) => s?.drills.find((d) => d.slot === "conditioning");
  assert.ok(interval && prescribedDurationMinutes(runIn(interval)!)! >= 40, "an interval session was priced as one repeat");
  assert.ok(distance && prescribedDurationMinutes(runIn(distance)!)! >= 40, "a distance run has no usable time estimate");
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
  const sports: SportId[] = ["football", "rugby", "basketball", "running", "weightlifting", "gym"];
  const goals: GoalType[] = ["speed", "agility", "strength", "endurance", "injury_recovery", "skill"];
  const focuses: TrainingFocus[] = ["performance", "fitness", "aesthetics", "rehab"];
  const long: string[] = [];

  // Every public combination, including the maximum ten-exercise preference.
  // The previous audit sampled three sports, one goal and 3–5 days, then let
  // 115 minutes pass under a comment that promised ninety. That is how the
  // 150-minute variants survived it.
  for (const sport of sports) for (const goal of goals) for (const focus of focuses) {
    for (let daysPerWeek = 2; daysPerWeek <= 7; daysPerWeek += 1) {
      for (const customised of [false, true]) {
        const plan = buildProgram({
          painMap: {}, goal, sport, focus, daysPerWeek,
          ...(customised ? { settings: { goals: [{ type: goal, priority: 1 }], exerciseTarget: 10 } } : {}),
        });
        for (const w of plan.weeks) for (const s of w.sessions) {
          const mins = s.kind === "active_rest" ? (s.durationMinutes ?? 30) : sessionMinutes(s);
          const cap = s.kind === "active_rest" ? ACTIVE_REST_MAX_MINUTES : sessionBudgetMinutes(s, plan.goal);
          if (mins > cap) long.push(`${sport}/${goal}/${focus}/${daysPerWeek}d/w${w.week}/${s.title}: ${mins} > ${cap} min`);
        }
      }
    }
  }
  assert.deepEqual(long.slice(0, 6), [], `${long.length} generated sessions run past their real cap`);
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
