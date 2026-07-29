// Catalog of strength/performance benchmarks. Stored in strength_benchmarks.metrics
// (JSONB) so this list can grow without a migration. `lowerIsBetter` flips the
// improvement direction for time-based metrics (sprints).

export interface MetricDef {
  key: string;
  label: string;
  unit: string;
  lowerIsBetter?: boolean;
}

export const METRIC_CATALOG: MetricDef[] = [
  { key: "squat_1rm", label: "Back squat 1RM", unit: "kg" },
  { key: "bench_1rm", label: "Bench press 1RM", unit: "kg" },
  { key: "deadlift_1rm", label: "Deadlift 1RM", unit: "kg" },
  { key: "sprint_10m", label: "10m sprint", unit: "s", lowerIsBetter: true },
  { key: "sprint_20m", label: "20m sprint", unit: "s", lowerIsBetter: true },
  { key: "sprint_40m", label: "40m sprint", unit: "s", lowerIsBetter: true },
  { key: "vertical_jump_cm", label: "Vertical jump", unit: "cm" },
  { key: "yo_yo_level", label: "Yo-Yo IR1 level", unit: "lvl" },

  // Everything above this line is a football test. The catalogue was offering a
  // Yo-Yo IR1 level to weightlifters and had nothing at all a runner could
  // record — so "track your benchmarks" meant "track a footballer's benchmarks".
  // lib/sport-profile.ts decides which of these each sport is shown.
  { key: "bronco_s", label: "Bronco test", unit: "s", lowerIsBetter: true },
  { key: "lane_agility_s", label: "Lane agility drill", unit: "s", lowerIsBetter: true },
  { key: "run_1500m_min", label: "1500m time", unit: "min", lowerIsBetter: true },
  { key: "run_5k_min", label: "5k time", unit: "min", lowerIsBetter: true },
  { key: "run_10k_min", label: "10k time", unit: "min", lowerIsBetter: true },
  { key: "snatch_1rm", label: "Snatch 1RM", unit: "kg" },
  { key: "clean_jerk_1rm", label: "Clean & jerk 1RM", unit: "kg" },
  { key: "front_squat_1rm", label: "Front squat 1RM", unit: "kg" },
  { key: "ohp_1rm", label: "Overhead press 1RM", unit: "kg" },
  { key: "pullups_max", label: "Max pull-ups", unit: "reps" },
];

export function metricDef(key: string): MetricDef {
  return METRIC_CATALOG.find((m) => m.key === key) ?? { key, label: key, unit: "" };
}

/** Signed delta where positive always means "improved", honouring lowerIsBetter. */
export function improvementDelta(key: string, latest: number, previous: number): number {
  const def = metricDef(key);
  const raw = latest - previous;
  return def.lowerIsBetter ? -raw : raw;
}

export interface BenchmarkProgress {
  pct: number; // 0..100 of the way from baseline to target
  current: number;
  achieved: boolean;
  label: string; // e.g. "1.75 → 1.65 s"
}

/** Progress from a baseline toward a target, honouring lowerIsBetter metrics. */
export function benchmarkProgress(metricKey: string, baseline: number, target: number, current: number): BenchmarkProgress {
  const def = metricDef(metricKey);
  const span = target - baseline; // signed
  const moved = current - baseline;
  let pct = span === 0 ? 100 : (moved / span) * 100;
  pct = Math.max(0, Math.min(100, pct));
  const achieved = def.lowerIsBetter ? current <= target : current >= target;
  return {
    pct: achieved ? 100 : Math.round(pct),
    current,
    achieved,
    label: `${baseline} → ${target} ${def.unit}`,
  };
}
