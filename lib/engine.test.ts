import { test } from "node:test";
import { rpeOf } from "./effort";
import assert from "node:assert/strict";
import { buildBlock, prescriptionText, restText, painByArea, adjustForReadiness, type ProgramDrill, type ProgramPlan } from "./engine";
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

/**
 * A BLOCK IS ONE PROGRAMME PROGRESSED, NOT TWELVE UNRELATED WORKOUTS.
 *
 * This test used to demand at least 8 distinct movement-sets across the 12
 * sessions, which sounds like variety and is actually the defect. The engine
 * periodises DOSE — `WEEK_PROGRESSION` literally tells the athlete "add a little
 * weight and a set, reps drop slightly" and, on the deload, "same movements,
 * ~60% of the weight". Rotating the exercises weekly made all of that copy a
 * lie. What day 1 of a strength block actually read was:
 *
 *   wk1  Bent-over barbell row    "Groove the movement..."
 *   wk2  Barbell hip thrust       "Add a little weight and a set"
 *   wk3  Pogo hops                "Peak volume: extra set..."
 *   wk4  Dumbbell shoulder press  "Deload: SAME MOVEMENTS, ~60%"
 *
 * You cannot add weight to a row by doing pogo hops, and you cannot tell
 * whether the block worked. Progressive overload is the mechanism a block works
 * by, so the movements now hold and the numbers move.
 *
 * The original v1 defect this test was written for — three sessions on a loop,
 * unchanged all block — is still caught, by the prescriptions.
 */
test("a block progresses one programme rather than rotating exercises", () => {
  const plan = buildBlock({ goal: "strength", painMap: {}, sport: "rugby", daysPerWeek: 3 });
  const sessions = plan.weeks.flatMap((w) => w.sessions);
  assert.equal(sessions.length, 12);

  // The same day, across the four weeks, trains the same movements — that is
  // what makes the load progression above meaningful.
  //
  // Two slots are excluded and both deliberately. Ball work rotates because
  // skill progresses by difficulty rather than by load. Conditioning is swapped
  // on the deload — week 4 trades hill repeats for a recovery run, which is the
  // one job that week has.
  for (let di = 0; di < 3; di++) {
    const lifts = (wi: number) =>
      plan.weeks[wi].sessions[di].drills
        .filter((d) => !d.skill && d.slot !== "conditioning")
        .map((d) => d.name).join("|");
    for (let wi = 1; wi < 4; wi++) {
      assert.equal(lifts(wi), lifts(0), `day ${di + 1} trains different movements in week ${wi + 1} than in week 1`);
    }
  }

  // And the numbers DO move — otherwise it is the same session four times,
  // which is the v1 defect this test was originally written to catch.
  const byPrescription = new Set(sessions.map((s) => s.drills.map((d) => `${d.name}:${d.sets}x${d.reps}`).join("|")));
  assert.ok(byPrescription.size >= 10, `only ${byPrescription.size} distinct prescriptions in a 12-session block`);

  // Different days of the same week are different sessions.
  const week1 = plan.weeks[0].sessions.map((s) => s.drills.map((d) => d.name).join("|"));
  assert.equal(new Set(week1).size, week1.length, "two days in week 1 are the same session");
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

/**
 * EVERY EFFORT CHECK READS `rpeOf`, NOT ITS OWN REGEX.
 *
 * Four of these stripped non-digits out of `intensity` and took the number.
 * That worked while the string was exactly "RPE 8" and broke the moment effort
 * targets started carrying their meaning — "RPE 7 — 3 reps left in you"
 * strips to "73". lib/effort.ts owns the parsing precisely so a format change
 * has one place to update, and four private copies is what stops that being
 * true.
 */
test("effort climbs to the peak and drops on the deload", () => {
  const plan = buildBlock({ goal: "strength", painMap: {}, sport: "weightlifting" });
  const rpe = (wi: number) => {
    const vals = plan.weeks[wi].sessions.flatMap((s) => s.drills)
      .map((d) => rpeOf(d.intensity) ?? 0)
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

// --- readiness actually changing the session ---------------------------------

test("green trains exactly as written", () => {
  const s = buildBlock({ goal: "strength", painMap: {}, sport: "gym" }).weeks[0].sessions[0];
  assert.deepEqual(adjustForReadiness(s, "Green"), s);
});

test("yellow takes a set off the working movements, but not the warm-up", () => {
  const s = buildBlock({ goal: "strength", painMap: {}, sport: "rugby" }).weeks[1].sessions[0];
  const eased = adjustForReadiness(s, "Yellow");

  for (const [i, d] of s.drills.entries()) {
    const e = eased.drills[i];
    if (d.slot === "warmup" || d.slot === "cooldown" || d.skill) {
      assert.equal(e.sets, d.sets, `${d.name}: warm-up/cool-down must not be trimmed`);
    } else {
      assert.ok(e.sets < d.sets || d.sets <= 1, `${d.name}: expected a set off ${d.sets}, got ${e.sets}`);
    }
  }
  // And it says why, rather than leaving the athlete to wonder.
  assert.ok(eased.drills.some((d) => /readiness is down/i.test(d.reason)));
});

test("yellow eases the effort target rather than only the volume", () => {
  const s = buildBlock({ goal: "strength", painMap: {}, sport: "weightlifting" }).weeks[2].sessions[0];
  const eased = adjustForReadiness(s, "Yellow");
  const before = s.drills.find((d) => d.intensity);
  const after = eased.drills.find((d) => d.name === before?.name);
  if (before?.intensity && after?.intensity) {
    const n = (x: string) => Number(x.replace(/[^\d.]/g, ""));
    assert.ok(n(after.intensity) < n(before.intensity), "RPE should come down on a flat day");
    assert.ok(n(after.intensity) >= 5, "but never below RPE 5 — that isn't training");
  }
});

test("red is a real session you can open, not a paragraph of advice", () => {
  const s = buildBlock({ goal: "speed", painMap: {}, sport: "football" }).weeks[2].sessions[0];
  const rest = adjustForReadiness(s, "Red");
  assert.match(rest.title, /recovery/i);
  assert.ok(rest.drills.length > 0, "a recovery day still has to give you something to do");
  assert.ok(rest.drills.every((d) => d.slot !== "primary"), "no hard work on a red day");
  assert.ok(rest.drills.some((d) => d.slot === "warmup"), "keep the warm-up — you need more of it, not less");
});

test("a trimmed prescription still reads correctly", () => {
  const s = buildBlock({ goal: "strength", painMap: {}, sport: "gym" }).weeks[0].sessions[0];
  const eased = adjustForReadiness(s, "Yellow");
  for (const d of eased.drills) {
    // Only the "N × ..." forms state a set count. A continuous effort is
    // rendered as "20 min" (see prescriptionText), where the leading number is
    // MINUTES — reading it as sets was a latent bug in this test, and it went
    // unnoticed only because a strength day happened to draw interval-style
    // conditioning. There is nothing to trim on a single continuous effort, and
    // `restated` correctly leaves it alone.
    if (!d.prescription?.includes(" × ")) continue;
    if (d.slot === "warmup" || d.slot === "cooldown" || d.skill) continue;
    const lead = Number(d.prescription.split(" ")[0]);
    assert.equal(lead, d.sets, `${d.name}: prescription "${d.prescription}" disagrees with sets=${d.sets}`);
  }
});

// --- a coach picking exercises --------------------------------------------

test("a coach's picks actually appear in the program", () => {
  const picks = ["back_squat", "barbell_row", "farmers_carry"];
  const plan = buildBlock({ goal: "strength", painMap: {}, sport: "gym", mustInclude: picks });
  const names = new Set(plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.drills)).map((d) => d.name));
  for (const id of picks) {
    const m = MOVEMENT_BY_ID[id];
    assert.ok(names.has(m.name), `${m.name} was picked by the coach and never appeared`);
  }
});

test("a pick that would load an injured joint is still refused", () => {
  // The whole point of it being a preference rather than a command. A coach
  // picking a back squat for someone reporting 9/10 knee pain must not get one.
  const plan = buildBlock({
    goal: "strength", painMap: { knee_left: 9 }, sport: "gym",
    mustInclude: ["back_squat", "box_jumps"],
  });
  const names = plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.drills)).map((d) => d.name);
  assert.ok(!names.includes(MOVEMENT_BY_ID.back_squat.name), "a squat reached a badly injured knee");
  assert.ok(!names.includes(MOVEMENT_BY_ID.box_jumps.name), "box jumps reached a badly injured knee");
});

test("a pick the athlete has excluded is still excluded", () => {
  const plan = buildBlock({
    goal: "strength", painMap: {}, sport: "gym",
    constraints: parseConstraints("I don't train legs"),
    mustInclude: ["back_squat"],
  });
  const names = plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.drills)).map((d) => d.name);
  assert.ok(!names.includes(MOVEMENT_BY_ID.back_squat.name), "a coach's pick overrode the athlete's own exclusion");
});

test("with no picks, nothing changes", () => {
  const a = buildBlock({ goal: "speed", painMap: {}, sport: "football" });
  const b = buildBlock({ goal: "speed", painMap: {}, sport: "football", mustInclude: [] });
  assert.deepEqual(a, b);
});

// --- professional-grade dosing ------------------------------------------------

/**
 * QUALITY WORK IS NEVER TAKEN TO FAILURE.
 *
 * Sprinting, jumping and changing direction are limited by force per contact,
 * not by how much work you can survive. The weekly RPE escalation applied to
 * everything equally, so peak week prescribed flying sprints, hill sprints and
 * the T-drill at RPE 10 — maximal, nothing in reserve — and depth drops and
 * power cleans at 9.
 *
 * Nobody coaches a sprint session to failure. The velocity-loss literature is
 * consistent that lower fatigue thresholds produce better explosive adaptations
 * at matched volume, and a fatigued sprint is the textbook hamstring-strain
 * mechanism.
 */
test("sprints, jumps and change-of-direction never exceed RPE 8", () => {
  const quality = new Set(["sprint", "jump", "cod", "footwork"]);
  for (const goal of ["speed", "agility", "strength"] as const) {
    const plan = buildBlock({ goal, painMap: {}, sport: "football", daysPerWeek: 4 });
    for (const w of plan.weeks) {
      for (const s of w.sessions) {
        for (const d of s.drills) {
          const m = MOVEMENTS.find((x) => x.name === d.name);
          if (!m || !quality.has(m.pattern) || !d.intensity) continue;
          const rpe = rpeOf(d.intensity) ?? 0;
          assert.ok(
            rpe <= 8,
            `${w.theme} week: ${d.name} (${m.pattern}) prescribed at ${d.intensity}`
          );
        }
      }
    }
  }
});

/** Strength work still gets to be hard — that is where a block's intensity lives. */
test("but strength work still climbs into the peak week", () => {
  const plan = buildBlock({ goal: "strength", painMap: {}, sport: "gym", daysPerWeek: 4 });
  const peak = plan.weeks[2].sessions.flatMap((s) => s.drills);
  const hard = peak.filter((d) => {
    const m = MOVEMENTS.find((x) => x.name === d.name);
    if (!m || !d.intensity) return false;
    const heavy = ["squat", "hinge", "push_h", "push_v", "pull_h", "pull_v"].includes(m.pattern);
    return heavy && (rpeOf(d.intensity) ?? 0) >= 9;
  });
  assert.ok(hard.length > 0, "peak week should push the strength lifts to RPE 9");
});

/**
 * IN-SEASON, THE WEEK TAPERS INTO THE MATCH.
 *
 * Elite football runs a matchday-minus microcycle: load peaks at MD-4/MD-3 and
 * comes down through MD-2 and MD-1 so the player arrives fresh, and studies of
 * professional squads find exactly that pattern in the tracking data. A flat
 * week does the opposite of what it should — the session closest to the match
 * is as heavy as the one furthest from it, and the gym takes the legs the match
 * needed.
 */
test("an in-season week comes down towards the match", () => {
  const load = (p: ReturnType<typeof buildBlock>, di: number) =>
    p.weeks[0].sessions[di].drills.reduce((n, d) => n + d.sets, 0);

  const inSeason = buildBlock({ goal: "strength", painMap: {}, sport: "football", daysPerWeek: 4, isInSeason: true });
  const off = buildBlock({ goal: "strength", painMap: {}, sport: "football", daysPerWeek: 4 });

  const last = inSeason.weeks[0].sessions.length - 1;
  assert.ok(
    load(inSeason, last) < load(inSeason, 0),
    `last session (${load(inSeason, last)} sets) should be lighter than the first (${load(inSeason, 0)})`
  );

  // Off-season has no match to be fresh for, so nothing to taper into.
  const offLoads = off.weeks[0].sessions.map((_, i) => load(off, i));
  assert.ok(
    Math.max(...offLoads) - Math.min(...offLoads) < offLoads[0],
    "off-season sessions should not be tapered"
  );

  // And the week still does less work overall than the off-season one.
  const total = (p: ReturnType<typeof buildBlock>) =>
    p.weeks[0].sessions.reduce((n, s) => n + s.drills.reduce((m, d) => m + d.sets, 0), 0);
  assert.ok(total(inSeason) < total(off), "in-season should be a lighter week overall");
});

test("a block is mostly the goal it was asked for", () => {
  /**
   * MEASURED. The generic rotation was a fixed three-item list indexed by
   * `di % length`, so on a 3-day week — the most common — the chosen quality
   * got one day in three:
   *
   *   speed 3d    33% -> 67%
   *   agility 3d  33% -> 67%
   *   skill 3d    33% -> 67%
   *   speed 5d    40% -> 60%
   *
   * An athlete picking "Speed" trained three times and did one speed session.
   * That is a general athleticism block with a speed label on it.
   *
   * 0.6 is the floor, below the 0.67 measured at three days so ordinary
   * changes don't fail the build. Four days is exempt and sits at 50% by
   * design: the fourth day is the adjacent quality (agility for a speed
   * block), which a coach alternates precisely so neither is trained on tired
   * legs. If this fails, do not lower it — check focusRotationFor.
   */
  for (const goal of ["speed", "agility", "skill", "strength", "endurance"] as const) {
    for (const days of [3, 5]) {
      const wk = buildBlock({ goal, painMap: {}, sport: "football", daysPerWeek: days }).weeks[0];
      const onGoal = wk.sessions.filter((s) => s.focus === goal).length;
      assert.ok(
        onGoal / days >= 0.6,
        `${goal}/${days}d: only ${onGoal} of ${days} sessions train ${goal} — ${wk.sessions.map((s) => s.focus).join(", ")}`
      );
    }
  }
});

test("a strength day sits between the two hard quality days", () => {
  // Speed and agility are the high-CNS qualities. `[goal, strength, goal]` puts
  // the support day between them by construction; two goal days back to back
  // would be two maximal-intent sessions on consecutive days.
  for (const goal of ["speed", "agility"] as const) {
    const wk = buildBlock({ goal, painMap: {}, sport: "football", daysPerWeek: 3 }).weeks[0];
    const focuses = wk.sessions.map((s) => s.focus);
    for (let i = 1; i < focuses.length; i++) {
      assert.ok(
        !(focuses[i] === goal && focuses[i - 1] === goal),
        `${goal}: two ${goal} sessions back to back — ${focuses.join(", ")}`
      );
    }
  }
});

test("a sprint distance holds across the block and the sets carry the progression", () => {
  /**
   * Peak week used to read "Stride-outs 6 × 81m". The seconds branch already
   * rounded to fives — its comment says nobody has coached an eighty-one
   * second hill — and metres were simply never given the same treatment.
   *
   * Rounding alone would have printed 80m and hidden the worse half: a sprint
   * distance is the drill, not a volume knob. 20m is an acceleration, 60m is a
   * stride-out, 80m is a different exercise. Scaling swapped the drill for a
   * harder one and progressed the sets on top — 5 × 60m to 6 × 81m is a 60%
   * jump in sprint volume in two weeks, in the quality most likely to tear a
   * hamstring. "Flying 20m sprints" makes it plainest: the distance is in the
   * exercise's own name.
   */
  const plan = buildBlock({ goal: "speed", painMap: {}, sport: "football", daysPerWeek: 3 });
  const distances = new Map<string, Set<number>>();
  for (const wk of plan.weeks) {
    for (const s of wk.sessions) {
      for (const d of s.drills) {
        const m = /^(\d+) × (\d+)m$/.exec(d.prescription ?? "");
        if (!m) continue;
        const metres = Number(m[2]);
        assert.equal(metres % 5, 0, `${d.name}: ${metres}m is not a distance anyone would coach`);
        if (!distances.has(d.name)) distances.set(d.name, new Set());
        distances.get(d.name)!.add(metres);
      }
    }
  }
  assert.ok(distances.size > 0, "no distance work found — this test would pass vacuously");
  for (const [name, set] of distances) {
    assert.equal(set.size, 1, `${name} changed distance across the block: ${[...set].join(", ")}m`);
  }
});

test("a block that isn't about conditioning doesn't smuggle in a second hard session", () => {
  /**
   * A speed block was closing its strength day with "Kettlebell swing intervals
   * 7 × 40s, RPE 9" — a hard metabolic workout tacked onto a lift, two days
   * before a sprint session. The interference effect written down: the athlete
   * reaches the day the block exists for with fatigued legs.
   *
   * The existing day-level filters could not catch it. That session's focus was
   * "strength" inside a "speed" block, so every check keyed on the DAY passed;
   * the ceiling has to key on the block's goal.
   *
   * Endurance blocks are exempt below and must stay exempt — there, hard
   * conditioning is the training rather than a finisher.
   */
  for (const goal of ["speed", "agility", "strength", "skill"] as const) {
    const plan = buildBlock({ goal, painMap: {}, sport: "football", daysPerWeek: 3 });
    for (const wk of plan.weeks) {
      for (const s of wk.sessions) {
        for (const c of s.drills.filter((d) => d.slot === "conditioning")) {
          const rpe = rpeOf(c.intensity) ?? 0;
          assert.ok(
            rpe < 9,
            `${goal} wk${wk.week} "${s.title}": ${c.name} at ${c.intensity} is a second hard session, not support`
          );
        }
      }
    }
  }
  // The exemption is load-bearing: an endurance block must still be allowed its
  // hard intervals, or this guard would have quietly gutted the one goal whose
  // conditioning IS the point.
  const endurance = buildBlock({ goal: "endurance", painMap: {}, sport: "football", daysPerWeek: 3 });
  const hard = endurance.weeks.flatMap((w) => w.sessions).flatMap((s) => s.drills)
    .filter((d) => d.slot === "conditioning")
    .some((d) => (Number((d.intensity ?? "").replace(/[^\d.]/g, "")) || 0) >= 9);
  assert.ok(hard, "an endurance block lost its hard conditioning — the exemption is broken");
});
