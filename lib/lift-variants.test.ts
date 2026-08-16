import test from "node:test";
import assert from "node:assert/strict";
import { LIFT_VARIANTS, REFUSED, refusalFor, variantFor } from "./lift-variants";
import { LIFT_STANDARDS, resolveLift, standardFor, rankedLifts, bodyPartStrength } from "./strength-standards";
import { EXERCISES } from "./exercises";
import type { TrainingLog } from "./types";

/** Loaded work — the exercises that could say something about strength. */
const LOADED = EXERCISES.filter((e) =>
  /barbell|dumbbell|machine|cable|kettlebell|smith|weight|plate|bar$/i.test(e.equipment) ||
  /Strength|Power|Hypertrophy/i.test(e.category));

// --- the table itself --------------------------------------------------------

test("every variant points at a lift that exists and converts sanely", () => {
  const keys = new Set(LIFT_STANDARDS.map((l) => l.key));
  for (const v of LIFT_VARIANTS) {
    assert.ok(keys.has(v.base), `${v.key} converts to '${v.base}', which is not a ranked lift`);
    assert.ok(v.aliases.length > 0, `${v.key} has no aliases, so nothing can ever match it`);
    assert.ok(v.why.length > 20, `${v.key} has no real justification for its factor`);
    // A factor outside this range is not a variant of the base lift, it is a
    // different exercise wearing a conversion.
    assert.ok(v.factor >= 0.6 && v.factor <= 1.2, `${v.key} converts at ${v.factor}, which is not a variant`);
  }
});

test("variant keys and aliases are unique", () => {
  assert.equal(new Set(LIFT_VARIANTS.map((v) => v.key)).size, LIFT_VARIANTS.length, "duplicate variant key");
  const seen = new Map<string, string>();
  for (const v of LIFT_VARIANTS) {
    for (const a of v.aliases) {
      const prev = seen.get(a);
      assert.equal(prev, undefined, `'${a}' is claimed by both ${prev} and ${v.key}`);
      seen.set(a, v.key);
    }
  }
});

/**
 * A DIRECT MATCH MUST ALWAYS WIN.
 *
 * If a variant alias ever shadowed a real lift's name, adding to this table
 * would silently change how an already-ranked lift is read — a squat quietly
 * becoming 90% of itself, and every existing rank moving with it.
 */
test("no variant alias steals a name the standards already own", () => {
  for (const v of LIFT_VARIANTS) {
    for (const a of v.aliases) {
      assert.equal(standardFor(a), null, `'${a}' is already a real lift, so ${v.key} would shadow it`);
    }
  }
});

// --- coverage ----------------------------------------------------------------

/**
 * THE NUMBER THIS WHOLE FILE EXISTS FOR.
 *
 * Before the variant table the ranks could see 14 of the library's 269 loaded
 * exercises, so most people's training simply did not count toward body-part
 * strength. Pinned rather than described, because "we widened it a bit" is not
 * a claim anybody can check a year from now.
 */
test("the ranks can see far more of the library than the eight barbell lifts", () => {
  const rankable = LOADED.filter((e) => resolveLift(e.name));
  assert.ok(LOADED.length > 250, `only ${LOADED.length} loaded exercises found — the filter has drifted`);
  assert.ok(rankable.length >= 40,
    `only ${rankable.length} of ${LOADED.length} loaded exercises rank; it was 14 before the variants and should be far more now`);
});

/**
 * NOTHING LOADED IS IGNORED WITHOUT A REASON.
 *
 * This is the honest half. An exercise that cannot be ranked is fine; an
 * exercise that cannot be ranked and has nobody's decision attached to it is
 * an oversight waiting to be inherited — and it is the answer to "why doesn't
 * my leg press count".
 */
test("every loaded exercise either ranks or says why it cannot", () => {
  const orphans = LOADED.filter((e) => !resolveLift(e.name) && !refusalFor(e.name));
  assert.deepEqual(orphans.map((e) => e.name), [],
    "these carry a load, produce no rank, and no refusal explains them");
});

test("the refusals are reasons, not shrugs", () => {
  for (const r of REFUSED) {
    assert.ok(r.why.length > 40, `"${r.pattern}" is refused without a real explanation`);
  }
});

test("the things that genuinely cannot be ranked are refused", () => {
  // Each of these was considered and rejected. A future change that starts
  // ranking one of them should have to delete a test that says why not.
  for (const name of [
    "Leg Press", "Hack squat", "Goblet squat", "Bulgarian split squat", "Walking lunge",
    "Push Press", "Power clean", "Seated Cable Row", "Lat pulldown", "Rack pull",
    "Barbell Curl", "Machine Shoulder Press", "Dumbbell Row", "Half Squat", "Farmer's carry",
  ]) {
    assert.equal(resolveLift(name), null, `${name} should not produce a rank`);
    assert.ok(refusalFor(name), `${name} is ignored with no reason given`);
  }
});

// --- conversion --------------------------------------------------------------

test("a direct match is never converted", () => {
  const r = resolveLift("Back squat")!;
  assert.equal(r.derived, false);
  assert.equal(r.convert(100), 100, "a real lift was scaled by a variant factor");
  assert.equal(r.label, "Back squat");
});

test("dumbbells are doubled, because they are logged per hand", () => {
  // THE ONE THAT CAN BE 2x WRONG. 40kg per hand is 80kg of dumbbell, and 90% of
  // that is 72kg of bench. Forgetting the doubling would halve every dumbbell
  // lifter's chest rank; forgetting it only on some entries would be worse.
  const r = resolveLift("Dumbbell Bench Press")!;
  assert.equal(r.derived, true);
  assert.equal(Math.round(r.convert(40)), 72);
  for (const v of LIFT_VARIANTS) {
    if (/dumbbell|db /i.test(v.label)) {
      assert.equal(v.perHand, true, `${v.key} is a dumbbell lift but is not marked per-hand`);
    }
  }
});

test("a harder variant converts down and an easier one converts up", () => {
  const incline = resolveLift("Incline Bench Press")!;
  const decline = resolveLift("Decline Bench Press")!;
  assert.ok(incline.convert(100) < 100, "an incline should be worth less than the same weight flat");
  assert.ok(decline.convert(100) > 100, "a decline moves more weight, so it should be worth more");
});

test("a converted lift keeps its own name", () => {
  // Somebody who has never touched a flat barbell bench should not be told
  // their "Bench press" is Intermediate — the obvious next thought is "no it
  // isn't, I've never done one".
  const r = resolveLift("Incline Dumbbell Bench Press")!;
  assert.equal(r.lift.key, "bench");
  assert.match(r.label, /incline/i);
  assert.notEqual(r.label, r.lift.label);
});

test("a variant is marked derived so the UI can say the number is an estimate", () => {
  assert.equal(resolveLift("Smith Machine Squat")!.derived, true);
  assert.equal(resolveLift("Deadlift")!.derived, false);
  assert.equal(variantFor("Deadlift"), null, "a real lift should not also be a variant");
});

// --- what it means for an athlete --------------------------------------------

const log = (name: string, load_kg: number, reps = 8): TrainingLog =>
  ({ log_date: "2026-01-01", drills: [{ name, sets: 3, reps, load_kg }] }) as unknown as TrainingLog;

test("somebody who only trains with dumbbells is no longer unranked", () => {
  // THE COMPLAINT, IN ONE TEST. This athlete trains chest and shoulders twice a
  // week and had grey patches over both, because neither movement was a
  // barbell bench or a barbell press.
  const logs = [
    log("Dumbbell Bench Press", 34),
    log("Incline Dumbbell Bench Press", 26),
    log("Dumbbell shoulder press", 24),
    log("Smith Machine Squat", 120, 5),
    log("Trap bar deadlift", 150, 5),
  ];
  const ranks = rankedLifts(logs, 80, "male");
  const ranked = bodyPartStrength(ranks).filter((p) => p.tier);

  assert.ok(ranked.length >= 6, `only ${ranked.length} muscles ranked from a full dumbbell programme`);
  for (const m of ["chest", "shoulders", "quads", "back"]) {
    assert.ok(ranked.find((p) => p.muscle === m), `${m} is still unranked`);
  }
  // And each says which movement earned it, not the barbell lift it converted to.
  const chest = ranked.find((p) => p.muscle === "chest")!;
  assert.match(chest.from ?? "", /dumbbell/i, `chest says "${chest.from}" — a lift they never did`);
});

test("a converted rank never beats the same athlete's real lift", () => {
  // A dumbbell press and a barbell press both land on the bench standard, and
  // the best number wins — which is right, and must not mean the estimate can
  // displace the measurement when the measurement is higher.
  const ranks = rankedLifts([log("Bench press", 100, 3), log("Dumbbell Bench Press", 30)], 80, "male");
  const bench = ranks.find((r) => r.lift.key === "bench")!;
  assert.equal(bench.source, "logged", "a lighter dumbbell session displaced a real barbell bench");
  assert.equal(bench.via, "Bench press");
});
