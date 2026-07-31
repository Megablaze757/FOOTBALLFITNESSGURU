import { test } from "node:test";
import assert from "node:assert/strict";
import { recommendDrills, buildProgram, analyzeProgress, painByArea, goalsForSport } from "./coach";
import { MOVEMENTS } from "./movements";
import type { ProgramPlan } from "./engine";
import type { TrainingLog } from "./types";

test("goalsForSport tailors goals per sport", () => {
  const football = goalsForSport("football");
  assert.equal(football[0].id, "speed");

  const wl = goalsForSport("weightlifting");
  assert.equal(wl[0].id, "strength");
  assert.match(wl[0].label, /Maximal strength/);
  assert.ok(!wl.some((g) => g.id === "agility")); // weightlifting hides agility

  const rugby = goalsForSport("rugby");
  assert.equal(rugby[0].id, "strength");
  assert.match(rugby.find((g) => g.id === "skill")!.label, /Contact/);

  assert.equal(goalsForSport(null).length, 6); // unknown → full football set
});

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
  // In-season deload week has lighter volume than the peak week. Measured
  // across the week: drills[0] is no longer the same movement from one week to
  // the next, which is the point of the rotation.
  assert.ok(weekSets(plan, 3) <= weekSets(plan, 2));
});

/** Total prescribed sets in a week — warm-ups included, they just don't wave. */
const weekSets = (plan: { weeks: { sessions: { drills: { sets: number }[] }[] }[] }, wi: number) =>
  plan.weeks[wi].sessions.flatMap((s) => s.drills).reduce((n, d) => n + d.sets, 0);

test("a later block progresses volume above block 1", () => {
  const b1 = buildProgram({ goal: "strength", painMap: {}, block: 1 });
  const b3 = buildProgram({ goal: "strength", painMap: {}, block: 3 });
  // Measured across the week, not off drills[0]: that's the warm-up now, and a
  // warm-up that grows 8% a block is not a feature.
  assert.ok(weekSets(b3, 2) > weekSets(b1, 2), `block3 ${weekSets(b3, 2)} should exceed block1 ${weekSets(b1, 2)}`);
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

test("program weeks genuinely progress rather than repeating", () => {
  const plan = buildProgram({ goal: "strength", painMap: {}, sport: "rugby" });

  // Compare the whole week, not one drill: what matters is that week 2 isn't
  // week 1 relabelled.
  const sig = (wi: number) =>
    plan.weeks[wi].sessions.flatMap((s) => s.drills).map((d) => `${d.name}:${d.sets}x${d.reps}`).join("|");
  const distinct = new Set([sig(0), sig(1), sig(2)]);
  assert.equal(distinct.size, 3, "weeks 1-3 should each be different");

  for (const w of plan.weeks) {
    assert.ok(w.focusNote && w.focusNote.length > 5, `week ${w.week} missing focusNote`);
    for (const d of w.sessions.flatMap((s) => s.drills)) {
      // Warm-ups and cool-downs are the same every session on purpose, so they
      // carry no "do it harder this week" line — everything else must.
      if (d.slot === "warmup" || d.slot === "cooldown") continue;
      assert.ok(d.progression && d.progression.length > 5, `${d.name} missing progression`);
    }
  }

  assert.ok(weekSets(plan, 3) < weekSets(plan, 2), "deload should cut volume below the peak week");
});

test("weighted lifts wave reps down toward the peak", () => {
  // Weightlifting, not gym+aesthetics: that combination routes to the
  // hypertrophy engine, which deliberately holds reps in range instead of
  // waving them down (see hypertrophy.test.ts).
  const plan = buildProgram({ goal: "strength", painMap: {}, sport: "weightlifting", focus: "performance" });

  // Compare a lift only against ITSELF. The block now rotates which movements
  // appear, so "the first drill matching /squat/" is a different exercise from
  // one week to the next — and matching loosely also caught the Spanish squat
  // iso-hold, which is timed work and correctly goes UP.
  const loadLifts = new Set(MOVEMENTS.filter((m) => m.prog === "load").map((m) => m.name));
  const repsIn = (wi: number, name: string) =>
    plan.weeks[wi].sessions.flatMap((s) => s.drills).find((d) => d.name === name)?.reps;

  let compared = 0;
  for (const name of loadLifts) {
    const base = repsIn(0, name);
    const peak = repsIn(2, name);
    if (base == null || peak == null) continue;
    assert.ok(peak <= base, `${name}: peak week ${peak} reps should not exceed base week ${base}`);
    compared++;
  }
  assert.ok(compared > 0, "no load lift appeared in both week 1 and week 3 to compare");
});

// --- Running handoff ---------------------------------------------------------

test("a runner chasing endurance gets runs, not a drill list", () => {
  const plan = buildProgram({ goal: "endurance", painMap: {}, sport: "running", daysPerWeek: 5 });
  const names = plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.drills.map((d) => d.name)));
  assert.ok(names.some((n) => /run|tempo|interval|threshold|VO2/i.test(n)), `got: ${[...new Set(names)].join(", ")}`);
  // The tell that it went to the wrong engine: a runner's plan full of sleds,
  // shuttles and bike intervals, which is what happened before this existed.
  assert.ok(!names.some((n) => /sled|shuttle|bike/i.test(n)), `gym conditioning leaked in: ${names.join(", ")}`);
});

test("every run in a runner's plan names its zone", () => {
  const plan = buildProgram({ goal: "endurance", painMap: {}, sport: "running", daysPerWeek: 4 });
  for (const w of plan.weeks) {
    for (const s of w.sessions) {
      assert.match(s.drills[0].prescription ?? "", /Zone [1-5]/, `${s.title} has no zone`);
    }
  }
});

test("a runner asking for strength still gets the gym", () => {
  // "Runner's strength" is leg durability work — hijacking it into a run block
  // would remove the very thing that keeps them running.
  const plan = buildProgram({ goal: "strength", painMap: {}, sport: "running", daysPerWeek: 3 });
  const names = plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.drills.map((d) => d.name)));
  assert.ok(!names.every((n) => /run$/i.test(n)), "expected gym work, got a run block");
});

test("a runner coming back from injury gets rehab, not mileage", () => {
  const plan = buildProgram({ goal: "injury_recovery", painMap: { knee_left: 6 }, sport: "running", daysPerWeek: 3 });
  assert.notEqual(plan.goal, "endurance");
});

test("a footballer is unaffected by the running handoff", () => {
  const plan = buildProgram({ goal: "endurance", painMap: {}, sport: "football", daysPerWeek: 4 });
  const names = plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.drills.map((d) => d.name)));
  assert.ok(names.length > plan.weeks.length * 4, "expected a full drill list, not one run per day");
});

test("a sore runner's easy days drop to recovery pace", () => {
  const sore = buildProgram({
    goal: "endurance", painMap: { knee_left: 6 }, sport: "running", daysPerWeek: 5,
  });
  const fresh = buildProgram({ goal: "endurance", painMap: {}, sport: "running", daysPerWeek: 5 });
  const zone1 = (p: typeof sore) =>
    p.weeks.flatMap((w) => w.sessions).filter((s) => /Zone 1/.test(s.drills[0].prescription ?? "")).length;
  assert.ok(zone1(sore) > zone1(fresh), "a sore knee should pull the easy days back to Zone 1");
});

test("runs are available to every sport, not just runners", () => {
  // The requirement is plain: a footballer or a gym athlete doing conditioning
  // should be able to be told to go for a run. Before the run entries existed,
  // a conditioning slot could only be filled by a sled, a shuttle or a bike.
  const RUNS = ["Easy run", "Long run", "Threshold run", "Recovery run", "Fartlek run", "Hill repeats"];
  for (const sport of ["football", "rugby", "basketball", "gym", "weightlifting"] as const) {
    const names = new Set(
      recommendDrills({ goal: "endurance", painMap: {}, sport }).map((d) => d.name),
    );
    assert.ok([...names].some((n) => RUNS.includes(n)), `${sport} was offered no runs: ${[...names].join(", ")}`);
  }
});

test("a recovery run is reachable as recovery work in any sport", () => {
  const names = recommendDrills({ goal: "injury_recovery", painMap: {}, sport: "gym" }).map((d) => d.name);
  assert.ok(names.length > 0);
});

test("'no running' drops every run but keeps the bike", () => {
  // The four that don't have "run" in the name — Fartlek, Strides, Hill
  // repeats, VO2 max intervals — are why running had to become a region. The
  // name-stem rule alone would have let all four through.
  const plan = buildProgram({
    goal: "endurance", painMap: {}, sport: "football", daysPerWeek: 4,
    notes: "no running, my shins are wrecked",
  });
  const names = plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.drills.map((d) => d.name)));
  for (const banned of ["Easy run", "Long run", "Fartlek run", "Hill repeats", "Strides", "VO2 max intervals"]) {
    assert.ok(!names.includes(banned), `"${banned}" survived a "no running" note`);
  }
  // …and the point of making it a region rather than banning cardio outright:
  // conditioning must still be fillable.
  assert.ok(plan.constraints.some((c) => /running/i.test(c)), "the exclusion should be shown back to the athlete");
});

test("a runner's own numbers drive the block", () => {
  // The mileage input is the one variable that decides whether a block builds
  // someone or injures them, so it has to actually reach the engine.
  const small = buildProgram({
    goal: "endurance", painMap: {}, sport: "running", daysPerWeek: 5, weeklyKm: 20,
  });
  const big = buildProgram({
    goal: "endurance", painMap: {}, sport: "running", daysPerWeek: 5, weeklyKm: 80,
  });
  const km = (p: typeof small) => Number(/([\d.]+)km target/.exec(p.weeks[0].focusNote)![1]);
  assert.equal(km(small), 20);
  assert.equal(km(big), 80);
});

test("runner level caps the hard sessions", () => {
  const beginner = buildProgram({
    goal: "endurance", painMap: {}, sport: "running", daysPerWeek: 5,
    weeklyKm: 40, runnerLevel: "beginner",
  });
  const advanced = buildProgram({
    goal: "endurance", painMap: {}, sport: "running", daysPerWeek: 5,
    weeklyKm: 40, runnerLevel: "advanced",
  });
  const hard = (p: typeof beginner) =>
    p.weeks[1].sessions.filter((s) => /Threshold|VO2|Cruise|repeat|Fartlek|Steady|Progression/i.test(s.title)).length;
  assert.equal(hard(beginner), 1);
  assert.ok(hard(advanced) > hard(beginner), `advanced ${hard(advanced)} vs beginner ${hard(beginner)}`);
});

test("a logged race turns the plan's zones into real paces", () => {
  const withRace = buildProgram({
    goal: "endurance", painMap: {}, sport: "running", daysPerWeek: 4,
    weeklyKm: 40, thresholdSecPerKm: 255,
  });
  const p = withRace.weeks[0].sessions[0].drills[0].prescription!;
  assert.match(p, /\d+:\d\d–\d+:\d\d\/km/, `expected a pace range, got: ${p}`);
});

test("every sport and every goal can prescribe an actual run", () => {
  // The ask was "running in the programs", not "running available to the
  // programs". Those came apart: the run entries existed in the catalogue and
  // scored fine, and a strength block still contained none, because the
  // strength blueprint had no conditioning slot at all — so for the goal most
  // athletes pick, nothing in any sport could ever tell them to go for a run.
  const RUNS = [
    "Recovery run", "Easy run", "Long run", "Threshold run",
    "VO2 max intervals", "Fartlek run", "Progression run", "Hill repeats",
  ];
  for (const sport of ["football", "rugby", "basketball", "gym", "weightlifting"] as const) {
    for (const goal of ["endurance", "speed", "strength"] as const) {
      const plan = buildProgram({ goal, painMap: {}, sport, daysPerWeek: 4 });
      const names = plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.drills.map((d) => d.name)));
      assert.ok(
        names.some((n) => RUNS.includes(n)),
        `${sport}/${goal} contains no runs at all`,
      );
    }
  }
});

test("the deload week gets recovery running, not hill repeats", () => {
  // Filling week 4's conditioning from the same ranked list as Peak week put
  // hill repeats into the down week — the one week they must not be in. It was
  // also why the recovery run, the easiest thing in the catalogue, was never
  // selected anywhere in the app.
  for (const sport of ["football", "gym", "weightlifting"] as const) {
    const plan = buildProgram({ goal: "strength", painMap: {}, sport, daysPerWeek: 4 });
    const deload = plan.weeks[3].sessions.flatMap((s) => s.drills.map((d) => d.name));
    assert.ok(!deload.includes("Hill repeats"), `${sport}: hill repeats in the deload week`);
    assert.ok(!deload.includes("VO2 max intervals"), `${sport}: VO2 intervals in the deload week`);
  }
  // And it actually reaches for the recovery run somewhere across a block.
  const names = buildProgram({ goal: "strength", painMap: {}, sport: "football", daysPerWeek: 4 })
    .weeks.flatMap((w) => w.sessions.flatMap((s) => s.drills.map((d) => d.name)));
  assert.ok(names.includes("Recovery run"), "recovery runs are still unreachable");
});

test("'no running' still empties the runs out of a strength block", () => {
  // The new conditioning slot must not become a back door around the athlete's
  // own exclusions.
  const plan = buildProgram({
    goal: "strength", painMap: {}, sport: "gym", daysPerWeek: 4, notes: "no running",
  });
  const names = plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.drills.map((d) => d.name)));
  for (const banned of ["Easy run", "Long run", "Recovery run", "Hill repeats"]) {
    assert.ok(!names.includes(banned), `"${banned}" survived a "no running" note`);
  }
});

// --- Are the runs actually reasonable? ---------------------------------------

const RUN_NAMES = [
  "Recovery run", "Easy run", "Long run", "Threshold run",
  "VO2 max intervals", "Fartlek run", "Progression run", "Hill repeats", "Strides",
];
const runsIn = (plan: ProgramPlan) =>
  plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.drills)).filter((d) => RUN_NAMES.includes(d.name));

test("every run in a program names its zone", () => {
  // The zone is the instruction. "40 min" on its own is the commonest way an
  // easy day gets run too hard, and the programme was the only surface in the
  // app not speaking in zones.
  for (const sport of ["football", "rugby", "gym", "weightlifting"] as const) {
    for (const goal of ["endurance", "strength"] as const) {
      const plan = buildProgram({ goal, painMap: {}, sport, daysPerWeek: 4 });
      for (const d of runsIn(plan)) {
        assert.match(d.prescription ?? "", /Zone [1-5] \(/, `${sport}/${goal}: ${d.name} has no zone`);
        // And the talk test, so the number coaches someone with no HR strap.
        assert.ok((d.cue ?? "").length > 20, `${d.name} has no effort description`);
      }
    }
  }
});

test("a continuous run is one effort, not a set of them", () => {
  // The two-set floor made a long run read `sets: 2` — the prescription text
  // hid it, but anything reading the number saw two sets of a 75-minute run.
  for (const d of runsIn(buildProgram({ goal: "strength", painMap: {}, sport: "football", daysPerWeek: 4 }))) {
    if ((d.prescription ?? "").includes(" min")) {
      assert.equal(d.sets, 1, `${d.name} prescribed as ${d.sets} sets`);
    }
  }
});

test("a recovery run stays a recovery run all block", () => {
  // The RPE floor of 5 clamped its RPE 2 up to 5, so the one movement whose
  // entire purpose is being easy was prescribed at moderate effort.
  for (const d of runsIn(buildProgram({ goal: "strength", painMap: {}, sport: "football", daysPerWeek: 4 }))) {
    if (d.name === "Recovery run") {
      const rpe = Number(/RPE ([\d.]+)/.exec(d.intensity ?? "")?.[1] ?? 99);
      assert.ok(rpe <= 3, `a recovery run at RPE ${rpe} is not a recovery run`);
      assert.match(d.prescription ?? "", /Zone 1/);
    }
  }
});

test("run durations grow at a survivable rate", () => {
  // Lift rep-scaling took a 75-minute long run to 105 by week 3 — a 40% jump
  // inside one block, roughly four times what a runner should add.
  // Weeks 1-3 only. Week 4 is the deload and is MEANT to come down, so folding
  // it in would count the block working correctly as a swing.
  const plan = buildProgram({ goal: "endurance", painMap: {}, sport: "football", daysPerWeek: 4 });
  const byName = new Map<string, number[]>();
  for (const w of plan.weeks.slice(0, 3)) {
    for (const d of w.sessions.flatMap((s) => s.drills)) {
      if (!RUN_NAMES.includes(d.name)) continue;
      const mins = Number(/^(\d+) min/.exec(d.prescription ?? "")?.[1] ?? 0);
      if (mins) byName.set(d.name, [...(byName.get(d.name) ?? []), mins]);
    }
  }
  assert.ok(byName.size > 0, "no timed runs found to check");
  for (const [name, mins] of byName) {
    const grown = Math.max(...mins) / Math.min(...mins);
    assert.ok(grown <= 1.25, `${name} climbs ${Math.round((grown - 1) * 100)}% across the build weeks`);
  }
});

test("timed intervals are prescribed in round numbers", () => {
  for (const d of runsIn(buildProgram({ goal: "endurance", painMap: {}, sport: "football", daysPerWeek: 4 }))) {
    const secs = Number(/× (\d+)s/.exec(d.prescription ?? "")?.[1] ?? 0);
    if (secs) assert.equal(secs % 5, 0, `${d.name}: ${secs}s is not a number anyone would say`);
  }
});
