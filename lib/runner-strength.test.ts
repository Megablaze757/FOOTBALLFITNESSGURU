import test from "node:test";
import assert from "node:assert/strict";
import { addRunnerStrength, runnerStrengthDrills, strengthDaysFor } from "./runner-strength";
import { buildProgram } from "./coach";
import { auditWeek } from "./muscle-volume";
import { kindOf, isWorkingSet } from "./session-shape";
import type { ProgramSession } from "./engine";

/**
 * The strength work a runner's plan did not have.
 *
 * Measured before any of this: a runner on five days a week received five runs
 * and ZERO strength sessions. Every session in the block was a single run drill
 * — no warm-up, no lifting, no cool-down — because the run branch of
 * buildProgram returns before finishPlan and skipped the whole checklist.
 */

const runner = (daysPerWeek: number) =>
  buildProgram({ sport: "running", goal: "endurance", daysPerWeek, weeklyKm: 40 } as never);

test("a runner gets strength work, and every session of it is complete", () => {
  // Two days a week wherever the week has room for two. A three-day runner at
  // real mileage sometimes has room for one: five lifts plus a warm-up and a
  // stretch is 32 minutes, and their easy run alone runs to 92-101, which puts
  // the day past the two-hour cap. One full session is the honest answer there,
  // not two that the time-budget pass then deletes.
  //
  // WHAT MUST NEVER HAPPEN is a day whose title says "+ strength" and whose
  // contents do not. An earlier version prescribed onto days with no room and
  // the budget stripped one back to a single deadlift with the RUN deleted —
  // the athlete's Tuesday read "Easy run + strength" and contained neither.
  for (const days of [3, 4, 5]) {
    for (const week of runner(days).weeks) {
      const lifting = week.sessions.filter((s) =>
        s.drills.some((d) => isWorkingSet(kindOf(d.name, d.slot))));
      assert.ok(lifting.length >= 1, `${days}d week ${week.week}: no strength at all`);
      assert.ok(lifting.length <= 2, `${days}d week ${week.week}: ${lifting.length} strength days`);
      for (const session of lifting) {
        const lifts = session.drills.filter((d) => isWorkingSet(kindOf(d.name, d.slot)));
        assert.equal(lifts.length, 5, `${session.title} kept only ${lifts.length} of 5 lifts`);
        assert.ok(session.drills.some((d) => d.slot === "conditioning"),
          `${session.title} lost its run to make room for the lifting`);
      }
    }
  }
  // Four and five days always have room for both.
  for (const days of [4, 5]) {
    for (const week of runner(days).weeks) {
      const lifting = week.sessions.filter((s) =>
        s.drills.some((d) => isWorkingSet(kindOf(d.name, d.slot))));
      assert.equal(lifting.length, 2, `${days}d week ${week.week}`);
    }
  }
});

test("the strength dose is one that actually does something", () => {
  // Three sets once a week is three sets a week, which is under the maintenance
  // floor — the point at which a prescription stops doing anything at all.
  // Prescribing work that cannot work is worse than prescribing none, because
  // the athlete spends the time either way. Three earlier versions failed here:
  // rotating the movements between the two slots, rotating them by week, and
  // rotating them by block.
  //
  // Checked on weeks that carry both sessions. A week with room for one gets
  // half the dose, which is the consequence of a 101-minute easy run rather
  // than a fault to paper over.
  for (const days of [3, 4, 5]) {
    for (const week of runner(days).weeks) {
      const lifting = week.sessions.filter((s) =>
        s.drills.some((d) => isWorkingSet(kindOf(d.name, d.slot))));
      if (lifting.length < 2) continue;
      // `auditWeek`'s own definition of trained: a muscle the plan prescribes a
      // MOVEMENT for, not one that merely assists something. A runner's core
      // gets assistance credit from the deadlift and nothing else, and calling
      // that "trained below maintenance" would flag a decision the plan made
      // rather than a fault it has.
      const audit = auditWeek(week);
      assert.deepEqual(audit.neglected, [],
        `${days}d week ${week.week}: ${audit.neglected.map((g) => `${g} ${audit.volume[g]}`).join(", ")}`);
    }
  }
});

test("the same lifts come back, so they can be loaded", () => {
  // Supporting strength is progressive or it is pointless: you cannot add
  // weight to a lift you do once a fortnight. Variety in a runner's block comes
  // from the running, which already changes every session.
  const week = runner(4).weeks[0];
  const lifts = week.sessions.map((s) =>
    s.drills.filter((d) => isWorkingSet(kindOf(d.name, d.slot))).map((d) => d.name).join("|"))
    .filter((names) => names.length > 0);
  assert.equal(lifts.length, 2);
  assert.equal(lifts[0], lifts[1], "the two strength days should be the same session");
});

test("the long run is the last day to gain a lifting session", () => {
  // The single most important session in a runner's week and the last one to
  // arrive at with tired legs. Excluded by NAME rather than by length, because
  // its length is not what makes it the long run — one earlier version sorted
  // by duration and put the strength work on the long run, since the mileage
  // engine had made that week's easy run the longer of the two.
  // On four and five days there are always two better days, so it never
  // happens. On three days at real mileage it sometimes must: a 40km week over
  // three days makes the "easy" run 109 minutes, which has no room for lifting
  // inside a two-hour cap, and the long run is then the only day left with any.
  // Prescribing it onto a day with no room does not make a longer session — the
  // budget pass drops the lifts and the dose silently collapses.
  for (const days of [4, 5]) {
    for (const week of runner(days).weeks) {
      for (const session of week.sessions) {
        if (!/long run/i.test(session.title)) continue;
        const lifts = session.drills.filter((d) => isWorkingSet(kindOf(d.name, d.slot)));
        assert.equal(lifts.length, 0, `${days}d: the long run gained ${lifts.length} lifts`);
      }
    }
  }
});

test("the hard days are where it goes", () => {
  // Hard day hard, easy day easy. Lifting on an easy day makes it moderate, and
  // a polarised plan whose easy days are moderate is just a plan that is tiring.
  // On a four- or five-day week there are enough quality sessions for both
  // slots to land on one.
  for (const days of [4, 5]) {
    const week = runner(days).weeks[0];
    for (const session of week.sessions) {
      const lifts = session.drills.filter((d) => isWorkingSet(kindOf(d.name, d.slot)));
      if (!lifts.length) continue;
      const zone = Number(/Zone (\d)/.exec(
        session.drills.find((d) => d.slot === "conditioning")?.prescription ?? "")?.[1] ?? 0);
      assert.ok(zone >= 4, `${days}d "${session.title}" is Zone ${zone} and carries lifting`);
    }
  }
});

test("the run comes first, and the lifting after it", () => {
  // A lifter's easy run is a finisher and belongs last. A runner's tempo
  // session is the point of the day and belongs first — the strength work must
  // not be what they are tired from when they try to hold pace. One fixed
  // section order cannot be right for both; see indexFor in program-validate.
  for (const week of runner(5).weeks) {
    for (const session of week.sessions) {
      const run = session.drills.findIndex((d) => d.slot === "conditioning");
      const firstLift = session.drills.findIndex((d) => isWorkingSet(kindOf(d.name, d.slot)));
      if (run < 0 || firstLift < 0) continue;
      assert.ok(run < firstLift, `${session.title}: the lifting comes before the run`);
    }
  }
});

test("a lifting day still gets a warm-up and a cool-down", () => {
  // The run branch skipped finishPlan entirely, so a runner's sessions carried
  // no slots, no scaffolding and no ordering.
  for (const week of runner(4).weeks) {
    for (const session of week.sessions) {
      if (!session.drills.some((d) => isWorkingSet(kindOf(d.name, d.slot)))) continue;
      assert.ok(session.drills.some((d) => d.slot === "warmup"), `${session.title}: no warm-up`);
      assert.ok(session.drills.some((d) => d.slot === "cooldown"), `${session.title}: no cool-down`);
    }
  }
});

test("an easy run stays a run and nothing else", () => {
  // The days that were left alone must be left properly alone: no scaffolding,
  // no lifting, no "warm-up" bolted onto a Zone 2 jog whose own first ten
  // minutes are the warm-up.
  const week = runner(5).weeks[0];
  const easy = week.sessions.filter((s) =>
    !s.drills.some((d) => isWorkingSet(kindOf(d.name, d.slot))));
  assert.ok(easy.length >= 2);
  for (const session of easy) assert.equal(session.drills.length, 1, session.title);
});

test("two runs a week is not enough days to take one over", () => {
  assert.equal(strengthDaysFor(2), 0);
  assert.equal(strengthDaysFor(1), 0);
  assert.equal(strengthDaysFor(3), 2);
  assert.equal(strengthDaysFor(6), 2);
});

test("the block covers the hinge, the single leg, the hamstring and the calf", () => {
  // Not a style list. Rotating a subset was tried three ways and every one
  // dropped something load-bearing: a block with no hip hinge is missing the
  // thing a runner's strength work is mostly for, and a runner's calves take
  // more load per stride than anything else in the body.
  const names = runnerStrengthDrills().map((d) => d.name.toLowerCase()).join(" | ");
  for (const pattern of [/deadlift/, /split squat/, /nordic/, /calf/, /copenhagen/]) {
    assert.match(names, pattern);
  }
  // Every movement carries what the guided session and the check-in need.
  for (const d of runnerStrengthDrills()) {
    assert.ok(d.rest && d.rest > 0, `${d.name} has no rest`);
    assert.ok(d.intensity, `${d.name} has no effort target`);
    assert.ok(d.progression, `${d.name} does not say what to change`);
  }
});

test("addRunnerStrength does nothing to a week with nothing to add to", () => {
  const empty: ProgramSession[] = [];
  assert.deepEqual(addRunnerStrength(empty, () => true), []);
  const two = [1, 2].map((day) => ({ day, title: `Day ${day}`, focus: "endurance", drills: [] })) as ProgramSession[];
  assert.deepEqual(addRunnerStrength(two, () => true), two);
});
