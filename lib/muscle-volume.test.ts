import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProgram } from "./coach";
import { buildBlock } from "./engine";
import { MOVEMENT_BY_ID } from "./movements";
import {
  weeklyMuscleVolume, musclesOf, auditWeek, verdictFor, LANDMARKS,
  type MuscleGroup,
} from "./muscle-volume";

/**
 * Weekly sets per muscle group is the number strength coaches program against
 * and the one the evidence is written in. The engine could not see it: it
 * counted sets per SLOT, which says how long a session is and nothing about
 * whether the athlete is training their hamstrings.
 */

const wk = (input: Record<string, unknown>, week = 2) =>
  buildProgram({ painMap: {}, ...input } as never).weeks[week];

test("a sprint session is not thirty sets of quads", () => {
  // Sprints, change of direction and conditioning are qualities and energy
  // systems, not resistance volume. Counting them as leg sets would make every
  // speed block read as the heaviest leg week of the athlete's life.
  const speed = wk({ goal: "speed", daysPerWeek: 4, sport: "football", focus: "performance" });
  const v = weeklyMuscleVolume(speed);
  assert.ok(v.quads < 15, `${v.quads} quad sets in a speed week is a counting bug, not a programme`);

  for (const id of ["flying_sprints", "hill_sprints", "t_drill", "lateral_shuffle"]) {
    assert.deepEqual(musclesOf(MOVEMENT_BY_ID[id]), [], `${id} should contribute no resistance volume`);
  }
});

/**
 * The bodybuilding engine draws from a completely different catalogue —
 * "Close Grip Bench Press", "Cable Fly" — none of which appear in MOVEMENTS.
 * Reading only the S&C library counted ZERO sets for every hypertrophy plan,
 * which is precisely the population this number matters most to.
 */
test("hypertrophy programmes are countable too", () => {
  const week = wk({ goal: "strength", daysPerWeek: 5, sport: "gym", focus: "aesthetics" });
  const v = weeklyMuscleVolume(week);
  const total = (Object.values(v) as number[]).reduce((a, b) => a + b, 0);
  assert.ok(total > 30, `a 5-day bodybuilding week counted only ${total} sets`);
  assert.ok(v.chest > 0 && v.back > 0, "a bodybuilding block must register chest and back work");
});

test("assistance counts for half, and a jump for a third", () => {
  // A bench press is chest first, then shoulders and triceps assisting.
  assert.deepEqual(musclesOf(MOVEMENT_BY_ID.bench_press), ["chest", "shoulders", "triceps"]);
  const week = {
    week: 1, theme: "t", intensity: "i", focusNote: "n",
    sessions: [{
      day: 1, title: "t", focus: "strength" as const,
      drills: [
        { name: "Barbell bench press", sets: 4, reps: 6, cue: "", reason: "", slot: "primary" as const },
        { name: "Box jumps", sets: 3, reps: 5, cue: "", reason: "", slot: "primary" as const },
      ],
    }],
  };
  const v = weeklyMuscleVolume(week);
  assert.equal(v.chest, 4, "primary mover gets the full set count");
  assert.equal(v.triceps, 2, "assisting muscle gets half");
  // Box jumps: quads primary (3 × 1/3 = 1), glutes assisting (3 × 1/3 × 0.5 = 0.5).
  assert.equal(v.quads, 1);
  assert.equal(v.glutes, 0.5);
});

test("warm-ups and ball work are not training volume", () => {
  const week = {
    week: 1, theme: "t", intensity: "i", focusNote: "n",
    sessions: [{
      day: 1, title: "t", focus: "strength" as const,
      drills: [
        { name: "Glute bridge", sets: 2, reps: 12, cue: "", reason: "", slot: "warmup" as const },
        { name: "Directional first touch", sets: 1, reps: 1, cue: "", reason: "", skill: true },
      ],
    }],
  };
  const v = weeklyMuscleVolume(week);
  assert.equal((Object.values(v) as number[]).reduce((a, b) => a + b, 0), 0);
});

/**
 * The pattern lies for a whole slot of the catalogue. `rehab` covers calf
 * raises, band walks, terminal knee extensions, adductor squeezes and shoulder
 * external rotations — five different muscles sharing one label.
 */
test("movements whose pattern lies are corrected", () => {
  assert.deepEqual(musclesOf(MOVEMENT_BY_ID.calf_raise), ["calves"]);
  assert.deepEqual(musclesOf(MOVEMENT_BY_ID.adductor_iso_squeeze), ["adductors"]);
  assert.deepEqual(musclesOf(MOVEMENT_BY_ID.terminal_knee_ext), ["quads"]);
  // A hip thrust is a hinge that is almost entirely glute, not hamstring.
  assert.deepEqual(musclesOf(MOVEMENT_BY_ID.hip_thrust), ["glutes"]);
  assert.deepEqual(musclesOf(MOVEMENT_BY_ID.nordic_curl), ["hamstrings"]);
});

test("the landmarks classify the way the evidence reads", () => {
  assert.equal(verdictFor(0), "untrained");
  assert.equal(verdictFor(LANDMARKS.maintenance - 1), "maintenance");
  assert.equal(verdictFor(14), "productive");
  assert.equal(verdictFor(LANDMARKS.excessive + 1), "excessive");
});

/**
 * No programme the app produces should bury a muscle group past the point the
 * evidence supports. Diminishing returns set in through the teens and recent
 * meta-regression argues the top end costs recovery for very little — so a
 * generated block sitting above it is a programming error, not a hard week.
 */
test("no generated programme buries a muscle group", () => {
  const cases = [
    { goal: "strength", daysPerWeek: 5, sport: "football", focus: "performance" },
    { goal: "speed", daysPerWeek: 4, sport: "football", focus: "performance" },
    { goal: "strength", daysPerWeek: 5, sport: "rugby", focus: "performance" },
    { goal: "strength", daysPerWeek: 5, sport: "gym", focus: "aesthetics" },
    { goal: "strength", daysPerWeek: 4, sport: "football", focus: "performance", isInSeason: true },
  ];
  for (const c of cases) {
    for (let w = 0; w < 4; w++) {
      const audit = auditWeek(wk(c, w));
      assert.deepEqual(
        audit.excessive, [],
        `${c.sport}/${c.goal} week ${w + 1}: ${audit.excessive
          .map((g: MuscleGroup) => `${g} ${audit.volume[g]}`).join(", ")}`
      );
    }
  }
});

/**
 * A SPRINTING ATHLETE GETS HAMSTRING WORK.
 *
 * This is the finding that justified building the accounting at all. A
 * four-day football strength block contained ZERO hamstring sets — no Nordic
 * curl, no RDL, no slider, all three of which are in the catalogue. The
 * posterior chain got a hip thrust, which is glutes. Nothing in the app could
 * see it, because volume was counted per session slot rather than per muscle.
 *
 * Hamstring strain is the most common non-contact injury in football and the
 * Nordic curl is the best-evidenced thing anyone has found to reduce it.
 */
test("a sprinting sport's block contains real hamstring work", () => {
  for (const sport of ["football", "rugby"] as const) {
    for (const goal of ["strength", "speed"] as const) {
      const audit = auditWeek(wk({ goal, daysPerWeek: 4, sport, focus: "performance" }));
      assert.ok(
        audit.volume.hamstrings > 0,
        `${sport}/${goal}: not one hamstring set in the week`
      );
    }
  }
});

/**
 * And it is not swamped by quad work. Quad-dominant programming is a known
 * contributor to hamstring strain, so the ratio is worth pinning — on the
 * strength blocks, where there is room in the session for it.
 *
 * A SPEED block currently sits lower, around 0.3: quads accumulate from squats,
 * split squats and every jump, while hamstrings come from one Nordic. That is
 * thin rather than absent, and closing it properly means more room in the
 * blueprint than a speed session has. Left as a known gap rather than papered
 * over with a threshold that passes.
 */
test("a strength block for a sprinting sport is not quad-dominant", () => {
  for (const sport of ["football", "rugby"] as const) {
    const audit = auditWeek(wk({ goal: "strength", daysPerWeek: 4, sport, focus: "performance" }));
    assert.ok(audit.hamstringToQuad !== null);
    assert.ok(
      audit.hamstringToQuad! >= 0.6,
      `${sport}: only ${audit.hamstringToQuad} hamstring sets per quad set`
    );
  }
});

test("the audit reports the week it audited", () => {
  const plan = buildBlock({ goal: "strength", painMap: {}, sport: "football", daysPerWeek: 3 });
  assert.deepEqual(plan.weeks.map((w) => auditWeek(w).week), [1, 2, 3, 4]);
});
