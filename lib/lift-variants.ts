// =============================================================================
// Every lift in the library that says something about how strong you are.
//
// THE PROBLEM, MEASURED. lib/strength-standards.ts ranks eight barbell lifts.
// The library holds 339 exercises, 269 of which carry a load — and the ranks
// could see FOURTEEN of them. Somebody who trains chest with dumbbells and an
// incline but never touches a flat barbell bench had no chest rank at all: a
// grey patch on the body figure over a muscle they train twice a week, and a
// strength total computed as though that half of their training never happened.
//
// With this table it is 42, and every one of the remaining 227 has a written
// reason below rather than silently counting for nothing. Those two numbers are
// asserted in lib/lift-variants.test.ts, so they cannot quietly rot.
//
// WHY NOT JUST GIVE EVERY EXERCISE A STANDARD. Because a tier is a comparison
// against a population, and the bodyweight multiples that make that comparison
// mean anything only exist for a handful of lifts. Inventing "intermediate is
// 1.4x bodyweight on the cable fly" would be making up sports science and
// printing it as a rank — worse than the grey patch, because the athlete cannot
// tell an invented number from a real one.
//
// SO: CONVERT, DON'T INVENT. A variant that has a known, stable ratio to a
// ranked lift gets that ratio and is judged against the ranked lift's standard.
// A close-grip bench is about 90% of a flat bench for almost everyone, and that
// relationship is taught the same way everywhere. Where no such ratio exists,
// the exercise is REFUSED — explicitly, by name, with the reason — rather than
// given a plausible-looking guess. See REFUSED below; it is as important as the
// table above it, and it is there so that the next person to widen this can see
// which omissions were decisions rather than oversights.
//
// The factors are coaching rules of thumb, not measurements, and they are used
// for one purpose: deciding which of six broad tiers somebody sits in. They are
// deliberately round numbers. A tier is about a quarter of bodyweight wide, so
// being 5% out moves nobody; being 2x out would, which is why the per-hand rule
// below is the part that actually matters.
// =============================================================================

// TYPE-ONLY, on purpose. lib/strength-standards.ts imports the table below, so
// a value import here would close a runtime cycle between the two modules. This
// file is data plus a lookup; the resolution that needs LIFT_STANDARDS lives
// there, where the standards do.
import { exerciseKey } from "./exercise-stats";

export interface LiftVariant {
  /** Its own key, so a percentage-gain chart keeps it separate from the base. */
  key: string;
  /** What the athlete sees. Their dumbbell press is reported as a dumbbell press. */
  label: string;
  /** Names in the training log that mean this, lower-cased. */
  aliases: string[];
  /** Which ranked lift's standard judges it. */
  base: string;
  /**
   * Multiply the logged one-rep max by this to get the equivalent base lift.
   *
   * Above 1 where the variant is EASIER than the base — a decline bench moves
   * more weight than a flat one, so the same load says slightly less about you.
   */
  factor: number;
  /**
   * Dumbbells are logged per hand, so double the load before converting.
   *
   * THIS IS THE ONE THAT CAN BE 2x WRONG, and the only reason it is safe is
   * that per-hand is what everybody means: dumbbells are labelled per dumbbell
   * and people say "I press the 40s". The factors on these entries are for the
   * COMBINED load, so 40kg per hand is 80kg combined and then the ratio.
   */
  perHand?: boolean;
  /** Why this number. One line, so it can be argued with. */
  why: string;
}

/**
 * Ordered most specific first — "close grip incline bench press" has to be
 * tested before "incline bench press", or it resolves to the wrong one. The
 * lookup below relies on exact name matching rather than substrings, so this
 * ordering is belt and braces, but the table reads better this way anyway.
 */
export const LIFT_VARIANTS: LiftVariant[] = [
  // --- Bench, base 1.00 ------------------------------------------------------
  {
    key: "db_bench", label: "Dumbbell bench press", base: "bench", factor: 0.9, perHand: true,
    aliases: ["dumbbell bench press", "db bench press", "db bench", "dumbbell bench", "dumbbell chest press", "dumbbell floor press"],
    why: "Two dumbbells combined run about 90% of a barbell bench — the stabilising cost is real.",
  },
  {
    key: "incline_db_bench", label: "Incline dumbbell press", base: "bench", factor: 0.75, perHand: true,
    aliases: ["incline dumbbell bench press", "incline dumbbell press", "incline db press", "incline db bench press"],
    why: "Incline costs about a fifth against flat, and dumbbells another tenth on top.",
  },
  {
    key: "incline_bench", label: "Incline bench press", base: "bench", factor: 0.82,
    aliases: ["incline bench press", "incline barbell bench press", "incline bench", "incline barbell press", "close grip incline bench press"],
    why: "The shoulder does more of the work and the chest less; roughly four fifths of a flat bench.",
  },
  {
    key: "decline_bench", label: "Decline bench press", base: "bench", factor: 1.05,
    aliases: ["decline bench press", "decline barbell bench press", "decline bench"],
    why: "A shorter range in the strongest position — most people move slightly MORE than on flat.",
  },
  {
    key: "close_grip_bench", label: "Close-grip bench press", base: "bench", factor: 0.9,
    aliases: ["close grip bench press", "close-grip bench press", "close grip bench"],
    why: "Triceps-biased, about a tenth under a competition-width bench.",
  },
  {
    key: "paused_bench", label: "Paused bench press", base: "bench", factor: 0.92,
    aliases: ["paused bench press", "pause bench press", "spoto press"],
    why: "Killing the stretch reflex costs most people around 8%.",
  },
  {
    key: "floor_press", label: "Floor press", base: "bench", factor: 0.9,
    aliases: ["floor press", "barbell floor press"],
    why: "A shortened range against no leg drive — close to a close-grip bench.",
  },
  {
    key: "decline_db_bench", label: "Decline dumbbell press", base: "bench", factor: 0.95, perHand: true,
    aliases: ["decline dumbbell bench press", "decline dumbbell press", "decline db press"],
    why: "Decline's slight advantage and dumbbells' slight cost very nearly cancel.",
  },
  {
    key: "close_grip_db_bench", label: "Close-grip dumbbell press", base: "bench", factor: 0.82, perHand: true,
    aliases: ["close grip dumbbell bench press", "close grip dumbbell press", "neutral grip dumbbell bench press"],
    why: "Triceps-biased and dumbbell-held — the two costs stack.",
  },
  {
    key: "smith_bench", label: "Smith machine bench", base: "bench", factor: 0.9,
    aliases: ["smith machine bench press", "smith bench press"],
    why: "A fixed bar removes the balancing, so the same load says less than a free bar would.",
  },

  // --- Overhead press --------------------------------------------------------
  {
    key: "db_shoulder_press", label: "Dumbbell shoulder press", base: "ohp", factor: 0.85, perHand: true,
    aliases: ["dumbbell shoulder press", "seated dumbbell shoulder press", "seated dumbbell press", "db shoulder press", "dumbbell overhead press", "dumbbell military press"],
    why: "Two dumbbells overhead run about 85% of a barbell — each arm balances its own load.",
  },

  // --- Squat -----------------------------------------------------------------
  {
    key: "pause_squat", label: "Paused squat", base: "squat", factor: 0.9,
    aliases: ["paused squat", "pause squat", "box squat", "barbell box squat"],
    why: "A pause or a box in the hole costs about a tenth of a competition squat.",
  },
  {
    key: "safety_bar_squat", label: "Safety bar squat", base: "squat", factor: 0.9,
    aliases: ["safety bar squat", "safety squat bar squat", "ssb squat"],
    why: "The bar's forward pull makes it a harder squat at the same weight.",
  },
  {
    key: "smith_squat", label: "Smith machine squat", base: "squat", factor: 0.85,
    aliases: ["smith machine squat", "smith squat"],
    why: "A fixed bar path takes out the balancing, which is a bigger help under a squat than a bench.",
  },

  // --- Deadlift --------------------------------------------------------------
  {
    key: "trap_bar_deadlift", label: "Trap bar deadlift", base: "deadlift", factor: 1.05,
    aliases: ["trap bar deadlift", "trap-bar deadlift", "hex bar deadlift", "hex-bar deadlift", "trap bar dead lift"],
    why: "The load sits in line with you rather than in front, so most people pull slightly more.",
  },
  {
    key: "deficit_deadlift", label: "Deficit deadlift", base: "deadlift", factor: 0.9,
    aliases: ["deficit deadlift"],
    why: "A longer pull from a lower start, worth about a tenth.",
  },
  {
    key: "pause_deadlift", label: "Paused deadlift", base: "deadlift", factor: 0.9,
    aliases: ["pause deadlift", "paused deadlift"],
    why: "Stopping below the knee costs roughly what a deficit does.",
  },

  // --- Romanian deadlift -----------------------------------------------------
  {
    key: "db_rdl", label: "Dumbbell Romanian deadlift", base: "romanian_deadlift", factor: 0.85, perHand: true,
    aliases: ["dumbbell romanian deadlift", "dumbbell rdl", "db rdl"],
    why: "Grip and balance cap it a little below the barbell version.",
  },

  // --- Row -------------------------------------------------------------------
  {
    key: "tbar_row", label: "T-bar row", base: "row", factor: 0.95,
    aliases: ["t bar row", "t-bar row", "tbar row", "landmine row"],
    why: "Chest or hip supported and closer to the pivot — a touch easier than a strict barbell row.",
  },
];

/**
 * EXERCISES DELIBERATELY NOT CONVERTED, and why.
 *
 * This list is the honest half of the feature. Everything here loads a muscle
 * and none of it can be turned into a tier without inventing a number, so it
 * counts toward VOLUME (lib/muscle-volume.ts) and stays out of the ranks.
 *
 * Written down rather than simply absent so that the next person to widen this
 * table can tell a decision from an oversight — and so that "why doesn't my leg
 * press count" has an answer.
 */
export const REFUSED: { pattern: RegExp; why: string }[] = [
  {
    pattern: /leg press|hack squat|pendulum squat/i,
    why: "Machine leverage differs by a factor of two between brands, so the same 200kg means different things in different gyms. There is no standard to rank it against.",
  },
  {
    pattern: /goblet squat|kettlebell squat/i,
    why: "Limited by what you can hold at your chest, not by what your legs can do — it stops measuring leg strength long before your legs stop.",
  },
  {
    pattern: /split squat|lunge|step.?up|single.?leg|one.?arm|one leg/i,
    why: "Unilateral work varies too much with balance and setup to compare against a two-legged standard.",
  },
  {
    pattern: /push press|jerk|clean|snatch|thruster/i,
    why: "Leg drive makes these different lifts, not easier versions of a press. They are power, and power is measured elsewhere.",
  },
  {
    pattern: /cable|pec deck|machine (chest|shoulder|row|press|fly)|seated dip machine|lat pulldown|pulldown/i,
    why: "A weight stack is not calibrated between machines, and a pulldown is counterweighted by your own body position. The number on the pin is not a load.",
  },
  {
    pattern: /rack pull|block pull|pin press/i,
    why: "The pin height changes the lift completely, and nobody records it.",
  },
  {
    // "Skull crushers" is a lying triceps extension by its common name, and the
    // common name is what athletes type — so the pattern has to know it, or the
    // one exercise everybody calls by a nickname falls out of the isolation
    // rule and reads as an oversight.
    pattern: /curl|lateral raise|front raise|fly|extension|shrug|pullover|face pull|kickback|calf raise|pushdown|squat thrust|skull ?crusher/i,
    why: "Isolation work has no published bodyweight standard, and its load is set by the muscle's leverage rather than by the athlete's strength in any comparable way.",
  },
  {
    pattern: /pull.?up|chin.?up|dip|push.?up|inverted row|muscle.?up/i,
    why: "These are ranked by bodyweight plus what you added, which is a different calculation from a barbell multiple. Worth adding properly rather than bolting onto this table.",
  },
  {
    /**
     * A kettlebell is not a barbell with a handle. The weights come in fixed
     * jumps — 8, 12, 16, 20, 24 — so the resolution is far coarser than a
     * ratio needs, and in every one of these the set ends because the position
     * failed rather than because the muscle did.
     */
    pattern: /kettlebell|bottoms.?up|get.?up|windmill|halo|racked/i,
    why: "Kettlebells come in fixed jumps too coarse to express a bodyweight ratio, and these end when the position gives out rather than when the muscle does — which is a measure of control, not of strength.",
  },
  {
    /**
     * A hold is scored in seconds. There is no weight moved and therefore no
     * one-rep maximum to be a multiple of.
     */
    pattern: /\bhold\b|dead hang|pinch/i,
    why: "Held for time rather than lifted for reps, so there is no repetition maximum for a bodyweight multiple to be taken from. Seconds are the honest unit here, not kilos.",
  },
  {
    pattern: /arnold press|z press|behind the neck|viking press|log press|landmine press|jm press|tate press/i,
    why: "Real lifts with no stable published ratio to a strict overhead press.",
  },
  {
    pattern: /dumbbell (squat|front squat|deadlift)|farmer|carry|shrug/i,
    why: "Capped by what your hands can hold rather than by what the muscle can do — it stops measuring the leg or the back long before they stop.",
  },
  {
    pattern: /zercher|jefferson|behind the back|belt squat|sumo squat|overhead squat|sissy squat|landmine squat/i,
    why: "Odd-bar and odd-position variants with no published ratio to their parent lift. Real training, unrankable.",
  },
  {
    pattern: /half squat|pin squat|board press|partial|quarter squat/i,
    why: "A partial range of motion moves far more weight and nobody records the depth, so the number cannot be compared to anything.",
  },
  {
    pattern: /good morning|glute ham raise|ghr|reverse hyper|back extension|hip (abduction|adduction|extension|thrust machine)/i,
    why: "Posterior-chain accessories with no bodyweight standard — the load is set by leverage and by what the machine allows.",
  },
  {
    pattern: /yates row|meadows row|renegade row|bench pull|upright row|chest.?supported|seated cable row|dumbbell row|high pull/i,
    why: "Row variants whose torso angle and support change the load far more than strength does. The barbell row is the one with a standard.",
  },
  {
    pattern: /reverse grip|zottman|cheat |strict curl|spider|preacher|concentration|wrist|hammer/i,
    why: "Grip and position variants of isolation work. No standard, and none is needed — these are volume.",
  },
  {
    pattern: /crunch|sit.?up|leg raise|knee raise|russian twist|ab wheel|plank|side bend|flutter|scissor|toes to bar|superman|hollow/i,
    why: "Core work is measured by what you can hold and for how long, not by a one-rep max against bodyweight.",
  },
  {
    pattern: /jump|hop|bound|throw|wall ball|sprint|sled|scrum|burpee|mountain climber|jumping jack|depth drop|swing/i,
    why: "Power and conditioning. Fast is not the same question as strong, and lib/benchmarks.ts is where speed and power are measured.",
  },
  {
    pattern: /bodyweight squat|pistol squat|nordic|dead bug|bird dog|glute bridge$/i,
    why: "Bodyweight movements with no external load to rank.",
  },
  {
    // Deliberately last and deliberately broad: anything the library files as
    // Rehab is graded by pain and tolerance, not by a percentage of bodyweight.
    // A tier on a rehab exercise would invite somebody to chase it, which is
    // the opposite of what a rehab exercise is for.
    pattern: /^y raise$|pendulum|scapular|sleeper|quad set|straight leg raise|heel drop|soleus|wobble|ankle (circle|alphabet|dorsiflexion)|band ankle|pelvic tilt|cat cow|prone press|hip hinge pattern|side-?lying/i,
    why: "Rehab work, graded by pain and tolerance rather than by load. Ranking it would invite chasing a number on an exercise whose whole point is staying below one.",
  },
];

const VARIANT_BY_ALIAS = new Map<string, LiftVariant>();
for (const v of LIFT_VARIANTS) {
  for (const alias of v.aliases) VARIANT_BY_ALIAS.set(exerciseKey(alias), v);
}

/** Why a given exercise does not produce a rank, or null if it does. */
export function refusalFor(name: string): string | null {
  if (VARIANT_BY_ALIAS.has(exerciseKey(name))) return null;
  for (const r of REFUSED) if (r.pattern.test(name)) return r.why;
  return null;
}

/** The variant a logged drill name means, if it is one. */
export function variantFor(name: string): LiftVariant | null {
  return VARIANT_BY_ALIAS.get(exerciseKey(name)) ?? null;
}
