import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FIGURE_REGIONS } from "../components/BodyStrengthFigure";
import { BODY_OUTLINE, BODY_VIEWBOX } from "./body-outline";
import {
  LIFT_STANDARDS, RANKABLE_MUSCLES, STRENGTH_TIERS, TOP_TIER, bodyPartStrength,
  rankLift, rankedLifts, standardFor, strengthHeadline, strengthTierTotal, tierAt,
} from "./strength-standards";
import { computeXp, EMPTY_STATS } from "./gamification";
import type { TrainingLog } from "./types";

const log = (date: string, drills: TrainingLog["drills"]): TrainingLog =>
  ({ log_date: date, drills } as TrainingLog);

// --- the standards themselves --------------------------------------------------

/**
 * RELATIVE TO BODYWEIGHT IS THE WHOLE DESIGN.
 *
 * The ranked-gym charts this came from give absolute numbers — a 215lb overhead
 * press is "Olympian". That is a chart for one person. This asserts the thing
 * an absolute chart cannot do: the same achievement ranks the same whoever did
 * it, so a 60kg athlete is not told they are hopeless for being small nor a
 * 100kg one that they are elite for being large.
 */
test("the same achievement ranks the same at any bodyweight", () => {
  const squat = standardFor("back squat")!;
  const small = rankLift(squat, 60 * 1.75, 60, "male")!;
  const large = rankLift(squat, 100 * 1.75, 100, "male")!;
  assert.equal(small.tier.name, large.tier.name);
  assert.equal(small.ratio.toFixed(2), large.ratio.toFixed(2));

  // And the same absolute lift does NOT rank the same, which is the point.
  const heavy = rankLift(squat, 105, 60, "male")!;
  const light = rankLift(squat, 105, 100, "male")!;
  assert.ok(heavy.tier.index > light.tier.index,
    "105kg means the same thing at 60kg and 100kg, which it does not");
});

test("every tier is reachable, ordered, and has a colour", () => {
  const squat = standardFor("squat")!;
  const seen = new Set<string>();
  // From just above zero: a lift of 0kg has no ratio to rank and returns null.
  for (let ratio = 0.02; ratio <= 4; ratio += 0.05) {
    seen.add(rankLift(squat, 80 * ratio, 80, "male")!.tier.name);
  }
  for (const t of STRENGTH_TIERS) {
    assert.ok(seen.has(t.name), `${t.name} cannot be reached by any squat`);
    assert.match(t.color, /^#[0-9a-f]{6}$/i);
    assert.ok(t.blurb.length > 0);
  }
});

test("thresholds only ever go up, for both sexes", () => {
  for (const lift of LIFT_STANDARDS) {
    for (const set of [lift.male, lift.female]) {
      assert.equal(set.length, TOP_TIER, `${lift.key} has the wrong number of rungs`);
      for (let i = 1; i < set.length; i++) {
        assert.ok(set[i] > set[i - 1], `${lift.key} rung ${i} is not harder than the one below`);
      }
    }
    // Women's standards sit below men's throughout. Flattening them would quietly
    // tell every woman she is worse at pressing than she is.
    for (let i = 0; i < lift.male.length; i++) {
      assert.ok(lift.female[i] < lift.male[i], `${lift.key} rung ${i}`);
    }
  }
});

test("a lift the app has never heard of is not ranked at all", () => {
  assert.equal(standardFor("cable tricep kickback"), null);
  assert.equal(standardFor(""), null);
  // Spelling and spacing must not lose somebody their rank.
  assert.equal(standardFor("  BACK  SQUAT ")?.key, "squat");
  assert.equal(standardFor("Bent-Over Row")?.key, "row");
});

test("no rank without a bodyweight to divide by", () => {
  const squat = standardFor("squat")!;
  assert.equal(rankLift(squat, 140, 0, "male"), null);
  assert.equal(rankLift(squat, 0, 80, "male"), null);
});

test("the top of the ladder has no next rung to chase", () => {
  const squat = standardFor("squat")!;
  const top = rankLift(squat, 80 * 4, 80, "male")!;
  assert.equal(top.tier.index, TOP_TIER);
  assert.equal(top.toNextKg, null);
  assert.equal(top.nextTier, null);
  assert.equal(top.progress, 1);
});

test("the kilos to the next rung are real kilos", () => {
  const squat = standardFor("squat")!;
  // 80kg male, Novice at 0.75x (60kg), Intermediate at 1.25x (100kg).
  const r = rankLift(squat, 70, 80, "male")!;
  assert.equal(r.tier.name, "Novice");
  assert.equal(r.toNextKg, 30, "100kg is the Intermediate threshold, so 30kg to go");
  assert.equal(r.nextTier?.name, "Intermediate");
});

// --- reading it out of the log ---------------------------------------------------

/**
 * BEST EVER, NOT MOST RECENT. A rank you can lose by having a bad Tuesday
 * punishes training on tired legs. This app already had that argument once,
 * about XP, and settled it the same way — see `computeXp`.
 */
test("a bad session cannot cost you a rank", () => {
  const logs = [
    log("2026-01-10", [{ name: "Back squat", sets: 1, reps: 3, load_kg: 150 }]),
    log("2026-02-10", [{ name: "Back squat", sets: 3, reps: 5, load_kg: 60 }]),
  ];
  const [rank] = rankedLifts(logs, 80, "male");
  assert.equal(Math.round(rank.best), 165, "the 150x3 estimates to 165, and it stands");
});

test("the best SET is found, not just the heaviest", () => {
  // 5 at 100 estimates higher than 1 at 105, so the top set is not always best.
  const logs = [log("2026-01-10", [{
    name: "Deadlift", sets: 2, reps: 5, load_kg: 105,
    sets_detail: [{ reps: 5, load_kg: 100 }, { reps: 1, load_kg: 105 }],
  }])];
  const [rank] = rankedLifts(logs, 80, "male");
  assert.ok(rank.best > 105, `best was ${rank.best}`);
});

test("bodyweight and unloaded work is skipped rather than ranked at zero", () => {
  const logs = [log("2026-01-10", [{ name: "Back squat", sets: 3, reps: 10, load_kg: null }])];
  assert.deepEqual(rankedLifts(logs, 80, "male"), []);
  assert.deepEqual(rankedLifts(null, 80, "male"), []);
});

// --- the body ---------------------------------------------------------------------

/**
 * NOT TESTED IS NOT UNTRAINED, and this is the assertion that keeps them apart.
 *
 * Showing "Untrained" for a muscle nobody has ever loaded is the app inventing
 * a verdict from an absence — the same mistake the funnel made when a missing
 * step rendered as a drop to zero.
 */
test("a muscle with nothing logged is unranked, not untrained", () => {
  const logs = [log("2026-01-10", [{ name: "Bench press", sets: 3, reps: 5, load_kg: 100 }])];
  const parts = bodyPartStrength(rankedLifts(logs, 80, "male"));
  const chest = parts.find((p) => p.muscle === "chest")!;
  const hams = parts.find((p) => p.muscle === "hamstrings")!;
  assert.ok(chest.tier, "the bench press should have ranked the chest");
  assert.equal(hams.tier, null, "hamstrings were never trained and must not read as Untrained");
  assert.notEqual(hams.tier, tierAt(0));
});

/**
 * The hardest thing a muscle has done is what it is worth. Averaging would mean
 * training a muscle MORE could lower its rank, which is absurd on its face.
 */
test("a muscle is as strong as its best lift, not its average", () => {
  const logs = [log("2026-01-10", [
    { name: "Deadlift", sets: 1, reps: 1, load_kg: 200 },      // huge
    { name: "Romanian deadlift", sets: 3, reps: 10, load_kg: 40 }, // light
  ])];
  const parts = bodyPartStrength(rankedLifts(logs, 80, "male"));
  const hams = parts.find((p) => p.muscle === "hamstrings")!;
  assert.equal(hams.from, "Deadlift");
  assert.ok(hams.tier!.index >= 3);
});

test("every rankable muscle is reachable by some lift", () => {
  for (const muscle of RANKABLE_MUSCLES) {
    assert.ok(LIFT_STANDARDS.some((l) => l.muscles.includes(muscle)),
      `nothing in the standards trains ${muscle}, so it can never be ranked`);
  }
});

// --- xp --------------------------------------------------------------------------

/**
 * PAID PER BODY PART, NOT PER LIFT, and that is the anti-farming design: paying
 * per lift rewards logging the same squat under six spellings.
 */
test("getting stronger pays, and logging the same lift twice does not", () => {
  const oneSquat = rankedLifts([log("2026-01-10", [
    { name: "Back squat", sets: 1, reps: 1, load_kg: 140 },
  ])], 80, "male");
  // The actual farming vector: the same lift, logged under another of its
  // spellings. Both resolve to one standard, so the body has not changed.
  const spelledTwice = rankedLifts([log("2026-01-10", [
    { name: "Back squat", sets: 1, reps: 1, load_kg: 140 },
    { name: "barbell back squat", sets: 1, reps: 1, load_kg: 140 },
    { name: "SQUAT", sets: 1, reps: 1, load_kg: 140 },
  ])], 80, "male");
  assert.equal(spelledTwice.length, 1, "one lift under three names counted as three");
  assert.equal(
    strengthTierTotal(bodyPartStrength(spelledTwice)),
    strengthTierTotal(bodyPartStrength(oneSquat)),
    "re-spelling a lift minted XP out of nothing",
  );

  const alsoBench = rankedLifts([log("2026-01-10", [
    { name: "Back squat", sets: 1, reps: 1, load_kg: 140 },
    { name: "Bench press", sets: 1, reps: 1, load_kg: 100 },
  ])], 80, "male");
  assert.ok(
    strengthTierTotal(bodyPartStrength(alsoBench)) > strengthTierTotal(bodyPartStrength(oneSquat)),
    "training a new part of the body should be worth something",
  );
});

test("strength XP only ever adds", () => {
  const none = computeXp(EMPTY_STATS);
  const some = computeXp({ ...EMPTY_STATS, strengthTiers: 6 });
  assert.ok(some > none);
  assert.equal(computeXp({ ...EMPTY_STATS, strengthTiers: 0 }), none);
});

// --- the headline ------------------------------------------------------------------

test("the headline says the one useful thing, in priority order", () => {
  assert.match(strengthHeadline([], []), /log a squat/i);

  // A rung within reach beats a boast, because it is actionable.
  const close = rankedLifts([log("2026-01-10", [
    { name: "Back squat", sets: 1, reps: 1, load_kg: 95 },  // 100kg = Intermediate at 80kg BW
  ])], 80, "male");
  assert.match(strengthHeadline(close, bodyPartStrength(close)), /5kg on your back squat/i);
});

// --- the figure ----------------------------------------------------------------------

/**
 * THE FIGURE HAS TO ANSWER WHERE YOU TAPPED.
 *
 * The highlight shapes are a decision and the failure is silent: a curve in the
 * wrong place puts the shoulder yoke across the chest and nothing looks broken,
 * it is just wrong.
 */
const extentOf = (region: { d: string[] }) => {
  // Every coordinate in these paths is absolute, so the extent reads straight off.
  const nums = region.d.join(" ").match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};
const holds = (m: string, x: number, y: number) => {
  const e = extentOf(FIGURE_REGIONS.find((r) => r.muscle === m)!);
  return x >= e.x0 && x <= e.x1 && y >= e.y0 && y <= e.y1;
};

test("every region sits where that muscle actually is", () => {
  // Landmarks read off the traced outline: centre line x=430, torso x 290..570.
  // Landmarks read off the source under a 100-unit grid, not off an impression:
  // deltoids 300-450, pectorals 330-510, upper arm 380-650, abs 515-800,
  // thighs 830-1200.
  assert.ok(holds("shoulders", 240, 380), "the deltoid shape misses the deltoid");
  assert.ok(holds("chest", 400, 420), "the chest shape misses the pectoral");
  assert.ok(holds("core", 430, 700), "the core shape misses the navel");
  assert.ok(holds("quads", 380, 1000), "the thigh shape misses the thigh");
  assert.ok(holds("biceps", 240, 500), "the arm shape misses the upper arm");

  // AND MUST NOT REACH WHERE THE MUSCLE IS NOT. The first chest curve sat 50
  // units low and 100 too tall, so it crossed the ribs; the first shoulder
  // shape was one band and it coloured the throat.
  // The shapes are traced now, so what this guards is the BOX that selects them
  // in scripts/gen-body-figure.mjs — widen it and the chest starts eating the
  // collarbone or the navel, which is what the earlier band-bucketed version did.
  const chest = extentOf(FIGURE_REGIONS.find((r) => r.muscle === "chest")!);
  assert.ok(chest.y0 >= 320, `chest reaches up to ${chest.y0}, above the pectorals`);
  assert.ok(chest.y1 <= 570, `chest reaches down to ${chest.y1}, past the pectorals`);

  // Paired muscles are two shapes. One band across the top of a torso lights
  // the throat, which is what the first shoulder version did.
  for (const m of ["shoulders", "chest", "biceps", "quads"]) {
    assert.equal(FIGURE_REGIONS.find((r) => r.muscle === m)!.d.length, 2,
      `${m} is not two shapes — a single one spans the midline`);
  }
  assert.ok(!holds("shoulders", 430, 250), "the deltoid shape covers the throat");

  // And the arms are on the arms, not on the ribs — the mistake the by-eye
  // version made, where the upper arm shape sat at x 194 against a torso edge
  // of 298.
  const arms = extentOf(FIGURE_REGIONS.find((r) => r.muscle === "biceps")!);
  assert.ok(arms.x0 < 270, `the upper arm shape starts at x=${arms.x0}, which is on the torso`);
});

/**
 * And they have to be in the right ORDER down the body, which is the check that
 * survives any amount of reshaping: a chest below a navel is wrong however
 * pretty the curve.
 */
test("the regions stack down the body in the order a body has them", () => {
  const mid = (m: string) => { const e = extentOf(FIGURE_REGIONS.find((r) => r.muscle === m)!); return (e.y0 + e.y1) / 2; };
  const order = ["shoulders", "chest", "core", "quads"];
  for (let i = 1; i < order.length; i++) {
    assert.ok(mid(order[i]) > mid(order[i - 1]),
      `${order[i]} is not below ${order[i - 1]} on the figure`);
  }
  // And the arms sit outside the torso rather than on it.
  const arms = extentOf(FIGURE_REGIONS.find((r) => r.muscle === "biceps")!);
  const chest = extentOf(FIGURE_REGIONS.find((r) => r.muscle === "chest")!);
  assert.ok(arms.x0 < chest.x0 && arms.x1 > chest.x1, "the arm shapes do not reach past the torso");
});

/**
 * A region has to be big enough to hit. The figure renders 220px wide against
 * an 861-unit viewBox, so one CSS pixel is about 3.9 units and this codebase's
 * 44px floor is about 172 of them.
 *
 * This is why the figure is 220px and not 190: at 190 the shoulder yoke came
 * out 40px tall. The alternative was squeezing the shapes, which would have put
 * the chest across the navel.
 */
test("no region is too small to tap", () => {
  const SCALE = 861 / 220;            // viewBox units per rendered CSS pixel
  const FLOOR = 44 * SCALE;
  for (const region of FIGURE_REGIONS) {
    const e = extentOf(region);
    // Clipped to the body, so the drawn extent overstates the width of the arm
    // shapes; height is the honest dimension for every region here.
    assert.ok(e.y1 - e.y0 >= FLOOR,
      `${region.muscle} is ${Math.round((e.y1 - e.y0) / SCALE)}px tall`);
  }
});

/**
 * The drawing is generated, and the thing that can silently break is the
 * contract between it and the code that colours it: a renamed region leaves a
 * muscle permanently grey with nothing to indicate anything is wrong.
 */
test("the outline is real, closed, and inside its own viewBox", () => {
  assert.ok(BODY_OUTLINE.startsWith("M") && BODY_OUTLINE.endsWith("Z"), "the body is not a closed path");
  const nums = BODY_OUTLINE.slice(1, -1).split("L").map((p) => p.split(",").map(Number));
  assert.ok(nums.length > 100, `only ${nums.length} points — the trace has collapsed`);
  for (const [x, y] of nums) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y), "the outline contains a non-number");
    assert.ok(x >= 0 && x <= BODY_VIEWBOX.width, `x=${x} is outside the viewBox`);
    assert.ok(y >= 0 && y <= BODY_VIEWBOX.height, `y=${y} is outside the viewBox`);
  }
});

test("the figure never claims a rank it cannot justify", () => {
  // Every muscle the drawing shows must be one the standards can actually rank,
  // or it would sit permanently neutral and read as a failure to train it.
  for (const { muscle } of FIGURE_REGIONS) {
    assert.ok(RANKABLE_MUSCLES.includes(muscle), `the figure shows ${muscle}, which nothing can rank`);
  }
  // And the muscles it cannot show must still reach the athlete, in the list.
  const hidden = RANKABLE_MUSCLES.filter((m) => !FIGURE_REGIONS.some((r) => r.muscle === m));
  const panel = readFileSync(new URL("../components/StrengthRanks.tsx", import.meta.url), "utf8");
  assert.ok(hidden.length > 0, "the front view now shows every muscle, which it cannot");
  assert.match(panel, /RANKABLE_MUSCLES\.map/,
    "the list no longer walks every rankable muscle, so the rear ones vanish");
});
