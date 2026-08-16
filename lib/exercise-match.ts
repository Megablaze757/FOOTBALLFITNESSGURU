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

/**
 * A crude singular form, so "calf raises" and "calf raise" are the same word.
 *
 * THE NAIVE VERSION WAS WORSE THAN NONE. Stripping `(ings|ing|es|s)$` turns
 * "raises" into "rais" and leaves "raise" alone, so the two stopped matching —
 * and the library's own "Eccentric calf raises" became unreachable from
 * "eccentric calf raise", which is what a rehab plan actually writes. A stemmer
 * that maps two spellings of one word to two different stems is doing the
 * opposite of its job.
 *
 * The English plural rules, in the order they have to be applied.
 */
function stem(w: string): string {
  if (w.endsWith("ies") && w.length > 4) return `${w.slice(0, -3)}y`;   // plies -> ply
  if (/(ss|sh|ch|x|z)es$/.test(w)) return w.slice(0, -2);               // presses -> press
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);      // raises -> raise
  if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);         // hopping -> hopp
  return w;
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
 * Different words for the same movement.
 *
 * Word overlap cannot connect "heel raise" to "standing calf raise" — they
 * share nothing — and no amount of tuning the threshold would, because they
 * genuinely have no words in common. These are the cases where two names mean
 * one exercise, which is a fact about English rather than about scoring.
 *
 * Kept deliberately small and one-directional. Every entry here is a claim that
 * two names are the SAME movement, and a wrong one sends somebody rehabbing a
 * hamstring to the wrong exercise — so the bar is "a physio would use these
 * interchangeably", not "these are related".
 */
const SYNONYMS: Record<string, string> = {
  "heel raise": "standing calf raise",
  "heel raises": "standing calf raise",
  "toe raise": "standing calf raise",
  "calf raise": "standing calf raise",
  "ball squeeze": "adductor isometric squeeze",
  "adductor squeeze": "adductor isometric squeeze",
  "groin squeeze": "adductor isometric squeeze",
  "hamstring catch": "nordic hamstring curl",
  "nordic curl": "nordic hamstring curl",
  "russian lean": "nordic hamstring curl",
  "clamshell": "band lateral walks",
  "glute med activation": "band lateral walks",
  "sit to stand": "box step up",
  "quad setting": "quad set",
  "vmo activation": "terminal knee extensions",
  "single leg stand": "single-leg balance progression",
  "balance drill": "single-leg balance progression",
  "trunk rotation": "thoracic spine openers",
  "thoracic rotation": "thoracic spine openers",
  "hip flexor stretch": "couch stretch",
};

/**
 * ONE NAME, TWO EXERCISES — resolved by which joint you are rehabbing.
 *
 * THIS SHIPPED BROKEN AND IS WORTH RECORDING. "Wall slide" means a supported
 * squat when the knee is the problem and a scapular slide up a wall when the
 * shoulder is. There was only a knee entry, so an athlete on a shoulder plan
 * tapped their wall slides and got a quad exercise — a real movement, the wrong
 * one, offered with exactly as much confidence as a correct answer. That is the
 * precise failure `findExercise` returning null was supposed to prevent, and it
 * came in through the front door because the two exercises shared a name.
 *
 * The test missed it for a related reason: "Wall slide" was listed under both
 * knee and shoulder in the rehab vocabulary, and asserting only that it
 * RESOLVED passed while resolving wrongly. Asserting what it resolves TO is the
 * fix, and that assertion now exists.
 *
 * With no area given, an ambiguous name resolves to nothing. A rehab plan
 * always knows its own body area, and guessing between two joints is how the
 * bug happened in the first place.
 */
const AMBIGUOUS: Record<string, Record<string, string>> = {
  "wall slide": { shoulder: "Wall angel", knee: "Wall slide squat" },
  "wall slides": { shoulder: "Wall angel", knee: "Wall slide squat" },
  "external rotation": { shoulder: "Band external rotation", hip: "Band lateral walks" },
  "isometric hold": { hamstring: "Isometric hamstring hold", calf: "Isometric calf hold", knee: "Isometric wall sit" },
  "isometric holds": { hamstring: "Isometric hamstring hold", calf: "Isometric calf hold", knee: "Isometric wall sit" },
};

/** Which body area an exercise lookup is being made for, loosely matched. */
function areaKey(area: string | null | undefined): string | null {
  const a = String(area ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!a) return null;
  if (/shoulder|rotatorcuff|scapula/.test(a)) return "shoulder";
  if (/knee|patell|acl|quad/.test(a)) return "knee";
  if (/hamstring/.test(a)) return "hamstring";
  if (/calf|achilles|soleus/.test(a)) return "calf";
  if (/groin|adductor/.test(a)) return "groin";
  if (/lowerback|back|lumbar|spine/.test(a)) return "lower_back";
  if (/hip|glute/.test(a)) return "hip";
  if (/ankle|foot/.test(a)) return "ankle";
  return null;
}

/**
 * The library exercise a name refers to, or null.
 *
 * Null rather than a best guess is the point. A wrong how-to for a rehab
 * exercise is worse than no how-to: the athlete follows it.
 *
 * `area` is the body part being rehabbed, where the caller knows it. It only
 * ever decides between two exercises that genuinely share a name — it never
 * widens or narrows an otherwise unambiguous lookup.
 */
export function findExercise(name: string, area?: string | null): Exercise | null {
  const key = exerciseKey(name);
  if (!key) return null;

  const lower = String(name).toLowerCase().trim();

  /**
   * EXACT MATCH FIRST, ALWAYS. An exercise has to be able to find itself —
   * putting ambiguity ahead of this made "Wall angel" unfindable by its own
   * name, which broke the library rather than fixing anything.
   *
   * The shared names below are safe underneath it precisely because none of
   * them IS a library entry: the two wall slides are called "Wall angel" and
   * "Wall slide squat", so a bare "wall slide" matches neither and falls
   * through to the disambiguation on purpose.
   */
  const exact = BY_KEY.get(key);
  if (exact) return exact;

  const shared = AMBIGUOUS[lower];
  if (shared) {
    const ak = areaKey(area);
    const pick = ak ? shared[ak] : undefined;
    // No area, or an area this name has no entry for: refuse rather than pick.
    if (!pick) return null;
    return BY_KEY.get(exerciseKey(pick)) ?? null;
  }

  // A different word for the same movement, before any scoring is attempted.
  const synonym = SYNONYMS[lower];
  if (synonym) {
    const hit = BY_KEY.get(exerciseKey(synonym));
    if (hit) return hit;
  }

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
export function hasHowTo(name: string, area?: string | null): boolean {
  const ex = findExercise(name, area);
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

// --- applying an athlete's swaps ---------------------------------------------

/** Prescribed exercise name → what they are doing instead. See migration 0086. */
export type SwapMap = Record<string, string>;

export interface SwappedDrill {
  name: string;
  /** The prescribed name, when this drill was swapped. */
  swappedFrom?: string;
}

/**
 * Rename the drills an athlete has swapped.
 *
 * MATCHED ON THE NORMALISED NAME, not the raw string. The map is keyed by
 * whatever the plan called the exercise when they tapped it, and a regenerated
 * block can spell the same movement differently ("Barbell back squat" vs "Back
 * squat"). Comparing raw strings would silently drop every swap the next time
 * the block was rebuilt — the athlete's shoulder would still hate overhead
 * pressing and the programme would have quietly forgotten.
 *
 * Carries `swappedFrom` rather than erasing the original, so the UI can say
 * what was prescribed and offer to put it back.
 */
export function applySwaps<T extends { name: string }>(drills: T[], swaps: SwapMap | null | undefined): (T & SwappedDrill)[] {
  const map = new Map<string, string>();
  for (const [from, to] of Object.entries(swaps ?? {})) {
    if (typeof to === "string" && to.trim()) map.set(swapKey(from), to);
  }
  if (map.size === 0) return (drills ?? []) as (T & SwappedDrill)[];

  return (drills ?? []).map((d) => {
    const to = map.get(swapKey(d.name));
    return to ? { ...d, name: to, swappedFrom: d.name } : (d as T & SwappedDrill);
  });
}

/**
 * The identity a swap is remembered against: the MOVEMENT, not the spelling.
 *
 * Resolving through the library first means "Back squat" and "Barbell back
 * squat" land on the same key, so a swap survives the block being regenerated
 * with the catalogue's fuller name. Matching on the raw string would drop it
 * silently — the athlete's shoulder still hates overhead pressing and the
 * programme has quietly forgotten.
 *
 * It cannot over-match, because it borrows `findExercise`'s judgement: a front
 * squat resolves to a different exercise and keeps its own key, and a name the
 * library does not know falls back to the normalised string rather than being
 * guessed into somebody else's swap.
 */
function swapKey(name: string): string {
  return findExercise(name)?.id ?? exerciseKey(name);
}
