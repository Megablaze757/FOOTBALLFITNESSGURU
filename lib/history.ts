// Pure aggregation of training + nutrition history into chartable series.
// Drives the Progress page and (via the edge function) the AI worker payload.

import type { NutritionLog, TrainingLog } from "./types";

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
  const sorted = asc(logs);
  const volume: DayPoint[] = [];
  const minutes: DayPoint[] = [];
  const byDrill = new Map<string, DrillStat>();
  let totalReps = 0;

  for (const log of sorted) {
    let dayVolume = 0;
    for (const d of log.drills ?? []) {
      const reps = (Number(d.sets) || 0) * (Number(d.reps) || 0);
      dayVolume += reps;
      totalReps += reps;
      const key = d.name.trim() || "drill";
      const stat = byDrill.get(key) ?? { name: key, sessions: 0, totalSets: 0, bestLoad: null };
      stat.sessions += 1;
      stat.totalSets += Number(d.sets) || 0;
      if (d.load_kg != null) stat.bestLoad = Math.max(stat.bestLoad ?? 0, Number(d.load_kg));
      byDrill.set(key, stat);
    }
    volume.push({ date: log.log_date, value: dayVolume });
    minutes.push({ date: log.log_date, value: log.total_minutes ?? 0 });
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
