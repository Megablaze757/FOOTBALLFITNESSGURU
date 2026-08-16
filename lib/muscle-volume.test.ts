import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProgram } from "./coach";
import { buildBlock } from "./engine";
import { MOVEMENT_BY_ID } from "./movements";
import {
  weeklyMuscleVolume, musclesOf, auditWeek, verdictFor, LANDMARKS, MUSCLE_LABEL,
  type MuscleGroup,
} from "./muscle-volume";
import { loggedWeeklySets, volumeAdvice } from "./muscle-volume";

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
  // Below the PRODUCTIVE floor, not below maintenance: the captions have always
  // said the productive band starts at 10, and this used to call anything from
  // 6 upwards productive — so a holding dose was reported as a building one.
  assert.equal(verdictFor(LANDMARKS.productiveLow - 1), "maintenance");
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
test("a sprinting sport's block contains real hamstring and calf work", () => {
  /**
   * ACROSS EVERY DAY COUNT, not just the convenient one.
   *
   * This test used to check 4 days only, and that gap let a regression through:
   * widening the speed blueprint by one accessory slot shifted the rotation,
   * the Nordic curl vanished, and a 3-DAY speed block went to zero hamstring
   * sets while the test stayed green. A scoring bonus can always be rotated
   * out — SPRINT_ESSENTIALS are taken before the rotation for that reason.
   */
  for (const sport of ["football", "rugby"] as const) {
    for (const goal of ["speed", "strength", "agility"] as const) {
      for (const days of [2, 3, 4, 5]) {
        const audit = auditWeek(wk({ goal, daysPerWeek: days, sport, focus: "performance" }));
        assert.ok(
          audit.volume.hamstrings > 0,
          `${sport}/${goal} ${days}d: not one hamstring set in the week`
        );
        // Football is a series of achilles loads. Calves were sitting at 1.3
        // sets a week — below anything worth calling training.
        assert.ok(
          audit.volume.calves > 0,
          `${sport}/${goal} ${days}d: not one calf set in the week`
        );
      }
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

test("a three-day sprint week is not short of hamstring work", () => {
  /**
   * MEASURED, and the number is the point.
   *
   * The sprint essentials used to be a fixed two-item list spread round-robin
   * across the week, so a 3-day athlete got a Nordic on one day, calves on
   * another and nothing posterior on the third. Quad volume does not move with
   * frequency — squats and jumps are in every session — so the imbalance got
   * WORSE the fewer days you trained, which is backwards: three days a week is
   * the busy semi-pro this app is for, not an edge case.
   *
   * Peak-week hamstring:quad, before -> after:
   *   football/speed/3d    0.31 -> 0.62
   *   rugby/speed/3d       0.29 -> 0.82
   *   basketball/speed/3d  0.31 -> 0.62
   *
   * 0.5 is the floor asserted here, deliberately below the 0.62 measured, so
   * ordinary selection churn doesn't fail the build. Drop below it and a
   * sprinting athlete is accumulating quad volume against a hamstring that
   * isn't keeping up — which is the injury this whole path exists to prevent.
   * If this fails, do not lower the threshold: find what stopped the essentials
   * reaching every session.
   */
  for (const sport of ["football", "rugby", "basketball"] as const) {
    const week = buildBlock({ goal: "speed", painMap: {}, sport, daysPerWeek: 3 }).weeks[2];
    const v = weeklyMuscleVolume(week);
    assert.ok(
      v.hamstrings / v.quads >= 0.5,
      `${sport}: ${v.hamstrings} hamstring sets against ${v.quads} quad — ratio ${(v.hamstrings / v.quads).toFixed(2)}`
    );
  }
});

test("every session in a sprint week carries posterior-chain work", () => {
  // The mechanism behind the ratio above: `pi % days === di` gives each day one
  // guaranteed essential only when the list is as long as the week. A shorter
  // list silently leaves the last sessions with none.
  //
  // HONEST LIMIT: this one does NOT fail against the old two-item list — I
  // checked. With three days, two forced essentials cover two sessions and the
  // scoring bonus usually wins the third anyway, so the old code passes this
  // while still producing a 0.31 ratio. The test above is the guard that bites;
  // this pins the weaker, still-worth-having invariant that no session in a
  // sprint week comes out with nothing for the posterior chain at all.
  //
  // Asserted through weeklyMuscleVolume rather than against a list of movement
  // ids: drills carry names, not ids, and a hand-written id list would be one
  // catalogue rename away from passing while measuring nothing.
  const week = buildBlock({ goal: "speed", painMap: {}, sport: "football", daysPerWeek: 3 }).weeks[2];
  for (const s of week.sessions) {
    const v = weeklyMuscleVolume({ ...week, sessions: [s] });
    assert.ok(
      v.hamstrings + v.calves > 0,
      `session "${s.title}" has no hamstring or calf work: ${s.drills.map((d) => d.name).join(", ")}`
    );
  }
});

// --- what was actually done --------------------------------------------------

/**
 * THE NUMBER THAT DRIVES A DECISION IS THE ONE ABOUT WHAT HAPPENED.
 *
 * Everything else in this file audits a programme — what the engine intends to
 * prescribe. Nobody trains their plan exactly, and a rank without the volume
 * behind it is a scoreboard: "chest: Novice" says where you are and "chest: 4
 * sets a week" says why, and only the pair tells anybody what to change.
 */
test("weekly sets come out of the log, averaged not totalled", () => {
  const logs = [
    { log_date: "2026-01-01", drills: [{ name: "Bench Press", sets: 4, reps: 5 }] },
    { log_date: "2026-01-08", drills: [{ name: "bench press", sets: 4, reps: 5 }] },
    { log_date: "2026-01-15", drills: [{ name: "Back Squat", sets: 5, reps: 5 }] },
  ];
  const sets = loggedWeeklySets(logs, 28);
  // 8 bench sets over 4 weeks is 2 a week — a 28-day TOTAL would read four
  // times too high against landmarks that are all expressed per week.
  assert.equal(sets.chest, 2);
  // A squat is quad volume AND glute volume — full credit to each primary
  // mover, the same way the programme auditor counts them. And "Back Squat"
  // resolves through the lift standards, because the hypertrophy catalogue has
  // never heard of it.
  // 5 sets over 4 weeks, rounded to one decimal for display.
  assert.equal(sets.quads, 1.3);
  assert.equal(sets.glutes, 1.3);
  // Free-text casing must not split one exercise into two.
  assert.ok(sets.chest !== undefined, "'Bench Press' and 'bench press' counted separately");
});

test("a drill the catalogue does not know trains nothing, rather than everything", () => {
  const sets = loggedWeeklySets([{ log_date: "2026-01-01", drills: [{ name: "Wobble board", sets: 3, reps: 10 }] }], 28);
  assert.deepEqual(sets, {});
  assert.deepEqual(loggedWeeklySets(null, 28), {});
  assert.deepEqual(loggedWeeklySets([], 0), {}, "a zero-day window must not divide by zero");
});

test("the advice says what the number means, not what the literature calls it", () => {
  assert.match(volumeAdvice(0), /nothing logged/);
  assert.match(volumeAdvice(3), /hold what you have/);
  assert.match(volumeAdvice(14), /productive/);
  assert.match(volumeAdvice(30), /recovery is the limit/);
  // Each verdict has to produce a distinct sentence, or the panel says the same
  // thing about doing too little and doing too much.
  const said = new Set([0, 3, 14, 30].map(volumeAdvice));
  assert.equal(said.size, 4);
});

// =============================================================================
// THE PLAN AND THE AUDIT HAVE TO AGREE.
//
// The app used to contain a straight contradiction. One half built a week; the
// other half measured it and reported that it neglected muscles it was
// training. Both halves shipped, both were shown to the athlete, and nothing
// reconciled them — the athlete's own words were "it says it itself the engine
// isn't doing its job."
//
// Measured before the fix, across every sport x goal x focus x day count the
// product can produce: 887 of 1044 generated weeks flagged. The two causes were
// separate and both real — the counting was wrong (assisting movers scored
// zero for the bodybuilding catalogue, so a push day scored no triceps at all)
// AND the dose was wrong (a muscle given one exercise at three sets a week).
//
// These sweep the whole surface rather than sampling it, because sampling is
// how it stayed broken: the cases anybody thought to write down were the ones
// that already worked.
// =============================================================================

import { goalsForSport } from "./coach";
import { SPORTS } from "./exercises";
import { balanceWeeklyVolume, volumeBreakdown } from "./muscle-volume";
import { musclesForName } from "./hypertrophy";
import { exerciseMuscles } from "./muscle-volume";
import { EXERCISES } from "./exercises";

const FOCI = ["performance", "aesthetics", "injury_recovery"] as const;

/** Every block the product can build, one entry per week. */
function everyGeneratedWeek(): { label: string; week: ReturnType<typeof wk> }[] {
  const out: { label: string; week: ReturnType<typeof wk> }[] = [];
  for (const { id: sport } of SPORTS) {
    for (const focus of FOCI) {
      for (const g of goalsForSport(sport)) {
        for (const daysPerWeek of [3, 4, 5]) {
          const plan = buildProgram({ painMap: {}, goal: g.id, sport, focus, daysPerWeek } as never);
          for (const week of plan.weeks) {
            out.push({ label: `${sport}/${g.id}/${focus}/${daysPerWeek}d wk${week.week}`, week });
          }
        }
      }
    }
  }
  return out;
}

test("no generated week trains a muscle at a dose too small to do anything", () => {
  const failures: string[] = [];
  for (const { label, week } of everyGeneratedWeek()) {
    const audit = auditWeek(week);
    if (audit.neglected.length) {
      failures.push(`${label}: ${audit.neglected.map((g) => `${g} ${audit.volume[g]}`).join(", ")}`);
    }
  }
  assert.deepEqual(
    failures.slice(0, 10), [],
    `${failures.length} generated weeks train a muscle below maintenance — the plan contradicting the audit`,
  );
});

test("and none goes past what the evidence says can be recovered from", () => {
  // The opposite fault, and the one that correcting the floor introduced:
  // once assisting movers were counted properly, an aesthetics peak week put
  // shoulders and triceps at 28 weekly sets. A muscle can be over-trained by
  // accident by exactly the mechanism that under-trained it — nobody counting.
  const failures: string[] = [];
  for (const { label, week } of everyGeneratedWeek()) {
    const audit = auditWeek(week);
    if (audit.excessive.length) {
      failures.push(`${label}: ${audit.excessive.map((g) => `${g} ${audit.volume[g]}`).join(", ")}`);
    }
  }
  assert.deepEqual(failures.slice(0, 10), [], `${failures.length} weeks exceed the excessive landmark`);
});

test("the sweep is real, not an empty loop", () => {
  // Two assertions above pass trivially if everyGeneratedWeek() returns nothing,
  // which is precisely how a green suite ends up meaning nothing.
  const weeks = everyGeneratedWeek();
  assert.ok(weeks.length > 500, `only ${weeks.length} weeks swept`);
  assert.ok(
    weeks.some(({ week }) => (Object.keys(volumeBreakdown(week).direct) as MuscleGroup[])
      .some((g) => volumeBreakdown(week).direct[g] > 0)),
    "no week trains anything at all — the counting has broken, not the plans",
  );
});

test("a muscle that only ever assists is not called neglected", () => {
  /**
   * A footballer's speed block prescribes rows and chin-ups and no curls. The
   * biceps pick up four sets of assistance a week: that is neither a plan to
   * build them nor an oversight, it is what happens to your arms when you pull
   * heavy things. Calling it neglect flagged 192 of 216 weeks — a warning
   * nobody can act on, which is a warning everybody learns to ignore.
   */
  const week = wk({ goal: "speed", daysPerWeek: 4, sport: "football", focus: "performance" });
  const { total, direct } = volumeBreakdown(week);
  const audit = auditWeek(week);
  for (const g of Object.keys(total) as MuscleGroup[]) {
    if (direct[g] === 0 && total[g] > 0) {
      assert.ok(!audit.neglected.includes(g), `${g} assists only (${total[g]} sets) and was called neglected`);
    }
  }
});

test("balancing only ever changes set counts, never the exercises", () => {
  // The line this correction must not cross. Choosing movements is the engine's
  // job: a pass that started adding or dropping exercises to hit a number would
  // be a second, invisible engine disagreeing with the first.
  const before = wk({ goal: "strength", daysPerWeek: 4, sport: "football", focus: "performance" }, 0);
  const after = balanceWeeklyVolume(before);
  assert.deepEqual(
    after.sessions.map((s) => s.drills.map((d) => d.name)),
    before.sessions.map((s) => s.drills.map((d) => d.name)),
  );
  assert.deepEqual(after.sessions.map((s) => s.title), before.sessions.map((s) => s.title));
});

test("balancing does not mutate the week it was given", () => {
  // A built plan is handed to React and to the database. Mutating in place would
  // change a program object somebody else is already holding.
  const week = wk({ goal: "strength", daysPerWeek: 4, sport: "gym", focus: "aesthetics" }, 0);
  const setsBefore = week.sessions.map((s) => s.drills.map((d) => d.sets));
  balanceWeeklyVolume(week);
  assert.deepEqual(week.sessions.map((s) => s.drills.map((d) => d.sets)), setsBefore);
});

test("a bodybuilding push day counts its triceps and front delts", () => {
  /**
   * THE COUNTING BUG UNDERNEATH HALF OF THIS.
   *
   * Every exercise in the imported gym catalogue carries exactly one muscle
   * label — "Bench Press" is Chest, full stop. So a push day of bench, incline
   * press and dips scored twelve chest sets and ZERO for triceps or shoulders,
   * and the audit then reported "triceps: 3" (the pushdowns alone) to somebody
   * who had just done three heavy pressing movements.
   */
  const week = {
    week: 1, theme: "Base", intensity: "Moderate", focusNote: "",
    sessions: [{
      day: 1, title: "Push", focus: "strength" as const,
      drills: [
        { name: "Bench Press", sets: 4, reps: 8, cue: "", reason: "" },
        { name: "Incline Bench Press", sets: 4, reps: 8, cue: "", reason: "" },
      ],
    }],
  };
  const v = weeklyMuscleVolume(week);
  assert.equal(v.chest, 8, "the primary mover is counted in full");
  assert.equal(v.triceps, 4, "eight pressing sets is four triceps sets at half credit");
  assert.equal(v.shoulders, 4, "and four for the front delts");
});

test("where the catalogue and the pattern disagree, the catalogue wins", () => {
  /**
   * "Dips" is filed under Triceps in the curated catalogue, and the pressing
   * pattern would call it a chest movement. The catalogue is data somebody
   * chose; the pattern is a regex over a name. It still picks up chest and
   * shoulders as assistance, so nothing is lost — only the lead changes.
   */
  assert.deepEqual(musclesForName("Dips"), ["triceps", "shoulders", "chest"]);
  assert.deepEqual(musclesForName("Bench Press"), ["chest", "triceps", "shoulders"]);
  // An exercise no rule matches keeps the catalogue's single group, so adding
  // this table cannot have changed what was already counted.
  assert.deepEqual(musclesForName("Cable Fly"), ["chest"]);
});

test("a loaded calf raise is not discounted like a banded walk", () => {
  // `rehab` is a slot, not a description of the load. Three sets of twelve
  // standing calf raises is exactly what a bodybuilder does for calves;
  // halving it because of where it sits in the session was the accounting
  // rather than the programme.
  const drill = (name: string) => ({
    week: 1, theme: "Base", intensity: "Moderate", focusNote: "",
    sessions: [{ day: 1, title: "x", focus: "strength" as const,
      drills: [{ name, sets: 4, reps: 12, cue: "", reason: "" }] }],
  });
  assert.equal(weeklyMuscleVolume(drill(MOVEMENT_BY_ID.calf_raise.name)).calves, 4);
  // …and the genuinely low-load work keeps the discount it was given for.
  assert.equal(weeklyMuscleVolume(drill(MOVEMENT_BY_ID.band_lateral_walk.name)).glutes, 2);
});

test("a block says up front what it cannot deliver", () => {
  /**
   * The floor is guaranteed now, but maintenance is not what somebody asking to
   * build muscle wants — and on three days across ten muscle groups the
   * arithmetic does not reach the productive band for all of them: three
   * sessions is about 84 working sets where the band would want 110.
   *
   * That is a fact about the week, not a fault in the engine. What was
   * unacceptable was WHERE the athlete found out: the progress page measured the
   * same block and reported the shortfall days later, which reads as the app
   * contradicting itself.
   */
  const three = buildProgram({ painMap: {}, goal: "strength", sport: "gym", focus: "aesthetics", daysPerWeek: 3 } as never);
  const note = three.constraints.find((c) => /sets a week that builds fastest/.test(c));
  assert.ok(note, `a 3-day block promises the productive band silently: ${three.constraints.join(" | ")}`);
  assert.match(note!, /3 days a week/);
  assert.match(note!, /Adding a training day/, "the one change that actually moves it is not offered");

  // And the muscles it names are the ones actually short, not a guess from the
  // day count — a sentence naming the wrong muscles is worse than no sentence.
  const audit = auditWeek(three.weeks[1]);
  const short = (Object.keys(audit.volume) as MuscleGroup[])
    .filter((g) => volumeBreakdown(three.weeks[1]).direct[g] > 0 && audit.volume[g] < LANDMARKS.productiveLow);
  for (const g of short) assert.match(note!, new RegExp(g, "i"), `${g} is short and unnamed`);
});

test("it does not tell a six-day athlete to add a seventh day", () => {
  // Advice has to fit the week it is given about. At six days there is no day
  // to add, and the shortfall is a deliberate trade rather than a gap.
  const six = buildProgram({ painMap: {}, goal: "strength", sport: "gym", focus: "aesthetics", daysPerWeek: 6 } as never);
  const note = six.constraints.find((c) => /sets a week that builds fastest/.test(c));
  if (note) assert.ok(!/Adding a training day/.test(note), `told a 6-day athlete to add a day: ${note}`);
});

test("a block that reaches the band everywhere says nothing", () => {
  // Advice that appears on every plan is advice people stop reading.
  const perf = buildProgram({ painMap: {}, goal: "speed", sport: "football", focus: "performance", daysPerWeek: 4 } as never);
  assert.ok(
    !perf.constraints.some((c) => /sets a week that builds fastest/.test(c)),
    "a performance block is being lectured about hypertrophy volume it never promised",
  );
});

// =============================================================================
// "ALL THE PROGRAMS I'VE TRIED BUILD ARE JUST MAINTENANCE."
//
// Two causes, both measured. The floor the engine guaranteed was MAINTENANCE —
// six weekly sets, the dose that holds what you already have — for every block
// the app builds, including ones somebody asked to build them something. And
// verdictFor called anything at or above six "productive" while every caption
// says the productive band starts at ten, so 53% of trained muscles sat below
// the band with the app telling the athlete they were in it.
// =============================================================================

test("the word on the bar means the band the caption describes", () => {
  // Seven sets is a holding dose. Calling it productive was the app marking
  // its own homework.
  assert.equal(verdictFor(LANDMARKS.productiveLow - 1), "maintenance");
  assert.equal(verdictFor(LANDMARKS.productiveLow), "productive");
  assert.equal(verdictFor(LANDMARKS.excessive), "productive");
  assert.equal(verdictFor(LANDMARKS.excessive + 1), "excessive");
  assert.equal(verdictFor(0), "untrained");
});

test("an out-of-season block trains its muscles to build, not to hold", () => {
  /**
   * THE COMPLAINT: "all the programs I've tried build are just maintenance,
   * which is not what a customer wants." They were right. The floor the engine
   * guaranteed was six weekly sets — the dose that HOLDS what you have — for
   * every block it builds, and 53% of trained muscles sat below the band the
   * app's own captions describe.
   *
   * Judged only on muscles the block prescribes work FOR. What a muscle picks
   * up assisting is not a promise the block made.
   */
  let inBand = 0, trained = 0;
  const short: string[] = [];
  for (const sport of ["football", "rugby", "gym", "basketball"] as const) {
    for (const daysPerWeek of [3, 4, 5]) {
      const week = buildProgram({ painMap: {}, goal: "strength", sport, focus: "performance", daysPerWeek } as never).weeks[1];
      const { direct } = volumeBreakdown(week);
      const v = weeklyMuscleVolume(week);
      for (const g of Object.keys(v) as MuscleGroup[]) {
        if (direct[g] <= 0) continue;
        trained++;
        if (v[g] >= LANDMARKS.productiveLow) inBand++;
        else short.push(`${sport}/${daysPerWeek}d ${g}: ${v[g]}`);
        // The hard floor, separately: nothing the block trains may sit below
        // even a holding dose.
        assert.ok(v[g] >= LANDMARKS.maintenance, `${sport}/${daysPerWeek}d ${g} is at ${v[g]}, below maintenance`);
      }
    }
  }
  // Measured at 47% before the floor became intent-aware. The rest are muscles
  // whose single movement is already capped at six sets — real, and reported by
  // volumeShortfall rather than hidden.
  const pct = (inBand / trained) * 100;
  assert.ok(pct >= 80, `only ${pct.toFixed(0)}% of trained muscles reach the building band: ${short.join(", ")}`);
});

test("the athlete's own case: a footballer out of season builds everywhere", () => {
  // Four days, the most common configuration in the app. Before: quads 7.3,
  // shoulders 8, calves 8.7 — all below the band, all labelled productive.
  const week = buildProgram({ painMap: {}, goal: "strength", sport: "football", focus: "performance", daysPerWeek: 4 } as never).weeks[1];
  const { direct } = volumeBreakdown(week);
  const v = weeklyMuscleVolume(week);
  const short = (Object.keys(v) as MuscleGroup[])
    .filter((g) => direct[g] > 0 && v[g] < LANDMARKS.productiveLow)
    .map((g) => `${g}: ${v[g]}`);
  assert.deepEqual(short, [], "a muscle this block trains is stuck at a holding dose");
});

test("in-season is the one place maintenance is the right answer", () => {
  // The sport is the training load; the gym's job is to keep tissue robust
  // without adding fatigue to a competition week. A block that pushed every
  // muscle into the building band in-season would be the engine overriding a
  // decision the athlete made.
  const inSeason = buildProgram({ painMap: {}, goal: "strength", sport: "football", focus: "performance", daysPerWeek: 4, isInSeason: true } as never);
  const off = buildProgram({ painMap: {}, goal: "strength", sport: "football", focus: "performance", daysPerWeek: 4 } as never);
  const total = (p: typeof off) => {
    const v = weeklyMuscleVolume(p.weeks[1]);
    return (Object.values(v) as number[]).reduce((a, b) => a + b, 0);
  };
  assert.ok(total(inSeason) < total(off),
    `in-season carries ${total(inSeason)} sets against ${total(off)} out of season`);
});

test("the volume bars can be reconciled with the sessions they describe", () => {
  /**
   * The complaint was "the sets aren't calculating correctly", and the number
   * was right — it just could not be checked. Assisting muscles count half a
   * set, so a week with two triceps movements reported sixteen triceps sets.
   * An athlete counting the page gets eight. `direct` is that number, and the
   * bar now shows it as the solid portion.
   */
  const week = buildProgram({ painMap: {}, goal: "strength", sport: "gym", focus: "aesthetics", daysPerWeek: 4 } as never).weeks[1];
  const { total, direct } = volumeBreakdown(week);
  // Counting only drills whose PRIMARY is that muscle is what an athlete does
  // by eye, and it must equal `direct` exactly or the split is decorative.
  const byEye: Partial<Record<MuscleGroup, number>> = {};
  for (const s of week.sessions) {
    for (const d of s.drills) {
      const primary = musclesForName(d.name)[0];
      if (primary) byEye[primary] = (byEye[primary] ?? 0) + d.sets;
    }
  }
  for (const g of Object.keys(direct) as MuscleGroup[]) {
    if (direct[g] === 0) continue;
    assert.equal(direct[g], byEye[g] ?? 0, `${g}: the solid bar says ${direct[g]}, counting the sessions gives ${byEye[g] ?? 0}`);
    assert.ok(total[g] >= direct[g], `${g}: total ${total[g]} is less than the direct work ${direct[g]}`);
  }
});

test("every exercise in the library names a primary mover", () => {
  // The imported catalogue carries one coarse label per exercise, so the detail
  // page for a bench press said "Chest" and nothing about the triceps or front
  // delts it also trains — while the volume accounting knew both.
  const withoutPrimary = EXERCISES.filter((e) => !exerciseMuscles(e.name, e.muscles).primary);
  assert.deepEqual(withoutPrimary.map((e) => e.id), [], "library exercises with no primary muscle");
});

test("a compound names what assists it, and an isolation names nothing", () => {
  assert.deepEqual(exerciseMuscles("Bench Press", ["Chest"]),
    { primary: "Chest", secondary: ["Triceps", "Shoulders"] });
  // A cable fly assists nothing. Inventing a secondary here would be the same
  // lie in the other direction.
  assert.deepEqual(exerciseMuscles("Cable Fly", ["Chest"]).secondary, []);
  // And the library and the volume accounting must agree, or an exercise's page
  // contradicts the bar it contributes to.
  const [primary] = musclesForName("Barbell Deadlift");
  assert.equal(exerciseMuscles("Barbell Deadlift", []).primary, MUSCLE_LABEL[primary]);
});

test("an exercise the catalogues don't know keeps its own labels", () => {
  // Custom exercises somebody typed in still get a primary rather than nothing.
  assert.deepEqual(exerciseMuscles("Some Made Up Lift", ["Forearms", "Grip"]),
    { primary: "Forearms", secondary: ["Grip"] });
  assert.deepEqual(exerciseMuscles("Some Made Up Lift", []), { primary: null, secondary: [] });
});
