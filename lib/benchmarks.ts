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

/** One saved test. Only the fields a resolver has to read. */
export interface BenchmarkRow {
  test_date?: string | null;
  created_at?: string | null;
  metrics?: Record<string, unknown> | null;
}

/**
 * The most recent value of each metric, across every test.
 *
 * THE LATEST ROW IS NOT THE LATEST NUMBER, and that is the bug this exists to
 * stop. The form saves what you typed and nothing more — "enter at least one
 * metric" — so a row is a TEST, not a profile: squat on Monday, 5k on Saturday,
 * two rows with one number each. Anything reading `.limit(1)` therefore sees
 * Saturday's 5k and no squat at all, and reports a lifter who has never
 * squatted. The zone guide on the library page did exactly that, and quietly
 * fell back to generic pace bands for runners whose last test happened to be a
 * lift.
 *
 * Newest wins per metric, not biggest: this answers "where are you now", which
 * is what a prescription and a pace band need. Best-ever is a different
 * question and lib/strength-standards.ts already answers it — a rank must never
 * fall because of one bad day, while a working weight must follow the bad day
 * or it prescribes a lift you cannot make.
 *
 * Same-day tests are ordered by `created_at`, because a date alone cannot
 * separate two rows saved an hour apart and the row order out of PostgREST is
 * not a promise.
 */
export function latestMetrics(rows: readonly BenchmarkRow[] | null | undefined): Record<string, number> {
  const newestFirst = [...(rows ?? [])].sort((a, b) => {
    const date = String(b.test_date ?? "").localeCompare(String(a.test_date ?? ""));
    return date !== 0 ? date : String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
  });

  const out: Record<string, number> = {};
  for (const row of newestFirst) {
    for (const [key, raw] of Object.entries(row.metrics ?? {})) {
      // A metric saved as null or as text is absent, not zero — writing 0 here
      // would prescribe a zero-kilo working weight and rank it as untrained.
      if (key in out) continue;
      // Number(null) is 0 and Number("") is 0, so the guard has to come before
      // the coercion — which is precisely how a null squat became a zero-kilo
      // one-rep max the first time this was written.
      if (raw === null || raw === undefined || raw === "") continue;
      const value = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(value)) out[key] = value;
    }
  }
  return out;
}

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
