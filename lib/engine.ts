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
  strength:        { warmup: 2, primary: 1, secondary: 2, accessory: 2, cooldown: 1 },
  speed:           { warmup: 2, primary: 2, secondary: 1, accessory: 1, cooldown: 1 },
  agility:         { warmup: 2, primary: 1, secondary: 2, accessory: 1, conditioning: 1, cooldown: 1 },
  endurance:       { warmup: 2, secondary: 1, accessory: 1, conditioning: 2, cooldown: 1 },
  injury_recovery: { warmup: 3, secondary: 1, accessory: 3, conditioning: 1, cooldown: 1 },
  skill:           { warmup: 2, primary: 1, secondary: 1, accessory: 1, cooldown: 1 },
};

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
function pick(ranked: Scored[], count: number, offset: number, usedIds: Set<string>, usedPatterns: Set<Pattern>): Movement[] {
  if (count <= 0 || !ranked.length) return [];
  // The window has to be wider than the number of sessions that rotate through
  // it, or the rotation wraps: with a window of 6, week 1 day 1 and week 3 day 1
  // land on the same offset and you're back to repeating sessions.
  const depth = Math.max(count * 3, 8);
  const window = rotate(ranked.slice(0, depth), offset);
  const out: Movement[] = [];

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

function doseForWeek(base: Dose, prog: Prog, wi: number, volumeScale: number, fixed: boolean): Dose {
  // Warm-ups and cool-downs don't periodise. The same eight leg swings every
  // session is correct; progressing them is theatre.
  if (fixed) return { ...base };

  const shape = WEEK_SHAPE[prog][wi];
  const sets = Math.max(wi === 3 ? 1 : 2, Math.round(base.sets * volumeScale) + shape.setsDelta);
  const reps = Math.max(1, Math.round(base.reps * shape.repFactor));
  const rpe = base.rpe != null ? clamp(Math.round((base.rpe + RPE_DELTA[wi]) * 2) / 2, 5, 10) : undefined;
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
  return `Day ${day + 1} · ${map[focus]}`;
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
    const volumeScale = (input.isInSeason ? 0.75 : 1) * blockScale;

    const sessions: ProgramSession[] = Array.from({ length: days }, (_, di) => {
      const focusGoal = rotation[di % rotation.length];
      const ctx: Ctx = {
        focusGoal, pain, soreAreas, sport: input.sport, trainingFocus: input.focus, constraints,
        picked: input.mustInclude?.length ? new Set(input.mustInclude) : undefined,
      };
      const sessionIndex = wi * days + di;

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

        const ranked = rankSlot(slot, ctx);
        // Patterns only need to be unique within the training blocks; a warm-up
        // and a cool-down sharing "mobility" is fine and in fact correct.
        const patternGuard = slot === "warmup" || slot === "cooldown" ? new Set<Pattern>() : usedPatterns;
        const chosen = pick(ranked, want, sessionIndex + SLOT_SEED[slot], usedIds, patternGuard);

        const fixed = slot === "warmup" || slot === "cooldown";
        for (const m of chosen) {
          const dose = doseForWeek(m.dose, m.prog, wi, volumeScale, fixed);
          drills.push({
            name: m.name,
            sets: dose.sets,
            reps: dose.reps,
            cue: m.cue,
            reason: reasonFor(m, slot, ctx),
            progression: fixed ? undefined : WEEK_PROGRESSION[m.prog][wi],
            prescription: prescriptionText(dose),
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
