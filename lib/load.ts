// =============================================================================
// Training-load management — sRPE, acute:chronic workload ratio (ACWR), streaks,
// and a weekly report. Real sports-science used by pro setups; pure + tested.
// =============================================================================

import type { DailyCheckIn, NutritionLog, TrainingLog } from "./types";

/** Session load = duration × intensity (session-RPE). Falls back to rep volume. */
export function sessionLoad(t: TrainingLog): number {
  const sRPE = (t.total_minutes ?? 0) * (t.intensity ?? 0);
  if (sRPE > 0) return sRPE;
  return (t.drills ?? []).reduce((s, d) => s + (Number(d.sets) || 0) * (Number(d.reps) || 0), 0);
}

export type LoadZone = "building" | "detraining" | "optimal" | "caution" | "danger";

export interface ACWR {
  acute: number; // avg daily load, last 7d
  chronic: number; // avg daily load, last 28d
  ratio: number | null; // acute / chronic
  zone: LoadZone;
  message: string;
}

function dailyLoadMap(logs: TrainingLog[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of logs) m.set(t.log_date, (m.get(t.log_date) ?? 0) + sessionLoad(t));
  return m;
}

function windowAvg(map: Map<string, number>, asOf: Date, days: number): number {
  let total = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(asOf.getTime() - i * 86400_000).toISOString().slice(0, 10);
    total += map.get(d) ?? 0;
  }
  return total / days;
}

/**
 * Acute:chronic workload ratio. The "sweet spot" is ~0.8–1.3; >1.5 is a load
 * spike associated with elevated injury risk; <0.8 is detraining.
 */
export function computeACWR(logs: TrainingLog[], asOf = new Date()): ACWR {
  const map = dailyLoadMap(logs);
  const acute = +windowAvg(map, asOf, 7).toFixed(0);
  const chronic = +windowAvg(map, asOf, 28).toFixed(0);

  if (chronic === 0) {
    return { acute, chronic, ratio: null, zone: "building", message: "Building your baseline — keep logging training to unlock load tracking." };
  }
  const ratio = +(acute / chronic).toFixed(2);
  let zone: LoadZone;
  let message: string;
  if (ratio < 0.8) { zone = "detraining"; message = "Load is dropping off — you may be detraining. Add volume back gradually."; }
  else if (ratio <= 1.3) { zone = "optimal"; message = "Load is in the sweet spot — well balanced and progressing safely."; }
  else if (ratio <= 1.5) { zone = "caution"; message = "Load is climbing fast. Hold here rather than adding more this week."; }
  else { zone = "danger"; message = "Sharp load spike — elevated injury risk. Back off volume for a few days."; }
  return { acute, chronic, ratio, zone, message };
}

/** Consecutive check-in days ending today (or yesterday). */
export function checkInStreak(dates: string[], today = new Date().toISOString().slice(0, 10)): number {
  const set = new Set(dates);
  let streak = 0;
  let cursor = new Date(today);
  // Allow the streak to count if today isn't logged yet but yesterday was.
  if (!set.has(today)) cursor = new Date(cursor.getTime() - 86400_000);
  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor = new Date(cursor.getTime() - 86400_000);
  }
  return streak;
}

export interface WeeklyReport {
  checkIns: number;
  avgReadinessInputs: { sleep: number | null; fatigue: number | null };
  sessions: number;
  totalLoad: number;
  loadTrend: "up" | "down" | "flat";
  nutritionDays: number;
  topWin: string;
  focus: string;
}

/** A plain-language weekly summary from the last 7 days vs the prior 7. */
export function weeklyReport(
  checkIns: DailyCheckIn[],
  training: TrainingLog[],
  nutrition: NutritionLog[],
  asOf = new Date()
): WeeklyReport {
  const cutoff = new Date(asOf.getTime() - 7 * 86400_000).toISOString().slice(0, 10);
  const prevCutoff = new Date(asOf.getTime() - 14 * 86400_000).toISOString().slice(0, 10);

  const weekCheck = checkIns.filter((c) => c.check_in_date > cutoff);
  const weekTrain = training.filter((t) => t.log_date > cutoff);
  const prevTrain = training.filter((t) => t.log_date > prevCutoff && t.log_date <= cutoff);
  const weekNut = nutrition.filter((n) => n.log_date > cutoff);

  const totalLoad = Math.round(weekTrain.reduce((s, t) => s + sessionLoad(t), 0));
  const prevLoad = prevTrain.reduce((s, t) => s + sessionLoad(t), 0);
  const loadTrend = totalLoad > prevLoad * 1.1 ? "up" : totalLoad < prevLoad * 0.9 ? "down" : "flat";

  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null;
  };

  const win =
    weekTrain.length >= 4 ? `${weekTrain.length} training sessions logged — strong consistency.`
    : weekCheck.length >= 5 ? "You checked in most days — great habit streak."
    : weekNut.length >= 4 ? "Nutrition logged consistently this week."
    : "You kept the daily loop going.";

  const focus =
    loadTrend === "up" ? "Load is rising — protect recovery (sleep + mobility) this week."
    : weekTrain.length < 3 ? "Aim for one more quality session next week."
    : "Hold this rhythm and chase a benchmark PR.";

  return {
    checkIns: weekCheck.length,
    avgReadinessInputs: { sleep: avg(weekCheck.map((c) => c.sleep_quality)), fatigue: avg(weekCheck.map((c) => c.fatigue_score)) },
    sessions: weekTrain.length,
    totalLoad,
    loadTrend,
    nutritionDays: weekNut.length,
    topWin: win,
    focus,
  };
}
