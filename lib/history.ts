// Pure aggregation of training + nutrition history into chartable series.
// Drives the Progress page and (via the edge function) the AI worker payload.

// Aliased: this file already has a `totalReps` accumulator, and importing
// the helper under the same name shadowed it silently.
import { setCount, topLoad, totalReps as drillReps } from "./training-sets";
import type { NutritionLog, TrainingLog } from "./types";
import { durationMinutes, isActivity } from "./training-duration";

export interface DayPoint {
  date: string; // ISO, oldest -> newest
  value: number;
}

export interface DrillStat {
  name: string;
  sessions: number; // days it appeared
  totalSets: number;
  bestLoad: number | null; // heaviest load_kg seen
}

export interface TrainingSummary {
  volume: DayPoint[]; // sum(sets*reps) per day
  minutes: DayPoint[];
  drillFrequency: DrillStat[];
  totalSessions: number;
  totalReps: number;
}

export interface NutritionSummary {
  calories: DayPoint[];
  protein: DayPoint[];
  water: DayPoint[]; // litres
  avgCalories: number | null;
  avgProtein: number | null;
}

const KCAL = { protein: 4, carbs: 4, fats: 9 };

function asc<T extends { log_date: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.log_date.localeCompare(b.log_date));
}

export function summarizeTraining(logs: TrainingLog[]): TrainingSummary {
  const sorted = asc(logs.filter(isActivity));
  const volume: DayPoint[] = [];
  const minutes: DayPoint[] = [];
  const byDrill = new Map<string, DrillStat>();
  let totalReps = 0;

  for (const log of sorted) {
    let dayVolume = 0;
    for (const d of log.drills ?? []) {
      const reps = drillReps(d);
      dayVolume += reps;
      totalReps += reps;
      const key = d.name.trim() || "drill";
      const stat = byDrill.get(key) ?? { name: key, sessions: 0, totalSets: 0, bestLoad: null };
      stat.sessions += 1;
      stat.totalSets += setCount(d);
      // topLoad, so a heavy top set inside a detailed log is not lost behind
      // the summary's rounded figure.
      const best = topLoad(d);
      if (best != null) stat.bestLoad = Math.max(stat.bestLoad ?? 0, best);
      byDrill.set(key, stat);
    }
    volume.push({ date: log.log_date, value: dayVolume });
    minutes.push({ date: log.log_date, value: +durationMinutes(log).toFixed(2) });
  }

  const drillFrequency = [...byDrill.values()].sort((a, b) => b.sessions - a.sessions || b.totalSets - a.totalSets);
  return { volume, minutes, drillFrequency, totalSessions: sorted.length, totalReps };
}

export function caloriesFromMacros(m: NutritionLog["macros"]): number {
  return Math.round((m?.protein ?? 0) * KCAL.protein + (m?.carbs ?? 0) * KCAL.carbs + (m?.fats ?? 0) * KCAL.fats);
}

export function summarizeNutrition(logs: NutritionLog[]): NutritionSummary {
  const sorted = asc(logs);
  const calories = sorted.map((l) => ({ date: l.log_date, value: caloriesFromMacros(l.macros) }));
  const protein = sorted.map((l) => ({ date: l.log_date, value: Math.round(l.macros?.protein ?? 0) }));
  const water = sorted.map((l) => ({ date: l.log_date, value: +(((l.daily_water_intake_ml ?? 0) / 1000)).toFixed(2) }));
  return {
    calories,
    protein,
    water,
    avgCalories: avg(calories.map((p) => p.value)),
    avgProtein: avg(protein.map((p) => p.value)),
  };
}

function avg(nums: number[]): number | null {
  const v = nums.filter((n) => n > 0);
  if (!v.length) return null;
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}
