// =============================================================================
// Weekly set volume per muscle group.
//
// WHY THIS EXISTS. The engine counted sets per SLOT — so many in the primary
// block, so many accessory — which says how long a session is and nothing about
// whether the athlete is actually training their hamstrings. A block could hit
// quads twenty-five times a week and hamstrings twice, and no part of the app
// could tell. Weekly sets per muscle is the number strength coaches program
// against and the one the evidence is expressed in, so it is the number the
// engine should be able to see.
//
// Deliberately NOT a scoring input. It reports; the athlete and the coach
// decide. An optimiser that silently rearranged someone's programme to hit a
// volume target would be trading a coach's judgement for a spreadsheet's, and
// the landmarks below are population averages with wide individual variation.
//
// Pure + tested.
// =============================================================================

import { MOVEMENT_BY_ID, type Movement, type Pattern } from "./movements";
import { muscleGroupForName, type MuscleGroup } from "./hypertrophy";
import type { ProgramPlan, ProgramWeek } from "./engine";

/**
 * ONE vocabulary, borrowed rather than reinvented.
 *
 * `lib/hypertrophy.ts` already had a MuscleGroup and a classifier for the gym
 * catalogue. Defining a second one here would have produced the same failure
 * this codebase has already had once with nutrition — two calculations, two
 * answers, same athlete — except about training volume, where a bodybuilder's
 * "arms" and an S&C block's "arms" would have quietly meant different things.
 */
export type { MuscleGroup } from "./hypertrophy";

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  quads: "Quads", hamstrings: "Hamstrings", glutes: "Glutes", calves: "Calves",
  adductors: "Adductors", chest: "Chest", back: "Back", shoulders: "Shoulders",
  biceps: "Biceps", triceps: "Triceps", core: "Core",
};

/**
 * What a movement pattern trains, before looking at the movement itself.
 *
 * Primary movers only. A back squat loads the spinal erectors and a bench press
 * the front delts, but counting those would inflate every number and is not how
 * the volume literature counts either — see SECONDARY_CREDIT below for how
 * assisting muscles are handled.
 *
 * Patterns absent from this map train no muscle group for counting purposes:
 * sprint, cod, footwork, mobility, skill and conditioning are qualities and
 * energy systems, not resistance volume. Counting a sprint as leg sets is how
 * you end up telling a footballer they have done thirty sets of quads.
 */
const PATTERN_MUSCLES: Partial<Record<Pattern, MuscleGroup[]>> = {
  squat: ["quads", "glutes"],
  lunge: ["quads", "glutes"],
  hinge: ["hamstrings", "glutes"],
  push_h: ["chest", "shoulders", "triceps"],
  push_v: ["shoulders", "triceps"],
  pull_h: ["back", "biceps"],
  pull_v: ["back", "biceps"],
  carry: ["core", "back"],
  core: ["core"],
  jump: ["quads", "glutes", "calves"],
};

/**
 * Movements whose pattern lies about what they train.
 *
 * The `rehab` pattern is the worst offender and the reason this map has to
 * exist: it covers calf raises, band walks, terminal knee extensions, adductor
 * squeezes and shoulder external rotations, which between them train five
 * different things and share nothing but a slot in the session.
 *
 * The rest are movements where the pattern's default is directionally right but
 * meaningfully wrong — a hip thrust is a hinge that is almost entirely glute,
 * and a Nordic curl is a hinge that is almost entirely hamstring.
 */
const MUSCLE_OVERRIDES: Record<string, MuscleGroup[]> = {
  // rehab — pattern says nothing
  calf_raise: ["calves"],
  calf_raise_eccentric: ["calves"],
  band_lateral_walk: ["glutes"],
  terminal_knee_ext: ["quads"],
  adductor_iso_squeeze: ["adductors"],
  shoulder_external_rotation: ["shoulders"],
  ankle_alphabet: [],           // joint prep, not loading anything
  // hinges that are not hamstring work
  hip_thrust: ["glutes"],
  nordic_curl: ["hamstrings"],
  hamstring_slider: ["hamstrings"],
  single_leg_rdl: ["hamstrings", "glutes"],
  // squats that are quad-isolating rather than a squat pattern
  spanish_squat: ["quads"],
  isometric_wall_sit: ["quads"],
  // core work with a hip component
  copenhagen: ["adductors", "core"],
  // Olympic lifting is triple extension, not a jump
  power_clean: ["glutes", "hamstrings", "quads", "back"],
  // Plyometrics. Counted at all only because they ARE loading the tissue —
  // see PLYO_CREDIT: they do not count like a set of squats.
  pogo_hops: ["calves"],
  box_jumps: ["quads", "glutes"],
  depth_drop: ["quads", "glutes", "calves"],
  broad_jump: ["quads", "glutes"],
  vertical_jump: ["quads", "glutes"],
  // a sport-specific push
  scrum_drive: ["chest", "shoulders", "back"],
};

/**
 * How much a set counts toward a muscle that ASSISTS rather than leads.
 *
 * Half, which is the convention in the volume-landmark literature: the triceps
 * do real work in a bench press and it is not the same work as a set of
 * extensions. Counting assistance at full value double-counts every compound
 * and makes the totals meaningless; counting it at zero tells a lifter with six
 * pressing movements that they have done nothing for their arms.
 *
 * The first muscle listed for a movement is the primary mover; the rest assist.
 */
const SECONDARY_CREDIT = 0.5;

/**
 * How much a plyometric contact counts as resistance volume.
 *
 * A third. Jumps genuinely load the muscle and connective tissue — ignoring
 * them understates what a speed block does to an athlete's legs, which is
 * exactly the mistake that gets someone hurt in a week that looked light on
 * paper. But five box jumps is not five squats, and counting them equally would
 * have a sprint session reading as a leg day.
 */
const PLYO_CREDIT = 1 / 3;
const PLYO_PATTERNS = new Set<Pattern>(["jump"]);

/**
 * And how much an ACTIVATION set counts.
 *
 * Half. Banded lateral walks, isometric squeezes and terminal knee extensions
 * are low-load work whose job is to switch a muscle on or keep a joint honest,
 * not to accumulate the mechanical tension volume landmarks are measured in.
 * Counting four sets of banded walks like four sets of hip thrusts pushed a
 * rugby peak week's glutes to 22.5 — over the line the evidence supports —
 * which was the accounting being generous rather than the programme being
 * wrong. Not zero, because they are still sets the athlete has to recover from.
 */
const ACTIVATION_CREDIT = 0.5;
const ACTIVATION_PATTERNS = new Set<Pattern>(["rehab"]);

const BY_NAME: Map<string, Movement> =
  new Map(Object.values(MOVEMENT_BY_ID).map((m) => [m.name, m]));

/** The muscles a movement trains, primary mover first. */
export function musclesOf(movement: Movement): MuscleGroup[] {
  const override = MUSCLE_OVERRIDES[movement.id];
  if (override) return override;
  return PATTERN_MUSCLES[movement.pattern] ?? [];
}

export type MuscleVolume = Record<MuscleGroup, number>;

const emptyVolume = (): MuscleVolume => ({
  quads: 0, hamstrings: 0, glutes: 0, calves: 0, adductors: 0,
  chest: 0, back: 0, shoulders: 0, biceps: 0, triceps: 0, core: 0,
});

/**
 * Weekly sets per muscle group for one week of a plan.
 *
 * Warm-ups and cool-downs are excluded: two sets of glute bridges before a
 * session is preparation, and counting it as glute volume would flatter every
 * week by a couple of sets in exactly the place people already over-count.
 */
export function weeklyMuscleVolume(week: ProgramWeek): MuscleVolume {
  const out = emptyVolume();
  for (const session of week.sessions) {
    for (const drill of session.drills) {
      /**
       * Slot decides, not pattern.
       *
       * Warm-ups and cool-downs are preparation. CONDITIONING is the one that
       * caught me out: kettlebell swings carry a `hinge` pattern, so six
       * thirty-second intervals were counting as six sets of hamstrings and
       * three of glutes — enough on its own to push a rugby week's glute volume
       * past the point the evidence supports, from a movement nobody would call
       * resistance work. An interval is an energy system with a shape, and the
       * shape is not the point of it.
       */
      if (drill.slot === "warmup" || drill.slot === "cooldown"
        || drill.slot === "conditioning" || drill.skill) continue;
      /**
       * TWO ENGINES BUILD PROGRAMMES, AND BOTH HAVE TO BE COUNTABLE.
       *
       * An athlete on "muscle & aesthetics" is handed to the hypertrophy engine
       * instead of the S&C one, and it draws from a different catalogue
       * entirely — "Close Grip Bench Press", "Cable Fly", names that appear
       * nowhere in MOVEMENTS. Reading only the S&C library counted exactly zero
       * sets for those plans, which is the population that cares about this
       * number most.
       */
      const movement = BY_NAME.get(drill.name);
      if (movement) {
        const muscles = musclesOf(movement);
        if (!muscles.length) continue;
        const plyo = PLYO_PATTERNS.has(movement.pattern) ? PLYO_CREDIT
          : ACTIVATION_PATTERNS.has(movement.pattern) ? ACTIVATION_CREDIT : 1;
        muscles.forEach((muscle, i) => {
          out[muscle] += (drill.sets ?? 0) * plyo * (i === 0 ? 1 : SECONDARY_CREDIT);
        });
        continue;
      }
      // The hypertrophy catalogue classifies to a single primary group, which
      // is the convention bodybuilding volume is counted in anyway.
      const group = muscleGroupForName(drill.name);
      if (group) out[group] += drill.sets ?? 0;
    }
  }
  for (const k of Object.keys(out) as MuscleGroup[]) out[k] = Math.round(out[k] * 10) / 10;
  return out;
}

/**
 * The volume landmarks, in weekly sets per muscle group.
 *
 * From the resistance-training dose-response work and the volume-landmark
 * framework it is usually expressed in. Both hypertrophy and strength improve
 * with volume across the studied range, with clear diminishing returns, and
 * recent meta-regression argues the upper end buys little and costs recovery.
 *
 * These are POPULATION AVERAGES with wide individual variation, and they are
 * used here to describe a programme rather than to constrain one. A footballer
 * in-season legitimately sits near MAINTENANCE for most groups: their legs are
 * getting hammered by the sport and the gym's job is to keep tissue robust, not
 * to chase hypertrophy.
 */
export const LANDMARKS = {
  /** Below this the muscle is not really being trained. */
  maintenance: 6,
  /** The range most of the benefit sits in. */
  productiveLow: 10,
  productiveHigh: 20,
  /** Past here the evidence says recovery starts costing more than the volume buys. */
  excessive: 22,
} as const;

export type VolumeVerdict = "untrained" | "maintenance" | "productive" | "excessive";

export function verdictFor(sets: number): VolumeVerdict {
  if (sets < 1) return "untrained";
  if (sets < LANDMARKS.maintenance) return "maintenance";
  if (sets > LANDMARKS.excessive) return "excessive";
  return "productive";
}

export interface VolumeAudit {
  week: number;
  volume: MuscleVolume;
  /** Muscles carrying more weekly volume than the evidence supports. */
  excessive: MuscleGroup[];
  /**
   * Muscles trained so little they may as well not be, EXCLUDING ones no
   * reasonable programme for this athlete would train — a footballer's block
   * owing nothing to chest is a choice, not an oversight, which is why this
   * only reports groups that appear somewhere in the plan.
   */
  neglected: MuscleGroup[];
  /** Biggest imbalance in the classic injury pair, as a ratio. */
  hamstringToQuad: number | null;
}

/**
 * Describe a week's volume, for the UI and for tests.
 *
 * `hamstringToQuad` is called out on its own because it is the one ratio in
 * team sport with a hard outcome attached: hamstring strain is the most common
 * non-contact injury in football, and quad-dominant programming is a known
 * contributor. A block heavy in squats and light in hinges is a real finding
 * about a real risk, not a stylistic note.
 */
export function auditWeek(week: ProgramWeek): VolumeAudit {
  const volume = weeklyMuscleVolume(week);
  const groups = Object.keys(volume) as MuscleGroup[];
  const trained = groups.filter((g) => volume[g] > 0);
  return {
    week: week.week,
    volume,
    excessive: groups.filter((g) => verdictFor(volume[g]) === "excessive"),
    neglected: trained.filter((g) => volume[g] < LANDMARKS.maintenance),
    hamstringToQuad: volume.quads > 0 ? Math.round((volume.hamstrings / volume.quads) * 100) / 100 : null,
  };
}

export function auditPlan(plan: ProgramPlan): VolumeAudit[] {
  return plan.weeks.map(auditWeek);
}
