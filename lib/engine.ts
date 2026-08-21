// =============================================================================
// Program engine v2 — builds a training BLOCK, not a list of drills.
//
// WHAT WAS WRONG WITH V1. Each session called recommendDrills() with the same
// inputs and took the top 3. The scoring is deterministic and buildProgram never
// passed recentDrillNames, so the anti-repetition penalty never fired. The
// result: a 4-week, 3-day block contained twelve sessions built from three
// distinct sets of drills. Week 3 Day 1 was Week 1 Day 1 with different reps.
//
// It also had no notion of a session. Three drills arrived in scored order, so
// you might warm up with a depth drop, and there was no warm-up available at all
// because the engine couldn't see the mobility work (see lib/movements.ts).
// Prescription was a flat lookup by goal — every strength movement got 4x6
// whether it was a deadlift or a calf raise, and nothing ever said how long to
// rest, which for sprint work is most of the prescription.
//
// WHAT V2 DOES.
//   1. Builds each session from SLOTS: warm up, do the hard skilled work fresh,
//      accumulate volume, condition, cool down.
//   2. Rotates selection by session index, so every session in the block
//      differs — while staying pure and deterministic, because the app
//      regenerates plans from saved inputs and they must come back identical.
//   3. Doses each movement from its own prescription — sets, reps, rest, tempo
//      and target RPE — progressed across the four weeks.
//   4. Keeps one movement per pattern per session, so you don't get back squat,
//      front squat and goblet squat in the same hour.
//
// Pure + tested.
// =============================================================================

import type { PainMap } from "./types";
import type { SportId } from "./exercises";
import { isExcluded, EMPTY_CONSTRAINTS, type Constraints } from "./constraints";
import { positionProfile, type PositionProfile } from "./position-profile";
import { skillForSession } from "./skills";
import { runZoneLabel, runZoneFeel } from "./running";
import {
  MOVEMENTS, type BodyArea, type Dose, type GoalType, type Movement,
  type Pattern, type Prog, type Slot,
} from "./movements";

export type TrainingFocus = "performance" | "fitness" | "aesthetics" | "rehab";

// Re-exported so consumers can take the program types and the vocabulary they
// are written in from one place.
export type { GoalType, BodyArea, Slot, Movement } from "./movements";

export interface ProgramDrill {
  name: string;
  sets: number;
  reps: number;
  cue: string;
  reason: string;
  progression?: string;
  /**
   * Technical work is prescribed in its own terms — "5 × 60 seconds each foot"
   * rather than sets and reps. When present the UI shows this instead.
   */
  prescription?: string;
  /** True for ball work, so it can be labelled apart from the physical block. */
  skill?: boolean;
  /**
   * True for work that came from an active rehab plan rather than the block.
   *
   * It is labelled apart because it is not optional in the way an accessory is,
   * and because offering to "swap" it for a similar movement would be offering
   * to leave the rehab protocol — see lib/rehab-plan.ts.
   */
  rehab?: boolean;
  // --- v2 additions. All optional: a program saved by v1 still renders. ---
  /** Where it sits in the session, so the UI can group and label the blocks. */
  slot?: Slot;
  /** Seconds between sets. */
  rest?: number;
  /** "RPE 8" — how hard this should feel. */
  intensity?: string;
  tempo?: string;
  /** Preparation template item: one completion tap, never load tracking. */
  completionOnly?: boolean;
  /** Explicitly chosen in the programme builder, so the time fit values it first. */
  preferred?: boolean;
}

export interface ProgramSession {
  day: number;
  title: string;
  focus: GoalType;
  drills: ProgramDrill[];
  /** Active rest is a real scheduled day, not an empty workout. */
  kind?: "workout" | "active_rest";
  durationMinutes?: number | null;
  rpe?: number | null;
  notes?: string | null;
}
export interface ProgramWeek { week: number; theme: string; intensity: string; focusNote: string; sessions: ProgramSession[] }
export interface ProgramPlan {
  goal: GoalType;
  summary: string;
  constraints: string[];
  weeks: ProgramWeek[];
  block?: number;
  /** Ordered goal badges that explain what drove this programme. */
  goals?: import("./program-preferences").GoalPreference[];
  /** The generation controls used for this block, retained for rebuilds. */
  settings?: import("./program-preferences").ProgramSettings;
  /**
   * What the checklist changed on its way here, in the athlete's words.
   *
   * Kept on the plan rather than returned alongside it because the plan is what
   * gets saved and re-read: a correction the athlete can only see in the
   * milliseconds after generation is a correction they will never see. See
   * lib/program-validate.ts for why they are surfaced at all.
   */
  corrections?: string[];
}

export interface EngineInput {
  goal: GoalType;
  painMap: PainMap;
  isInSeason?: boolean;
  daysPerWeek?: number;
  block?: number;
  sport?: SportId;
  focus?: TrainingFocus;
  position?: string | string[];
  constraints?: Constraints;
  /**
   * Movement ids a coach has specifically chosen for this athlete.
   *
   * A strong PREFERENCE, not an override. Each pick gets a large scoring bonus
   * so it wins its slot wherever it's eligible — but it still passes through
   * the pain filter and the athlete's own exclusions first. A coach picking a
   * back squat for someone reporting 8/10 knee pain should not get a back
   * squat, and finding that out from an injury is not acceptable when the
   * engine already knows.
   */
  mustInclude?: string[];
  /**
   * How many weeks the block runs, including its deload. Defaults to four.
   * Three when the athlete is arriving tired — see lib/deload.ts.
   */
  blockWeeks?: number;
  goals?: import("./program-preferences").GoalPreference[];
  settings?: import("./program-preferences").ProgramSettings;
}

// --- Pain ---------------------------------------------------------------------

const SIDE = new Set(["left", "right"]);

/** Worst pain per body area from a pain map ({knee_left:7} -> {knee:7}). */
export function painByArea(painMap: PainMap): Partial<Record<BodyArea, number>> {
  const out: Partial<Record<BodyArea, number>> = {};
  for (const [k, v] of Object.entries(painMap ?? {})) {
    const area = k.split("_").filter((t) => !SIDE.has(t)).join("_") as BodyArea;
    out[area] = Math.max(out[area] ?? 0, Number(v) || 0);
  }
  return out;
}

// --- Session shape ------------------------------------------------------------

/**
 * How many movements each slot contributes, per session focus. This is the
 * difference between "three drills" and a session: a strength day earns two
 * accessory slots, a rehab day is mostly warm-up and accessory work, and an
 * endurance day is built around the conditioning block.
 */
const BLUEPRINTS: Record<GoalType, Partial<Record<Slot, number>>> = {
  // A strength block used to end at the cool-down with no aerobic work in it at
  // all — which meant that for the goal most athletes actually pick, no program
  // in any sport could ever prescribe going for a run. That isn't a defensible
  // strength block either: some easy aerobic work is in every serious one,
  // because it's what lets you recover between the heavy days.
  strength:        { warmup: 2, primary: 1, secondary: 2, accessory: 2, conditioning: 1, cooldown: 1 },
  // Two accessory slots, not one. With a single slot a speed block came out at
  // 0.3 hamstring sets per quad set — quads accumulating from squats, split
  // squats and every jump while the hamstrings got one Nordic. Sprinting is the
  // mechanism that tears hamstrings, so the session that trains sprinting is
  // the last one that should be short of hamstring work.
  speed:           { warmup: 2, primary: 2, secondary: 1, accessory: 2, conditioning: 1, cooldown: 1 },
  agility:         { warmup: 2, primary: 1, secondary: 2, accessory: 1, conditioning: 1, cooldown: 1 },
  endurance:       { warmup: 2, secondary: 1, accessory: 1, conditioning: 2, cooldown: 1 },
  injury_recovery: { warmup: 3, secondary: 1, accessory: 3, conditioning: 1, cooldown: 1 },
  skill:           { warmup: 2, primary: 1, secondary: 1, accessory: 1, conditioning: 1, cooldown: 1 },
};

/**
 * Above this RPE a conditioning movement isn't recovery work.
 *
 * Used on the deload week, where the whole point is that the work comes down.
 * Filling that week's conditioning slot from the same ranked list as Peak week
 * put hill repeats and VO2 intervals into the down week, which is the one week
 * they must not be in — and it was also why the recovery run, the easiest thing
 * in the catalogue, was never selected anywhere.
 */
const RECOVERY_RPE_CEILING = 5;

/**
 * The hardest conditioning may be in a block that isn't about conditioning.
 *
 * 7 leaves tempo runs, sled work and easy aerobic minutes — everything whose
 * job is to build the engine underneath the quality — while excluding the
 * RPE 9 interval sessions that are a second hard workout wearing a finisher's
 * clothes. See the filter in buildBlock for the failure this caught.
 *
 * Measured against the CATALOGUE's rpe, not the progressed one, so a tempo run
 * that starts at 7 still reads RPE 8 in peak week. That is deliberate and not
 * an escape: peaking a supportive session by one point is periodisation, while
 * selecting a movement that was RPE 9 before any progression is choosing a
 * second hard workout. It is the choice this filters, not the climb.
 */
const SUPPORT_CONDITIONING_RPE_CEILING = 7;

/**
 * Sports whose athletes sprint, and the movements that keep their hamstrings
 * attached. See the bonus in `rankSlot`.
 *
 * Deliberately the hamstring-SPECIFIC movements: a squat is not hamstring work
 * and a hip thrust is glutes. The deadlift earns its place because it is the
 * one bilateral hinge heavy enough to matter here.
 */
const SPRINT_SPORTS = new Set<SportId>(["football", "rugby", "basketball", "running"]);
const HAMSTRING_WORK = new Set(["nordic_curl", "single_leg_rdl", "hamstring_slider", "deadlift"]);
/**
 * Calf and achilles work, for the same reason and the same sports.
 *
 * Football blocks were coming out at 1.3-5.7 calf sets a week — below
 * maintenance — in a sport that is essentially a series of achilles loads.
 * Calf raises sit in the `rehab` pattern and score like rehab work, so they
 * never won a slot unless somebody was already injured, which is precisely the
 * wrong time to start.
 */
const CALF_WORK = new Set(["calf_raise", "calf_raise_eccentric", "pogo_hops"]);

/**
 * What a sprinting athlete's week must contain, whatever else is in it.
 *
 * A scoring bonus was not enough and could not be: `pick` rotates its window, so
 * a well-ranked movement is spun out of the slot exactly as a coach's picks
 * were. Widening the speed blueprint made it WORSE — the extra accessory slot
 * shifted the rotation and the Nordic vanished entirely, taking a 3-day speed
 * block from four hamstring sets to zero.
 *
 * So these are taken before the rotation, the same mechanism as a coach's pick,
 * and for a stronger reason: a coach's pick is a preference, and a sprinting
 * athlete with no posterior-chain work is a hamstring injury with a date on it.
 * The pain filter still runs first and still wins.
 */
const SPRINT_ESSENTIALS = ["nordic_curl", "calf_raise_eccentric"];

/**
 * One guaranteed posterior-chain movement PER SESSION, not two per block.
 *
 * The two-item list above is distributed round-robin (`pi % days === di`), so
 * on a 3-day week one session got a Nordic, one got calves and the third got
 * neither — and everything past that relied on a scoring bonus that loses when
 * slots are scarce. Measured on the peak week, that produced:
 *
 *   football/speed/3d   4.0 hamstring sets vs 13.0 quad — 0.31
 *   rugby/speed/3d      4.0 vs 13.7          — 0.29
 *   basketball/speed/3d 4.0 vs 13.0          — 0.31
 *
 * against 0.80-0.92 at five days. Quad volume does not move with frequency
 * (squats and jumps are in every session) while hamstring volume did, so the
 * fewer days an athlete trains, the worse the imbalance — which is backwards.
 * Three days a week is the busy semi-pro, not the edge case.
 *
 * Returning exactly `days` entries means the modulo gives every session one.
 * Hamstrings lead the cycle and so take the majority on odd-length weeks:
 * the ratio is the worse deficit, and sprinting is the mechanism that tears
 * hamstrings. Varying the movement rather than repeating one lift keeps the
 * per-block selection rule intact — it differs by DAY, not by week.
 */
function sprintEssentials(days: number): string[] {
  const cycle = [
    "nordic_curl",
    "calf_raise_eccentric",
    "single_leg_rdl",
    "calf_raise",
    "hamstring_slider",
  ];
  return Array.from({ length: Math.max(0, days) }, (_, i) => cycle[i % cycle.length]);
}

const SLOT_ORDER: Slot[] = ["warmup", "primary", "secondary", "accessory", "skill", "conditioning", "cooldown"];

export const SLOT_LABEL: Record<Slot, string> = {
  warmup: "Warm-up",
  primary: "Main work",
  secondary: "Secondary",
  accessory: "Accessory",
  skill: "Ball work",
  conditioning: "Conditioning",
  cooldown: "Cool-down",
};

// Different slots rotate on different offsets, so two sessions that happen to
// share a primary don't also share their accessories.
const SLOT_SEED: Record<Slot, number> = {
  warmup: 0, primary: 1, secondary: 3, accessory: 5, skill: 7, conditioning: 11, cooldown: 13,
};

// --- Weekly progression -------------------------------------------------------

interface WeekShape { setsDelta: number; repFactor: number }

// A movement you add weight to climbs in intensity as reps come DOWN; one you
// add reps to climbs in volume as reps go UP; skill work holds its numbers and
// progresses by difficulty. This is what makes week 3 genuinely different from
// week 1 rather than the same session relabelled.
const WEEK_SHAPE: Record<Prog, WeekShape[]> = {
  load:  [{ setsDelta: 0, repFactor: 1.0 }, { setsDelta: 1, repFactor: 0.85 }, { setsDelta: 1, repFactor: 0.7 }, { setsDelta: -1, repFactor: 1.0 }],
  reps:  [{ setsDelta: 0, repFactor: 1.0 }, { setsDelta: 0, repFactor: 1.2 },  { setsDelta: 1, repFactor: 1.35 }, { setsDelta: -1, repFactor: 0.9 }],
  time:  [{ setsDelta: 0, repFactor: 1.0 }, { setsDelta: 0, repFactor: 1.2 },  { setsDelta: 1, repFactor: 1.4 },  { setsDelta: -1, repFactor: 0.8 }],
  skill: [{ setsDelta: 0, repFactor: 1.0 }, { setsDelta: 0, repFactor: 1.0 },  { setsDelta: 1, repFactor: 1.0 },  { setsDelta: -1, repFactor: 1.0 }],
};

// Effort climbs into the peak week and drops off a cliff on the deload — which
// is the entire point of a deload, and what people get wrong when left to it.
const RPE_DELTA = [0, 0.5, 1, -2];

/**
 * Minutes above which a single continuous effort is a session in its own right
 * rather than something you tack onto the end of one.
 *
 * 45 keeps easy 20-40 minute aerobic work available on a lifting day — which is
 * in every serious strength block and is what lets you recover between the
 * heavy days — while keeping the 75-90 minute long run on endurance days.
 */
const LONG_EFFORT_MINUTES = 45;

/**
 * Movement patterns whose quality is destroyed by fatigue, and the effort
 * ceiling that protects them.
 *
 * Sprinting, jumping and changing direction are limited by how much force you
 * can produce per contact, not by how much work you can survive. Grind them and
 * the thing being trained goes away: the velocity-loss literature is consistent
 * that lower fatigue thresholds produce BETTER explosive adaptations than
 * higher ones at matched volume, and a fatigued sprint is also the textbook
 * hamstring-strain mechanism.
 *
 * The escalation above applied uniformly, so peak week prescribed:
 *
 *   Flying 20m sprints    RPE 10   (max effort, zero in reserve)
 *   Hill sprints          RPE 10
 *   T-drill               RPE 10
 *   Depth drop to sprint  RPE  9
 *   Power clean           RPE  9
 *
 * RPE 10 is failure. Nobody coaches a sprint session to failure, and an
 * Olympic lift at 9 is a technique problem waiting to happen. Peaking this work
 * means sharper reps and more of them, never grinding — so it keeps its base
 * effort and is capped at 8 whatever the week says.
 *
 * Strength patterns (squat, hinge, press, pull, carry) are unaffected: RPE 8-9
 * in a peak week is exactly right for those, and that is where the block's
 * intensity is supposed to come from.
 */
const QUALITY_PATTERNS = new Set<Pattern>(["sprint", "jump", "cod", "footwork"]);
const QUALITY_RPE_CEILING = 8;
/** Accessories are volume work: two or three reps left in the tank. */
const ACCESSORY_RPE = 7;

/**
 * In-season gym volume as a fraction of off-season, and how it is spread.
 *
 * The fraction is unchanged; TAPER_HIGH and TAPER_LOW average to it, so the
 * week does the same total work and simply front-loads it. Professional squads
 * do far less in-season gym work than this implies in absolute terms — the
 * literature describes one to two strength sessions a week maintaining
 * performance across a season — but how many days to train is the athlete's
 * choice to make, and overriding it silently is not this engine's job. What it
 * can do is make sure the last session before the weekend is the light one.
 */
const IN_SEASON_VOLUME = 0.75;
const TAPER_HIGH = 0.95;
const TAPER_LOW = 0.55;

const WEEK_PROGRESSION: Record<Prog, string[]> = {
  load:  ["Groove the movement at a weight you could do 2-3 more reps with.",
          "Add a little weight and a set — reps drop slightly, that's the point.",
          "Heaviest week: push the load, stop 1 rep short of failure.",
          "Deload: same movements, ~60% of the weight, stay snappy."],
  reps:  ["Establish clean reps you fully control.",
          "Same movement, more reps per set than last week.",
          "Peak volume: extra set and the highest reps of the block.",
          "Deload: cut the volume right back and recover."],
  time:  ["Settle into the work intervals at a repeatable effort.",
          "Extend each interval versus last week.",
          "Longest, hardest intervals of the block.",
          "Deload: short and easy, just keep ticking over."],
  skill: ["Prioritise clean technique over speed.",
          "Same drill, do it faster or in tighter space.",
          "Add a decision, a defender, or your weaker side.",
          "Deload: light, sharp reps to stay grooved."],
};

export const WEEK_INTENSITY = ["Moderate", "Higher", "Peak", "Deload"];
export const WEEK_FOCUS = [
  "Build a base and nail technique.",
  "Turn the dial up — more load and volume than week 1.",
  "Peak week: the hardest sessions of the block.",
  "Recover and absorb the work so you come back stronger.",
];
export const THEMES = ["Base", "Build", "Peak", "Deload"];
export const REHAB_THEMES = ["Protect & activate", "Controlled load", "Build capacity", "Return to sprint"];

// --- Selection ----------------------------------------------------------------

function adjacent(goal: GoalType, t: GoalType): boolean {
  const pairs: Record<GoalType, GoalType[]> = {
    speed: ["agility", "strength"],
    agility: ["speed", "skill"],
    strength: ["speed"],
    endurance: ["injury_recovery"],
    injury_recovery: ["strength", "endurance"],
    skill: ["agility"],
  };
  return pairs[goal]?.includes(t) ?? false;
}

interface Ctx {
  focusGoal: GoalType;
  pain: Partial<Record<BodyArea, number>>;
  soreAreas: BodyArea[];
  sport?: SportId;
  trainingFocus?: TrainingFocus;
  constraints: Constraints;
  /** Coach's picks, as a set for cheap lookup. */
  picked?: Set<string>;
  forced?: Set<string>;
  /** What this position actually has to do. See lib/position-profile.ts. */
  position?: PositionProfile | null;
}

interface Scored { m: Movement; score: number; spares: boolean; demoted: boolean }

/**
 * Rank the movements that could fill a slot.
 *
 * Warm-ups, cool-downs and conditioning aren't scored on goal fit — a hip
 * opener isn't "on-goal" for anything and would score zero, which is how you
 * end up with no warm-up.
 */
function rankSlot(slot: Slot, ctx: Ctx): Scored[] {
  const goalScored = slot === "primary" || slot === "secondary" || slot === "accessory";

  const ranked = MOVEMENTS
    .filter((m) => m.slot === slot)
    // An exclusion the athlete typed is a hard filter, not a penalty — "I don't
    // train legs" must mean zero leg work, not less of it.
    .filter((m) => !isExcluded(ctx.constraints, m.region, m.name))
    .map((m): Scored | null => {
      let score = goalScored
        ? (m.targets.includes(ctx.focusGoal) ? 10 : m.targets.some((t) => adjacent(ctx.focusGoal, t)) ? 4 : 1)
        : 5;

      // Pain. A movement that loads a sore joint is penalised; badly loading a
      // badly hurting one is refused outright.
      let painCost = 0;
      for (const area of Object.keys(ctx.pain) as BodyArea[]) {
        const p = ctx.pain[area] ?? 0;
        const l = m.load[area] ?? 0;
        painCost += (p / 10) * l * 3;
        if (p >= 7 && l >= 2) return null;
      }
      score -= painCost;

      // Sport fit. A runner should not be given scrum drives.
      if (ctx.sport && m.sports) score += m.sports.includes(ctx.sport) ? 5 : -8;

      /**
       * A SPRINTING SPORT GETS HAMSTRING WORK. NON-NEGOTIABLE.
       *
       * A four-day football block contained NONE — measured, across every week.
       * Not a Nordic curl, not an RDL, not a slider, all three of which are in
       * the catalogue. The posterior chain got a hip thrust, which is glutes,
       * and depth drops. Nothing else in the app could see it, because volume
       * was counted per session slot rather than per muscle.
       *
       * Hamstring strain is the most common non-contact injury in football and
       * the Nordic curl is the best-evidenced thing anyone has found to reduce
       * it. Shipping a sprinting athlete a programme with no hamstring work in
       * it is the one programming error with a documented injury attached.
       *
       * A bonus rather than a hard requirement, so the pain filter still wins:
       * an athlete reporting a hamstring already has these excluded above, and
       * nothing here can bring them back.
       */
      if (ctx.sport && SPRINT_SPORTS.has(ctx.sport)
        && (HAMSTRING_WORK.has(m.id) || CALF_WORK.has(m.id))) score += 8;

      /**
       * WHAT THE POSITION ACTUALLY DOES.
       *
       * Reported as "a prop's drills are the same as a flanker's" — and they
       * were, because position was read in exactly two places: to pick a ball
       * drill, and to print a name at the top of the programme. A front-rower
       * whose job is a maximal static push and a back-rower covering 7km in
       * repeat sprints got byte-identical strength, conditioning and accessory
       * work.
       *
       * A nudge on pattern, not a separate catalogue. The movements are the
       * same for everyone; what changes is which the selector reaches for
       * first, which is also what a coach changes. ±3 to ±7 against a goal
       * match of 10 — enough to reliably reorder the pool, never enough to beat
       * an exclusion the athlete typed, a sore joint, or a coach's pick.
       */
      const positionBonus = (ctx.position?.patterns[m.pattern] ?? 0)
        + (ctx.position?.movements?.[m.id] ?? 0);
      score += positionBonus;

      if (ctx.trainingFocus === "aesthetics" && (m.kit === "barbell" || m.kit === "dumbbell" || m.kit === "machine")) score += 3;
      if (ctx.trainingFocus === "fitness" && m.targets.includes("endurance")) score += 3;

      // Reward a movement that trains the goal while sparing what hurts — the
      // substitution is the coaching, so it should win over a plain penalty.
      const spares = ctx.soreAreas.length > 0 && ctx.soreAreas.every((a) => (m.load[a] ?? 0) <= 1);
      if (spares && m.targets.includes(ctx.focusGoal)) score += 3;

      // A coach chose this one. Big enough to win any slot it's eligible for,
      // and applied AFTER the pain checks above rather than instead of them —
      // the hard refusal for a badly loaded sore joint has already returned
      // null by this point and nothing here can bring it back.
      if (ctx.picked?.has(m.id)) score += 50;

      return { m, score, spares, demoted: positionBonus < 0 };
    })
    .filter((s): s is Scored => s !== null)
    .sort((a, b) => b.score - a.score || a.m.id.localeCompare(b.m.id));

  /**
   * A SCORING BONUS ALONE CHANGES NOTHING HERE, and measuring it is the only
   * way to find that out.
   *
   * `pick` rotates a window over the strong end of this list and takes the
   * first few distinct patterns. The window is fixed-width and the rotation
   * offset does not depend on the athlete — so what actually decides a session
   * is which movements are IN the window, not how they are ordered inside it.
   * With the bonus alone, a prop and a flanker shared 83% of their block:
   * every score moved, the top eight stayed the same eight, and the rotation
   * handed back the same drills.
   *
   * So a pattern the position actively demotes is removed from the pool rather
   * than merely pushed down it. A prop's block does not contain flying sprints
   * and a marathoner's does not contain depth drops — which is the difference
   * anyone would notice, and the one a coach would actually make.
   *
   * Only NEGATIVE weights do this, and only while enough movements remain to
   * rotate through. Emptying a slot to honour an emphasis would be a much worse
   * bug than an off-emphasis drill, and week-on-week variety needs something
   * left to vary.
   */
  const kept = ranked.filter((s) => !s.demoted);
  return kept.length >= MIN_POOL_AFTER_DEMOTION ? kept : ranked;
}

/**
 * Below this the pool is too thin to rotate through, so demotions are ignored
 * and the position gets an off-emphasis drill instead of an empty slot. Sized
 * against the widest `count` any blueprint asks for (3) times the two passes
 * `pick` makes, plus room for the pattern-uniqueness rule to skip a couple.
 */
const MIN_POOL_AFTER_DEMOTION = 6;

function rotate<T>(arr: T[], by: number): T[] {
  if (arr.length < 2) return arr;
  const k = ((by % arr.length) + arr.length) % arr.length;
  return [...arr.slice(k), ...arr.slice(0, k)];
}

/**
 * Take `count` movements, rotating the pool by the session index so that
 * consecutive sessions don't repeat — the whole reason v1 felt like one session
 * on a loop.
 *
 * Rotation happens within the strong end of the pool, not the whole thing:
 * spinning through everything would eventually serve up the worst option for
 * the sake of variety, which isn't variety, it's noise.
 */
function pick(
  ranked: Scored[], count: number, offset: number,
  usedIds: Set<string>, usedPatterns: Set<Pattern>,
  forced?: Set<string>
): Movement[] {
  if (count <= 0 || !ranked.length) return [];

  const out: Movement[] = [];
  /**
   * A COACH'S PICK IS TAKEN BEFORE THE ROTATION, NOT RANKED INTO IT — on the
   * one day of the week that pick belongs to.
   *
   * The +50 in `rankSlot` puts a chosen movement at the top of the list, and
   * then `rotate` below spun it straight back out again — the window starts at
   * `offset`, so position 0 is exactly where it does not get read from. A pick
   * only ever appeared when the rotation happened to land on it, which for a
   * three-day block meant a coach could pick a back squat, a row and a carry
   * and get none of the three.
   *
   * Forcing every pick into every session is the opposite mistake, and the
   * first version of this fix made it: three picks became a back squat, a row
   * and a carry on all three days of the week. So each pick is pinned to ONE
   * day — its position in the coach's list, modulo the days trained — and is
   * merely well-ranked on the others. It appears every week without becoming
   * the only thing the athlete ever does.
   *
   * The pain filter has already run by this point and returns null for anything
   * badly loaded on a sore joint, so nothing here can reinstate a movement the
   * engine refused on safety grounds.
   */
  if (forced?.size) {
    for (const { m } of ranked) {
      if (out.length >= count) break;
      if (!forced.has(m.id) || usedIds.has(m.id) || usedPatterns.has(m.pattern)) continue;
      out.push(m); usedIds.add(m.id); usedPatterns.add(m.pattern);
    }
    if (out.length >= count) return out;
  }
  // Wide enough that the days of a week, and the blocks that rotate through it,
  // don't wrap onto each other and start repeating.
  const depth = Math.max(count * 3, 8);
  const window = rotate(ranked.slice(0, depth), offset);

  // First pass: a different movement pattern each time, so a session isn't
  // three variations of a squat.
  for (const { m } of window) {
    if (out.length >= count) break;
    if (usedIds.has(m.id) || usedPatterns.has(m.pattern)) continue;
    out.push(m); usedIds.add(m.id); usedPatterns.add(m.pattern);
  }
  // Second pass: a repeated pattern beats an empty slot.
  for (const { m } of window) {
    if (out.length >= count) break;
    if (usedIds.has(m.id)) continue;
    out.push(m); usedIds.add(m.id);
  }
  return out;
}

// --- Dosing -------------------------------------------------------------------

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function doseForWeek(baseDose: Dose, prog: Prog, wi: number, volumeScale: number, fixed: boolean, pattern?: Pattern, slot?: Slot): Dose {
  // Warm-ups and cool-downs don't periodise. The same eight leg swings every
  // session is correct; progressing them is theatre.
  if (fixed) return { ...baseDose };

  /**
   * ACCESSORY WORK HAD NO TARGET EFFORT AT ALL.
   *
   * A third of every session — the accessory block — shipped with no RPE, so
   * the athlete was told to do three sets of twelve and nothing about how hard.
   * "As many as it says" is not a prescription; people either coast through
   * accessories or grind them to failure, and both waste the slot.
   *
   * 7 as the base: accessories are volume work, meant to leave two or three
   * reps in reserve. Deliberately only for movements that carry no RPE of their
   * own — anything the catalogue has already dosed keeps its own number, and
   * rehab work in particular must stay light.
   */
  const base: Dose = baseDose.rpe == null && slot === "accessory" && pattern !== "rehab"
    ? { ...baseDose, rpe: ACCESSORY_RPE }
    : baseDose;


  const shape = WEEK_SHAPE[prog][wi];

  /**
   * A CONTINUOUS RUN IS NOT A LIFT, AND PERIODISING IT LIKE ONE BROKE IT.
   *
   * Everything below was written for sets of a movement, and applied to a
   * 40-minute run it produced three separate absurdities:
   *
   *   * The two-set floor made a long run read `sets: 2`. The prescription text
   *     hides it — "75 min" — but anything reading the number saw two sets of a
   *     seventy-five minute run.
   *   * The RPE floor of 5 clamped a recovery run's RPE 2 up to 5, so the one
   *     movement in the catalogue whose entire purpose is being easy was
   *     prescribed at moderate effort. It stopped being a recovery run.
   *   * Lift rep-scaling took a 75-minute long run to 105 by week 3 — a 40%
   *     jump inside one block, which is roughly four times what a runner should
   *     add and exactly how people buy an injury.
   *
   * So a run progresses in DURATION only, gently, and its effort never moves:
   * an easy run is easy in week 1 and week 4. That is what a zone means.
   */
  const continuous = base.unit === "minutes";
  if (continuous) {
    // Deliberately tighter than the 10%-a-week rule allows, because this is one
    // conditioning slot inside someone else's strength block, not a run plan.
    const growth = clamp(shape.repFactor, 0.7, 1.12);
    return { ...base, sets: base.sets, reps: Math.max(1, Math.round(base.reps * growth)) };
  }

  const sets = Math.max(wi === 3 ? 1 : 2, Math.round(base.sets * volumeScale) + shape.setsDelta);
  // Seconds land on multiples of five. Scaling produced "9 × 81s", which is
  // inside the sensible band and still reads as something a machine wrote —
  // nobody has ever coached an eighty-one second hill.
  const scaled = base.reps * shape.repFactor;
  /**
   * A DISTANCE IS THE DRILL, NOT ITS VOLUME.
   *
   * The seconds fix above stopped at seconds, so metres kept scaling — and a
   * speed block's peak week read "Stride-outs 6 × 81m". Nobody has ever coached
   * an eighty-one metre stride-out either.
   *
   * Rounding alone would have printed 80m and hidden the worse half. A sprint
   * distance is not a volume knob: 20m is an acceleration, 60m is a stride-out
   * and 80m is a different exercise that happens to share a name. Scaling it
   * silently swapped the drill for a harder one and then progressed the sets
   * on top — 5 × 60m to 6 × 81m is a 60% jump in sprint volume across two
   * weeks, in the quality most likely to tear a hamstring.
   *
   * So distance holds and the SETS carry the progression, exactly as the
   * continuous-run branch above holds effort and moves duration. 5 × 60m to
   * 6 × 60m is what a coach writes. The rounding stays as a backstop for
   * catalogue entries that aren't already round.
   */
  const reps = base.unit === "secs"
    ? Math.max(5, Math.round(scaled / 5) * 5)
    : base.unit === "metres"
      ? Math.max(5, Math.round(base.reps / 5) * 5)
      : Math.max(1, Math.round(scaled));
  // The floor is 5 for gym work — nothing below that is worth a set — but a
  // movement that STARTS easier than that is meant to be, so it keeps its own.
  const floor = Math.min(5, base.rpe ?? 5);
  // Quality work never climbs into the red — see QUALITY_PATTERNS. The deload's
  // -2 still applies, because coming DOWN is always allowed.
  const ceiling = pattern && QUALITY_PATTERNS.has(pattern) ? QUALITY_RPE_CEILING : 10;
  const rpe = base.rpe != null
    ? clamp(Math.round((base.rpe + RPE_DELTA[wi]) * 2) / 2, Math.min(floor, ceiling), ceiling)
    : undefined;
  return { ...base, sets, reps, rpe };
}

export function prescriptionText(dose: Dose): string {
  const { sets, reps, unit } = dose;
  if (unit === "minutes") return `${reps} min`;
  if (unit === "secs") return `${sets} × ${reps}s`;
  if (unit === "metres") return `${sets} × ${reps}m`;
  if (unit === "each side") return `${sets} × ${reps} each side`;
  return `${sets} × ${reps}`;
}

/** "2 min" / "90s" — rest read as a duration, not a raw number of seconds. */
export function restText(seconds: number): string {
  if (seconds >= 120 && seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds}s`;
}

function reasonFor(m: Movement, slot: Slot, ctx: Ctx): string {
  if (slot === "warmup") return "Prepares the joints and tissue you're about to load.";
  if (slot === "cooldown") return "Brings the nervous system down and keeps range you'd otherwise lose.";
  if (ctx.soreAreas.length && ctx.soreAreas.every((a) => (m.load[a] ?? 0) <= 1) && m.targets.includes(ctx.focusGoal)) {
    return `Trains ${ctx.focusGoal.replace("_", " ")} with minimal load on your ${ctx.soreAreas.map((a) => a.replace("_", " ")).join(" / ")} while it's sore.`;
  }
  if (slot === "conditioning") return "Builds the engine that lets you repeat the hard efforts.";
  if (m.targets.includes(ctx.focusGoal)) return `Direct ${ctx.focusGoal.replace("_", " ")} work — ${m.cue.toLowerCase()}.`;
  return `Supports ${ctx.focusGoal.replace("_", " ")} as a complement.`;
}

/**
 * A goal string the engine can actually build from.
 *
 * WHY THIS EXISTS. `GoalType` is six values, and `programs.goal_type` is a bare
 * text column the app casts to it rather than checks — a hazard `sessionTitle`
 * below already guards against, and the blueprint did not. The consequence was
 * far worse than a wrong label: `BLUEPRINTS[focus]` came back `undefined`, every
 * slot count with it, and the session was built EMPTY. Measured over 108
 * generated programs, 54 sessions came out containing one ball drill and
 * nothing else — no warm-up, no lifts, no cool-down — under a heading that just
 * said "Day 1".
 *
 * Three strings reach here that are not GoalTypes: "aesthetics", "power" and
 * "fitness". They are real vocabulary — the goal picker's older labels and the
 * adaptive-goal ids — and they mean something, so they are mapped rather than
 * rejected: building muscle is strength work, power is speed work, and general
 * fitness is conditioning. Anything else falls back to strength, because a
 * strength session is the least wrong thing to hand somebody whose goal we
 * could not read.
 */
const GOAL_ALIASES: Record<string, GoalType> = {
  aesthetics: "strength",
  hypertrophy: "strength",
  power: "speed",
  fitness: "endurance",
  fat_loss: "endurance",
  mobility: "injury_recovery",
  rehab: "injury_recovery",
};

export function asGoalType(goal: string | null | undefined): GoalType {
  const g = String(goal ?? "").trim().toLowerCase();
  if (g in BLUEPRINTS) return g as GoalType;
  return GOAL_ALIASES[g] ?? "strength";
}

// --- Building -----------------------------------------------------------------

function sessionTitle(focus: GoalType, day: number): string {
  const map: Record<GoalType, string> = {
    speed: "Speed & sprint mechanics",
    agility: "Agility & change of direction",
    strength: "Strength & power",
    endurance: "Conditioning",
    injury_recovery: "Rehab & activation",
    skill: "Ball skill",
  };
  // `focus` is typed GoalType and arrives from `programs.goal_type`, which is a
  // bare text column — the app casts rather than checks. An unlisted value came
  // out as the session being titled "Day 1 · undefined" on the athlete's plan.
  // The day number is still true, so print that and drop the label rather than
  // printing a word that means nothing.
  return map[focus] ? `Day ${day + 1} · ${map[focus]}` : `Day ${day + 1}`;
}

/**
 * Which quality each day of the week trains.
 *
 * THE BLOCK HAS TO LOOK LIKE THE GOAL THAT WAS ASKED FOR. It didn't. The
 * generic branch was a fixed three-item rotation — `[goal, "strength",
 * complement]` — indexed by `di % length`, so on the most common week length
 * the chosen quality got exactly one day in three:
 *
 *   speed    3d  33%    speed, strength, agility
 *   agility  3d  33%    agility, strength, speed
 *   skill    3d  33%    ball skill, strength, speed
 *   speed    5d  40%
 *
 * An athlete picks "Speed", trains three times, and does one speed session.
 * That is a general athleticism block with a speed label on it, and it is the
 * concrete reason the programs did not read like something a coach had written.
 *
 * Strength and endurance were never affected — they hit 67-80% through their
 * own branches — so those are deliberately left exactly as they were rather
 * than folded into one clever formula that would have moved numbers that were
 * already right.
 *
 * WHAT A COACH ACTUALLY PRESCRIBES, and what this now returns:
 *
 *   2d  goal, strength                        50%
 *   3d  goal, strength, goal                  67%
 *   4d  goal, strength, goal, complement      50% on-goal, 75% related
 *   5d  goal, strength, goal, complement, goal 60%
 *
 * The strength day stays, at every length. Dropping it to chase a higher
 * percentage would be the wrong kind of alignment: speed is expressed through
 * force, and a speed block with no lifting in it produces a fast-looking
 * program and a slower athlete. Concurrent strength work is what the quality
 * is built on.
 *
 * The complement is the adjacent quality — agility for a speed block, speed for
 * agility and skill — and appears only from four days, when there is room for
 * it without displacing the goal. A speed block containing one agility day is
 * deliberate, not drift: they share the same qualities and a coach alternates
 * them precisely so neither is trained on tired legs.
 *
 * Two goal days are never adjacent at 3 or 5 days, which matters because these
 * are the high-CNS qualities: `[goal, strength, goal]` puts the support day
 * between them by construction.
 */
function focusRotationFor(input: EngineInput, days: number): GoalType[] {
  const rehab = input.goal === "injury_recovery" || input.focus === "rehab";
  if (rehab) return ["injury_recovery", "injury_recovery", "endurance"];
  if (input.focus === "aesthetics") return ["strength", "strength", "endurance"];
  if (input.focus === "fitness") return ["endurance", "strength", "endurance"];
  if (input.goal === "endurance") return ["endurance", "endurance", "strength", "endurance"];
  // Already 67-80% on-goal through the generic pattern below's first two slots;
  // kept verbatim so this change cannot regress it.
  if (input.goal === "strength") return ["strength", "strength", "speed"];

  const goal = asGoalType(input.goal);
  const complement: GoalType = goal === "speed" ? "agility" : "speed";
  if (days <= 2) return [goal, "strength"];
  if (days === 3) return [goal, "strength", goal];
  if (days === 4) return [goal, "strength", goal, complement];
  return [goal, "strength", goal, complement, goal];
}

// --- Today's readiness actually changing today's session ---------------------

export type ReadinessStatus = "Green" | "Yellow" | "Red";

/**
 * Adapt a planned session to how recovered the athlete actually is.
 *
 * Readiness was measured every morning, shown prominently, and then ignored:
 * the session was byte-for-byte identical whether you'd slept nine hours or
 * three. Yellow printed "cut the last set if you fade" and left the athlete to
 * do the arithmetic; Red said "take active recovery" and offered nothing you
 * could open, follow or log. Measuring something and then not acting on it is
 * the definition of a feature that's for show.
 *
 *   GREEN  — train as written.
 *   YELLOW — drop a set from the working movements and ease the effort target.
 *            The warm-up and cool-down are untouched; they're the part you need
 *            MORE of on a flat day, not less.
 *   RED    — replace it entirely with a real recovery session that can be
 *            played and logged like any other.
 */
export function adjustForReadiness(session: ProgramSession, status: ReadinessStatus): ProgramSession {
  if (status === "Green") return session;

  if (status === "Yellow") {
    return {
      ...session,
      title: `${session.title} · eased back`,
      drills: session.drills.map((d) => {
        if (d.slot === "warmup" || d.slot === "cooldown" || d.skill) return d;
        const sets = Math.max(1, d.sets - 1);
        return {
          ...d,
          sets,
          prescription: d.prescription ? restated(d.prescription, d.sets, sets) : d.prescription,
          // One notch easier. Chasing a peak RPE on a bad day is how a flat
          // week becomes an injury.
          intensity: easeIntensity(d.intensity),
          reason: `${d.reason} Trimmed a set — your readiness is down today.`,
        };
      }),
    };
  }

  // Red. Not "here's some advice", an actual session.
  const keep = session.drills.filter((d) => d.slot === "warmup" || d.slot === "cooldown");
  const easy = MOVEMENTS.filter((m) => m.slot === "conditioning" && (m.dose.rpe ?? 10) <= 6);
  const spin = easy[0] ?? MOVEMENTS.find((m) => m.slot === "conditioning");

  return {
    ...session,
    title: "Recovery session",
    drills: [
      ...keep.filter((d) => d.slot === "warmup"),
      ...(spin ? [{
        name: spin.name,
        sets: spin.dose.sets, reps: spin.dose.reps,
        cue: spin.cue,
        reason: "Easy aerobic work moves blood without adding fatigue.",
        prescription: prescriptionText(spin.dose),
        slot: "conditioning" as Slot,
        rest: spin.dose.rest,
      }] : []),
      ...keep.filter((d) => d.slot === "cooldown"),
    ],
  };
}

/** "4 × 5" -> "3 × 5" when a set comes off. Leaves anything else alone. */
function restated(prescription: string, from: number, to: number): string {
  return prescription.startsWith(`${from} ×`) ? prescription.replace(`${from} ×`, `${to} ×`) : prescription;
}

function easeIntensity(intensity?: string): string | undefined {
  if (!intensity) return intensity;
  const m = intensity.match(/RPE\s*([\d.]+)/i);
  if (!m) return intensity;
  return `RPE ${Math.max(5, Number(m[1]) - 1)}`;
}

/** A 4-week block: pain-aware, structured, and different every session. */
export function buildBlock(input: EngineInput): ProgramPlan {
  const block = Math.max(1, input.block ?? 1);
  const blockScale = 1 + (block - 1) * 0.08; // +8% volume per completed block
  /**
   * IN-SEASON FREQUENCY IS ADVISED, NOT ENFORCED — and that is deliberate.
   *
   * I capped this at 3 and reverted it. The reasoning against is in
   * programSummary() in coach.ts and it is better than mine: how often somebody
   * trains is theirs to decide, and silently handing an athlete three days when
   * they asked for five is a worse failure than the over-reach it prevents.
   * They would have no way to tell it happened, which is the property that
   * makes a silent override worse than a loud disagreement.
   *
   * So the professional standard (one to two gym sessions in-season, matches
   * being the load) is stated in the plan summary whenever four or more are
   * requested, and the week tapers into matchday. Volume already scales to
   * IN_SEASON_VOLUME. What is missing is only the veto, and the veto is the
   * part that should stay missing.
   */
  const days = clamp(input.daysPerWeek ?? (input.goal === "endurance" ? 4 : 3), 2, 5);
  const pain = painByArea(input.painMap);
  const soreAreas = (Object.keys(pain) as BodyArea[]).filter((a) => (pain[a] ?? 0) >= 4);
  const constraints = input.constraints ?? EMPTY_CONSTRAINTS;
  const rehab = input.goal === "injury_recovery";
  const themes = rehab ? REHAB_THEMES : THEMES;
  const rotation = focusRotationFor(input, days);
  /**
   * The coach's picks, plus the ones the sport makes non-negotiable.
   *
   * Appended rather than prepended: a coach who has chosen specific movements
   * gets their days first, and the essentials fill in around them.
   */
  /**
   * What this position cannot sensibly go a block without — a lock without a
   * jump, a prop without a scrum drive, a marathoner without a long run.
   *
   * Forced rather than scored for the same reason the sprint essentials are:
   * `pick` rotates its window, so a bonus can always be rotated out. That is
   * exactly how a 3-day speed block once reached zero hamstring sets while
   * every test stayed green.
   */
  const positionProf = positionProfile(input.sport, input.position);

  const required = [
    ...(input.mustInclude ?? []),
    ...(input.sport && SPRINT_SPORTS.has(input.sport)
      ? sprintEssentials(days).filter((id) => !(input.mustInclude ?? []).includes(id))
      : []),
  ];
  // Appended last: a coach's explicit picks come first, then the sport's
  // non-negotiables, then the position's. De-duped so a movement that is both
  // does not take two of the week's forced slots.
  for (const id of positionProf?.essentials ?? []) {
    if (!required.includes(id)) required.push(id);
  }

  /**
   * WHICH WEEKS THIS BLOCK RUNS.
   *
   * Four is the standard shape and the deload is always the last of them. A
   * three-week block drops the PEAK week rather than the deload — [0, 1, 3] —
   * so an athlete arriving tired gets Base, Build and then the week where the
   * work is absorbed, instead of one more accumulation week they cannot pay
   * for. Reusing the existing indices keeps every per-week shaping array below
   * (themes, intensity, focus, set deltas) correct without a second set of
   * numbers to maintain. See lib/deload.ts for who gets which.
   */
  const weekIndices = (input.blockWeeks ?? THEMES.length) <= 3 ? [0, 1, 3] : [0, 1, 2, 3];
  const weeks: ProgramWeek[] = weekIndices.map((wi, weekNumber) => {
    // In-season, the matches are the training. Volume comes down so the sport
    // gets the athlete's legs, not the gym.
    const volumeScale = (input.isInSeason ? IN_SEASON_VOLUME : 1) * blockScale;

    const sessions: ProgramSession[] = Array.from({ length: days }, (_, di) => {
      /**
       * IN-SEASON, THE WEEK TAPERS INTO THE MATCH.
       *
       * Every session used to carry identical load, with the whole week simply
       * scaled to 75%. That is not how the sport is actually coached. Elite
       * football runs a matchday-minus microcycle — load peaks at MD-4 and MD-3
       * and comes down through MD-2 and MD-1, so the player arrives fresh — and
       * the research on professional squads confirms the pattern in the data:
       * workload on MD-4/MD-3 is reliably greater than on MD-2/MD-1.
       *
       * A flat week does the opposite of what it should: the session closest to
       * the match is exactly as heavy as the one furthest from it, so the gym
       * takes the legs the match needed.
       *
       * So sessions descend across the week, from 0.95 down to 0.55, which
       * averages to the same IN_SEASON_VOLUME the flat version used. Same total
       * work, arranged the way a club would arrange it. Off-season is untouched
       * — with no match to be fresh for there is nothing to taper into.
       */
      const taper = input.isInSeason && days > 1
        ? (TAPER_HIGH - (TAPER_HIGH - TAPER_LOW) * (di / (days - 1))) / IN_SEASON_VOLUME
        : 1;
      const sessionScale = volumeScale * taper;
      const focusGoal = rotation[di % rotation.length];
      const ctx: Ctx = {
        focusGoal, pain, soreAreas, sport: input.sport, trainingFocus: input.focus, constraints,
        picked: required.length ? new Set(required) : undefined,
        position: positionProf,
        // The picks that belong to THIS day (see `pick`), rather than all of them.
        forced: required.length
          ? new Set(required.filter((_, pi) => pi % days === di))
          : undefined,
      };
      const sessionIndex = wi * days + di;
      /**
       * WHICH MOVEMENTS THIS SESSION USES IS FIXED FOR THE WHOLE BLOCK.
       *
       * It used to key off `sessionIndex`, so the exercises changed every week
       * — and the entire periodisation above is written on the assumption that
       * they do not. What an athlete actually read on day 1 of a strength
       * block was:
       *
       *   wk1  Bent-over barbell row    "Groove the movement..."
       *   wk2  Barbell hip thrust       "Add a little weight and a set"
       *   wk3  Pogo hops                "Peak volume: extra set..."
       *   wk4  Dumbbell shoulder press  "Deload: SAME MOVEMENTS, ~60%"
       *
       * Four unrelated exercises, each captioned as though it were last week's
       * lift with more weight on it. You cannot add weight to a row by doing
       * pogo hops, you cannot tell whether the block worked, and week 4 says
       * "same movements" over the one exercise that had not appeared yet.
       *
       * Progressive overload is the whole mechanism a training block works by:
       * repeat the movement, add load, deload, repeat. So selection is now
       * per BLOCK — day 1 is the same session for four weeks, and only the
       * sets, reps and RPE move. Variety comes between blocks instead, which
       * is where it belongs, via the `block` term.
       *
       * Ball work is the exception and still rotates weekly: skill progresses
       * by difficulty and variation rather than by load, so a different drill
       * each week is the point rather than a bug.
       */
      const blockSeed = (block - 1) * 5 + di;
      /**
       * THE MAIN LIFT SURVIVES THE BLOCK CHANGE; THE ACCESSORY WORK DOES NOT.
       *
       * Rotating everything between blocks means the athlete never keeps a
       * squat long enough to get good at it, and it also made block 3 come out
       * with LESS total work than block 1 — the change of exercise swamped the
       * +8%-a-block volume step, so someone three blocks in was doing 91 sets
       * where they used to do 95.
       *
       * Which is how strength blocks are actually written: you keep squatting
       * and pressing for months and change what goes around them. So the
       * primary slot ignores the block, and everything else rotates on it.
       */
      const seedFor = (slot: Slot) => (slot === "primary" ? di : blockSeed) + SLOT_SEED[slot];

      // `?? BLUEPRINTS.strength` is not redundant with asGoalType: the rotation
      // is also reached through `input.focus` branches above, and an empty
      // session is the one outcome that must not be possible here.
      const blueprint = { ...(BLUEPRINTS[focusGoal] ?? BLUEPRINTS.strength) };
      // In-season conditioning is what the fixtures are for.
      if (input.isInSeason && blueprint.conditioning) blueprint.conditioning = 1;

      const usedIds = new Set<string>();
      const usedPatterns = new Set<Pattern>();
      const drills: ProgramDrill[] = [];

      for (const slot of SLOT_ORDER) {
        if (slot === "skill") {
          // Ball work still comes from lib/skills.ts: it's position-aware and
          // carries setup, coaching points and a progression, which a movement
          // entry doesn't.
          //
          // Not on a rehab day. v1 added technical work to every session
          // regardless, so a block built around a torn hamstring still
          // prescribed 1v1 attacking drills.
          // Keyed off the block's goal, not this session's focus: a rehab block
          // has a conditioning day in it, and "you're rehabbing a torn
          // hamstring, here's some 1v1 attacking" is wrong on that day too.
          const rehabBlock = input.goal === "injury_recovery" || input.focus === "rehab";
          const skill = input.sport && !rehabBlock
            ? skillForSession(input.sport, input.position, sessionIndex)
            : null;
          if (skill && !isExcluded(constraints, "skill", skill.name)) {
            drills.push({
              name: skill.name,
              // Kept so anything reading sets/reps numerically still works; the
              // prescription below is what the athlete actually sees.
              sets: 1, reps: 1,
              prescription: skill.reps,
              skill: true,
              slot: "skill",
              cue: skill.coaching,
              reason: `${skill.skill} — technical work for your position.`,
              progression: skill.progression,
            });
          }
          continue;
        }

        const want = blueprint[slot] ?? 0;
        if (want <= 0) continue;

        let ranked = rankSlot(slot, ctx);

        // Week 4 is the deload. Conditioning on a down week has to BE a down
        // week — otherwise the same ranking that puts hill repeats in Peak
        // puts them here too, and the week stops doing the one job it has.
        // Falls back to the full list if nothing easy survived the athlete's
        // exclusions, because a deload with no conditioning is still better
        // than a crash.
        /**
         * A LONG EASY RUN IS NOT A FINISHER FOR A LIFTING SESSION.
         *
         * Conditioning was ranked without reference to what the session already
         * was, so a strength day ended with "Long run — 84 min · Zone 2", and a
         * SPEED block prescribed two 84-minute runs a week. Both are the
         * interference effect written out as a plan: high-volume aerobic work
         * is the one thing known to blunt the strength and power adaptations
         * the rest of the session exists to produce.
         *
         * Continuous efforts are `sets: 1` with the minutes in `reps`, so a long
         * one is identifiable without new metadata. They stay in endurance blocks,
         * where they are the session rather than an afterthought. Everything
         * short — hill repeats, sled pushes, kettlebell swings — is untouched:
         * those finish a strength day rather than fighting it.
         *
         * Keyed on the BLOCK goal: an "endurance" day inside a strength block
         * still needs a finisher, not a second workout. Falls back to the full list rather than leaving the slot empty, for
         * an athlete whose exclusions rule out everything short.
         */
        if (slot === "conditioning" && input.goal !== "endurance") {
          const compatible = ranked.filter(
            (r) => !(r.m.dose.sets === 1 && (r.m.dose.reps ?? 0) >= LONG_EFFORT_MINUTES)
          );
          if (compatible.length) ranked = compatible;
        }
        /**
         * IN A QUALITY BLOCK, CONDITIONING SUPPORTS THE WORK — IT DOESN'T
         * COMPETE WITH IT.
         *
         * A speed block was closing its strength day with "Kettlebell swing
         * intervals 7 × 40s, RPE 9". That is a hard metabolic session in its
         * own right, tacked onto the end of a lift, two days before a sprint
         * session — the interference effect written down. The athlete arrives
         * at the day the block exists for with fatigued legs, and the quality
         * they are supposedly training is the thing that suffers.
         *
         * Keyed on the BLOCK's goal, not the day's focus, which is why the
         * existing filters missed it: the offending session had focus
         * "strength" inside a "speed" block, so every day-level check passed.
         *
         * Endurance blocks are exempt and must be — hard conditioning is not a
         * finisher there, it is the training. Deload keeps its stricter ceiling
         * below. Falls back to the full list rather than emptying the slot, the
         * same way the long-effort filter above does.
         */
        if (slot === "conditioning" && input.goal !== "endurance" && wi !== 3) {
          const supportive = ranked.filter((r) => (r.m.dose.rpe ?? 10) <= SUPPORT_CONDITIONING_RPE_CEILING);
          if (supportive.length) ranked = supportive;
        }
        if (slot === "conditioning" && wi === 3) {
          const easy = ranked.filter((r) => (r.m.dose.rpe ?? 10) <= RECOVERY_RPE_CEILING);
          if (easy.length) ranked = easy;
        }
        // Patterns only need to be unique within the training blocks; a warm-up
        // and a cool-down sharing "mobility" is fine and in fact correct.
        const patternGuard = slot === "warmup" || slot === "cooldown" ? new Set<Pattern>() : usedPatterns;
        // Ball work never reaches here — the skill slot is handled above and
        // still rotates weekly off `sessionIndex`.
        const chosen = pick(ranked, want, seedFor(slot), usedIds, patternGuard, ctx.forced);

        const fixed = slot === "warmup" || slot === "cooldown";
        for (const m of chosen) {
          const dose = doseForWeek(m.dose, m.prog, wi, sessionScale, fixed, m.pattern, slot);
          // A run's zone IS the instruction, and "40 min" on its own is the
          // single most common way an easy day gets run too hard. Every other
          // surface in the app speaks in zones; the programme was the one that
          // didn't. The talk test goes on the cue, because a number without it
          // coaches nobody who hasn't got a heart-rate strap on.
          const zone = runZoneLabel(m.id);
          const feel = runZoneFeel(m.id);
          drills.push({
            name: m.name,
            sets: dose.sets,
            reps: dose.reps,
            cue: feel ? `${zone} — ${feel}` : m.cue,
            reason: reasonFor(m, slot, ctx),
            progression: fixed ? undefined : WEEK_PROGRESSION[m.prog][wi],
            prescription: zone ? `${prescriptionText(dose)} · ${zone}` : prescriptionText(dose),
            slot,
            rest: dose.rest,
            intensity: dose.rpe != null ? `RPE ${dose.rpe}` : undefined,
            tempo: dose.tempo,
          });
        }
      }

      return { day: di + 1, title: sessionTitle(focusGoal, di), focus: focusGoal, drills };
    });

    return { week: weekNumber + 1, theme: themes[wi], intensity: WEEK_INTENSITY[wi], focusNote: WEEK_FOCUS[wi], sessions };
  });

  return {
    goal: input.goal,
    summary: "", // coach.ts writes the athlete-facing summary; it owns the copy.
    constraints: [],
    weeks,
    block,
  };
}
