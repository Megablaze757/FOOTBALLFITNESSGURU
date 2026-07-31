import { test } from "node:test";
import assert from "node:assert/strict";
import { nutritionTargets, activityFactor, basalRate, planTargets, type TargetInput, type BodyStats } from "./nutrition";

// A fully-described adult, so the measured path is in play.
const ADULT: TargetInput = {
  weightKg: 80, heightCm: 182, age: 26, sex: "male",
  goal: "strength", dietGoal: "maintain", activity: "moderate",
  avgTrainingMinutes: 60, trainingDaysLogged: 10,
};

const macroKcal = (t: { protein: number; carbs: number; fats: number }) =>
  t.protein * 4 + t.carbs * 4 + t.fats * 9;

// --- the original contract, which still holds ---------------------------------

test("returns null without a weight", () => {
  assert.equal(nutritionTargets({ weightKg: null, goal: "speed", avgTrainingMinutes: 60 }), null);
});

test("strength goal uses 2.0 g/kg protein", () => {
  const t = nutritionTargets({ weightKg: 80, goal: "strength", avgTrainingMinutes: 0 })!;
  assert.equal(t.protein, 160);
});

test("endurance weights carbs higher than strength at the same weight", () => {
  const end = nutritionTargets({ weightKg: 70, goal: "endurance", avgTrainingMinutes: 60 })!;
  const str = nutritionTargets({ weightKg: 70, goal: "strength", avgTrainingMinutes: 60 })!;
  assert.ok(end.carbs > str.carbs);
});

test("calories rise with training volume", () => {
  const rest = nutritionTargets({ weightKg: 75, goal: "speed", avgTrainingMinutes: 0 })!;
  const hard = nutritionTargets({ weightKg: 75, goal: "speed", avgTrainingMinutes: 90 })!;
  assert.ok(hard.calories > rest.calories);
  assert.ok(hard.water_ml > rest.water_ml);
});

test("macros are positive and fats respect the hormone floor", () => {
  const t = nutritionTargets({ weightKg: 60, goal: "skill", avgTrainingMinutes: 30 })!;
  assert.ok(t.protein > 0 && t.carbs > 0 && t.fats >= Math.round(60 * 0.8));
});

// --- body stats: the point of the change -------------------------------------

test("with height, age and sex it uses the metabolic equation, not weight x 30", () => {
  const t = nutritionTargets(ADULT)!;
  assert.equal(t.basis, "measured");
  assert.equal(t.bmr, basalRate({ sex: "male", age: 26, heightCm: 182, weightKg: 80 }));
  assert.ok(t.tdee! > t.bmr!);
  assert.deepEqual(t.missing, []);
});

test("without them it says so and names what's missing", () => {
  const t = nutritionTargets({ weightKg: 80, goal: "strength", avgTrainingMinutes: 60 })!;
  assert.equal(t.basis, "estimated");
  assert.equal(t.bmr, null);
  assert.deepEqual(t.missing.sort(), ["age", "height", "sex"]);
});

test("a taller athlete of the same weight needs more", () => {
  const short = nutritionTargets({ ...ADULT, heightCm: 165 })!;
  const tall = nutritionTargets({ ...ADULT, heightCm: 195 })!;
  assert.ok(tall.calories > short.calories);
});

// --- training must only be counted once --------------------------------------

test("once there's a real log, the self-reported week stops mattering", () => {
  // Same measured training, opposite self-reports. If the self-report still fed
  // in, these would differ — which is how these calculators end up hundreds of
  // calories high.
  const claimsSedentary = nutritionTargets({ ...ADULT, activity: "sedentary" })!;
  const claimsAthlete = nutritionTargets({ ...ADULT, activity: "athlete" })!;
  assert.equal(claimsSedentary.calories, claimsAthlete.calories);
});

test("with too little logged, the self-reported week is used instead", () => {
  const thin = { ...ADULT, trainingDaysLogged: 1, avgTrainingMinutes: 5 };
  const sedentary = nutritionTargets({ ...thin, activity: "sedentary" })!;
  const athlete = nutritionTargets({ ...thin, activity: "athlete" })!;
  assert.ok(athlete.calories > sedentary.calories);
});

test("activity factor is continuous, anchored and clamped", () => {
  assert.equal(activityFactor(0), 1.2);
  assert.equal(activityFactor(90), 1.9);
  assert.equal(activityFactor(500), 1.9); // no runaway above the ladder
  assert.equal(activityFactor(-10), 1.2); // a bad reading can't go below rest
  // No cliff edge: one more minute must not move the target by a meal.
  for (let m = 0; m < 120; m++) {
    assert.ok(activityFactor(m + 1) - activityFactor(m) < 0.02, `jump at ${m} min`);
  }
});

// --- safety ------------------------------------------------------------------

test("under-18s are never put into a deficit", () => {
  const cut = nutritionTargets({ ...ADULT, age: 15, dietGoal: "cut" })!;
  const maintain = nutritionTargets({ ...ADULT, age: 15, dietGoal: "maintain" })!;
  assert.equal(cut.calories, maintain.calories);
  assert.ok(cut.guard, "should explain why it didn't cut");
});

test("adults who ask to cut, do", () => {
  const cut = nutritionTargets({ ...ADULT, dietGoal: "cut" })!;
  const maintain = nutritionTargets({ ...ADULT, dietGoal: "maintain" })!;
  assert.ok(cut.calories < maintain.calories);
});

test("nobody is targeted below their resting metabolic rate", () => {
  const t = nutritionTargets({
    weightKg: 50, heightCm: 150, age: 30, sex: "female",
    goal: "speed", dietGoal: "cut", activity: "sedentary",
    avgTrainingMinutes: 0, trainingDaysLogged: 0,
  })!;
  assert.ok(t.calories >= t.bmr!, `${t.calories} < BMR ${t.bmr}`);
  assert.ok(t.calories >= 1200);
  assert.ok(t.guard);
});

test("the macros never contradict the calorie number", () => {
  const cases: TargetInput[] = [
    ADULT,
    { ...ADULT, dietGoal: "cut" },
    { ...ADULT, dietGoal: "build", goal: "endurance" },
    { weightKg: 45, heightCm: 155, age: 14, sex: "female", goal: "skill", dietGoal: "cut", activity: "high", avgTrainingMinutes: 40, trainingDaysLogged: 9 },
    { weightKg: 110, heightCm: 200, age: 34, sex: "male", goal: "strength", dietGoal: "build", activity: "athlete", avgTrainingMinutes: 120, trainingDaysLogged: 14 },
  ];
  for (const c of cases) {
    const t = nutritionTargets(c)!;
    assert.ok(macroKcal(t) <= t.calories + 10, `macros ${macroKcal(t)} exceed ${t.calories}`);
    assert.ok(t.fats >= Math.round(c.weightKg! * 0.8), "fat floor breached");
    assert.ok(t.carbs > 0 && t.protein > 0);
  }
});

test("a cut still leaves enough carbohydrate to train on", () => {
  const t = nutritionTargets({ ...ADULT, dietGoal: "cut" })!;
  assert.ok(t.carbs >= Math.round(80 * 2), `only ${t.carbs}g carbs`);
});

// --- hydration ---------------------------------------------------------------

test("hydration scales with body size and training, and is capped", () => {
  const small = nutritionTargets({ ...ADULT, weightKg: 55 })!;
  const large = nutritionTargets({ ...ADULT, weightKg: 105 })!;
  assert.ok(large.water_ml > small.water_ml);

  // More water is not always better — past a point it's a health risk.
  const extreme = nutritionTargets({ ...ADULT, weightKg: 140, avgTrainingMinutes: 240 })!;
  assert.ok(extreme.water_ml <= 4500, `${extreme.water_ml} ml is too much to ask for`);
});

test("targets land on tidy numbers people can actually aim at", () => {
  const t = nutritionTargets(ADULT)!;
  assert.equal(t.calories % 10, 0);
  assert.equal(t.water_ml % 50, 0);
  assert.equal(t.protein, Math.round(t.protein));
});

// --- One number, everywhere --------------------------------------------------

test("the meal planner and the daily card agree on calories", () => {
  // THE BUG THIS PINS. planTargets was a second, simpler calculation: no
  // resting-rate floor, no under-18 guard, no sport weighting, different
  // protein per kg. So the Today tab said one number, the meal plan was built
  // to another, and MealCheckIn had been deliberately pinned to the wrong one
  // so that at least the tick-list matched the plan.
  const stats: BodyStats = {
    sex: "male", age: 24, heightCm: 180, weightKg: 78,
    activity: "high", goal: "maintain",
  };
  const context = { goal: "endurance" as const, avgTrainingMinutes: 55, trainingDaysLogged: 12 };

  const card = nutritionTargets({
    weightKg: stats.weightKg, heightCm: stats.heightCm, age: stats.age, sex: stats.sex,
    activity: stats.activity, dietGoal: stats.goal,
    goal: context.goal, avgTrainingMinutes: context.avgTrainingMinutes,
    trainingDaysLogged: context.trainingDaysLogged,
  })!;
  const plan = planTargets(stats, context);

  assert.equal(plan.calories, card.calories);
  assert.equal(plan.protein, card.protein);
  assert.equal(plan.carbs, card.carbs);
  assert.equal(plan.fats, card.fats);
});

test("planTargets inherits the safety floors it used to lack", () => {
  // A 16-year-old asking to cut must not be put in a deficit, and nobody is
  // targeted below their resting metabolic rate. The old planTargets did
  // neither, so a meal plan could be built to a number the daily card would
  // have refused to show.
  const teen: BodyStats = {
    sex: "female", age: 16, heightCm: 165, weightKg: 55,
    activity: "high", goal: "cut",
  };
  const t = planTargets(teen);
  assert.ok(t.calories >= t.bmr, `${t.calories} kcal is below a resting rate of ${t.bmr}`);

  const maintaining = planTargets({ ...teen, goal: "maintain" });
  assert.ok(
    t.calories >= maintaining.calories,
    "a growing athlete asking to cut should not be given fewer calories than maintaining",
  );
});

test("the macros never contradict the headline calories", () => {
  for (const goal of ["cut", "maintain", "build"] as const) {
    const t = planTargets({ sex: "male", age: 30, heightCm: 175, weightKg: 70, activity: "light", goal });
    const macroKcal = t.protein * 4 + t.carbs * 4 + t.fats * 9;
    assert.ok(
      Math.abs(macroKcal - t.calories) <= 20,
      `${goal}: macros come to ${macroKcal} kcal but the target says ${t.calories}`,
    );
  }
});
