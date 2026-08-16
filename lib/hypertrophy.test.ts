import { test } from "node:test";
import assert from "node:assert/strict";
import { splitFor, buildHypertrophyProgram, groupOf, isCompound } from "./hypertrophy";
import { parseConstraints, EMPTY_CONSTRAINTS } from "./constraints";
import { buildProgram } from "./coach";
import { weeklyMuscleVolume, LANDMARKS } from "./muscle-volume";

const gymPlan = (over: Partial<Parameters<typeof buildProgram>[0]> = {}) =>
  buildProgram({ goal: "strength", painMap: {}, sport: "gym", focus: "aesthetics", daysPerWeek: 3, ...over });

const allDrills = (p: ReturnType<typeof buildProgram>) =>
  p.weeks.flatMap((w) => w.sessions.flatMap((s) => s.drills));
const allNames = (p: ReturnType<typeof buildProgram>) => allDrills(p).map((d) => d.name.toLowerCase());

// --- split selection ---------------------------------------------------------

test("the split matches the training frequency", () => {
  assert.equal(splitFor(2).length, 2);
  assert.equal(splitFor(4).length, 4);
  assert.equal(splitFor(5).length, 5);
  assert.equal(splitFor(6).length, 6);
  // Two days a week can't support a body-part split.
  assert.ok(splitFor(2).every((d) => d.name.startsWith("Full body")));
});

/**
 * THREE DAYS IS FULL BODY, NOT PUSH/PULL/LEGS.
 *
 * PPL over three days trains every muscle ONCE a week, and that is where a
 * measured aesthetics block lost most of its volume — 7 weekly sets for chest,
 * 4 for glutes, against a productive band starting at 10. The same total work
 * spread over three exposures grows more muscle than one, and full body is the
 * textbook answer at this day count. PPL earns its place at six.
 */
test("three days is full body, because PPL there is once a week per muscle", () => {
  assert.ok(splitFor(3).every((d) => d.name.startsWith("Full body")),
    `three days gave ${splitFor(3).map((d) => d.name).join("/")}`);
  assert.deepEqual(splitFor(6).map((d) => d.name), ["Push", "Pull", "Legs", "Push B", "Pull B", "Legs B"]);
});

test("out-of-range frequencies are clamped, not crashed", () => {
  assert.ok(splitFor(0).length >= 2);
  assert.ok(splitFor(99).length <= 6);
  // Six, not five. The old cap silently threw away the sixth day somebody told
  // us they trained — 5 and 6 produced byte-identical weeks.
  assert.equal(splitFor(6).length, 6);
  assert.notDeepEqual(splitFor(6).map((d) => d.name), splitFor(5).map((d) => d.name));
});

/**
 * THE COMPLAINT, AS A NUMBER.
 *
 * "I said improve muscle aesthetics but it's only giving me a maintenance level
 * of sets" — and it was: every major muscle sat under the 10-set productive
 * threshold at the default three days. This asserts the big movers now land in
 * the band the evidence supports, at every day count somebody can pick.
 */
test("an aesthetics block actually prescribes a growth dose", () => {
  const BIG = ["quads", "glutes", "chest", "back"] as const;
  for (const daysPerWeek of [3, 4, 5, 6]) {
    const plan = buildProgram({ goal: "strength", painMap: {}, sport: "gym", focus: "aesthetics", daysPerWeek });
    const volume = weeklyMuscleVolume(plan.weeks[1]);
    for (const muscle of BIG) {
      assert.ok(volume[muscle] >= LANDMARKS.productiveLow,
        `${daysPerWeek} days: ${muscle} got ${volume[muscle]} weekly sets, under the productive ${LANDMARKS.productiveLow}`);
      assert.ok(volume[muscle] <= LANDMARKS.excessive + 2,
        `${daysPerWeek} days: ${muscle} got ${volume[muscle]} weekly sets, past what recovery supports`);
    }
  }
});

test("more training days buy more volume", () => {
  // The 5-vs-6 case was the giveaway: identical volume from a different amount
  // of training means a day was being dropped on the floor.
  const total = (daysPerWeek: number) => {
    const v = weeklyMuscleVolume(
      buildProgram({ goal: "strength", painMap: {}, sport: "gym", focus: "aesthetics", daysPerWeek }).weeks[1]);
    return Object.values(v).reduce((a, b) => a + b, 0);
  };
  assert.ok(total(4) > total(3), "a fourth day added nothing");
  assert.ok(total(6) > total(5), "a sixth day added nothing");
});

test("no split silently drops a muscle group it lists", () => {
  // Core was the one this caught: push/pull/legs has no home for it, so a
  // 6-day week measured ZERO core sets — dropped by accident, not by choice.
  for (const daysPerWeek of [3, 4, 5, 6]) {
    const plan = buildProgram({ goal: "strength", painMap: {}, sport: "gym", focus: "aesthetics", daysPerWeek });
    const volume = weeklyMuscleVolume(plan.weeks[1]);
    assert.ok(volume.core > 0, `${daysPerWeek} days: no core work at all`);
  }
});

// --- classification ----------------------------------------------------------

test("leg movements are split into real training groups", () => {
  const g = (name: string) => groupOf({ name, muscles: ["Legs"] } as never);
  assert.equal(g("Seated Calf Raise"), "calves");
  assert.equal(g("Lying Leg Curl"), "hamstrings");
  assert.equal(g("Glute Kickback"), "glutes");
  assert.equal(g("Hack Squat"), "quads");
});

test("conditioning is kept out of the bodybuilding pool", () => {
  assert.equal(groupOf({ name: "Burpee", muscles: ["Whole Body"] } as never), null);
  assert.equal(groupOf({ name: "Thruster", muscles: ["Whole Body"] } as never), null);
  // Hinges are the exception worth keeping.
  assert.equal(groupOf({ name: "Romanian Deadlift", muscles: ["Whole Body"] } as never), "hamstrings");
});

test("compound vs isolation is classified sensibly", () => {
  assert.equal(isCompound({ name: "Bench Press" } as never), true);
  assert.equal(isCompound({ name: "Dumbbell Lateral Raise" } as never), false);
  assert.equal(isCompound({ name: "Tricep Pushdown" } as never), false);
  assert.equal(isCompound({ name: "Hack Squat" } as never), true);
});

// --- the complaints this engine exists to fix --------------------------------

test("no field-sport drills leak into a gym program", () => {
  const names = allNames(gymPlan());
  for (const crossfit of ["ladder", "cone", "sprint", "dribbl", "shuttle", "burpee", "thruster", "hill"]) {
    assert.ok(!names.some((n) => n.includes(crossfit)), `"${crossfit}" has no place in a hypertrophy block`);
  }
});

test("programs contain real isolation work, not just compounds", () => {
  const names = allNames(gymPlan());
  const isolation = names.filter((n) => /curl|raise|extension|fly|pushdown|kickback/.test(n));
  assert.ok(isolation.length >= 4, `expected isolation work, got: ${[...new Set(names)].join(", ")}`);
});

test("reps stay in the hypertrophy range all block", () => {
  // Lifting only. The session now closes with an easy conditioning finisher,
  // and its `reps` field carries minutes or seconds rather than repetitions —
  // "1 × 20 minutes" is not a set of twenty. Asserting a rep range over it
  // would be checking the wrong unit, not catching a bad prescription.
  for (const d of allDrills(gymPlan()).filter((d) => d.slot !== "conditioning")) {
    assert.ok(d.reps >= 6 && d.reps <= 15, `${d.name} prescribed ${d.reps} reps`);
  }
});

test("the cardio finisher is a finisher, not a second workout", () => {
  const plan = gymPlan();
  for (const w of plan.weeks) {
    for (const s of w.sessions) {
      const cardio = s.drills.filter((d) => d.slot === "conditioning");
      assert.ok(cardio.length <= 1, `${s.title} has ${cardio.length} conditioning entries`);
      // It closes the session — putting it before the lifting would make the
      // lifting worse, which is the whole reason it goes last.
      if (cardio.length) assert.equal(s.drills[s.drills.length - 1].slot, "conditioning");
    }
  }
  // A VO2 session on top of a leg day is not a finisher, so the effort is capped.
  for (const d of allDrills(plan).filter((d) => d.slot === "conditioning")) {
    const rpe = Number(/RPE (\d+)/.exec(d.intensity ?? "")?.[1] ?? 0);
    assert.ok(rpe <= 7, `${d.name} at RPE ${rpe} is a workout, not a finisher`);
  }
});

test("sessions in a week are not carbon copies of each other", () => {
  const week1 = gymPlan().weeks[0].sessions;
  const day1 = week1[0].drills.map((d) => d.name).join("|");
  const day2 = week1[1].drills.map((d) => d.name).join("|");
  assert.notEqual(day1, day2);
});

test("push day trains pushing muscles, not legs", () => {
  // Six days, because that is where push/pull/legs now lives — three days is
  // full body, where mixing legs and pressing is the point rather than a bug.
  const plan = gymPlan({ daysPerWeek: 6 });
  const push = plan.weeks[0].sessions.find((s) => s.title.includes("Push"));
  assert.ok(push, "expected a Push day");
  for (const d of push!.drills) {
    assert.ok(!/squat|leg curl|leg extension|calf|lunge|deadlift/i.test(d.name), `${d.name} on push day`);
  }
});

test("sessions are named in gym language", () => {
  const titles = gymPlan().weeks[0].sessions.map((s) => s.title);
  assert.ok(titles.some((t) => /Push|Pull|Legs|Upper|Lower|Full body/.test(t)), titles.join(" / "));
});

// --- progression -------------------------------------------------------------

test("volume peaks in week 3 and drops in the deload", () => {
  const plan = gymPlan();
  const sets = (wi: number) => plan.weeks[wi].sessions.flatMap((s) => s.drills).reduce((n, d) => n + d.sets, 0);
  assert.ok(sets(2) > sets(0), "week 3 should add volume over week 1");
  assert.ok(sets(3) < sets(2), "week 4 should deload below the peak");
});

test("every drill explains what to change this week", () => {
  for (const d of allDrills(gymPlan())) {
    assert.ok(d.progression && d.progression.length > 5, `${d.name} has no progression note`);
    assert.ok(d.reason && d.reason.length > 5, `${d.name} has no reason`);
  }
});

// --- constraints + pain ------------------------------------------------------

test("a no-legs bodybuilder gets no leg work and no leg day", () => {
  const plan = gymPlan({ notes: "I don't train legs" });
  for (const n of allNames(plan)) {
    assert.ok(!/squat|leg curl|leg extension|leg press|calf|lunge|glute|deadlift/.test(n), `found ${n}`);
  }
  // The Legs day should drop out rather than render empty.
  for (const w of plan.weeks) {
    assert.ok(w.sessions.every((s) => s.drills.length > 0), "no empty sessions");
    assert.ok(!w.sessions.some((s) => s.title.includes("Legs")), "leg day should be gone");
  }
});

test("severe joint pain removes the groups that load it", () => {
  const plan = buildHypertrophyProgram({
    painMap: { knee_left: 9 },
    daysPerWeek: 3,
    constraints: EMPTY_CONSTRAINTS,
  });
  const names = plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.drills.map((d) => d.name.toLowerCase())));
  assert.ok(!names.some((n) => /squat|leg press|leg extension/.test(n)), "quad work loads a painful knee");
});

test("exclusions are echoed back to the athlete", () => {
  const plan = gymPlan({ notes: "no arms" });
  assert.ok(plan.constraints.some((c) => /arms/i.test(c)), plan.constraints.join(" / "));
});

test("parseConstraints feeds through buildProgram to the hypertrophy engine", () => {
  const direct = buildHypertrophyProgram({
    painMap: {}, daysPerWeek: 3, constraints: parseConstraints("no legs"),
  });
  const viaCoach = gymPlan({ notes: "no legs" });
  assert.deepEqual(viaCoach.weeks.map((w) => w.sessions.length), direct.weeks.map((w) => w.sessions.length));
});

// --- routing -----------------------------------------------------------------

test("aesthetics routes to hypertrophy whatever the sport", () => {
  const plan = buildProgram({ goal: "strength", painMap: {}, sport: "rugby", focus: "aesthetics", daysPerWeek: 3 });
  assert.ok(/split/.test(plan.summary), plan.summary);
});

test("rehab never gets hijacked by the hypertrophy engine", () => {
  const plan = buildProgram({ goal: "injury_recovery", painMap: {}, sport: "gym", focus: "aesthetics" });
  assert.ok(!/split/.test(plan.summary), plan.summary);
});

test("field-sport athletes are untouched by this change", () => {
  const plan = buildProgram({ goal: "speed", painMap: {}, sport: "football", focus: "performance" });
  assert.ok(!/split/.test(plan.summary), plan.summary);
});
