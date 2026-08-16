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

import { setCount } from "./training-sets";
import { MOVEMENT_BY_ID, type Movement, type Pattern } from "./movements";
import { muscleGroupForName, musclesForName, isCompoundName, type MuscleGroup } from "./hypertrophy";
import { spaceByMuscle } from "./session-order";
import { standardFor } from "./strength-standards";
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

/**
 * …except the ones in that slot that are ordinary resistance training.
 *
 * `rehab` is a slot, not a description of the load. A standing calf raise for
 * three sets of twelve is exactly the movement a bodybuilder does for calves,
 * and discounting it by half because of where it sits in the session was the
 * accounting, not the programme: a football block prescribing five and a half
 * sets of calf raises a week got scored 2.8 and reported as neglecting calves.
 *
 * The genuinely low-load work — banded walks, isometric squeezes, terminal knee
 * extensions, ankle mobility — keeps the discount, which is what it was added
 * for.
 */
const LOADED_REHAB = new Set<string>([
  "calf_raise",
  "calf_raise_eccentric",
  "shoulder_external_rotation",
]);

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
  return volumeBreakdown(week).total;
}

export interface VolumeBreakdown {
  /** Every set that touched the muscle, assistance counted at half. */
  total: MuscleVolume;
  /**
   * Only the sets where the muscle was the PRIMARY MOVER of real loading.
   *
   * Neither assistance nor discounted work counts here — a plyometric contact
   * and a banded squeeze are already held to be something other than resistance
   * volume (PLYO_CREDIT, ACTIVATION_CREDIT), and measuring a muscle whose only
   * work is those against a landmark defined in resistance sets compares two
   * different things. A rugby block whose adductor work is an isometric squeeze
   * is doing groin-injury prevention, not training adductors, and no honest
   * number of squeezes turns it into the latter.
   *
   * The distinction is what separates "this plan trains your biceps badly" from
   * "this plan does not train your biceps, and does not claim to". A footballer's
   * speed block prescribes rows and chin-ups and no curls: the biceps pick up
   * four sets of assistance a week, which is neither a plan to build them nor an
   * oversight — it is what happens to your arms when you pull heavy things.
   *
   * The audit used to call that neglect, because any number above zero counted
   * as "trained". It then flagged the same muscle in 192 of 216 generated weeks,
   * which is the point at which a warning has stopped being information.
   */
  direct: MuscleVolume;
}

/** Weekly sets per muscle, split by whether the muscle led the movement. */
export function volumeBreakdown(week: ProgramWeek): VolumeBreakdown {
  const out = emptyVolume();
  const direct = emptyVolume();
  const credit = (muscle: MuscleGroup, sets: number, primary: boolean, discount: number) => {
    out[muscle] += sets * discount * (primary ? 1 : SECONDARY_CREDIT);
    if (primary && discount === 1) direct[muscle] += sets;
  };
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
          : ACTIVATION_PATTERNS.has(movement.pattern) && !LOADED_REHAB.has(movement.id) ? ACTIVATION_CREDIT
          : 1;
        muscles.forEach((muscle, i) => {
          credit(muscle, setCount(drill), i === 0, plyo);
        });
        continue;
      }
      /**
       * The bodybuilding catalogue, counted the SAME WAY as the one above.
       *
       * This used to take the catalogue's single muscle label and credit that
       * one group. So a push day of bench, incline press and dips scored twelve
       * chest sets and nothing at all for triceps or front delts, and the audit
       * then reported "triceps: 3" — from the pushdowns alone — to somebody who
       * had just done three heavy pressing movements. The engine was told it
       * was neglecting a muscle it was hammering.
       *
       * `musclesForName` supplies the assisting movers the catalogue lacks, and
       * SECONDARY_CREDIT weighs them at half here exactly as it does for the
       * S&C library. One convention, both engines.
       */
      musclesForName(drill.name).forEach((muscle, i) => {
        credit(muscle, setCount(drill), i === 0, 1);
      });
    }
  }
  for (const k of Object.keys(out) as MuscleGroup[]) {
    out[k] = Math.round(out[k] * 10) / 10;
    direct[k] = Math.round(direct[k] * 10) / 10;
  }
  return { total: out, direct };
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
  const { total: volume, direct } = volumeBreakdown(week);
  const groups = Object.keys(volume) as MuscleGroup[];
  /**
   * "TRAINS" MEANS PRESCRIBES A MOVEMENT FOR, not "touches at all".
   *
   * This was `volume[g] > 0`, which is true of any muscle that assists anything
   * — so a footballer's speed block "trained" biceps, because rows exist, and
   * was then flagged for training them at four sets a week. 192 of 216 generated
   * weeks came out flagged, which is a warning nobody can act on and everybody
   * learns to ignore. A muscle with no movement of its own is not part of this
   * block; that is a decision the plan made, not a fault it has.
   */
  const trained = groups.filter((g) => direct[g] > 0);
  return {
    week: week.week,
    volume,
    excessive: groups.filter((g) => verdictFor(volume[g]) === "excessive"),
    // Judged on TOTAL, chosen from DIRECT: what matters is the stimulus a muscle
    // receives, but only for the muscles the plan set out to train.
    neglected: trained.filter((g) => volume[g] < LANDMARKS.maintenance),
    hamstringToQuad: volume.quads > 0 ? Math.round((volume.hamstrings / volume.quads) * 100) / 100 : null,
  };
}

export function auditPlan(plan: ProgramPlan): VolumeAudit[] {
  return plan.weeks.map(auditWeek);
}

// --- making the plan agree with the audit ------------------------------------

/**
 * IF THE PLAN TRAINS A MUSCLE, IT TRAINS IT ENOUGH TO MATTER.
 *
 * The app contained a straight contradiction. One half built the week; the other
 * half measured it and reported that it neglected muscles it was training — in
 * 620 of 1044 generated weeks, after the counting itself had been corrected.
 * Both halves were shipped, both were shown to the athlete, and nothing
 * reconciled them. The athlete's own words for it: "it says it itself the engine
 * isn't doing its job."
 *
 * A muscle given three sets a week is the worst of both worlds — it costs
 * session time, it costs recovery, and it is below the dose that holds what you
 * have. There are exactly two honest resolutions: train it properly, or don't
 * train it. This takes the first, because the plan already decided the muscle
 * belongs in the block; what it got wrong was the dose.
 *
 * ONLY EVER CHANGES THE SETS ON MOVEMENTS THE PLAN ALREADY CHOSE. It does not
 * pick exercises, reorder anything, or touch a muscle the block deliberately
 * leaves alone. Selection is the engine's job and stays there.
 *
 * AND NOT MORE THAN IT CAN RECOVER FROM. The same pass trims the other end,
 * because correcting only the floor introduced the opposite fault: once
 * assisting movers were counted properly, an aesthetics peak week put shoulders
 * and triceps at 28 weekly sets — past the point the evidence says recovery
 * costs more than the volume buys. A muscle can be over-trained by accident just
 * as easily as under-trained, and by the same mechanism: nobody was counting.
 *
 * Six sets is the most one exercise gets and two the least. Past those it stops
 * being a change of dose and becomes a change of exercise selection, which is
 * the engine's decision and not this function's.
 */
const MAX_SETS_PER_DRILL = 6;
const MIN_SETS_PER_DRILL = 2;

type WeekDrill = ProgramWeek["sessions"][number]["drills"][number];

export function balanceWeeklyVolume<W extends ProgramWeek>(week: W): W {
  // Work on a copy: a built plan is handed to React and to the database, and
  // mutating a week in place would change a program object somebody else is
  // already holding.
  const sessions = week.sessions.map((s) => ({ ...s, drills: s.drills.map((d) => ({ ...d })) }));

  /**
   * Every drill that counts, with what ONE set of it is worth to each muscle.
   *
   * Held per drill rather than per muscle because changing a drill's sets moves
   * several muscles at once — one more set of bench press is one chest set AND
   * half a triceps set AND half a shoulder set. The first version of this
   * tracked only the primary and so trimmed a group by removing sets whose
   * knock-on effect it could not see.
   */
  const counted: { drill: WeekDrill; per: Partial<Record<MuscleGroup, number>>; primary: MuscleGroup | null }[] = [];
  for (const s of sessions) {
    for (const d of s.drills) {
      if (d.slot === "warmup" || d.slot === "cooldown" || d.slot === "conditioning" || d.skill) continue;
      const per = perSetContribution(d.name);
      const muscles = Object.keys(per) as MuscleGroup[];
      if (!muscles.length) continue;
      counted.push({ drill: d, per, primary: primaryMuscleOf(d.name) });
    }
  }

  const { total, direct } = volumeBreakdown(week);
  const running: Record<MuscleGroup, number> = { ...total };
  const apply = (entry: (typeof counted)[number], delta: number) => {
    entry.drill.sets += delta;
    for (const [m, v] of Object.entries(entry.per)) running[m as MuscleGroup] += v * delta;
  };

  const groups = Object.keys(running) as MuscleGroup[];

  // --- floor: a muscle the plan trains, trained enough to matter -------------
  for (const group of groups.filter((g) => direct[g] > 0 && total[g] < LANDMARKS.maintenance)) {
    const targets = counted.filter((c) => c.primary === group);
    if (!targets.length) continue;
    // Round-robin, so a muscle short by four sets gains one on each of its
    // movements rather than four on the first — which would turn a balanced
    // three-exercise day into one exercise done to death.
    let guard = 0;
    while (running[group] < LANDMARKS.maintenance && guard++ < 40) {
      let moved = false;
      for (const t of targets) {
        if (running[group] >= LANDMARKS.maintenance) break;
        if (t.drill.sets >= MAX_SETS_PER_DRILL) continue;
        apply(t, +1);
        moved = true;
      }
      if (!moved) break; // every movement is at its cap; the dose is as high as it goes
    }
  }

  // --- ceiling: and not past what the evidence supports ----------------------
  // After the floor, because topping one muscle up can push an assisted
  // neighbour over — and the ceiling is the constraint that must hold last.
  let guard = 0;
  while (guard++ < 80) {
    const over = groups.find((g) => running[g] > LANDMARKS.excessive);
    if (!over) break;
    // Take the set off whichever movement gives this muscle the most, so the
    // fewest sets are removed — and never off a movement that is already at the
    // floor, or the trim would empty a drill to fix a neighbour.
    const candidates = counted
      .filter((c) => (c.per[over] ?? 0) > 0 && c.drill.sets > MIN_SETS_PER_DRILL)
      .sort((a, b) => (b.per[over] ?? 0) - (a.per[over] ?? 0) || b.drill.sets - a.drill.sets);
    const pick = candidates[0];
    if (!pick) break; // nothing left to take; the selection itself is the problem
    apply(pick, -1);
  }

  return { ...week, sessions };
}

/** The muscle a named drill leads with, across both catalogues. */
function primaryMuscleOf(name: string): MuscleGroup | null {
  const movement = BY_NAME.get(name);
  if (movement) return musclesOf(movement)[0] ?? null;
  return musclesForName(name)[0] ?? null;
}

/**
 * What ONE set of a named drill is worth to each muscle it touches.
 *
 * The same weighting `volumeBreakdown` applies, factored out so the two cannot
 * drift: change the credit rules in one place and both the measurement and the
 * correction move together.
 */
function perSetContribution(name: string): Partial<Record<MuscleGroup, number>> {
  const out: Partial<Record<MuscleGroup, number>> = {};
  const movement = BY_NAME.get(name);
  const muscles = movement ? musclesOf(movement) : musclesForName(name);
  const discount = !movement ? 1
    : PLYO_PATTERNS.has(movement.pattern) ? PLYO_CREDIT
    : ACTIVATION_PATTERNS.has(movement.pattern) && !LOADED_REHAB.has(movement.id) ? ACTIVATION_CREDIT
    : 1;
  muscles.forEach((m, i) => {
    out[m] = (out[m] ?? 0) + discount * (i === 0 ? 1 : SECONDARY_CREDIT);
  });
  return out;
}

/** Every week of a plan, balanced. */
export function balancePlanVolume(plan: ProgramPlan): ProgramPlan {
  return { ...plan, weeks: plan.weeks.map(balanceWeeklyVolume) };
}

/**
 * The muscle a drill leads with, as a plain string, for anything that needs to
 * compare two drills without knowing which catalogue they came from.
 *
 * This is the same answer `balanceWeeklyVolume` works from — deliberately, so
 * the module that spaces exercises apart and the module that counts their
 * volume cannot disagree about what a "Cable Fly" is.
 */
export function primaryMuscleName(name: string): string | null {
  return primaryMuscleOf(name);
}

/** True when a named drill is a compound, across both catalogues. */
export function isCompoundDrill(name: string): boolean {
  const movement = BY_NAME.get(name);
  // The S&C library has no compound flag; its own slots already carry the
  // ordering ("primary" before "accessory"), so the answer is only consulted
  // for drills that have no slot at all.
  if (movement) return movement.slot === "primary" || movement.slot === "secondary";
  return isCompoundName(name);
}

/**
 * WHAT THE BLOCK ACTUALLY DELIVERS, said before the athlete trains it.
 *
 * The floor is now guaranteed — every trained muscle reaches maintenance — but
 * maintenance is not what somebody asking to build muscle wants, and on three
 * days a week across ten muscle groups the arithmetic simply does not reach the
 * 10-20 band for all of them: three sessions is about 84 working sets and the
 * band would want 110. That is a fact about the week, not a fault in the engine,
 * and no amount of rearranging fixes it.
 *
 * What was unacceptable was where the athlete found out. The progress page
 * measured the same block and reported the shortfall days later, which read as
 * the app contradicting itself. Saying it up front, with the one change that
 * actually fixes it, turns the same fact into advice.
 *
 * MEASURED FROM THE FINISHED BLOCK, not predicted from the day count — after
 * the balance pass and with the priority weighting applied, so the sentence
 * names the muscles that are really short rather than the ones a formula
 * guessed would be.
 */
export function volumeShortfall(plan: ProgramPlan): string | null {
  // Week 2, not week 1 or 4: the block ramps in and deloads out, so the first
  // and last weeks understate what it prescribes.
  const week = plan.weeks[1] ?? plan.weeks[0];
  if (!week) return null;

  const { total, direct } = volumeBreakdown(week);
  const short = (Object.keys(direct) as MuscleGroup[])
    .filter((g) => direct[g] > 0 && total[g] < LANDMARKS.productiveLow)
    .sort((a, b) => total[a] - total[b]);
  if (!short.length) return null;

  const days = week.sessions.length;
  const named = short.map((g) => MUSCLE_LABEL[g].toLowerCase());
  const list = named.length === 1 ? named[0]
    : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  /**
   * The advice has to fit the week it is given about.
   *
   * "Add a training day" is the right answer at three and the wrong one at six,
   * where there is no seventh day to add and the shortfall is a deliberate
   * trade: the block is spending its budget on the big compound groups, which
   * is what a coach does and what the athlete should be told it did.
   */
  const advice = days >= 6
    ? `That is the trade this block makes on purpose — the compound work gets the volume, and ${named.length === 1 ? "this" : "these"} hold${named.length === 1 ? "s" : ""}. Add sets to them yourself if you want them pushed.`
    : `Everything else is in that band. Adding a training day is the one change that moves this.`;

  return (
    `On ${days} day${days === 1 ? "" : "s"} a week there isn't room to push everything: ` +
    `${list} sit at a holding dose rather than the 10-20 sets a week that builds fastest. ${advice}`
  );
}

/**
 * A whole plan, with each session ordered so consecutive exercises train
 * different muscles. See lib/session-order.ts for why that matters.
 */
export function spacePlanSessions(plan: ProgramPlan): ProgramPlan {
  return {
    ...plan,
    weeks: plan.weeks.map((w) => ({
      ...w,
      sessions: w.sessions.map((s) => ({
        ...s,
        drills: spaceByMuscle(s.drills, primaryMuscleName, isCompoundDrill),
      })),
    })),
  };
}

// --- what was actually done, as opposed to what was planned ------------------

/**
 * Weekly sets per muscle from the TRAINING LOG.
 *
 * Everything above this line audits a programme — what the engine intends to
 * prescribe. Nobody trains their plan exactly, and the number that should drive
 * a decision is the one describing what happened. An athlete looking at "chest:
 * Novice" needs to see "chest: 4 sets a week" beside it before the rank means
 * anything they can act on: those two facts together say "train it more", and
 * either one alone says nothing.
 *
 * AVERAGED OVER THE WINDOW, not totalled, because weekly sets is the unit every
 * landmark in this file is expressed in and a 28-day total silently reads four
 * times too high against them.
 *
 * Names, not catalogue ids, because a training log is free text — the same
 * `muscleGroupForName` the programme auditor uses, so a logged "Bench Press"
 * and a prescribed one cannot be counted as different exercises.
 */
export function loggedWeeklySets(
  logs: { log_date?: string; drills?: { name?: string; sets?: number; reps?: number; load_kg?: number | null; sets_detail?: unknown }[] | null }[] | null | undefined,
  windowDays: number,
): Partial<Record<MuscleGroup, number>> {
  const weeks = Math.max(1, windowDays / 7);
  const total = new Map<MuscleGroup, number>();

  for (const log of logs ?? []) {
    for (const drill of log.drills ?? []) {
      const name = String(drill.name ?? "").trim();
      if (!name) continue;
      /**
       * TWO VOCABULARIES, BECAUSE THE APP HAS TWO.
       *
       * `muscleGroupForName` only knows the hypertrophy catalogue, and the
       * catalogue does not contain "Back squat" — so the single most commonly
       * logged lift in the app contributed exactly zero quad volume, and an
       * athlete squatting three times a week was told they had trained nothing.
       *
       * The barbell lifts live in lib/strength-standards.ts instead, with their
       * own aliases, because that is where they are ranked. Falling back to
       * them joins the two up: a logged "back squat" now counts toward the same
       * quads its rank is computed from, which is the whole point of showing
       * the two numbers side by side.
       */
      const groups = muscleGroupForName(name)
        ? [muscleGroupForName(name)!]
        : standardFor(name)?.muscles ?? [];
      if (groups.length === 0) continue;
      const sets = setCount(drill as never);
      if (sets <= 0) continue;
      // Full credit to each primary mover, exactly as the programme auditor
      // above counts PATTERN_MUSCLES — a squat is quad volume AND glute volume.
      for (const group of groups) total.set(group, (total.get(group) ?? 0) + sets);
    }
  }

  const out: Partial<Record<MuscleGroup, number>> = {};
  for (const [group, sets] of total) out[group] = Math.round((sets / weeks) * 10) / 10;
  return out;
}

/**
 * The plainest sentence that can be said about a muscle's weekly volume.
 *
 * Written as advice rather than as a category, because "maintenance" is a word
 * from the literature and "enough to hold what you have, not to build" is what
 * it means to somebody deciding what to do on Thursday.
 */
export function volumeAdvice(sets: number): string {
  const v = verdictFor(sets);
  if (v === "untrained") return "nothing logged for this";
  if (v === "maintenance") return "enough to hold what you have, not to build";
  if (v === "excessive") return "more than the evidence supports — recovery is the limit here";
  return "in the productive range";
}
