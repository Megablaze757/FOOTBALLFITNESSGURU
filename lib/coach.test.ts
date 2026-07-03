import { test } from "node:test";
import assert from "node:assert/strict";
import { recommendDrills, buildProgram, analyzeProgress, painByArea } from "./coach";
import type { TrainingLog } from "./types";

test("painByArea takes the worst per area, ignoring side", () => {
  const p = painByArea({ knee_left: 7, knee_right: 3, ankle: 2 });
  assert.equal(p.knee, 7);
  assert.equal(p.ankle, 2);
});

test("knee pain + agility goal: recommends agility drills that spare the knee, avoids high-impact", () => {
  const recs = recommendDrills({ goal: "agility", painMap: { knee_left: 8 } });
  assert.ok(recs.length > 0);
  // No high knee-load drill (depth drop / box jumps) should appear with severe knee pain.
  assert.ok(!recs.some((r) => r.name.includes("Depth drop") || r.name.includes("Box jumps")));
  // The top picks should be flagged as protecting the sore knee, with an explaining reason.
  assert.ok(recs.some((r) => r.flagged));
  assert.match(recs[0].reason, /knee/i);
});

test("with no pain, on-goal drills lead and nothing is flagged", () => {
  const recs = recommendDrills({ goal: "speed", painMap: {} });
  assert.ok(recs.length >= 3);
  assert.ok(recs.every((r) => !r.flagged));
});

test("buildProgram returns a 4-week block with sessions and notes the constraint", () => {
  const plan = buildProgram({ goal: "agility", painMap: { knee_left: 8 }, isInSeason: true });
  assert.equal(plan.weeks.length, 4);
  assert.ok(plan.weeks[0].sessions.length >= 2);
  assert.ok(plan.weeks[0].sessions[0].drills.length > 0);
  assert.ok(plan.constraints.some((c) => /knee/i.test(c)));
  // In-season deload week has lighter volume than build weeks.
  const setsW3 = plan.weeks[2].sessions[0].drills[0].sets;
  const setsW4 = plan.weeks[3].sessions[0].drills[0].sets;
  assert.ok(setsW4 <= setsW3);
});

test("a later block progresses volume above block 1", () => {
  const b1 = buildProgram({ goal: "strength", painMap: {}, block: 1 });
  const b3 = buildProgram({ goal: "strength", painMap: {}, block: 3 });
  const sets1 = b1.weeks[2].sessions[0].drills[0].sets;
  const sets3 = b3.weeks[2].sessions[0].drills[0].sets;
  assert.ok(sets3 > sets1, `block3 ${sets3} should exceed block1 ${sets1}`);
  assert.equal(b3.block, 3);
  assert.match(b3.summary, /Block 3/);
});

test("analyzeProgress surfaces load progression and the knee-flare pattern", () => {
  const logs: TrainingLog[] = [
    { id: "1", user_id: "u", log_date: "2026-06-01", drills: [{ name: "Single-leg RDL", sets: 3, reps: 8, load_kg: 40 }, { name: "Box jumps", sets: 3, reps: 5 }], total_minutes: 60, intensity: 7, created_at: "" },
    { id: "2", user_id: "u", log_date: "2026-06-03", drills: [{ name: "Single-leg RDL", sets: 3, reps: 8, load_kg: 55 }, { name: "Depth drop to sprint", sets: 3, reps: 5 }], total_minutes: 60, intensity: 8, created_at: "" },
    { id: "3", user_id: "u", log_date: "2026-06-05", drills: [{ name: "Ladder quick-feet", sets: 3, reps: 10 }], total_minutes: 40, intensity: 5, created_at: "" },
  ];
  const checkIns = [
    { check_in_date: "2026-06-01", pain_map: { knee_left: 1 } },
    { check_in_date: "2026-06-02", pain_map: { knee_left: 6 } }, // flares after the box-jump day
    { check_in_date: "2026-06-04", pain_map: { knee_left: 7 } }, // flares after the depth-drop day
    { check_in_date: "2026-06-06", pain_map: { knee_left: 2 } }, // calm after the low-impact day
  ];
  const out = analyzeProgress(logs, checkIns);
  const rdl = out.progressions.find((p) => p.name === "Single-leg RDL");
  assert.equal(rdl?.deltaKg, 15);
  assert.ok(out.insights.some((i) => /knee/i.test(i)));
});
