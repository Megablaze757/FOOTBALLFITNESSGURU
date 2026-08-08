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
  // --- v2 additions. All optional: a program saved by v1 still renders. ---
  /** Where it sits in the session, so the UI can group and label the blocks. */
  slot?: Slot;
  /** Seconds between sets. */
  rest?: number;
  /** "RPE 8" — how hard this should feel. */
  intensity?: string;
  tempo?: string;
}

export interface ProgramSession { day: number; title: string; focus: GoalType; drills: ProgramDrill[] }
export interface ProgramWeek { week: number; theme: string; intensity: string; focusNote: string; sessions: ProgramSession[] }
export interface ProgramPlan {
  goal: GoalType;
  summary: string;
  constraints: string[];
  weeks: ProgramWeek[];
  block?: number;
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
  speed:           { warmup: 2, primary: 2, secondary: 1, accessory: 1, conditioning: 1, cooldown: 1 },
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
}

interface Scored { m: Movement; score: number; spares: boolean }

/**
 * Rank the movements that could fill a slot.
 *
 * Warm-ups, cool-downs and conditioning aren't scored on goal fit — a hip
 * opener isn't "on-goal" for anything and would score zero, which is how you
 * end up with no warm-up.
 */
function rankSlot(slot: Slot, ctx: Ctx): Scored[] {
  const goalScored = slot === "primary" || slot === "secondary" || slot === "accessory";

  return MOVEMENTS
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

      return { m, score, spares };
    })
    .filter((s): s is Scored => s !== null)
    .sort((a, b) => b.score - a.score || a.m.id.localeCompare(b.m.id));
}

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

function doseForWeek(base: Dose, prog: Prog, wi: number, volumeScale: number, fixed: boolean, pattern?: Pattern): Dose {
  // Warm-ups and cool-downs don't periodise. The same eight leg swings every
  // session is correct; progressing them is theatre.
  if (fixed) return { ...base };

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
  const reps = base.unit === "secs"
    ? Math.max(5, Math.round(scaled / 5) * 5)
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

function focusRotationFor(input: EngineInput): GoalType[] {
  const rehab = input.goal === "injury_recovery" || input.focus === "rehab";
  if (rehab) return ["injury_recovery", "injury_recovery", "endurance"];
  if (input.focus === "aesthetics") return ["strength", "strength", "endurance"];
  if (input.focus === "fitness") return ["endurance", "strength", "endurance"];
  if (input.goal === "endurance") return ["endurance", "endurance", "strength", "endurance"];
  return [input.goal, "strength", input.goal === "speed" ? "agility" : "speed"];
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
  const days = clamp(input.daysPerWeek ?? (input.goal === "endurance" ? 4 : 3), 2, 5);
  const pain = painByArea(input.painMap);
  const soreAreas = (Object.keys(pain) as BodyArea[]).filter((a) => (pain[a] ?? 0) >= 4);
  const constraints = input.constraints ?? EMPTY_CONSTRAINTS;
  const rehab = input.goal === "injury_recovery";
  const themes = rehab ? REHAB_THEMES : THEMES;
  const rotation = focusRotationFor(input);

  const weeks: ProgramWeek[] = THEMES.map((_, wi) => {
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
        picked: input.mustInclude?.length ? new Set(input.mustInclude) : undefined,
        // The picks that belong to THIS day (see `pick`), rather than all of them.
        forced: input.mustInclude?.length
          ? new Set(input.mustInclude.filter((_, pi) => pi % days === di))
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

      const blueprint = { ...BLUEPRINTS[focusGoal] };
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
         * one is identifiable without new metadata. They stay on endurance days,
         * where they are the session rather than an afterthought. Everything
         * short — hill repeats, sled pushes, kettlebell swings — is untouched:
         * those finish a strength day rather than fighting it.
         *
         * Falls back to the full list rather than leaving the slot empty, for
         * an athlete whose exclusions rule out everything short.
         */
        if (slot === "conditioning" && focusGoal !== "endurance") {
          const compatible = ranked.filter(
            (r) => !(r.m.dose.sets === 1 && (r.m.dose.reps ?? 0) >= LONG_EFFORT_MINUTES)
          );
          if (compatible.length) ranked = compatible;
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
          const dose = doseForWeek(m.dose, m.prog, wi, sessionScale, fixed, m.pattern);
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

    return { week: wi + 1, theme: themes[wi], intensity: WEEK_INTENSITY[wi], focusNote: WEEK_FOCUS[wi], sessions };
  });

  return {
    goal: input.goal,
    summary: "", // coach.ts writes the athlete-facing summary; it owns the copy.
    constraints: [],
    weeks,
    block,
  };
}
