// =============================================================================
// Finding an exercise in the library by the name something else called it, and
// finding the ones that could stand in for it.
//
// TWO CALLERS, ONE PROBLEM. A rehab plan names its exercises in prose written
// by a model ("Isometric hamstring hold"), and a programme names them from the
// catalogue ("Nordic curl") — and in both cases the athlete's next question is
// "how do I actually do that", which the library already answers for 339
// exercises. Nothing joined the two, so tapping a rehab exercise did nothing
// and a prescribed exercise you had no kit for was a dead end.
//
// EXACT FIRST, THEN FUZZY, AND THE ORDER IS THE WHOLE DESIGN. A fuzzy matcher
// that runs first will confidently return "Leg Extension" for "Terminal knee
// extension" — a real exercise, the wrong one, presented with the same
// confidence as a correct match. Exact key matching handles the common case
// perfectly; fuzzy only ever runs on what is left, and it has to clear a bar
// before it answers at all.
//
// Pure + tested.
// =============================================================================

import { EXERCISES, type Exercise } from "./exercises";
import { exerciseKey } from "./exercise-stats";

const BY_KEY = new Map<string, Exercise>();
for (const ex of EXERCISES) BY_KEY.set(exerciseKey(ex.name), ex);

/**
 * Words that carry no distinguishing information in an exercise name.
 *
 * Without this, "Dumbbell press" and "Leg press" share a word and a naive
 * overlap score calls them related.
 */
const NOISE = new Set([
  "the", "and", "with", "for", "your", "a", "an", "of", "to", "on", "in",
  "exercise", "variation", "style", "position", "hold", "holds",
]);

function words(name: string): string[] {
  return String(name ?? "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 2 && !NOISE.has(w))
    .map(stem);
}

function stem(w: string): string {
  return w.replace(/(ings|ing|es|s)$/, "");
}

/**
 * How confident a fuzzy match has to be before it answers.
 *
 * The score is the share of the QUERY's significant words that the candidate
 * also has. Two thirds means "Isometric hamstring hold" matches "Hamstring
 * isometric" but not "Hamstring curl" — the second shares one word out of
 * three, and returning it would tell somebody with a torn hamstring to do the
 * exercise their plan is specifically keeping them away from.
 */
const MIN_SCORE = 0.66;

/**
 * The library exercise a name refers to, or null.
 *
 * Null rather than a best guess is the point. A wrong how-to for a rehab
 * exercise is worse than no how-to: the athlete follows it.
 */
export function findExercise(name: string): Exercise | null {
  const key = exerciseKey(name);
  if (!key) return null;

  const exact = BY_KEY.get(key);
  if (exact) return exact;

  const q = words(name);
  if (q.length === 0) return null;

  let best: { ex: Exercise; score: number } | null = null;
  for (const ex of EXERCISES) {
    const c = new Set(words(ex.name));
    if (c.size === 0) continue;
    const hit = q.filter((w) => c.has(w)).length;
    // Share of the QUERY matched, penalised for candidate words that had
    // nothing to do with it — otherwise "Squat" scores 1.0 against every one of
    // the twenty-five exercises with "squat" in the name, and the shortest name
    // in the library wins every fuzzy lookup by accident.
    const score = (hit / q.length) * (hit / c.size);
    if (score >= MIN_SCORE && (!best || score > best.score)) best = { ex, score };
  }
  return best?.ex ?? null;
}

/** Whether the library can teach this movement, as opposed to merely listing it. */
export function hasHowTo(name: string): boolean {
  const ex = findExercise(name);
  return !!ex && (ex.hasHowTo === true || (ex.cues?.length ?? 0) > 0);
}

// --- swapping ----------------------------------------------------------------

/**
 * Muscle words that say nothing about what an exercise is for.
 *
 * "Full body" and "Whole body" appear on carries, burpees and Olympic lifts
 * alike, so counting them as a shared muscle makes every one of those a
 * substitute for every other.
 */
const VAGUE_MUSCLES = new Set(["full body", "whole body", "legs", "cardio"]);

function muscleSet(ex: Exercise): Set<string> {
  return new Set((ex.muscles ?? [])
    .map((m) => String(m).toLowerCase().trim())
    .filter((m) => m && !VAGUE_MUSCLES.has(m)));
}

export interface SwapOption {
  ex: Exercise;
  /** 0..1. How well it covers what the original trained. */
  score: number;
  /** One line the athlete can judge for themselves. */
  why: string;
}

/**
 * Exercises that could reasonably replace this one.
 *
 * RANKED BY WHAT THEY TRAIN, NOT BY WHAT THEY LOOK LIKE. Somebody swapping a
 * barbell back squat is almost always doing it because they have no barbell, so
 * ranking by similarity of equipment would offer them the front squat, the box
 * squat and the pause squat — three more barbell lifts and no help at all.
 * Shared muscles first, and different equipment is a mild PLUS rather than a
 * penalty for exactly that reason.
 *
 * Returns [] rather than guessing when the original is not in the library:
 * suggesting substitutes for a movement we cannot identify is how somebody ends
 * up replacing their rehab isometric with a leg extension.
 */
export function similarExercises(name: string, limit = 6): SwapOption[] {
  const original = findExercise(name);
  if (!original) return [];

  const want = muscleSet(original);
  if (want.size === 0) return [];

  const out: SwapOption[] = [];
  for (const ex of EXERCISES) {
    if (ex.id === original.id) continue;
    const has = muscleSet(ex);
    if (has.size === 0) continue;

    const shared = [...want].filter((m) => has.has(m));
    if (shared.length === 0) continue;

    // Jaccard: rewards covering what the original trained WITHOUT dragging in a
    // lot it didn't. A deadlift shares "hamstrings" with a leg curl and also
    // loads the whole back, and it is not a leg-curl substitute.
    const union = new Set([...want, ...has]).size;
    let score = shared.length / union;

    // Same kind of training is a strong signal — a strength movement should be
    // replaced by a strength movement, not by a mobility drill.
    if (ex.category === original.category) score += 0.25;
    // Different kit is usually the reason for the swap in the first place.
    if (ex.equipment !== original.equipment) score += 0.05;

    out.push({
      ex,
      score,
      why: `${shared.map(titleCase).join(", ")}${ex.equipment && ex.equipment !== "None" ? ` · ${ex.equipment}` : " · no kit"}`,
    });
  }

  return out.sort((a, b) => b.score - a.score || a.ex.name.localeCompare(b.ex.name)).slice(0, limit);
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
