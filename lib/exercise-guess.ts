// =============================================================================
// What is this movement, when nobody has told us?
//
// THE PROBLEM. Two places in the app hold a movement name and nothing else:
//
//   lib/how-to.ts   a name that reached a session from an older saved block,
//                   a coach's own session, or an AI variation
//   the check-in    an athlete typing something the 250-movement library has
//                   never heard of, so they can log the work they actually did
//
// Both have to answer the same three questions before they can draw a card or
// write a row: which figure to draw, which muscles it trains, and what kit it
// needs. The gym importer answered them years ago for its own 250 lines, and
// how-to.ts answered them again, privately, with a second set of regexes that
// already disagreed with the first — the importer calls a wall ball a jump, the
// private copy called it a ball drill.
//
// One guesser, so a movement gets the same figure wherever it is drawn.
//
// HONESTY IS THE POINT. Every one of these returns a guess, and the guess is
// only allowed to claim what the name actually says. `equipmentOf` ends with a
// catch-all that reads a barbell into any name containing "squat" — useful when
// importing a barbell catalogue, wrong when an athlete types "Cossack squat".
// Where the name is silent, these return null and the caller says nothing,
// rather than printing a barbell nobody owns.
//
// Pure + tested.
// =============================================================================

import type { DemoPattern, ExerciseCategory, Implement, SportId } from "./exercises";
import { demoOf, equipmentOf } from "./exercise-catalog";
import { exerciseMuscles } from "./muscle-volume";

/**
 * Patterns the gym importer has no reason to know, because its catalogue is
 * 250 barbells and machines. Checked first, and each one is deliberately
 * narrow: "ball" alone would turn a wall ball — a loaded squat-and-throw the
 * importer correctly calls a jump — into a dribbling drill.
 */
const CARDIO = /\b(bike|biking|cycling|spin|assault bike|echo bike|erg|ski erg|swim|swimming)\b/i;
const RUNNING = /\b(run|runs|running|sprint|sprints|sprinting|jog|jogging|stride|strides|shuttle|shuttles|repeats?|intervals?)\b/i;
const BALL = /dribbl|juggl|keepie|keepy|first touch|ball control|ball work|cone weave|crossing|finishing|shooting drill|passing drill|rondo|\b(match|game|scrimmage|kickabout|futsal|5.?a.?side|small.?sided)\b/i;
const AGILITY = /\b(agility|ladder|cone|cones|change of direction|cutting|zig ?zag|side ?step|shuffle)\b/i;
const CARRY = /\b(carry|carries|farmer|farmers|suitcase|yoke|waiter)\b/i;
const SLED = /\b(sled|prowler)\b/i;
const MOBILITY = /stretch|mobilit|foam roll|opener|cat.?cow|\b90.?90\b/i;
/** Mobility work below the waist looks like a lunge; everything else is done on the floor. */
const LOWER = /hip|quad|hamstring|groin|adductor|couch|glute|calf|ankle|lunge|pigeon|hurdle/i;

/** Which movement figure to draw. Never null — every row deserves a picture. */
export function guessDemo(name: string): DemoPattern {
  if (CARDIO.test(name)) return "bike";
  if (RUNNING.test(name)) return "run";
  if (BALL.test(name)) return "ball";
  if (AGILITY.test(name)) return "lateral";
  if (CARRY.test(name)) return "plank";
  if (SLED.test(name)) return "run";
  if (MOBILITY.test(name)) return LOWER.test(name) ? "lunge" : "plank";
  return demoOf(name);
}

/**
 * The muscles a name implies, primary first.
 *
 * Asks the shared muscle map before falling back to the movement pattern, so
 * "Cossack squat" comes back with quads and glutes rather than the generic
 * lower-body list.
 */
export function guessMuscles(name: string): string[] {
  const pattern = guessDemo(name);
  const fallback = MUSCLES_BY_PATTERN[pattern];
  const { primary, secondary } = exerciseMuscles(name, fallback);
  const found = [primary, ...secondary].filter((m): m is string => !!m);
  return found.length ? found : [...fallback];
}

const MUSCLES_BY_PATTERN: Record<DemoPattern, readonly string[]> = {
  press: ["Chest", "Shoulders", "Triceps"],
  pull: ["Back", "Biceps"],
  hinge: ["Hamstrings", "Glutes", "Back"],
  squat: ["Quads", "Glutes", "Core"],
  lunge: ["Quads", "Glutes", "Hamstrings"],
  plank: ["Core", "Shoulders"],
  jump: ["Quads", "Glutes", "Hamstrings", "Calves"],
  run: ["Quads", "Hamstrings", "Glutes", "Calves"],
  lateral: ["Quads", "Glutes", "Hamstrings", "Calves"],
  bike: ["Quads", "Glutes", "Calves"],
  ball: ["Quads", "Glutes", "Calves", "Core"],
};

/**
 * What the movement is FOR, in the library's own vocabulary.
 *
 * Order is the order of specificity, not of frequency: a sprint is speed work
 * before it is running, and a pogo hop is power before it is a jump.
 */
export function guessCategory(name: string): ExerciseCategory {
  if (/stretch|mobilit|foam roll|cat.?cow|opener|thoracic rotation|hip flexor/i.test(name)) return "Mobility";
  if (/rehab|prehab|activation|isometric hold/i.test(name)) return "Rehab";
  if (/breath|walk ?out|cool ?down|recovery walk|nap|sauna/i.test(name)) return "Recovery";
  if (/sprint|accelerat|max velocity|flying|\bstride/i.test(name)) return "Speed";
  if (/jump|bound|hop|plyo|clean|snatch|jerk|throw|slam|toss|explosive/i.test(name)) return "Power";
  if (BALL.test(name)) return "Skill";
  if (AGILITY.test(name)) return "Agility";
  if (RUNNING.test(name) || CARDIO.test(name) || /conditioning|circuit|amrap/i.test(name)) return "Endurance";
  return "Strength";
}

/**
 * The kit, or null when the name does not say.
 *
 * `equipmentOf` finishes with a rule that reads a barbell out of any name
 * containing squat, press, row or curl. That rule earns its place inside the
 * importer, whose input really is a barbell catalogue. Applied to a name a
 * person typed it invents equipment, which then filters the movement out of
 * "bodyweight only" and puts a bar in a picture of an air squat.
 */
export function guessEquipment(name: string): string | null {
  // Abbreviations the importer never had to read, because its own catalogue
  // spells everything out. People logging their own work do not.
  if (/\bdbs?\b/i.test(name)) return "Dumbbell";
  if (/\bkbs?\b/i.test(name)) return "Kettlebell";
  const equip = equipmentOf(name);
  if (equip === "Other") return null;
  if (equip === "Barbell" && !/\bbar(bell)?\b/i.test(name)) return null;
  return equip;
}

/** Which implement to draw in the athlete's hands. Only ever what the name names. */
export function guessImplement(name: string, pattern: DemoPattern = guessDemo(name)): Implement {
  const value = name.toLowerCase();
  if (/dumbbell|\bdbs?\b/.test(value)) return "dumbbells";
  if (/barbell|trap bar|hex bar|ez bar|smith/.test(value)) {
    return pattern === "squat" || pattern === "lunge" ? "barbell_back" : "barbell_hands";
  }
  if (/\bbox\b|bench|\bstep[ -]?up/.test(value)) return "box";
  return "none";
}

/** The row shape `custom_exercises` expects, filled in from the name alone. */
export interface CustomExerciseRow {
  coach_id: string;
  name: string;
  category: ExerciseCategory;
  sport: SportId | null;
  demo: DemoPattern;
  equipment: string | null;
  muscles: string[];
  cues: string[];
  why: string;
  description: string | null;
}

/**
 * Turn a typed name into a saveable exercise.
 *
 * `sport` stays null — all sports — on purpose. This row exists because
 * somebody logged a movement the library lacks, and the one thing they must
 * never see again is it disappearing. Tagging it with today's sport hides it
 * the day they switch, which is the bug this whole path is here to fix.
 *
 * The column is called `coach_id` and means owner; see CustomExerciseForm.
 */
export function customExerciseRow(name: string, ownerId: string): CustomExerciseRow {
  const clean = name.trim().replace(/\s+/g, " ");
  return {
    coach_id: ownerId,
    name: clean,
    category: guessCategory(clean),
    sport: null,
    demo: guessDemo(clean),
    equipment: guessEquipment(clean),
    muscles: guessMuscles(clean),
    cues: [],
    // Where it came from, in the athlete's own terms — `why` is printed on the
    // library card, and "Added by your coach" would be a lie on their own row.
    why: "You added this yourself while logging a session.",
    description: null,
  };
}
