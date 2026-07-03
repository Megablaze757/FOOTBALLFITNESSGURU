// =============================================================================
// Smart nutrition targets — derives daily calorie/macro/hydration goals from the
// athlete's weight, goal and recent training load. Pure + tested.
// =============================================================================

import type { GoalType } from "./coach";

export interface NutritionTargets {
  calories: number;
  protein: number; // g
  carbs: number; // g
  fats: number; // g
  water_ml: number;
  rationale: string;
}

interface TargetInput {
  weightKg: number | null;
  goal: GoalType | null;
  avgTrainingMinutes: number; // recent daily average
}

// Protein g/kg by goal (sports-nutrition ranges).
const PROTEIN_PER_KG: Record<GoalType, number> = {
  strength: 2.0,
  injury_recovery: 2.0,
  speed: 1.8,
  agility: 1.7,
  endurance: 1.6,
  skill: 1.6,
};

// Carb emphasis by goal (g/kg baseline, scaled by training volume).
const CARB_PER_KG: Record<GoalType, number> = {
  endurance: 6,
  speed: 5,
  agility: 5,
  strength: 4,
  skill: 4,
  injury_recovery: 3.5,
};

export function nutritionTargets({ weightKg, goal, avgTrainingMinutes }: TargetInput): NutritionTargets | null {
  if (!weightKg || weightKg <= 0) return null;
  const g = goal ?? "speed";

  // Maintenance estimate: ~30 kcal/kg base + training expenditure (~8 kcal/min).
  const trainingKcal = Math.round(avgTrainingMinutes * 8);
  const base = Math.round(weightKg * 30);
  const calories = Math.round((base + trainingKcal) / 10) * 10;

  const protein = Math.round(weightKg * PROTEIN_PER_KG[g]);
  // Carbs scale up a little with training volume.
  const carbScale = 1 + Math.min(0.4, avgTrainingMinutes / 150);
  const carbs = Math.round(weightKg * CARB_PER_KG[g] * carbScale);

  // Fats fill the remaining calories (min 0.8 g/kg for hormones).
  const kcalFromPC = protein * 4 + carbs * 4;
  const fats = Math.max(Math.round(weightKg * 0.8), Math.round((calories - kcalFromPC) / 9));

  const water_ml = Math.round((weightKg * 35 + avgTrainingMinutes * 12) / 50) * 50;

  return {
    calories,
    protein,
    carbs,
    fats,
    water_ml,
    rationale: `Tuned for ${g.replace("_", " ")} at ${Math.round(weightKg)}kg with ~${Math.round(avgTrainingMinutes)} min/day training: ${PROTEIN_PER_KG[g]} g/kg protein, carbs weighted to fuel your sessions.`,
  };
}
