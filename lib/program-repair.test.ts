import { test } from "node:test";
import assert from "node:assert/strict";
import { repairPlan, planStructureIssues } from "./program-repair";
import { buildProgram } from "./coach";
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

/** A one-week, one-session plan built from bare drill names. */
function oneSession(names: string[]): ProgramPlan {
  return {
    goal: "strength", summary: "s", constraints: [],
    weeks: [{
      week: 1, theme: "Build", intensity: "moderate",
      sessions: [{
        day: 1, focus: "Lower",
        drills: names.map((name) => ({ name, sets: 3, reps: 8, cue: "c", reason: "r" })),
      }],
    }],
  } as unknown as ProgramPlan;
}

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
 * A PLAN WITH NO SLOT LABELS AT ALL — the case the repair used to give up on.
 *
 * The first version bailed here on the reasoning that we cannot tell a warm-up
 * from a main lift, so guessing risks bolting a second warm-up onto a session
 * that already has one. Sound, and it left the actual reported bug unfixed: a
 * backend returning bare unlabelled drills got no scaffolding restored at all,
 * which is precisely what was being complained about. The repair only worked on
 * plans that were already mostly right.
 *
 * It is not a guess when you can look it up. Every drill worth naming is in
 * MOVEMENTS and every movement there declares its slot, so the structure gets
 * RECOVERED rather than invented — and the double-warm-up worry disappears with
 * it, because an existing warm-up is now recognised as one.
 */
test("slots are recovered by name when the backend sends none", () => {
  const local = buildBlock(INPUT);
  const slotless: ProgramPlan = {
    ...local,
    weeks: local.weeks.map((w) => ({
      ...w,
      sessions: w.sessions.map((s) => ({
        ...s,
        // eslint-disable-next-line no-unused-vars
        drills: s.drills.map(({ slot, ...rest }) => rest),
      })),
    })),
  };

  const { plan, report } = repairPlan(slotless, INPUT);
  assert.equal(report.slotless, true, "the input genuinely had no labels");
  assert.ok(report.inferred > 0, "slots should be recovered from the movement library");

  // Every session ends up structurally complete.
  for (const week of plan.weeks) {
    for (const s of week.sessions) {
      for (const slot of ["warmup", "conditioning", "cooldown"]) {
        assert.ok(s.drills.some((d) => d.slot === slot), `week ${week.week} day ${s.day} has no ${slot}`);
      }
    }
  }
});

/**
 * The specific harm the old bail-out existed to prevent. These drills all came
 * from the local engine, so every one is in the library and every warm-up is
 * recognised — nothing should be added on top.
 */
test("recovering slots does not bolt a second warm-up onto a complete session", () => {
  const local = buildBlock(INPUT);
  const slotless: ProgramPlan = {
    ...local,
    weeks: local.weeks.map((w) => ({
      ...w,
      sessions: w.sessions.map((s) => ({
        ...s,
        // eslint-disable-next-line no-unused-vars
        drills: s.drills.map(({ slot, ...rest }) => rest),
      })),
    })),
  };
  const { plan, report } = repairPlan(slotless, INPUT);

  assert.deepEqual(report.repaired, [], "a complete session needed nothing added");
  for (let w = 0; w < plan.weeks.length; w++) {
    for (let i = 0; i < plan.weeks[w].sessions.length; i++) {
      assert.equal(
        plan.weeks[w].sessions[i].drills.length,
        local.weeks[w].sessions[i].drills.length,
        "drill count must not change when only labels were missing"
      );
    }
  }
});

/**
 * A movement the model invented isn't in the library, so its slot stays unknown
 * — and the session is then treated as missing that block and given a real one.
 * Silence is not evidence that a warm-up happened.
 */
test("an unrecognised drill name does not count as a warm-up", () => {
  const local = buildBlock(INPUT);
  const invented: ProgramPlan = {
    ...local,
    weeks: local.weeks.map((w) => ({
      ...w,
      sessions: w.sessions.map((s) => ({
        ...s,
        drills: [{
          name: "Quantum Fascia Activation", sets: 3, reps: 10,
          cue: "invented", reason: "invented",
        }],
      })),
    })),
  };
  const { plan, report } = repairPlan(invented, INPUT);
  assert.ok(report.repaired.length > 0, "an unknown drill must not satisfy the warm-up requirement");
  for (const week of plan.weeks) {
    for (const s of week.sessions) {
      assert.ok(s.drills.some((d) => d.slot === "warmup"), `day ${s.day} still has no warm-up`);
      assert.ok(s.drills.some((d) => d.slot === "cooldown"), `day ${s.day} still has no cool-down`);
    }
  }
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

/**
 * The near-miss, which is where name matching earns its keep or causes harm.
 *
 * A model writes "Ankle rocks"; the library says "Half-kneeling ankle rocks".
 * Exact matching misses it, and the session then gets a redundant second
 * warm-up. Whole-phrase containment catches it.
 */
test("a warm-up named slightly differently is still recognised", () => {
  const { plan, report } = repairPlan(oneSession([
    "Ankle rocks", "Back squat", "Couch stretch", "Easy run",
  ]), INPUT);
  assert.equal(report.repaired.length, 0, "nothing should have been added");
  const drills = plan.weeks[0].sessions[0].drills;
  assert.equal(drills.find((d) => d.name === "Ankle rocks")?.slot, "warmup");
  assert.equal(drills.find((d) => d.name === "Easy run")?.slot, "conditioning");
});

/**
 * And the harm it must not cause. "Squat" on its own appears inside movements
 * in several different slots, so it identifies none of them — matching it would
 * label a main lift as a warm-up and skip adding a real one.
 */
test("a generic one-word name is not matched to a slot", () => {
  const { plan, report } = repairPlan(oneSession(["Squat", "Bench press"]), INPUT);
  assert.deepEqual(report.repaired[0]?.added, ["warmup", "conditioning", "cooldown"]);
  assert.equal(
    plan.weeks[0].sessions[0].drills.find((d) => d.name === "Squat")?.slot,
    undefined,
    "an ambiguous name must stay unslotted rather than pass as a warm-up"
  );
});

/** A whole block of bare lifts — the shape the diverged backend actually sends. */
test("a bare list of lifts gets a warm-up, conditioning and a stretch", () => {
  const { plan, report } = repairPlan(
    oneSession(["Back squat", "Romanian deadlift", "Walking lunge"]), INPUT);
  assert.deepEqual(report.repaired[0]?.added, ["warmup", "conditioning", "cooldown"]);
  const drills = plan.weeks[0].sessions[0].drills;
  assert.equal(drills[0].slot, "warmup", "the session must open with the warm-up");
  assert.equal(drills[drills.length - 1].slot, "cooldown", "and close with the stretch");
  // The model's own work is untouched in the middle.
  for (const name of ["Back squat", "Romanian deadlift", "Walking lunge"]) {
    assert.ok(drills.some((d) => d.name === name), `${name} was dropped`);
  }
});

/**
 * A SHORT WEEK IS MISSING TRAINING, not missing scaffolding.
 *
 * The client asks for `days_per_week` and nothing checked that the answer
 * honoured it. Someone who sets 5 days has said what they can commit to; three
 * well-formed sessions look exactly as valid as five to a caller whose only
 * check is that a `plan` key exists.
 */
test("a week short of the requested days is topped up from the engine", () => {
  const wants5 = { ...INPUT, daysPerWeek: 5 };
  const short: ProgramPlan = {
    goal: "strength", summary: "s", constraints: [],
    weeks: [1, 2].map((week) => ({
      week, theme: "Build", intensity: "moderate", focusNote: "",
      sessions: [1, 2, 3].map((day) => ({
        day, title: `Day ${day}`, focus: "strength",
        drills: [{ name: "Back squat", sets: 4, reps: 5, cue: "c", reason: "r" }],
      })),
    })),
  } as unknown as ProgramPlan;

  const { plan, report } = repairPlan(short, wants5);
  for (const week of plan.weeks) {
    assert.equal(week.sessions.length, 5, `week ${week.week} still has ${week.sessions.length} days`);
    // Renumbered to continue the week — two "day 1"s would break the check-in's
    // day lookup.
    assert.deepEqual(week.sessions.map((s) => s.day), [1, 2, 3, 4, 5]);
  }
  assert.equal(report.toppedUp.length, 2, "both weeks were short");

  // And the added days are real sessions, scaffolding included.
  for (const week of plan.weeks) {
    for (const s of week.sessions) {
      assert.ok(s.drills.some((d) => d.slot === "warmup"), `day ${s.day} has no warm-up`);
      assert.ok(s.drills.length > 1, `day ${s.day} is empty`);
    }
  }
});

test("a full week is left at the length the model chose", () => {
  const { report } = repairPlan(buildBlock(INPUT), INPUT);
  assert.deepEqual(report.toppedUp, []);
});

/**
 * More days than asked for may be deliberate — a deload week structured
 * differently — and deleting training somebody has been given is a worse
 * mistake than leaving an extra day they can skip.
 */
test("extra sessions are never removed", () => {
  const wants2 = { ...INPUT, daysPerWeek: 2 };
  const generous = buildBlock({ ...INPUT, daysPerWeek: 4 });
  const { plan, report } = repairPlan(generous, wants2);
  assert.equal(plan.weeks[0].sessions.length, 4);
  assert.deepEqual(report.toppedUp, []);
});

// --- values the database does not constrain ----------------------------------

/**
 * `programs.goal_type` and `profiles.training_focus` are both bare text columns
 * whose permitted values exist only in a SQL comment, and the app casts rather
 * than checks on the way in. Both were rendering the literal word "undefined"
 * into the athlete's program: a session titled "Day 1 · undefined", and a
 * summary reading "Weighted toward undefined." — the sentence that says what
 * the block is for.
 *
 * Migration 0070 stops bad values getting in. This is the other half: whatever
 * is already stored, the program must still read like a program.
 */
test("an unrecognised goal or focus never reaches the athlete as 'undefined'", () => {
  const base = {
    goal: "strength", painMap: {}, isInSeason: false, sport: "football",
    position: ["Centre back"], focus: "performance", daysPerWeek: 4, notes: "",
  };
  const rogues: [string, unknown][] = [
    ["goal", "power"], ["goal", ""], ["goal", "HYPERTROPHY"],
    ["focus", "both"], ["focus", null], ["focus", "strength"],
    ["sport", "netball"],
  ];
  for (const [field, value] of rogues) {
    const plan = buildProgram({ ...base, [field]: value } as never);
    assert.ok(
      !JSON.stringify(plan).includes("undefined"),
      `${field}=${JSON.stringify(value)} put the word "undefined" in the plan`
    );
    // And it is still a usable program, not just a quiet one.
    assert.equal(plan.weeks.length, 4, `${field}=${JSON.stringify(value)}: not 4 weeks`);
    for (const w of plan.weeks) {
      assert.equal(w.sessions.length, 4, `${field}=${JSON.stringify(value)}: wrong session count`);
      for (const s of w.sessions) assert.ok(s.drills.length > 0, "empty session");
    }
  }
});
