import { test } from "node:test";
import assert from "node:assert/strict";
import { repairPlan, planStructureIssues } from "./program-repair";
import { buildBlock, type ProgramPlan, type EngineInput } from "./engine";

const INPUT: EngineInput = {
  goal: "strength", painMap: {}, daysPerWeek: 4,
  sport: "football", position: "Centre Midfield",
};

/** A plan shaped like the Worker's, with the scaffolding stripped out. */
function strippedPlan(): ProgramPlan {
  const local = buildBlock(INPUT);
  return {
    ...local,
    weeks: local.weeks.map((w) => ({
      ...w,
      sessions: w.sessions.map((s) => ({
        ...s,
        drills: s.drills.filter((d) => d.slot !== "warmup" && d.slot !== "cooldown" && d.slot !== "conditioning"),
      })),
    })),
  };
}

test("the local engine still builds a warm-up, conditioning and a cool-down", () => {
  // The baseline the regression was measured against. If this ever fails, the
  // problem is here rather than in the backend.
  const plan = buildBlock(INPUT);
  for (const w of plan.weeks) {
    for (const s of w.sessions) {
      for (const slot of ["warmup", "conditioning", "cooldown"] as const) {
        assert.ok(
          s.drills.some((d) => d.slot === slot),
          `week ${w.week} day ${s.day} has no ${slot}`
        );
      }
    }
  }
});

test("a well-formed plan is returned untouched", () => {
  const plan = buildBlock(INPUT);
  const { plan: out, report } = repairPlan(plan, INPUT);
  assert.equal(report.repaired.length, 0);
  assert.equal(out, plan, "an intact plan should not be rebuilt");
});

/**
 * THE REPORTED REGRESSION, reproduced.
 *
 * "Before they had warmups stretching running, now they don't." The plans came
 * from the Worker, whose source is not in this repo, and `/coach` accepted
 * whatever it returned.
 */
test("a plan with no warm-up or cool-down gets them back", () => {
  const stripped = strippedPlan();
  assert.ok(planStructureIssues(stripped).length > 0, "fixture should be broken");

  const { plan, report } = repairPlan(stripped, INPUT);
  assert.deepEqual(planStructureIssues(plan), [], "repaired plan should be complete");
  assert.ok(report.repaired.length > 0);

  for (const w of plan.weeks) {
    for (const s of w.sessions) {
      assert.equal(s.drills[0].slot, "warmup", "the warm-up must come first");
      assert.equal(s.drills[s.drills.length - 1].slot, "cooldown", "the cool-down must come last");
    }
  }
});

test("repair keeps every drill the model chose", () => {
  const stripped = strippedPlan();
  const { plan } = repairPlan(stripped, INPUT);
  for (let wi = 0; wi < stripped.weeks.length; wi++) {
    for (let si = 0; si < stripped.weeks[wi].sessions.length; si++) {
      const before = stripped.weeks[wi].sessions[si].drills.map((d) => d.name);
      const after = plan.weeks[wi].sessions[si].drills.map((d) => d.name);
      for (const name of before) {
        assert.ok(after.includes(name), `repair dropped "${name}" — it must only add`);
      }
    }
  }
});

test("an added drill says it was added, so nobody thinks the model chose it", () => {
  const { plan } = repairPlan(strippedPlan(), INPUT);
  const added = plan.weeks[0].sessions[0].drills.find((d) => d.slot === "warmup")!;
  assert.match(added.reason, /added/i);
});

test("the same warm-up is not bolted onto every session", () => {
  const { plan } = repairPlan(strippedPlan(), INPUT);
  const firsts = plan.weeks[0].sessions.map((s) => s.drills[0].name);
  assert.ok(new Set(firsts).size > 1, `every session opened with "${firsts[0]}"`);
});

/**
 * A v1 plan, or a model that ignored the schema entirely, has no slot labels.
 * We cannot tell a warm-up from a main lift, so we must not guess — bolting a
 * second warm-up onto a session that already has one is worse than leaving it.
 */
test("a plan with no slot labels at all is left alone", () => {
  const local = buildBlock(INPUT);
  const slotless: ProgramPlan = {
    ...local,
    weeks: local.weeks.map((w) => ({
      ...w,
      sessions: w.sessions.map((s) => ({
        ...s,
        drills: s.drills.map(({ slot, ...rest }) => rest),
      })),
    })),
  };
  const { plan, report } = repairPlan(slotless, INPUT);
  assert.equal(report.slotless, true);
  assert.equal(report.repaired.length, 0);
  assert.equal(plan, slotless);
});

test("only the missing half is added", () => {
  const local = buildBlock(INPUT);
  // Warm-up present, cool-down stripped.
  const half: ProgramPlan = {
    ...local,
    weeks: local.weeks.map((w) => ({
      ...w,
      sessions: w.sessions.map((s) => ({ ...s, drills: s.drills.filter((d) => d.slot !== "cooldown") })),
    })),
  };
  const { plan, report } = repairPlan(half, INPUT);
  assert.deepEqual(planStructureIssues(plan), []);
  for (const r of report.repaired) assert.deepEqual(r.added, ["cooldown"]);
  // No duplicate warm-ups.
  const warmups = plan.weeks[0].sessions[0].drills.filter((d) => d.slot === "warmup").length;
  assert.equal(warmups, local.weeks[0].sessions[0].drills.filter((d) => d.slot === "warmup").length);
});

/**
 * The "running" half of the report — conditioning is structural too.
 *
 * Every goal in the engine's SLOTS table allocates a conditioning block, so a
 * session arriving without one is missing something, not expressing a
 * preference. This also pins the ordering: conditioning after the lifting,
 * before the stretch.
 */
test("conditioning is restored, and lands before the cool-down", () => {
  const { plan } = repairPlan(strippedPlan(), INPUT);
  for (const w of plan.weeks) {
    for (const s of w.sessions) {
      const cond = s.drills.findIndex((d) => d.slot === "conditioning");
      const cool = s.drills.findIndex((d) => d.slot === "cooldown");
      assert.ok(cond !== -1, `week ${w.week} day ${s.day} has no conditioning`);
      assert.ok(cond < cool, "conditioning must come before the cool-down");
    }
  }
});

test("a session keeping its own conditioning does not get a second one", () => {
  const local = buildBlock(INPUT);
  const noWarmup: ProgramPlan = {
    ...local,
    weeks: local.weeks.map((w) => ({
      ...w,
      sessions: w.sessions.map((s) => ({ ...s, drills: s.drills.filter((d) => d.slot !== "warmup") })),
    })),
  };
  const { plan, report } = repairPlan(noWarmup, INPUT);
  for (const r of report.repaired) assert.deepEqual(r.added, ["warmup"]);
  const before = local.weeks[0].sessions[0].drills.filter((d) => d.slot === "conditioning").length;
  const after = plan.weeks[0].sessions[0].drills.filter((d) => d.slot === "conditioning").length;
  assert.equal(after, before, "conditioning was duplicated");
});
