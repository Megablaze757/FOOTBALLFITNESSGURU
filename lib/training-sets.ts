// =============================================================================
// Per-set logging, without breaking everything that reads the summary.
//
// A drill was stored as one row of numbers — `{ sets: 3, reps: 10, load_kg: 40 }`
// — which says "three sets of ten at forty" and cannot say anything else. That
// is not how a set actually goes: reps fall as you tire, load climbs across
// warm-ups, and the last set is the one worth looking at. An athlete logging
// 12/10/8 had to pick a number and lose the rest.
//
// WHY NOT JUST REPLACE THE SHAPE. `sets` and `reps` are read by session load
// (lib/load.ts), personal history (lib/history.ts), weekly muscle volume
// (lib/muscle-volume.ts) and the progression rules in lib/coach.ts, plus every
// row already in the database. Changing the shape underneath them would either
// break those or silently change what they compute — and load feeding ACWR
// means a silent change there tells athletes to back off on the wrong week.
//
// So `sets_detail` is ADDITIVE. When it is there it is the truth; when it is
// absent the old three numbers are, and this module is the one place that knows
// the difference. Readers ask here instead of multiplying two fields.
//
// THE SUMMARY STAYS HONEST. Whenever detail is written, the three legacy fields
// are recomputed from it, so anything that has not been migrated still sees
// numbers that add up rather than a stale "3 × 10" beside sets of 12, 10 and 8.
// =============================================================================

import type { TrainingDrill } from "./types";

export interface DrillSet {
  reps: number;
  /** Null is a bodyweight set, which is different from an unrecorded one. */
  load_kg?: number | null;
  /** Prep work: stored and displayed, but never counted as a working set. */
  isWarmup?: boolean;
}

/**
 * The sets of a drill, however it was logged.
 *
 * With no detail this expands the summary — three sets of ten becomes three
 * identical sets — so a caller never has to branch. Expanding rather than
 * returning empty matters: the alternative is every reader writing its own
 * `detail?.length ? … : sets * reps`, which is exactly the duplicated arithmetic
 * this module exists to remove.
 */
export function setsOf(drill: Pick<TrainingDrill, "sets" | "reps" | "load_kg" | "sets_detail">): DrillSet[] {
  const detail = drill.sets_detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((s) => ({
      reps: Math.max(0, Number(s.reps) || 0),
      load_kg: s.load_kg ?? null,
      isWarmup: s.isWarmup === true,
    }));
  }
  const count = Math.max(0, Math.floor(Number(drill.sets) || 0));
  const reps = Math.max(0, Number(drill.reps) || 0);
  return Array.from({ length: count }, () => ({ reps, load_kg: drill.load_kg ?? null }));
}

/** Sets that affect PRs, strength, and volume. */
export function workingSetsOf(drill: Pick<TrainingDrill, "sets" | "reps" | "load_kg" | "sets_detail">): DrillSet[] {
  return setsOf(drill).filter((s) => !s.isWarmup);
}

/** Prep sets, retained for the session history but excluded from performance. */
export function warmupSetsOf(drill: Pick<TrainingDrill, "sets" | "reps" | "load_kg" | "sets_detail">): DrillSet[] {
  return setsOf(drill).filter((s) => s.isWarmup);
}

/** Total reps actually performed. The number session load is built from. */
export function totalReps(drill: Pick<TrainingDrill, "sets" | "reps" | "load_kg" | "sets_detail">): number {
  return workingSetsOf(drill).reduce((n, s) => n + s.reps, 0);
}

/** How many sets were done. */
export function setCount(drill: Pick<TrainingDrill, "sets" | "reps" | "load_kg" | "sets_detail">): number {
  return workingSetsOf(drill).length;
}

/** The heaviest set. What progression in lib/coach.ts compares week to week. */
export function topLoad(drill: Pick<TrainingDrill, "sets" | "reps" | "load_kg" | "sets_detail">): number | null {
  const loads = workingSetsOf(drill).map((s) => s.load_kg).filter((l): l is number => l != null && l > 0);
  return loads.length ? Math.max(...loads) : null;
}

/**
 * Rewrite the three legacy fields so they still describe the sets.
 *
 * `reps` is the ROUNDED AVERAGE, and that is a deliberate compromise: nothing
 * can represent 12/10/8 in a single number, and the average keeps `sets × reps`
 * closest to the real total for readers that have not been taught about detail.
 * Anything that needs the true figure calls totalReps instead — which, inside
 * this codebase, all of them now do.
 */
export function withSets(drill: TrainingDrill, sets: DrillSet[]): TrainingDrill {
  const clean = sets.map((s) => ({
    reps: Math.max(0, Math.floor(Number(s.reps) || 0)),
    load_kg: s.load_kg ?? null,
    ...(s.isWarmup ? { isWarmup: true } : {}),
  }));
  if (clean.length === 0) {
    // Deleting the last set means "I did not do this", not "I did it zero
    // times with the old numbers still attached".
    return { ...drill, sets: 0, reps: 0, load_kg: null, sets_detail: [] };
  }
  const working = clean.filter((s) => !s.isWarmup);
  const total = working.reduce((n, s) => n + s.reps, 0);
  const loads = working.map((s) => s.load_kg).filter((l): l is number => l != null && l > 0);
  return {
    ...drill,
    sets: working.length,
    reps: working.length ? Math.round(total / working.length) : 0,
    load_kg: loads.length ? Math.max(...loads) : null,
    sets_detail: clean,
  };
}

/** Whether this drill was logged set by set, rather than as one summary. */
export function hasSetDetail(drill: Pick<TrainingDrill, "sets_detail">): boolean {
  return Array.isArray(drill.sets_detail) && drill.sets_detail.length > 0;
}

/**
 * One line describing what was done.
 *
 * Identical sets collapse to "3 × 10" because writing "10, 10, 10" is noise;
 * varied ones are listed, because the variation IS the information. Load is
 * appended once when every set shared it and per-set when it climbed.
 */
export function describeSets(drill: Pick<TrainingDrill, "sets" | "reps" | "load_kg" | "sets_detail">): string {
  const sets = workingSetsOf(drill);
  if (sets.length === 0) return "—";

  const sameReps = sets.every((s) => s.reps === sets[0].reps);
  const loads = sets.map((s) => s.load_kg ?? null);
  const sameLoad = loads.every((l) => l === loads[0]);

  const repPart = sameReps ? `${sets.length} × ${sets[0].reps}` : sets.map((s) => s.reps).join(", ");

  if (sameLoad) {
    return loads[0] != null && loads[0] > 0 ? `${repPart} @ ${trim(loads[0])}kg` : repPart;
  }
  // Loads varied, so each set carries its own — a top set of 60 after two at 40
  // is the whole point of logging them separately.
  return sets.map((s) => (s.load_kg != null && s.load_kg > 0 ? `${s.reps}@${trim(s.load_kg)}` : `${s.reps}`)).join(", ");
}

/** 42.5 stays 42.5; 40.0 becomes 40. */
function trim(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * What this drill looked like the last time it was done.
 *
 * DERIVE RATHER THAN ASK — docs/UI-AUDIT.md is explicit that the best remaining
 * ideas for the check-in form are subtractive, and this is one: the page
 * already loads 28 days of training logs for the ACWR calculation, so the app
 * knows you squatted 12/10/8 at 40kg on Tuesday and was still making you type
 * it again on Thursday. Nothing new is fetched.
 *
 * Names are matched case-insensitively and trimmed, because "Back squat" typed
 * once and "back squat " typed later are the same exercise to everyone except a
 * string comparison.
 */
export function lastSetsFor(
  logs: { log_date?: string; drills?: TrainingDrill[] | null }[] | null | undefined,
  name: string,
): DrillSet[] | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;

  // Newest first. Sorted here rather than trusted, because the query that
  // supplies these is ordered for a different purpose and could change.
  const sorted = [...(logs ?? [])].sort((a, b) => String(b.log_date ?? "").localeCompare(String(a.log_date ?? "")));
  for (const log of sorted) {
    for (const d of log.drills ?? []) {
      if (String(d.name ?? "").trim().toLowerCase() !== wanted) continue;
      const sets = workingSetsOf(d);
      // A drill recorded with zero sets is not a previous performance.
      if (sets.length > 0 && sets.some((s) => s.reps > 0)) return sets;
    }
  }
  return null;
}

/**
 * Reps times load, summed. The number that makes a session feel like it counted
 * — and it costs nothing, because both halves are already recorded.
 *
 * Bodyweight sets contribute zero rather than being skipped: the total is
 * tonnage lifted, and a set with no bar on it did not lift any.
 */
export function drillTonnage(drill: Pick<TrainingDrill, "sets" | "reps" | "load_kg" | "sets_detail">): number {
  return workingSetsOf(drill).reduce((n, s) => n + s.reps * (s.load_kg ?? 0), 0);
}
