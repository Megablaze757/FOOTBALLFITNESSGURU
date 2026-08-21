import test from "node:test";
import assert from "node:assert/strict";
import { validatePlan, planIssues, orderPlan } from "./program-validate";
import { kindOf, KIND_RANK, isWorkingSet, inFatigueOrder, sectionFor } from "./session-shape";
import { buildProgram } from "./coach";
import { asGoalType, type ProgramDrill, type ProgramPlan, type Slot } from "./engine";

/**
 * The checklist, tested against the session that prompted it.
 *
 * The report an athlete sent in — pull-ups in the warm-up, a "SECONDARY"
 * section, the overhead press written twice, dips and rope pushdowns in the
 * cool-down — could not have come from lib/engine.ts: measured over 1,728
 * generated sessions it produces zero duplicates and zero working sets in a
 * warm-up. It came from the AI backend, which /coach prefers over both local
 * engines and which had no duplicate, ordering or section check of any kind.
 *
 * So the fixture here is that exact session, and the load-bearing tests are the
 * ones that walk real generated programs from every path.
 */

const drill = (name: string, slot: Slot, sets = 3, reps = 8): ProgramDrill =>
  ({ name, slot, sets, reps, rest: 75, cue: "", reason: "" }) as ProgramDrill;

/** The athlete's broken push session, verbatim. */
function brokenPlan(): ProgramPlan {
  return {
    summary: "",
    constraints: [],
    weeks: [{
      week: 1,
      sessions: [{
        day: 1,
        title: "Push",
        focus: "strength",
        drills: [
          drill("Band pull-aparts", "warmup", 1, 10),
          drill("Pull-Ups", "warmup", 3, 10),
          drill("Barbell Bench Press", "primary"),
          drill("Standing Overhead Press", "primary"),
          drill("Box jumps", "secondary", 2, 4),
          drill("Standing Overhead Press", "secondary", 2, 6),
          drill("Dips", "cooldown", 1, 10),
          drill("Triceps Rope Pushdown", "cooldown", 1, 12),
        ],
      }],
    }],
  } as unknown as ProgramPlan;
}

test("the reported session comes out clean", () => {
  const { plan, report } = validatePlan(brokenPlan());
  assert.deepEqual(planIssues(plan), []);

  const drills = plan.weeks[0].sessions[0].drills;
  const names = drills.map((d) => d.name);

  // No duplicate.
  assert.equal(names.filter((n) => n === "Standing Overhead Press").length, 1);

  // Power first among the working sets — the one rule of session design that is
  // close to universal, and the one the reported session broke worst.
  const firstWorking = drills.find((d) => isWorkingSet(kindOf(d.name, d.slot)))!;
  assert.equal(kindOf(firstWorking.name, firstWorking.slot), "power", `opens on ${firstWorking.name}`);

  // Pull-ups, dips and the pushdown are working sets and are out of the
  // warm-up and cool-down.
  for (const name of ["Pull-Ups", "Dips", "Triceps Rope Pushdown"]) {
    const d = drills.find((x) => x.name === name)!;
    assert.ok(d.slot !== "warmup" && d.slot !== "cooldown", `${name} is still in the ${d.slot}`);
  }

  // Isolation last.
  const working = drills.filter((d) => isWorkingSet(kindOf(d.name, d.slot)));
  assert.equal(working[working.length - 1].name, "Triceps Rope Pushdown");

  // And every correction is announced rather than made silently.
  assert.ok(report.corrections.length >= 3);
  for (const c of report.corrections) assert.match(c.note, /\S/);
});

test("every correction is a sentence an athlete could read", () => {
  // A log line is not an explanation. The whole reason corrections are surfaced
  // is that an engine which silently rearranges a plan is indistinguishable
  // from one that generates a different plan every time.
  const { report } = validatePlan(brokenPlan());
  for (const c of report.corrections) {
    assert.match(c.note, /^[A-Z]/, c.note);
    assert.match(c.note, /[.!]$/, c.note);
    assert.ok(c.note.length < 160, `too long to read on a card: ${c.note}`);
  }
});

test("running it twice changes nothing the second time", () => {
  // The corrections are applied to saved plans on every load, so a pass that
  // is not idempotent would rewrite the athlete's programme each time they
  // opened it — and the swap-for-a-variation rule is exactly the kind of thing
  // that can chase its own tail.
  const once = validatePlan(brokenPlan()).plan;
  const twice = validatePlan(once);
  assert.deepEqual(twice.plan, once);
  assert.deepEqual(twice.report.corrections, []);
});

test("a real generated block from every sport passes the checklist", () => {
  // THE TEST THAT MATTERS. Unit tests on one fixture pass while 41.7% of
  // generated sessions have no warm-up, because nothing walks the output.
  const issues: string[] = [];
  let sessions = 0;
  for (const sport of ["football", "rugby", "basketball", "running", "gym", "weightlifting"]) {
    for (const goal of ["strength", "aesthetics", "power", "speed", "endurance", "fitness"]) {
      for (const daysPerWeek of [3, 4, 5]) {
        const plan = buildProgram({ sport, goal, daysPerWeek } as any);
        sessions += plan.weeks.reduce((n, w) => n + w.sessions.length, 0);
        issues.push(...planIssues(plan));
      }
    }
  }
  assert.ok(sessions > 1500, `only ${sessions} sessions audited`);
  assert.deepEqual(issues.slice(0, 8), [], `${issues.length} issues across ${sessions} sessions`);
});

test("a run day is not given band pull-aparts", () => {
  // Scaffolding is for sessions with working sets. A tempo run's own first ten
  // minutes ARE the warm-up, and bolting mobility onto it is the kind of
  // mechanical helpfulness that makes an app feel like it is not reading.
  const plan: ProgramPlan = {
    summary: "", constraints: [],
    weeks: [{ week: 1, sessions: [{ day: 1, title: "Tempo", focus: "endurance",
      drills: [drill("Tempo / threshold", "conditioning", 1, 30)] }] }],
  } as unknown as ProgramPlan;
  const { plan: out, report } = validatePlan(plan);
  assert.equal(out.weeks[0].sessions[0].drills.length, 1);
  assert.deepEqual(report.corrections, []);
});

test("a curated warm-up drill is never promoted out of the warm-up", () => {
  // A-skips, strides and ladder quick-feet carry a sprint or footwork pattern
  // because that is what they train, and all three are filed as warm-ups on
  // purpose. An earlier version read the pattern first and promoted them, which
  // moved real volume onto the hamstrings and took a football block to 26
  // weekly sets against a ceiling of 22.
  for (const name of ["A-skips", "Strides", "Ladder quick-feet"]) {
    assert.equal(kindOf(name, "warmup"), "prep", name);
    assert.equal(sectionFor(name, "warmup"), "warmup", name);
  }
});

test("the label loses to the movement, not the other way round", () => {
  // The failure this whole file exists for: a plan that says `cooldown` on a
  // set of dips. Trusting the label there is agreeing with the mistake.
  assert.equal(kindOf("Dips", "cooldown"), "compound");
  assert.equal(kindOf("Barbell Back Squat", "warmup"), "compound");
  // But a name nothing recognises has only its label to go on, and that is the
  // one case where the label is the best evidence available.
  assert.equal(kindOf("Bespoke coach mobility flow", "warmup"), "prep");
});

test("ordering never adds, removes or renames anything", () => {
  // `orderPlan` runs after the time-budget pass, so if it could add a set it
  // would be able to push a fitted session back over the athlete's minutes.
  const plan = buildProgram({ sport: "gym", goal: "strength", daysPerWeek: 4 } as any);
  const sorted = orderPlan(plan);
  for (let w = 0; w < plan.weeks.length; w++) {
    for (let s = 0; s < plan.weeks[w].sessions.length; s++) {
      const before = [...plan.weeks[w].sessions[s].drills].map((d) => d.name).sort();
      const after = [...sorted.weeks[w].sessions[s].drills].map((d) => d.name).sort();
      assert.deepEqual(after, before);
    }
  }
  for (const week of sorted.weeks) {
    for (const session of week.sessions) assert.ok(inFatigueOrder(session.drills), session.title);
  }
});

test("a duplicate becomes a variation, not a deletion", () => {
  // Dropping it is the fallback. An athlete who was prescribed two pressing
  // movements should get two pressing movements.
  const plan: ProgramPlan = {
    summary: "", constraints: [],
    weeks: [{ week: 1, sessions: [{ day: 1, title: "Push", focus: "strength", drills: [
      drill("Barbell Bench Press", "primary"),
      drill("Barbell Bench Press", "secondary"),
    ] }] }],
  } as unknown as ProgramPlan;
  const out = validatePlan(plan).plan.weeks[0].sessions[0].drills
    .filter((d) => isWorkingSet(kindOf(d.name, d.slot)));
  assert.equal(out.length, 2, "the second press was deleted rather than replaced");
  assert.notEqual(out[0].name, out[1].name);
});

test("fatigue tiers rank the way a coach would order them", () => {
  const order = ["Box jumps", "Barbell Back Squat", "Goblet squat", "Leg Press", "Leg Extension", "Plank"];
  const ranks = order.map((n) => KIND_RANK[kindOf(n)]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), order.join(" → "));
  assert.equal(new Set(ranks).size, ranks.length, "each tier should be distinct");
});

test("a goal the engine does not know still builds a real session", () => {
  // `programs.goal_type` is a bare text column the app casts rather than
  // checks, and three real strings reach the engine that are not GoalTypes:
  // "aesthetics", "power" and "fitness". `BLUEPRINTS[focus]` came back
  // undefined for all three, every slot count with it, and the session was
  // built EMPTY — 54 of 1,728 generated sessions contained one ball drill and
  // nothing else, under a heading that read "Day 1".
  for (const goal of ["aesthetics", "power", "fitness", "hypertrophy", "not_a_goal"]) {
    for (const daysPerWeek of [3, 4, 5]) {
      const plan = buildProgram({ sport: "football", goal, daysPerWeek } as never);
      for (const week of plan.weeks) {
        for (const session of week.sessions) {
          // Not a working-set floor: a conditioning day is deliberately led by
          // the conditioning and carries only two, which is the right shape for
          // it. What must never happen again is a session that is one drill.
          assert.ok(session.drills.length >= 4,
            `${goal}/${daysPerWeek}d "${session.title}" has ${session.drills.length} drills`);
          assert.ok(session.drills.some((d) => d.slot === "warmup"), `${goal}: no warm-up`);
          assert.ok(session.drills.some((d) => d.slot === "cooldown"), `${goal}: no cool-down`);
          // "Day 1" on its own is what an unreadable goal used to produce.
          assert.ok(session.title.includes("·"), `${goal}: "${session.title}" has no session name`);
        }
      }
    }
  }
});

test("asGoalType maps the vocabulary the app actually stores", () => {
  // Mapped rather than rejected: these mean something. Building muscle is
  // strength work, power is speed work, general fitness is conditioning.
  assert.equal(asGoalType("aesthetics"), "strength");
  assert.equal(asGoalType("hypertrophy"), "strength");
  assert.equal(asGoalType("power"), "speed");
  assert.equal(asGoalType("fitness"), "endurance");
  assert.equal(asGoalType("rehab"), "injury_recovery");
  // A real GoalType passes through untouched.
  assert.equal(asGoalType("endurance"), "endurance");
  // And anything unreadable becomes the least wrong thing to hand somebody.
  assert.equal(asGoalType("???"), "strength");
  assert.equal(asGoalType(null), "strength");
});
