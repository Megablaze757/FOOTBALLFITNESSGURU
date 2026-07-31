// =============================================================================
// Energy and hydration physiology. Pure + tested, no food database.
//
// This is the single home for "how many calories does this body need", which
// used to exist twice: the meal planner had proper Mifflin-St Jeor maths, while
// the Coach targets card on the same page used a flat weight x 30. Two answers
// to one question, on one screen. The planner's version moved here and the card
// now shares it, so the numbers agree.
//
// meal-plan.ts re-exports the names it used to own, so existing imports still
// work. The dependency runs one way — food selection needs the energy maths,
// the energy maths needs nothing.
// =============================================================================

import type { GoalType } from "./coach";

export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "high" | "athlete";
export type DietGoal = "cut" | "maintain" | "build";

export const ACTIVITY_LEVELS: { id: ActivityLevel; label: string; blurb: string; factor: number }[] = [
  { id: "sedentary", label: "Sedentary", blurb: "Desk job, little training", factor: 1.2 },
  { id: "light", label: "Light", blurb: "1–2 sessions a week", factor: 1.375 },
  { id: "moderate", label: "Moderate", blurb: "3–4 sessions a week", factor: 1.55 },
  { id: "high", label: "High", blurb: "5–6 sessions a week", factor: 1.725 },
  { id: "athlete", label: "Athlete", blurb: "Daily training or two-a-days", factor: 1.9 },
];

export const DIET_GOALS: { id: DietGoal; label: string; blurb: string; adjust: number }[] = [
  { id: "cut", label: "Lean down", blurb: "Lose fat, hold muscle", adjust: -0.18 },
  { id: "maintain", label: "Maintain", blurb: "Fuel performance", adjust: 0 },
  { id: "build", label: "Build muscle", blurb: "Gain size and strength", adjust: 0.12 },
];

export interface BodyStats {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: DietGoal;
}

export interface PlanTargets {
  bmr: number;
  tdee: number;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  rationale: string;
}

/**
 * Mifflin-St Jeor — the equation with the best track record for estimating
 * resting metabolic rate in non-obese adults. Needs height and age, which is
 * why weight alone was never enough.
 */
export function basalRate({ sex, age, heightCm, weightKg }: Pick<BodyStats, "sex" | "age" | "heightCm" | "weightKg">): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(sex === "male" ? base + 5 : base - 161);
}

/**
 * Everything the daily card knows that a body-stats form does not: which sport
 * goal is driving the macro split, and how much training has actually been
 * logged. Optional, because the pure meal-plan tests have no page around them.
 */
export interface TargetContext {
  goal?: GoalType | null;
  avgTrainingMinutes?: number;
  trainingDaysLogged?: number;
}

/**
 * Calorie and macro targets for the meal planner.
 *
 * THIS USED TO BE A SECOND, SIMPLER CALCULATION, and that was the bug behind
 * "the numbers don't agree". The Today tab said 2,850 kcal from
 * nutritionTargets — which floors the number at resting metabolic rate, refuses
 * to put a 16-year-old in a deficit, weights carbs by sport, and reconciles the
 * macros against the headline so the card always adds up. The meal plan was
 * built to a different number from here, which did none of that. Two tabs, two
 * answers, same athlete, and MealCheckIn had already been pinned to the wrong
 * one deliberately so at least it matched the plan.
 *
 * There is one calculation now. This is a thin adapter over it, kept because
 * the meal-plan engine and its tests are written against BodyStats, and pass
 * the same `context` the daily card uses so the two cannot drift again.
 */
export function planTargets(stats: BodyStats, context: TargetContext = {}): PlanTargets {
  const t = nutritionTargets({
    weightKg: stats.weightKg,
    heightCm: stats.heightCm,
    age: stats.age,
    sex: stats.sex,
    activity: stats.activity,
    dietGoal: stats.goal,
    goal: context.goal ?? null,
    avgTrainingMinutes: context.avgTrainingMinutes ?? 0,
    trainingDaysLogged: context.trainingDaysLogged ?? 0,
  });

  // nutritionTargets only returns null without a usable weight, and BodyStats
  // requires one. Guard rather than assert, so a zero from a form field can't
  // crash the planner.
  if (!t) {
    const bmr = basalRate(stats);
    return { bmr, tdee: bmr, calories: bmr, protein: 0, carbs: 0, fats: 0, rationale: "Add your weight to get a target." };
  }

  // bmr/tdee go null when height, age or sex are missing. The planner's form
  // always collects all three, so this only bites on a partial profile.
  return {
    bmr: t.bmr ?? 0,
    tdee: t.tdee ?? 0,
    calories: t.calories,
    protein: t.protein,
    carbs: t.carbs,
    fats: t.fats,
    rationale: t.rationale,
  };
}

// --- Automatic daily targets -------------------------------------------------

export interface NutritionTargets {
  calories: number;
  protein: number; // g
  carbs: number; // g
  fats: number; // g
  water_ml: number;
  rationale: string;
  /** "measured" once we know height, age and sex — the estimate is much tighter. */
  basis: "measured" | "estimated";
  bmr: number | null;
  tdee: number | null;
  /** Human-readable stats that would sharpen the number, for the UI to ask for. */
  missing: string[];
  /** Set when a safety floor moved the number, so the card can explain itself. */
  guard: string | null;
}

export interface TargetInput {
  weightKg: number | null;
  /** Sport goal from the active program — drives the macro split. */
  goal: GoalType | null;
  /** Daily average over the recent window. */
  avgTrainingMinutes: number;
  heightCm?: number | null;
  age?: number | null;
  sex?: Sex | null;
  /** Self-reported typical week. Only used until there's enough real data. */
  activity?: ActivityLevel | null;
  dietGoal?: DietGoal | null;
  /** Days in the window that actually carry a training log. */
  trainingDaysLogged?: number;
}

// Protein g/kg by sport goal (sports-nutrition ranges).
const PROTEIN_PER_KG: Record<GoalType, number> = {
  strength: 2.0,
  injury_recovery: 2.0,
  speed: 1.8,
  agility: 1.7,
  endurance: 1.6,
  skill: 1.6,
};

// Fat g/kg by sport goal. Endurance runs leaner on fat so more of the day's
// energy is left for carbohydrate, which is what actually fuels the work.
const FAT_PER_KG: Record<GoalType, number> = {
  endurance: 0.8,
  speed: 0.9,
  agility: 0.9,
  skill: 0.9,
  strength: 1.0,
  injury_recovery: 1.0,
};

// Protein g/kg by diet goal. Highest in a deficit, where it's the thing keeping
// muscle on. The two ladders are reconciled by taking whichever asks for more.
const DIET_PROTEIN_PER_KG: Record<DietGoal, number> = { cut: 2.2, maintain: 1.8, build: 2.0 };

const FAT_FLOOR_PER_KG = 0.8; // hormone production
const CARB_FLOOR_PER_KG = 2.0; // below this an athlete stops recovering between sessions

/** Drinking-water target ceiling. Past this, more water is a risk, not a goal. */
const WATER_CAP_ML = 4500;
const WATER_PER_KG = 33;
const WATER_PER_TRAINING_MIN = 12; // ~720 ml an hour of sweat loss

/**
 * A day's average training below which we don't trust the log to describe the
 * athlete's week. Four days out of fourteen is enough of a pattern; less than
 * that and a quiet fortnight would quietly cut their calories.
 */
const MIN_DAYS_FOR_MEASURED = 4;

// Measured minutes/day -> activity factor, anchored to the same ladder people
// pick from by hand. Interpolated rather than stepped: a target that jumps 200
// kcal because someone trained one minute longer reads as a bug.
const FACTOR_ANCHORS: [minutes: number, factor: number][] = [
  [0, 1.2], [20, 1.375], [42, 1.55], [65, 1.725], [90, 1.9],
];

export function activityFactor(avgTrainingMinutes: number): number {
  const m = Math.max(0, avgTrainingMinutes);
  const last = FACTOR_ANCHORS[FACTOR_ANCHORS.length - 1];
  if (m >= last[0]) return last[1];
  for (let i = 1; i < FACTOR_ANCHORS.length; i++) {
    const [x1, y1] = FACTOR_ANCHORS[i - 1];
    const [x2, y2] = FACTOR_ANCHORS[i];
    if (m <= x2) return y1 + ((m - x1) / (x2 - x1)) * (y2 - y1);
  }
  return 1.55;
}

/**
 * Daily calorie, macro and hydration targets, derived rather than typed in.
 *
 * Calories come from the body (Mifflin-St Jeor x activity x diet goal); the
 * macro split comes from the sport goal. Those are genuinely different
 * questions and were previously answered by one crude number.
 *
 * Two things are deliberately conservative:
 *
 *  - Training is counted ONCE. The activity factor is derived from logged
 *    minutes where there's enough of a record, and only falls back to the
 *    self-reported week otherwise. Adding measured training on top of a factor
 *    that already assumes it is the classic way these calculators end up
 *    several hundred calories high.
 *
 *  - Under-18s are never put into a deficit, and nobody is ever targeted below
 *    their resting metabolic rate. This app is aimed at young athletes; a
 *    number on a screen telling a 15-year-old to eat less is not a feature.
 */
export function nutritionTargets(input: TargetInput): NutritionTargets | null {
  const { weightKg, goal, avgTrainingMinutes } = input;
  if (!weightKg || weightKg <= 0) return null;

  const g = goal ?? "speed";
  const age = input.age ?? null;
  const sex = input.sex ?? null;
  const heightCm = input.heightCm ?? null;

  const hasBody = !!(heightCm && heightCm > 0 && age && age > 0 && sex);
  const missing: string[] = [];
  if (!heightCm || heightCm <= 0) missing.push("height");
  if (!age || age <= 0) missing.push("age");
  if (!sex) missing.push("sex");

  // Count training once — measured if there's a real record, self-reported if not.
  const measured = (input.trainingDaysLogged ?? 0) >= MIN_DAYS_FOR_MEASURED;
  const selfFactor = input.activity
    ? ACTIVITY_LEVELS.find((a) => a.id === input.activity)?.factor
    : undefined;
  const factor = measured ? activityFactor(avgTrainingMinutes) : selfFactor ?? activityFactor(avgTrainingMinutes);

  let guard: string | null = null;

  // A deficit is a choice an adult makes. For a growing athlete it isn't one
  // we'll make on their behalf.
  let adjust = DIET_GOALS.find((d) => d.id === input.dietGoal)?.adjust ?? 0;
  if (age != null && age < 18 && adjust < 0) {
    adjust = 0;
    guard = "You're still growing, so we've set this to fuel training rather than cut calories.";
  }

  let bmr: number | null = null;
  let tdee: number | null = null;
  let calories: number;

  if (hasBody) {
    bmr = basalRate({ sex: sex as Sex, age: age as number, heightCm: heightCm as number, weightKg });
    tdee = Math.round(bmr * factor);
    calories = Math.round(tdee * (1 + adjust));
  } else {
    // Without height and age there's no resting-rate equation to use. ~30 kcal/kg
    // plus the work done is the standard rough substitute — good enough to be
    // useful, and the UI asks for the missing pieces.
    calories = Math.round((weightKg * 30 + avgTrainingMinutes * 8) * (1 + adjust));
  }

  // Nobody is targeted below what their body burns doing nothing.
  const ABSOLUTE_FLOOR = 1200;
  const floor = Math.max(bmr ?? 0, ABSOLUTE_FLOOR);
  if (calories < floor) {
    guard = guard ?? (bmr != null && bmr >= ABSOLUTE_FLOOR
      ? "Held at your resting metabolic rate — eating below what your body burns at rest backfires."
      : "Held at our lower limit. Any less than this isn't something we'll recommend.");
    calories = floor;
  }
  calories = Math.round(calories / 10) * 10;

  // Protein: whichever of the sport goal and the diet goal asks for more.
  const proteinPerKg = Math.max(
    PROTEIN_PER_KG[g],
    input.dietGoal ? DIET_PROTEIN_PER_KG[input.dietGoal] : 0
  );
  const protein = Math.round(weightKg * proteinPerKg);

  let fats = Math.round(weightKg * FAT_PER_KG[g]);
  const fatFloor = Math.round(weightKg * FAT_FLOOR_PER_KG);
  let carbs = Math.round((calories - protein * 4 - fats * 9) / 4);

  // In a hard deficit the remainder can leave too little to train on. Take it
  // out of fat first, down to the hormone floor.
  const carbFloor = Math.round(weightKg * CARB_FLOOR_PER_KG);
  if (carbs < carbFloor) {
    carbs = carbFloor;
    const over = protein * 4 + carbs * 4 + fats * 9 - calories;
    if (over > 0) fats = Math.max(fatFloor, fats - Math.round(over / 9));
  }
  fats = Math.max(fatFloor, fats);

  // Never show a macro breakdown that contradicts the headline number. If the
  // floors pushed the macros above the target, the target is what moves.
  // Rounding grams to whole numbers shifts the total by a couple of kcal, which
  // is noise. A gap bigger than that means a floor bound — and then it's the
  // headline number that moves, not the macros, so the card always adds up.
  // Ceil rather than round: rounding to the nearest 10 can land back below the
  // macro sum, which is the contradiction this exists to prevent.
  const macroKcal = protein * 4 + carbs * 4 + fats * 9;
  if (macroKcal > calories + 10) {
    calories = Math.ceil(macroKcal / 10) * 10;
    guard = guard ?? "Raised to cover the minimum protein, fat and carbs your training needs.";
  }

  const water_ml = Math.min(
    WATER_CAP_ML,
    Math.round((weightKg * WATER_PER_KG + avgTrainingMinutes * WATER_PER_TRAINING_MIN) / 50) * 50
  );

  return {
    calories, protein, carbs, fats, water_ml,
    basis: hasBody ? "measured" : "estimated",
    bmr, tdee, missing, guard,
    rationale: rationaleFor({ hasBody, bmr, tdee, calories, protein, proteinPerKg, g, measured, avgTrainingMinutes, dietGoal: input.dietGoal ?? null }),
  };
}

function rationaleFor(a: {
  hasBody: boolean; bmr: number | null; tdee: number | null; calories: number;
  protein: number; proteinPerKg: number; g: GoalType; measured: boolean;
  avgTrainingMinutes: number; dietGoal: DietGoal | null;
}): string {
  const sport = a.g.replace("_", " ");
  const load = a.measured
    ? `your logged ${Math.round(a.avgTrainingMinutes)} min a day`
    : "the training week you described";

  if (a.hasBody) {
    const aim = DIET_GOALS.find((d) => d.id === a.dietGoal)?.label.toLowerCase();
    return `You burn about ${a.bmr} kcal at rest, and roughly ${a.tdee} with ${load}. ` +
      `${aim ? `To ${aim}, that's` : "That gives"} ${a.calories.toLocaleString()} kcal, ` +
      `with ${a.protein}g protein (${a.proteinPerKg}g/kg) and carbs weighted for ${sport}.`;
  }
  return `Estimated from your weight and ${load}: ${a.calories.toLocaleString()} kcal, ` +
    `${a.protein}g protein (${a.proteinPerKg}g/kg), carbs weighted for ${sport}. ` +
    `Add your height, age and sex to swap this rough guess for a proper metabolic estimate.`;
}
