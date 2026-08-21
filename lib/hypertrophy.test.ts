import { test } from "node:test";
import assert from "node:assert/strict";
import { splitFor, buildHypertrophyProgram, groupOf, isCompound, regionOfMovement, muscleGroupForName } from "./hypertrophy";
import { parseConstraints, EMPTY_CONSTRAINTS } from "./constraints";
import { buildProgram } from "./coach";
import { weeklyMuscleVolume, auditWeek, LANDMARKS } from "./muscle-volume";
import { exerciseMeasure } from "./exercise-measure";

const gymPlan = (over: Partial<Parameters<typeof buildProgram>[0]> = {}) =>
  buildProgram({ goal: "strength", painMap: {}, sport: "gym", focus: "aesthetics", daysPerWeek: 3, ...over });

const allDrills = (p: ReturnType<typeof buildProgram>) =>
  p.weeks.flatMap((w) => w.sessions.flatMap((s) => s.drills));
const allNames = (p: ReturnType<typeof buildProgram>) => allDrills(p).map((d) => d.name.toLowerCase());

test("static holds in gym plans are prescribed and progressed as time", () => {
  const plans = [2, 3, 4, 5, 6].map((daysPerWeek) => gymPlan({ daysPerWeek }));
  const holds = plans.flatMap(allDrills).filter((d) => exerciseMeasure(d.name) === "seconds");
  assert.ok(holds.length > 0, "the audit did not reach a static hold");
  for (const hold of holds) {
    assert.match(hold.prescription ?? "", /^\d+ × \d+s$/, hold.name);
    assert.doesNotMatch(`${hold.progression} ${hold.intensity}`, /weight|reps? in the tank/i, hold.name);
  }
});

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
  for (const d of allDrills(gymPlan()).filter((d) => d.slot !== "conditioning" && exerciseMeasure(d.name, d.prescription) === "reps")) {
    assert.ok(d.reps >= 6 && d.reps <= 15, `${d.name} prescribed ${d.reps} reps`);
  }
});

test("the cardio finisher is a finisher, not a second workout", () => {
  const plan = gymPlan();
  for (const w of plan.weeks) {
    for (const s of w.sessions) {
      const cardio = s.drills.filter((d) => d.slot === "conditioning");
      assert.ok(cardio.length <= 1, `${s.title} has ${cardio.length} conditioning entries`);
      // It closes the WORK — putting it before the lifting would make the
      // lifting worse, which is the whole reason it goes last.
      //
      // "Last drill in the session" was the same thing until every session
      // gained a cool-down (lib/program-validate.ts). A stretch after the
      // finisher is correct; the assertion just had no way to say so.
      if (cardio.length) {
        const work = s.drills.filter((d) => d.slot !== "cooldown");
        assert.equal(work[work.length - 1].slot, "conditioning", s.title);
      }
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

// =============================================================================
// A BLOCK, NOT A WORKOUT GENERATOR.
//
// Measured before this: ONE movement out of thirty-five survived all four
// weeks, and day one's main lift went Close Grip Bench → Decline Bench →
// Dumbbell Bench → Incline Bench. You cannot add weight to a lift you do once,
// so progressive overload — the mechanism the whole thing exists to drive —
// was impossible by construction, while the plan's own progression line read
// "pick a weight you could do 2-3 more reps with".
// =============================================================================

import { STAPLES } from "./exercise-catalog";

const namesIn = (week: { sessions: { drills: { name: string }[] }[] }) =>
  new Set(week.sessions.flatMap((s) => s.drills.map((d) => d.name)));

test("the lifts stay put for the whole block, so load can progress", () => {
  for (const daysPerWeek of [3, 4, 5, 6]) {
    const plan = buildProgram({ goal: "strength", painMap: {}, sport: "gym", focus: "aesthetics", daysPerWeek });
    const weeks = plan.weeks.map(namesIn);
    const stable = [...weeks[0]].filter((n) => weeks.every((w) => w.has(n)));
    // Not 100%: the cardio finisher rotates by design, and there is one per day.
    const ratio = stable.length / weeks[0].size;
    assert.ok(ratio > 0.8,
      `${daysPerWeek}d: only ${stable.length} of ${weeks[0].size} movements survive the block — nothing can be progressively overloaded`);
  }
});

test("the main lift of a session is the same lift in week 4 as in week 1", () => {
  // The sharpest form of the same claim, and the one an athlete would notice.
  const plan = buildProgram({ goal: "strength", painMap: {}, sport: "gym", focus: "aesthetics", daysPerWeek: 4 });
  for (let d = 0; d < plan.weeks[0].sessions.length; d++) {
    const opener = plan.weeks.map((w) => w.sessions[d]?.drills[0]?.name);
    assert.equal(new Set(opener).size, 1, `day ${d + 1} opens on a different lift each week: ${opener.join(" → ")}`);
  }
});

test("a deload eases the same session rather than replacing it", () => {
  // A week of different, easier movements is not a deload — it is a different
  // week, and it breaks the comparison the deload exists to set up.
  const plan = buildProgram({ goal: "strength", painMap: {}, sport: "gym", focus: "aesthetics", daysPerWeek: 4 });
  const peak = plan.weeks[2].sessions[0];
  const deload = plan.weeks[3].sessions[0];
  /**
   * The LIFTING is what must be identical. The conditioning finisher is
   * deliberately easier on a down week — cardioFinisher drops its effort
   * ceiling from 7 to 4 — so comparing it here would fail the block for doing
   * exactly what a deload is supposed to do.
   */
  const lifts = (s: typeof peak) => s.drills.filter((d) => d.slot !== "conditioning").map((d) => d.name);
  assert.deepEqual(lifts(deload), lifts(peak));
  const sets = (s: typeof peak) => s.drills.reduce((n, d) => n + d.sets, 0);
  assert.ok(sets(deload) < sets(peak), `deload carries ${sets(deload)} sets against a peak of ${sets(peak)}`);
});

test("effort climbs across the block and backs off for the deload", () => {
  const plan = buildProgram({ goal: "strength", painMap: {}, sport: "gym", focus: "aesthetics", daysPerWeek: 4 });
  // The first WORKING set, not the first drill. Sessions now open with a
  // warm-up, whose effort target is deliberately "easy" and deliberately does
  // not climb — see lib/program-validate.ts.
  const rir = plan.weeks.map((w) => {
    const lift = w.sessions[0].drills.find((d) => d.slot !== "warmup" && d.slot !== "cooldown");
    const m = /leave (\d+) in the tank/.exec(lift?.intensity ?? "");
    return m ? Number(m[1]) : null;
  });
  assert.deepEqual(rir, [3, 2, 1, 4], `reps in reserve across the block: ${rir.join(", ")}`);
});

test("blocks two and three are a different set of lifts", () => {
  // Variety belongs BETWEEN blocks. Without this the fix above would hand
  // somebody the same eight exercises until they quit.
  const first = namesIn(buildProgram({ goal: "strength", painMap: {}, sport: "gym", focus: "aesthetics", daysPerWeek: 4, block: 1 }).weeks[0]);
  const second = namesIn(buildProgram({ goal: "strength", painMap: {}, sport: "gym", focus: "aesthetics", daysPerWeek: 4, block: 2 }).weeks[0]);
  const shared = [...first].filter((n) => second.has(n));
  assert.ok(shared.length < first.size * 0.7,
    `block 2 repeats ${shared.length} of block 1's ${first.size} movements`);
});

test("sessions are anchored on staple lifts, not on novelty", () => {
  /**
   * The engine used to rank the pool by "has coaching cues", which is a proxy
   * for staple and not a good one. It produced "Close Grip Bench Press" as a
   * chest main lift — a triceps press whose own catalogue entry says so — and
   * "Cheat Curl", "JM Press" and "Tate Press" opening sessions.
   */
  const staples = new Set(STAPLES.map((s) => s.toLowerCase()));
  for (const daysPerWeek of [3, 4, 5]) {
    const plan = buildProgram({ goal: "strength", painMap: {}, sport: "gym", focus: "aesthetics", daysPerWeek });
    for (const s of plan.weeks[0].sessions) {
      // The lift the session is BUILT ON, which is the first thing after the
      // warm-up. Reading drills[0] meant this test only worked while gym
      // sessions had no warm-up at all — which was itself the defect that
      // lib/program-validate.ts was written to fix.
      const opener = s.drills.find((d) => d.slot !== "warmup" && d.slot !== "cooldown")?.name ?? "";
      assert.ok(staples.has(opener.toLowerCase()),
        `${daysPerWeek}d "${s.title}" opens on ${opener}, which is not a lift to build a session on`);
    }
  }
});

test("a four-day block contains the squat, the hinge and the press", () => {
  // The catalogue held 23 squat variants and no back squat, so blocks came out
  // anchored on "Dumbbell Deadlift" and "Sled Leg Press". A hypertrophy block
  // missing the three lifts everything else is accessory to is not a block.
  const names = [...namesIn(buildProgram({ goal: "strength", painMap: {}, sport: "gym", focus: "aesthetics", daysPerWeek: 4 }).weeks[0])];
  const has = (re: RegExp) => names.some((n) => re.test(n));
  assert.ok(has(/^barbell (back|front) squat$/i), `no barbell squat: ${names.join(", ")}`);
  assert.ok(has(/deadlift/i), `no hinge: ${names.join(", ")}`);
  assert.ok(has(/bench press|overhead press/i), `no barbell press: ${names.join(", ")}`);
});

test("every lift carries rest and an effort target", () => {
  // 4 of 35 did, and those four were the cardio finishers: every actual lift
  // went out with no rest guidance and no idea how hard to go.
  const plan = buildProgram({ goal: "strength", painMap: {}, sport: "gym", focus: "aesthetics", daysPerWeek: 4 });
  for (const s of plan.weeks[0].sessions) {
    for (const d of s.drills) {
      assert.ok((d.rest ?? 0) > 0, `${d.name} has no rest period`);
      assert.ok(d.intensity, `${d.name} has no effort target`);
    }
  }
});

test("a tested max becomes a working weight", () => {
  /**
   * The Benchmarks page has stored these since it existed and the programme
   * has never once used them — an athlete with a tested 140kg squat was still
   * told to "pick something you could do 2-3 more reps with".
   *
   * 8 reps leaving 3 in reserve is a weight you could do 11 with, which by the
   * Epley relation is 140 / (1 + 11/30) = 102.4kg, rounded to the nearest
   * 2.5kg plate pair.
   */
  const plan = buildProgram({
    goal: "strength", painMap: {}, sport: "gym", focus: "aesthetics", daysPerWeek: 4,
    oneRepMax: { squat_1rm: 140 },
  });
  const squat = plan.weeks[0].sessions.flatMap((s) => s.drills).find((d) => /back squat/i.test(d.name));
  assert.ok(squat, "no squat in the block to load");
  assert.match(squat!.intensity ?? "", /^102\.5kg/, `squat prescribed at ${squat!.intensity}`);
});

test("without a tested max it says how hard, not how heavy", () => {
  // An invented number is worse than an honest instruction.
  const plan = buildProgram({ goal: "strength", painMap: {}, sport: "gym", focus: "aesthetics", daysPerWeek: 4 });
  for (const d of plan.weeks[0].sessions.flatMap((s) => s.drills)) {
    if (/kg/.test(d.intensity ?? "")) assert.fail(`${d.name} was given a weight with no max on file: ${d.intensity}`);
  }
});

test("the reason for a lift does not contradict itself", () => {
  // "Main lift for chest — a pressing movement that overloads the triceps" was
  // shipping: the slot label came from the group the engine filled and the
  // description from the exercise, and nothing checked they agreed.
  const plan = buildProgram({ goal: "strength", painMap: {}, sport: "gym", focus: "aesthetics", daysPerWeek: 4 });
  for (const d of plan.weeks[0].sessions.flatMap((s) => s.drills)) {
    const m = /^Main lift for (\w+)\./.exec(d.reason ?? "");
    if (!m) continue;
    const other = ["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "core"]
      .filter((g) => g !== m[1] && new RegExp(`overloads the ${g}`, "i").test(d.reason ?? ""));
    assert.deepEqual(other, [], `${d.name}: "${d.reason}"`);
  }
});

test("a block is built from the kit the athlete actually has", () => {
  /**
   * "The block can anchor on a barbell squat you have no barbell for." The
   * catalogue has carried an `equipment` field on every exercise since it was
   * imported, and nothing in the engine had ever looked at it.
   */
  const barbellish = /barbell|bench press|^dips$/i;
  const dumbbellOnly = buildProgram({
    painMap: {}, goal: "strength", sport: "gym", focus: "aesthetics", daysPerWeek: 4,
    notes: "I only have dumbbells at home",
  });
  const names = [...new Set(dumbbellOnly.weeks[1].sessions.flatMap((s) => s.drills.map((d) => d.name)))];
  const impossible = names.filter((n) => /^barbell |^bench press$|smith machine|leg press|cable/i.test(n));
  assert.deepEqual(impossible, [], `prescribed kit they said they do not have: ${impossible.join(", ")}`);
  assert.ok(names.some((n) => /dumbbell/i.test(n)), `no dumbbell work at all: ${names.join(", ")}`);

  // And with no notes the barbell lifts are still the backbone — the filter
  // must not quietly apply to everybody.
  const normal = buildProgram({ painMap: {}, goal: "strength", sport: "gym", focus: "aesthetics", daysPerWeek: 4 });
  const normalNames = normal.weeks[1].sessions.flatMap((s) => s.drills.map((d) => d.name));
  assert.ok(normalNames.some((n) => barbellish.test(n)), "the barbell lifts vanished for everybody");
});

test("a bodyweight-only block is still a block", () => {
  const plan = buildProgram({
    painMap: {}, goal: "strength", sport: "gym", focus: "aesthetics", daysPerWeek: 3,
    notes: "bodyweight only, no equipment",
  });
  for (const w of plan.weeks) {
    for (const s of w.sessions) {
      assert.ok(s.drills.length >= 4, `${s.title} came out with ${s.drills.length} exercises`);
    }
  }
  // Every muscle the block trains still reaches a dose that does something —
  // the equipment filter must not be allowed to hollow the week out.
  assert.deepEqual(auditWeek(plan.weeks[1]).neglected, []);
});

// =============================================================================
// A MUSCLE GROUP IS NOT ONE THING.
//
// The chest has an upper head an incline press loads and a flat bench barely
// touches. The hamstrings cross two joints, so a block of three hinges trains
// the hip end three times and the knee end not at all. Calves are the clearest
// case in the body: standing is gastrocnemius, seated is soleus, and neither
// substitutes for the other.
//
// The engine picked by muscle group and staple rank and could see none of it.
// =============================================================================

const regionsIn = (plan: ReturnType<typeof buildProgram>, group: Parameters<typeof regionOfMovement>[0]) => {
  const out = new Set<string>();
  for (const s of plan.weeks[1].sessions) {
    for (const d of s.drills) {
      if (muscleGroupForName(d.name) !== group) continue;
      const r = regionOfMovement(group, d.name);
      if (r) out.add(r);
    }
  }
  return out;
};

test("a muscle trained twice is trained from two angles", () => {
  const plan = buildProgram({ painMap: {}, goal: "strength", sport: "gym", focus: "aesthetics", daysPerWeek: 4 });
  for (const group of ["chest", "back", "shoulders", "hamstrings", "quads", "calves", "biceps", "triceps"] as const) {
    const count = plan.weeks[1].sessions
      .flatMap((s) => s.drills)
      .filter((d) => muscleGroupForName(d.name) === group).length;
    if (count < 2) continue;
    assert.ok(regionsIn(plan, group).size >= 2,
      `${group}: ${count} movements, all hitting the same part of it`);
  }
});

test("the coverage is shared across the block, not just within a day", () => {
  /**
   * Per-session memory got the chest right — flat, incline, decline, fly in one
   * day — and still put a standing calf raise on Tuesday and another standing
   * calf raise on Friday, never once loading the soleus. A muscle trained twice
   * a week is trained twice by the BLOCK, and the second day is exactly where
   * the other angle belongs.
   */
  const plan = buildProgram({ painMap: {}, goal: "strength", sport: "gym", focus: "aesthetics", daysPerWeek: 4 });
  const calves = regionsIn(plan, "calves");
  if (calves.size) {
    assert.ok(calves.has("soleus") && calves.has("gastroc"),
      `calves trained from: ${[...calves].join(", ")} — a seated raise is the only thing that loads the soleus`);
  }
});

test("hamstrings get both joints", () => {
  // The one with an injury attached: hamstring strain is the most common
  // non-contact injury in football, and a block of nothing but hinges trains
  // the hip end of the muscle three times over.
  const plan = buildProgram({ painMap: {}, goal: "strength", sport: "gym", focus: "aesthetics", daysPerWeek: 4 });
  const r = regionsIn(plan, "hamstrings");
  assert.ok(r.has("hip") && r.has("knee"), `hamstrings trained from: ${[...r].join(", ")}`);
});

test("it is a preference, never a reason to leave a slot empty", () => {
  // Where no fresh angle exists the original list must still stand.
  const plan = buildProgram({
    painMap: {}, goal: "strength", sport: "gym", focus: "aesthetics", daysPerWeek: 3,
    notes: "bodyweight only",
  });
  for (const w of plan.weeks) {
    for (const s of w.sessions) assert.ok(s.drills.length >= 4, `${s.title}: ${s.drills.length} exercises`);
  }
  assert.deepEqual(auditWeek(plan.weeks[1]).neglected, []);
});

test("an exercise the table does not know neither blocks nor is blocked", () => {
  assert.equal(regionOfMovement("glutes", "Barbell Hip Thrust"), null, "no claim is made about glutes");
  assert.equal(regionOfMovement("calves", "Seated Calf Raise"), "soleus");
  assert.equal(regionOfMovement("calves", "Standing Calf Raise"), "gastroc");
  assert.equal(regionOfMovement("chest", "Incline Bench Press"), "upper");
  assert.equal(regionOfMovement("hamstrings", "Romanian Deadlift"), "hip");
  assert.equal(regionOfMovement("hamstrings", "Lying Leg Curl"), "knee");
});
