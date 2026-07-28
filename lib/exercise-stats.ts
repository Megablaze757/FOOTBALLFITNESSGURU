// =============================================================================
// Per-exercise progression from the training log. Pure + tested.
//
// The Progress page could already tell you how much you trained. It couldn't
// tell you whether your squat was going up, which is the question people
// actually open a training app to answer.
//
// Drill names are free text, so "Back Squat", "back squat" and "Back  Squat "
// are one exercise here — grouped on a normalised key, displayed with the
// spelling the athlete used most.
// =============================================================================

import type { TrainingDrill, TrainingLog } from "./types";

export type Metric = "e1rm" | "tonnage" | "reps";

export interface ExercisePoint {
  date: string;
  /** Total reps performed: sum of sets x reps. */
  reps: number;
  sets: number;
  /** sets x reps x load. Null when the exercise carries no load. */
  tonnage: number | null;
  /** Heaviest load touched that day. */
  topLoad: number | null;
  /** Best estimated one-rep max that day. Null when there's nothing to estimate from. */
  e1rm: number | null;
}

export interface ExerciseOption {
  /** Grouping key — normalised, never shown. */
  key: string;
  /** What to put on screen. */
  name: string;
  sessions: number;
  lastDate: string;
  /** Whether any entry carried a load, which decides the metrics on offer. */
  hasLoad: boolean;
}

export type Direction = "improving" | "stable" | "declining";

export interface ExerciseProgress {
  name: string;
  points: ExercisePoint[];
  hasLoad: boolean;
  best: { value: number; date: string } | null;
  /** Percent change between the opening and closing thirds. Null if too short. */
  changePct: number | null;
  direction: Direction;
}

/** Group key: case- and whitespace-insensitive. */
export function exerciseKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Epley. Reliable in the 1–12 rep range and increasingly optimistic beyond it,
 * so past 12 we decline to guess rather than hand back a number that flatters.
 * A set of 20 press-ups is not evidence about anybody's one-rep max.
 */
export const MAX_REPS_FOR_1RM = 12;

export function estimate1RM(loadKg: number, reps: number): number | null {
  if (!(loadKg > 0) || !Number.isFinite(reps) || reps < 1 || reps > MAX_REPS_FOR_1RM) return null;
  return Math.round(loadKg * (1 + reps / 30));
}

function drillsOf(log: TrainingLog): TrainingDrill[] {
  return Array.isArray(log.drills) ? log.drills : [];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Every exercise in the window, most-trained first, so the picker leads with
 * what they'll want. Only exercises with a real name are offered — a blank one
 * groups everything unnamed into a meaningless "drill" line.
 */
export function exerciseOptions(logs: TrainingLog[]): ExerciseOption[] {
  const byKey = new Map<string, ExerciseOption & { spellings: Map<string, number> }>();

  for (const log of logs) {
    // A drill logged twice in one session is still one session for it.
    const seenToday = new Set<string>();
    for (const d of drillsOf(log)) {
      const label = (d?.name ?? "").trim();
      if (!label) continue;
      const key = exerciseKey(label);
      const entry = byKey.get(key) ?? {
        key, name: label, sessions: 0, lastDate: log.log_date, hasLoad: false,
        spellings: new Map<string, number>(),
      };
      if (!seenToday.has(key)) {
        entry.sessions += 1;
        seenToday.add(key);
      }
      if (log.log_date > entry.lastDate) entry.lastDate = log.log_date;
      if (num(d.load_kg) > 0) entry.hasLoad = true;
      entry.spellings.set(label, (entry.spellings.get(label) ?? 0) + 1);
      byKey.set(key, entry);
    }
  }

  return [...byKey.values()]
    .map((e): ExerciseOption => ({
      key: e.key,
      // Show it the way they usually write it, not however they wrote it first.
      name: commonest(e.spellings),
      sessions: e.sessions,
      lastDate: e.lastDate,
      hasLoad: e.hasLoad,
    }))
    .sort((a, b) => b.sessions - a.sessions || b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name));
}

/** Most-used spelling, ties broken alphabetically so the label never flickers. */
function commonest(spellings: Map<string, number>): string {
  let best = "";
  let bestCount = -1;
  for (const [label, count] of spellings) {
    if (count > bestCount || (count === bestCount && label.localeCompare(best) < 0)) {
      best = label;
      bestCount = count;
    }
  }
  return best;
}

/** One point per day the exercise appears, oldest first. */
export function exerciseSeries(logs: TrainingLog[], name: string): ExercisePoint[] {
  const key = exerciseKey(name);
  const byDate = new Map<string, ExercisePoint>();

  for (const log of logs) {
    for (const d of drillsOf(log)) {
      if (exerciseKey(d?.name ?? "") !== key) continue;

      const sets = num(d.sets);
      const reps = num(d.reps);
      const load = num(d.load_kg);
      const totalReps = sets * reps;

      const p = byDate.get(log.log_date) ?? {
        date: log.log_date, reps: 0, sets: 0, tonnage: null, topLoad: null, e1rm: null,
      };
      p.sets += sets;
      p.reps += totalReps;
      if (load > 0) {
        p.tonnage = (p.tonnage ?? 0) + totalReps * load;
        p.topLoad = Math.max(p.topLoad ?? 0, load);
        const est = estimate1RM(load, reps);
        // Best set of the day wins — a heavy triple beats a light ten.
        if (est != null) p.e1rm = Math.max(p.e1rm ?? 0, est);
      }
      byDate.set(log.log_date, p);
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function valueAt(p: ExercisePoint, metric: Metric): number | null {
  if (metric === "e1rm") return p.e1rm;
  if (metric === "tonnage") return p.tonnage;
  return p.reps || null;
}

/** The metrics worth offering for this exercise. Loadless work has only reps. */
export function metricsFor(hasLoad: boolean): { id: Metric; label: string; unit: string }[] {
  const reps = { id: "reps" as const, label: "Total reps", unit: "" };
  if (!hasLoad) return [reps];
  return [
    { id: "e1rm", label: "Est. 1RM", unit: "kg" },
    { id: "tonnage", label: "Volume", unit: "kg" },
    reps,
  ];
}

/**
 * Not a line of best fit. Opening third against closing third is harder to
 * mislead with one freak session, and it's the comparison an athlete makes in
 * their own head anyway.
 */
const MIN_POINTS_FOR_TREND = 4;
const STABLE_BAND_PCT = 5;

export function exerciseProgress(logs: TrainingLog[], name: string, metric: Metric = "e1rm"): ExerciseProgress {
  const points = exerciseSeries(logs, name);
  const hasLoad = points.some((p) => p.topLoad != null);
  const opt = exerciseOptions(logs).find((o) => o.key === exerciseKey(name));

  const values = points
    .map((p) => ({ date: p.date, value: valueAt(p, metric) }))
    .filter((v): v is { date: string; value: number } => v.value != null);

  let best: { value: number; date: string } | null = null;
  for (const v of values) if (!best || v.value > best.value) best = { value: v.value, date: v.date };

  let changePct: number | null = null;
  let direction: Direction = "stable";
  if (values.length >= MIN_POINTS_FOR_TREND) {
    const cut = Math.max(1, Math.floor(values.length / 3));
    const first = mean(values.slice(0, cut).map((v) => v.value));
    const last = mean(values.slice(-cut).map((v) => v.value));
    if (first > 0) {
      changePct = Math.round(((last - first) / first) * 1000) / 10;
      direction = changePct > STABLE_BAND_PCT ? "improving" : changePct < -STABLE_BAND_PCT ? "declining" : "stable";
    }
  }

  return { name: opt?.name ?? name.trim(), points, hasLoad, best, changePct, direction };
}

function mean(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
