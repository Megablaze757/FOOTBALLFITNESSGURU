import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBlock, prescriptionText, restText, painByArea, type ProgramDrill, type ProgramPlan } from "./engine";
import { MOVEMENTS, PROGRAMMED_IDS, MOVEMENT_BY_ID, movementsInSlot, normaliseKit } from "./movements";
import { EXERCISES } from "./exercises";
import { skillsForSport, skillsForAthlete } from "./skills";
import { parseConstraints } from "./constraints";

const allDrills = (p: ProgramPlan): ProgramDrill[] => p.weeks.flatMap((w) => w.sessions.flatMap((s) => s.drills));
const weekSets = (p: ProgramPlan, wi: number) =>
  p.weeks[wi].sessions.flatMap((s) => s.drills).reduce((n, d) => n + d.sets, 0);

// =============================================================================
// The catalogue
// =============================================================================

test("every programmed movement is a real, documented exercise", () => {
  // Catches a typo in the metadata table, which would otherwise silently drop a
  // movement out of every program with no error anywhere.
  const known = new Set(EXERCISES.map((e) => e.id));
  const missing = PROGRAMMED_IDS.filter((id) => !known.has(id));
  assert.deepEqual(missing, [], `metadata for exercises that don't exist: ${missing.join(", ")}`);
});

test("the engine can now see far more than the 42 it used to", () => {
  assert.ok(MOVEMENTS.length > 70, `only ${MOVEMENTS.length} movements reachable`);
});

test("every slot has something in it", () => {
  // An empty slot means a silently missing block of every session.
  for (const slot of ["warmup", "primary", "secondary", "accessory", "conditioning", "cooldown"] as const) {
    assert.ok(movementsInSlot(slot).length > 0, `nothing fills the ${slot} slot`);
  }
});

test("movements carry a real dose, not a placeholder", () => {
  for (const m of MOVEMENTS) {
    assert.ok(m.dose.sets > 0 && m.dose.reps > 0, `${m.id} has an empty dose`);
    assert.ok(m.dose.rest >= 0, `${m.id} has negative rest`);
    assert.ok(m.cue && m.cue.length > 3, `${m.id} has no coaching cue`);
  }
});

test("equipment normalises to something filterable", () => {
  assert.equal(normaliseKit("None"), "none");
  assert.equal(normaliseKit("Barbell"), "barbell");
  assert.equal(normaliseKit("Band"), "band");
  assert.equal(normaliseKit("Cones"), "cones");
  assert.equal(normaliseKit("Rower"), "machine");
});

// =============================================================================
// The defect this engine exists to fix
// =============================================================================

test("a block is twelve different sessions, not three on a loop", () => {
  const plan = buildBlock({ goal: "strength", painMap: {}, sport: "rugby", daysPerWeek: 3 });
  const sessions = plan.weeks.flatMap((w) => w.sessions);
  assert.equal(sessions.length, 12);

  // v1 produced three distinct sets of drills across the whole block, because
  // selection was deterministic and nothing varied per session.
  const byMovements = new Set(sessions.map((s) => s.drills.map((d) => d.name).join("|")));
  assert.ok(byMovements.size >= 8, `only ${byMovements.size} distinct sessions in a 12-session block`);

  const byPrescription = new Set(sessions.map((s) => s.drills.map((d) => `${d.name}:${d.sets}x${d.reps}`).join("|")));
  assert.ok(byPrescription.size >= 10, `only ${byPrescription.size} distinct prescriptions`);
});

test("the same day in consecutive weeks is not the same session", () => {
  const plan = buildBlock({ goal: "speed", painMap: {}, sport: "football", daysPerWeek: 3 });
  const day1 = (wi: number) => plan.weeks[wi].sessions[0].drills.map((d) => d.name).join("|");
  assert.notEqual(day1(0), day1(1), "week 1 day 1 and week 2 day 1 are identical");
});

test("no session prescribes the same movement twice", () => {
  const plan = buildBlock({ goal: "strength", painMap: {}, sport: "gym", daysPerWeek: 4 });
  for (const w of plan.weeks) {
    for (const s of w.sessions) {
      const names = s.drills.map((d) => d.name);
      assert.equal(new Set(names).size, names.length, `week ${w.week} day ${s.day} repeats a movement`);
    }
  }
});

test("it is still pure — the same inputs give back the same block", () => {
  // The app regenerates saved programs from their inputs. If this drifts, an
  // athlete's plan silently changes underneath them.
  const input = { goal: "agility" as const, painMap: { ankle_left: 3 }, sport: "basketball" as const, daysPerWeek: 3 };
  assert.deepEqual(buildBlock(input), buildBlock(input));
});

// =============================================================================
// Session structure
// =============================================================================

test("every session warms up and cools down", () => {
  const plan = buildBlock({ goal: "speed", painMap: {}, sport: "football" });
  for (const w of plan.weeks) {
    for (const s of w.sessions) {
      assert.ok(s.drills.some((d) => d.slot === "warmup"), `week ${w.week} day ${s.day} has no warm-up`);
      assert.ok(s.drills.some((d) => d.slot === "cooldown"), `week ${w.week} day ${s.day} has no cool-down`);
    }
  }
});

test("the hard work comes before the accessory work", () => {
  const plan = buildBlock({ goal: "strength", painMap: {}, sport: "weightlifting" });
  const order = ["warmup", "primary", "secondary", "accessory", "skill", "conditioning", "cooldown"];
  for (const s of plan.weeks[0].sessions) {
    const idx = s.drills.map((d) => order.indexOf(d.slot ?? "accessory"));
    for (let i = 1; i < idx.length; i++) {
      assert.ok(idx[i] >= idx[i - 1], `session ${s.day} is out of order at ${s.drills[i].name}`);
    }
  }
});

test("warm-ups don't periodise, but the training does", () => {
  const plan = buildBlock({ goal: "strength", painMap: {}, sport: "gym" });
  for (const d of allDrills(plan)) {
    if (d.slot === "warmup" || d.slot === "cooldown") {
      assert.equal(d.progression, undefined, `${d.name} is a warm-up with a progression cue`);
    }
  }
  assert.ok(weekSets(plan, 3) < weekSets(plan, 2), "the deload should be lighter than the peak");
});

test("everything is dosed properly, not just sets and reps", () => {
  const plan = buildBlock({ goal: "strength", painMap: {}, sport: "weightlifting" });
  for (const d of allDrills(plan)) {
    if (d.skill) continue; // ball work prescribes itself in its own terms
    assert.ok(d.prescription, `${d.name} has no prescription text`);
    assert.ok(typeof d.rest === "number", `${d.name} never says how long to rest`);
  }
  // Rest is most of the prescription for heavy work — a heavy squat on 45
  // seconds is a different exercise.
  const primaries = allDrills(plan).filter((d) => d.slot === "primary");
  assert.ok(primaries.length > 0);
  assert.ok(primaries.every((d) => (d.rest ?? 0) >= 120), "main lifts should get real rest");
  assert.ok(primaries.some((d) => d.intensity?.startsWith("RPE")), "main lifts should carry a target effort");
});

test("effort climbs to the peak and drops on the deload", () => {
  const plan = buildBlock({ goal: "strength", painMap: {}, sport: "weightlifting" });
  const rpe = (wi: number) => {
    const vals = plan.weeks[wi].sessions.flatMap((s) => s.drills)
      .map((d) => Number(d.intensity?.replace("RPE ", "")))
      .filter((n) => Number.isFinite(n));
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  assert.ok(rpe(2) > rpe(0), "peak week should be harder than week 1");
  assert.ok(rpe(3) < rpe(2), "deload should be easier than the peak");
});

test("prescriptions read the way a coach writes them", () => {
  assert.equal(prescriptionText({ sets: 4, reps: 5, rest: 150, unit: "reps" }), "4 × 5");
  assert.equal(prescriptionText({ sets: 3, reps: 30, rest: 45, unit: "secs" }), "3 × 30s");
  assert.equal(prescriptionText({ sets: 5, reps: 20, rest: 180, unit: "metres" }), "5 × 20m");
  assert.equal(prescriptionText({ sets: 3, reps: 8, rest: 60, unit: "each side" }), "3 × 8 each side");
  assert.equal(prescriptionText({ sets: 1, reps: 20, rest: 0, unit: "minutes" }), "20 min");
  assert.equal(restText(180), "3 min");
  assert.equal(restText(90), "90s");
});

// =============================================================================
// Safety and honouring what the athlete said
// =============================================================================

test("severe pain removes the movements that load it — everywhere in the block", () => {
  const plan = buildBlock({ goal: "strength", painMap: { knee_left: 9 }, sport: "football" });
  for (const d of allDrills(plan)) {
    const m = MOVEMENTS.find((x) => x.name === d.name);
    if (!m) continue; // ball work isn't in the movement catalogue
    assert.ok((m.load.knee ?? 0) < 2, `${d.name} loads a knee at 9/10 pain`);
  }
});

test("an exclusion the athlete typed is honoured, not merely discounted", () => {
  const plan = buildBlock({
    goal: "strength", painMap: {}, sport: "gym",
    constraints: parseConstraints("I don't train legs"),
  });
  for (const d of allDrills(plan)) {
    const m = MOVEMENTS.find((x) => x.name === d.name);
    assert.notEqual(m?.region, "legs", `${d.name} is leg work after "I don't train legs"`);
  }
});

test("a runner is never given a scrum drive", () => {
  const plan = buildBlock({ goal: "endurance", painMap: {}, sport: "running" });
  const names = allDrills(plan).map((d) => d.name);
  assert.ok(!names.some((n) => /scrum|tackle/i.test(n)), `runner got: ${names.filter((n) => /scrum|tackle/i.test(n))}`);
});

test("a rehab block doesn't send an injured athlete out to do 1v1s", () => {
  const plan = buildBlock({ goal: "injury_recovery", painMap: { hamstring_left: 6 }, sport: "football" });
  assert.ok(!allDrills(plan).some((d) => d.skill), "rehab sessions should not prescribe ball work");
});

test("pain is read per area, worst side wins", () => {
  const p = painByArea({ knee_left: 7, knee_right: 3, ankle: 2 });
  assert.equal(p.knee, 7);
  assert.equal(p.ankle, 2);
});

// =============================================================================
// Skill coverage — the gap that left whole sports and one position unserved
// =============================================================================

test("goalkeepers get goalkeeping, not crossing practice", () => {
  const gk = skillsForSport("football", "Goalkeeper");
  assert.ok(gk.length > 0);
  // Position-specific drills lead the list, so a keeper's program opens with
  // keeping. Previously there wasn't a single one.
  assert.ok(gk[0].positions.includes("Goalkeeper"), `a keeper's first drill is "${gk[0].name}"`);
  assert.ok(gk.filter((dr) => dr.positions.includes("Goalkeeper")).length >= 5);
});

test("an outfield player is never sent to do goalkeeper saves", () => {
  // The flip side of adding GK drills: the programmer draws from the athlete's
  // own pool, not the whole sport, or every winger starts practising diving.
  const plan = buildBlock({ goal: "speed", painMap: {}, sport: "football", position: "Winger", daysPerWeek: 3 });
  const gkNames = new Set(skillsForSport("football", "Goalkeeper")
    .filter((dr) => dr.positions.includes("Goalkeeper")).map((dr) => dr.name));
  const got = allDrills(plan).filter((d) => d.skill).map((d) => d.name);
  assert.ok(!got.some((n) => gkNames.has(n)), `winger was given: ${got.filter((n) => gkNames.has(n)).join(", ")}`);
});

test("a keeper's programmed ball work is actually keeping", () => {
  const plan = buildBlock({ goal: "agility", painMap: {}, sport: "football", position: "Goalkeeper", daysPerWeek: 3 });
  const skill = allDrills(plan).filter((d) => d.skill);
  assert.ok(skill.length > 0, "a keeper got no technical work at all");
  const keeperPool = new Set(skillsForAthlete("football", "Goalkeeper").map((dr) => dr.name));
  for (const d of skill) assert.ok(keeperPool.has(d.name), `${d.name} isn't goalkeeping work`);
});

test("the barbell sports have technical work at last", () => {
  for (const sport of ["weightlifting", "gym"] as const) {
    const drills = skillsForSport(sport, null);
    assert.ok(drills.length >= 5, `${sport} has only ${drills.length} skill drills`);
    // They have to be doable alone, or the program can never prescribe them.
    assert.ok(drills.some((dr) => dr.needs === "solo"), `${sport} has no solo skill work`);
  }
});

test("running has more than one thing to practise", () => {
  const groups = new Set(skillsForSport("running", null).map((dr) => dr.skill));
  assert.ok(groups.size >= 3, `running only covers: ${[...groups].join(", ")}`);
});

test("a lifter's program actually contains the lifting technique work", () => {
  const plan = buildBlock({ goal: "strength", painMap: {}, sport: "weightlifting", daysPerWeek: 3 });
  assert.ok(allDrills(plan).some((d) => d.skill), "no technical work in a weightlifting block");
});

test("every movement id in the catalogue is unique", () => {
  const ids = MOVEMENTS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(Object.keys(MOVEMENT_BY_ID).length, ids.length);
});
