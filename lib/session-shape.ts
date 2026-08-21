// =============================================================================
// What kind of movement is this, and where does it belong in the hour?
//
// WHY IT HAD TO BE ONE FILE. Four things in this app decide where an exercise
// goes and they all decided differently:
//
//   lib/movements.ts    a hand-curated `slot` for the ~180 S&C movements
//   lib/hypertrophy.ts  no slot at all — see below
//   the AI backend      whatever the model wrote, unchecked
//   lib/muscle-volume   `isCompoundDrill`, a name regex, used as a tie-break
//
// Measured across 108 generated programs, 1,728 sessions:
//
//   41.7% of sessions had NO warm-up and NO cool-down
//    8.2% of drills carried no slot label at all
//   11.3% of sessions ran the strength block out of fatigue order
//
// The 41.7% is the whole gym path. `buildHypertrophyProgram` emits a bare list
// of lifts, so a four-day gym block opened with a heavy squat cold and finished
// on a cable kickback — no mobility, no stretch, and no section headings on the
// screen either, because the UI groups by slot and there were none to group by.
//
// THE ORDER IS ABOUT FATIGUE, NOT TIDINESS. Jumps and sprints are the most
// neurally expensive thing an athlete does and the least tolerant of being
// tired; a curl is the opposite. Doing them the other way round makes the jump
// worse AND more dangerous, which is why "power first" is the one rule of
// session design that is close to universal.
//
// Pure + tested. No engine imports this to CHOOSE exercises — only to place
// the ones already chosen, so it works on a plan from any source including one
// a language model wrote.
// =============================================================================

import { MOVEMENTS, type Slot } from "./movements";
import { findExercise } from "./exercise-match";
import { equipBucket } from "./exercise-catalog";
import { howToFor } from "./how-to";

/**
 * The six tiers, hardest on the nervous system first.
 *
 * Deliberately coarser than the movement patterns: an athlete does not need to
 * know that a back squat is a "squat pattern", they need to know it goes before
 * the leg extension. Ties keep their existing order, so within a tier the
 * engine's own preference survives.
 */
export type ExerciseKind =
  | "power"       // jumps, throws, sprints — highest CNS demand, do fresh
  | "compound"    // barbell squat/hinge/press/pull — heavy, multi-joint
  | "secondary"   // dumbbell and kettlebell multi-joint work
  | "machine"     // machine and cable multi-joint work — stable, controlled
  | "isolation"   // single-joint: curls, extensions, raises, flyes
  | "core"        // trunk, carries, and anything that belongs at the end
  | "prep"        // mobility, activation, stretching — not working sets
  | "cardio"      // runs, conditioning, metcon
  | "skill";      // ball work and sport technique

export const KIND_RANK: Record<ExerciseKind, number> = {
  power: 1, compound: 2, secondary: 3, machine: 4, isolation: 5, core: 6,
  // These three never sort inside the working block; they have their own
  // sections. Ranked beyond it so a stray one cannot land in the middle.
  skill: 7, cardio: 8, prep: 9,
};

/** Short label for the badge on a card. */
export const KIND_LABEL: Record<ExerciseKind, string> = {
  power: "Power", compound: "Compound", secondary: "Compound", machine: "Machine",
  isolation: "Isolation", core: "Core", prep: "Prep", cardio: "Cardio", skill: "Skill",
};

const BY_NAME = new Map(MOVEMENTS.map((m) => [m.name.toLowerCase(), m]));

/**
 * Names that are single-joint however they are equipped.
 *
 * A list rather than a guess, because the consequence of being wrong is an
 * ordering the athlete can see is stupid. A "barbell curl" is a barbell
 * movement and an isolation exercise, and equipment alone would call it a
 * compound and put it before the bench press.
 */
const ISOLATION = /\b(curl|extension|raise|fly|flye|pushdown|pullover|kickback|shrug|face pull|rear delt|reverse fly|calf|adduction|abduction|wrist|pec deck|leg curl|leg extension|concentration|preacher|skull ?crusher|lateral)\b/i;

/** Trunk, carries and the things that finish a session. */
const CORE = /\b(plank|crunch|sit ?ups?|leg raise|hanging|ab wheel|rollout|dead ?bug|bird ?dog|russian twist|pallof|hollow|woodchop|side bend|carry|carries|farmer|suitcase|superman|back extension|hyperextension|copenhagen)\b/i;

/** Explosive work: highest CNS cost, lowest tolerance for being tired. */
const POWER = /\b(jump|jumps|bound|bounds|hop|hops|throw|sprint|sprints|clean|snatch|jerk|depth drop|plyo|plyometric|broad|box jump|med ball|medicine ball|explosive|flying \d+m|accelerat)\b/i;

/** Mobility, activation and stretching — never a working set. */
const PREP = /\b(stretch|mobility|foam roll|roll out|activation|warm ?up|cool ?down|breathing|dislocate|cat[- ]cow|arm circles|leg swings|ankle rock|hip switch|90\/90|band pull|pull ?apart|glute bridge|bird ?dog|scapular|dead ?hang|thoracic|couch|pigeon|world'?s greatest|a-?skip|b-?skip|high knees|butt kicks?|walkout)\b/i;

// `row` is deliberately absent and `rowing` is not: a cable row and a barbell
// row are back exercises, and a one-word match turned both into cardio.
const CARDIO = /\b(run|runs|jog|rowing|rower|row erg|bike|cycle|ski erg|erg|skipping|swim|shuttle|intervals?|tempo|fartlek|zone \d|metcon|circuit|treadmill|stair|assault)\b/i;

/**
 * What kind of movement this is.
 *
 * ORDER OF EVIDENCE, best first. The curated table knows things no regex can —
 * that a Nordic hamstring curl is an accessory rather than an isolation curl,
 * that a T-drill is change-of-direction rather than cardio — so it wins
 * whenever it has an opinion. The name rules then cover the ~250 imported gym
 * exercises and anything a language model invents.
 */
export function kindOf(name: string, declaredSlot?: Slot | null): ExerciseKind {
  const n = name.trim().toLowerCase();
  if (!n) return "prep";

  const known = BY_NAME.get(n);
  if (known) {
    /**
     * THE CURATOR'S OWN SLOT WINS, AND IT HAS TO BE CHECKED FIRST.
     *
     * The pattern switch below used to run before this, and it re-sectioned
     * three movements that were filed as warm-ups on purpose: A-skips, strides
     * and ladder quick-feet. All three carry a sprint or footwork pattern
     * because that is what they train, and all three are the classic dynamic
     * warm-up for a speed session — which is exactly why somebody sat down and
     * filed them under `warmup`.
     *
     * Promoting them into the main block moved real volume onto the hamstrings
     * and took a football block past what the evidence says can be recovered
     * from: 26 weekly sets against a ceiling of 22. A coarse pattern mapping
     * should never overrule a hand-placed slot.
     */
    if (known.slot === "warmup" || known.slot === "cooldown") return "prep";
    switch (known.pattern) {
      case "jump": case "sprint": return "power";
      // MOBILITY ONLY, NOT REHAB. `rehab` on this table means "safe to
      // prescribe around a niggle", not "not a working set" — a standing calf
      // raise and a Nordic hamstring curl both carry it, and both are loaded
      // work that belongs in the main block. Mapping the two together sent
      // every rehab-tagged accessory into the warm-up.
      case "mobility": return "prep";
      case "conditioning": return "cardio";
      case "skill": return "skill";
      case "core": case "carry": return "core";
      case "cod": case "footwork": return "power";
    }
    // A curated strength movement: rank it by what it is loaded with, which is
    // what actually decides how expensive it is.
    return byEquipment(name, known.slot);
  }

  /**
   * THE OTHER TWO CATALOGUES, before any regex.
   *
   * Ball work lives in lib/skills.ts and runs live in lib/running.ts, and
   * neither is in MOVEMENTS — so "Tight cone weave" fell through to the
   * equipment fallback and came back as a dumbbell compound, which would have
   * sorted a football drill into the middle of the strength block. lib/how-to.ts
   * already resolves a name against all three catalogues; asking it is both
   * more accurate than a name rule and the reason it exists.
   */
  const how = howToFor(name);
  if (how?.source === "skill") return "skill";
  if (how?.source === "run") return "cardio";

  /**
   * WHAT THE MOVEMENT IS BEATS WHAT IT WAS LABELLED, and this ordering is the
   * whole point of the file.
   *
   * The first version consulted `declaredSlot` before the name rules, on the
   * reasoning that an engine which said "warmup" knew more than a regex. That
   * is true of our engine and false of the thing this was written to catch: a
   * plan where dips and rope pushdowns arrive tagged `cooldown`. Trusting the
   * label there means agreeing with the mistake, and section purity becomes a
   * no-op on exactly the input it exists for.
   *
   * So the label is the LAST resort, consulted only for a name that no
   * catalogue and no rule recognises — where it is genuinely the only evidence
   * there is.
   */
  if (PREP.test(n)) return "prep";
  if (POWER.test(n)) return "power";
  if (CARDIO.test(n)) return "cardio";
  if (CORE.test(n)) return "core";
  if (ISOLATION.test(n)) return "isolation";
  return byEquipment(name, declaredSlot);
}

/**
 * A multi-joint lift, tiered by what it is loaded with.
 *
 * A barbell back squat, a goblet squat and a leg press are the same movement
 * pattern and three different costs: the bar is heaviest and least stable, the
 * machine is lightest and most stable. That is the whole reason the spec's
 * order separates them, and it is the right call — but only for movements that
 * are genuinely compound, which is why every isolation check runs first.
 */
function byEquipment(name: string, declaredSlot?: Slot | null): ExerciseKind {
  const found = findExercise(name);
  const bucket = found ? equipBucket(found.equipment) : "Other";
  if (bucket === "Barbell") return "compound";
  if (bucket === "Dumbbell" || bucket === "Kettlebell") return "secondary";
  if (bucket === "Machine" || bucket === "Cable") return "machine";
  // Bodyweight compounds — pull-ups, dips, press-ups — sit with the barbell
  // work, because for most athletes they ARE the heavy pull and the heavy push.
  if (bucket === "Bodyweight") return "compound";

  // Nothing in any catalogue recognises this name, so the label it arrived with
  // is the only evidence available. This is the one place it is trusted.
  if (!found) {
    if (declaredSlot === "warmup" || declaredSlot === "cooldown") return "prep";
    if (declaredSlot === "conditioning") return "cardio";
    if (declaredSlot === "skill") return "skill";
  }
  if (declaredSlot === "primary") return "compound";
  if (declaredSlot === "accessory") return "isolation";
  return "secondary";
}

/** Whether this is a working set rather than preparation or conditioning. */
export function isWorkingSet(kind: ExerciseKind): boolean {
  return KIND_RANK[kind] <= KIND_RANK.core;
}

/**
 * The section a movement belongs in, whatever it was labelled.
 *
 * THIS IS THE SECTION-PURITY RULE, and it only ever moves things in one
 * direction: a working set found in the warm-up or the cool-down is promoted
 * into the main block. It never demotes, because plenty of legitimate warm-up
 * work — band pull-aparts, glute bridges — would look like accessory work to a
 * classifier and dragging them into the main block would be the same mistake in
 * reverse.
 */
export function sectionFor(name: string, declared: Slot | null | undefined): Slot {
  const kind = kindOf(name, declared);
  if (kind === "prep") return declared === "cooldown" ? "cooldown" : "warmup";
  if (kind === "cardio") return "conditioning";
  if (kind === "skill") return "skill";
  // A working set. If it was filed as preparation, it was filed wrongly.
  if (declared === "warmup" || declared === "cooldown" || !declared) return mainSlotFor(kind);
  return declared;
}

/** Which of the engine's three working slots a kind belongs to. */
export function mainSlotFor(kind: ExerciseKind): Slot {
  switch (kind) {
    case "power": case "compound": return "primary";
    case "secondary": case "machine": return "secondary";
    default: return "accessory";
  }
}

/**
 * Reorder one session's working block by fatigue cost.
 *
 * STABLE within a tier, so the engine's own reasoning about which compound
 * comes first survives — this fixes the ordering it got wrong without
 * overriding the part it got right. Everything outside the working block keeps
 * its position relative to the sections around it.
 */
export function orderWorkingBlock<T extends { name: string; slot?: Slot | null }>(drills: T[]): T[] {
  const ranked = drills.map((d, i) => ({ d, i, k: kindOf(d.name, d.slot) }));
  const working = ranked.filter((r) => isWorkingSet(r.k));
  if (working.length < 2) return drills;

  const sorted = [...working].sort((a, b) =>
    KIND_RANK[a.k] - KIND_RANK[b.k] || a.i - b.i
  );
  // Put them back into the positions the working sets already occupied, so the
  // warm-up stays at the top and the cool-down stays at the bottom.
  const slots = working.map((r) => r.i);
  const out = [...drills];
  slots.forEach((position, n) => { out[position] = sorted[n].d; });
  return out;
}

/** True when the working block runs hardest-first. Used by the tests and the audit. */
export function inFatigueOrder<T extends { name: string; slot?: Slot | null }>(drills: T[]): boolean {
  const ranks = drills
    .map((d) => kindOf(d.name, d.slot))
    .filter(isWorkingSet)
    .map((k) => KIND_RANK[k]);
  return ranks.every((r, i) => i === 0 || ranks[i - 1] <= r);
}
