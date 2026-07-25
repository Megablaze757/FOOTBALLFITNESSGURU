// =============================================================================
// Hypertrophy program engine — bodybuilding-shaped training for the gym.
//
// The general coach engine (lib/coach.ts) is built for field sport: it rotates
// goals like speed/agility, prescribes from a ~40-drill library of sprints,
// ladders and plyos, and shapes weeks like a strength block (reps fall as load
// climbs). Handed an "I want to build muscle" athlete it produced a plan that
// read as CrossFit — no isolation work, no split, the same three compounds
// every session, and week 3 landing on 4x7.
//
// This builds the other shape entirely:
//   • a real split, chosen by how many days a week they train
//   • compounds first, then isolation, off the 247-movement gym catalog
//   • 6-15 rep hypertrophy ranges held while load creeps up
//   • per-session muscle targets, so Push day is chest/shoulders/triceps
//
// It emits the same ProgramPlan shape as buildProgram(), so the /coach UI,
// calendar, workout player and session logging all work unchanged.
// Pure + dependency-free: runs in the browser, unit-tested, no network.
// =============================================================================

import type { PainMap } from "./types";
import type { Exercise } from "./exercises";
import { IMPORTED_EXERCISES } from "./exercise-catalog";
import { isExcluded, type Constraints, type Region } from "./constraints";
import type { ProgramPlan, ProgramWeek, ProgramSession, ProgramDrill, BodyArea } from "./coach";

export type MuscleGroup =
  | "chest" | "back" | "shoulders" | "biceps" | "triceps"
  | "quads" | "hamstrings" | "glutes" | "calves" | "core";

const GROUP_LABEL: Record<MuscleGroup, string> = {
  chest: "chest", back: "back", shoulders: "shoulders", biceps: "biceps", triceps: "triceps",
  quads: "quads", hamstrings: "hamstrings", glutes: "glutes", calves: "calves", core: "core",
};

// Muscle groups map onto the coarse exclusion regions so "I don't train legs"
// and "no arms" work here exactly as they do in the general engine.
const GROUP_REGION: Record<MuscleGroup, Region> = {
  chest: "chest", back: "back", shoulders: "shoulders",
  biceps: "arms", triceps: "arms",
  quads: "legs", hamstrings: "legs", glutes: "legs", calves: "legs",
  core: "core",
};

// Which joint each group loads, for pain-aware substitution.
const GROUP_JOINT: Partial<Record<MuscleGroup, BodyArea>> = {
  quads: "knee", hamstrings: "hamstring", glutes: "hip", calves: "ankle",
  chest: "shoulder", shoulders: "shoulder", triceps: "shoulder",
};

// --- classifying the catalog -------------------------------------------------

const CALVES = /\bcalf\b|\bcalves\b/i;
const HAMSTRINGS = /leg curl|hamstring|romanian|\brdl\b|good morning|nordic|stiff leg/i;
const GLUTES = /hip thrust|glute|bridge|abduction|kickback|pull through/i;
const DEADLIFT = /deadlift|rack pull/i;

/** Sub-classify the catalog's single "Legs" bucket into real training groups. */
function legGroup(name: string): MuscleGroup {
  if (CALVES.test(name)) return "calves";
  if (HAMSTRINGS.test(name)) return "hamstrings";
  if (GLUTES.test(name)) return "glutes";
  return "quads";
}

/** The muscle group an exercise trains, or null when it isn't resistance work. */
export function groupOf(ex: Exercise): MuscleGroup | null {
  const muscle = (ex.muscles?.[0] ?? "").toLowerCase();
  const name = ex.name;
  switch (muscle) {
    case "chest": return "chest";
    case "back": return "back";
    case "shoulders": return "shoulders";
    case "biceps": return "biceps";
    case "triceps": return "triceps";
    case "core": return "core";
    case "forearms": return "biceps"; // trained alongside arms
    case "legs": return legGroup(name);
    case "whole body":
      // Mostly conditioning and Olympic work. Keep the hinges, drop the rest —
      // burpees and thrusters are not a bodybuilding back day.
      if (DEADLIFT.test(name)) return "hamstrings";
      return null;
    default: return null;
  }
}

const ISOLATION = /curl|extension|raise|\bfly\b|flyes|flies|pushdown|kickback|shrug|crunch|pullover|face pull|lateral|rear delt|adduction|abduction|wrist|twist|leg raise|sit ups?|plank|hyperextension|pec deck/i;

/** Compound movements anchor a session; isolation adds the volume after. */
export function isCompound(ex: Exercise): boolean {
  return !ISOLATION.test(ex.name);
}

// The hand-coached entries in exercise-catalog.ts are exactly the lifts a
// bodybuilder expects to see, so having real cues is a good proxy for "staple".
function quality(ex: Exercise): number {
  let q = (ex.cues?.length ?? 0) > 0 ? 10 : 0;
  if (ex.difficulty === "advanced") q -= 4; // Olympic/gymnastic work isn't the point here
  return q;
}

interface Movement {
  ex: Exercise;
  group: MuscleGroup;
  compound: boolean;
}

// Only the imported gym database. The hand-written EXERCISES list is field-sport
// coaching content and tags several muscles per drill — pulling it in here would
// classify "Ladder quick-feet" (muscles: Calves, Hip flexors) as calf work and
// land agility drills on a bodybuilder's leg day.
const POOL: Movement[] = IMPORTED_EXERCISES
  .filter((ex, i, all) => all.findIndex((o) => o.name.toLowerCase() === ex.name.toLowerCase()) === i)
  .map((ex) => {
    const group = groupOf(ex);
    return group ? { ex, group, compound: isCompound(ex) } : null;
  })
  .filter((m): m is Movement => m !== null)
  .sort((a, b) => quality(b.ex) - quality(a.ex) || a.ex.name.localeCompare(b.ex.name));

// --- splits ------------------------------------------------------------------

interface SplitDay {
  name: string;
  groups: MuscleGroup[];
}

/**
 * The split for a given training frequency. Two days can't justify a body-part
 * split (each muscle would be trained once a week), so those get full-body;
 * push/pull/legs only earns its place at 3+.
 */
export function splitFor(daysPerWeek: number): SplitDay[] {
  const days = Math.max(2, Math.min(5, Math.round(daysPerWeek) || 3));
  const PUSH: MuscleGroup[] = ["chest", "shoulders", "triceps"];
  const PULL: MuscleGroup[] = ["back", "biceps"];
  const LEGS: MuscleGroup[] = ["quads", "hamstrings", "glutes", "calves"];
  const UPPER: MuscleGroup[] = ["chest", "back", "shoulders", "biceps", "triceps"];
  const LOWER: MuscleGroup[] = ["quads", "hamstrings", "glutes", "core"];

  switch (days) {
    case 2:
      return [
        { name: "Full body A", groups: ["quads", "chest", "back", "shoulders"] },
        { name: "Full body B", groups: ["hamstrings", "back", "chest", "biceps", "triceps"] },
      ];
    case 3:
      return [
        { name: "Push", groups: PUSH },
        { name: "Pull", groups: PULL },
        { name: "Legs", groups: LEGS },
      ];
    case 4:
      return [
        { name: "Upper A", groups: UPPER },
        { name: "Lower A", groups: LOWER },
        { name: "Upper B", groups: ["back", "chest", "shoulders", "triceps", "biceps"] },
        { name: "Lower B", groups: ["hamstrings", "quads", "glutes", "calves"] },
      ];
    default:
      return [
        { name: "Push", groups: PUSH },
        { name: "Pull", groups: PULL },
        { name: "Legs", groups: LEGS },
        { name: "Upper", groups: UPPER },
        { name: "Lower", groups: LOWER },
      ];
  }
}

// --- week shaping ------------------------------------------------------------

// Hypertrophy progresses by adding volume and load while reps STAY in range —
// the general engine's strength shaping (reps down 30% by week 3) turns a
// bodybuilding block into a powerlifting one.
const WEEK_SETS_DELTA = [0, 0, 1, -1]; // weeks 1-4; week 4 deloads
const WEEK_REP_BUMP = [0, 2, 2, 0];    // extra reps within the range
const WEEK_THEMES = ["Base", "Build", "Peak", "Deload"];
const WEEK_INTENSITY = ["Moderate", "Higher", "Peak", "Deload"];
const WEEK_FOCUS = [
  "Find your working weights and leave 2-3 reps in the tank.",
  "Same weights, more reps — chase the top of every range.",
  "Peak week: add a set and push the last set close to failure.",
  "Deload: cut the sets right back so you grow into next block.",
];
const WEEK_PROGRESSION = [
  "Pick a weight you could do 2-3 more reps with, and own the technique.",
  "Same weight as week 1 — add reps until you reach the top of the range.",
  "Add a set. When you hit the top of the range, put the weight up next time.",
  "Deload: same movements, two thirds of the weight, stop well short of failure.",
];

/** Sets/reps for a movement, by role and week. */
function prescribe(compound: boolean, weekIndex: number): { sets: number; reps: number } {
  const baseSets = compound ? 4 : 3;
  const baseReps = compound ? 8 : 12;
  const sets = Math.max(2, baseSets + WEEK_SETS_DELTA[weekIndex]);
  // Reps stay inside 6-15 all block — that's the hypertrophy window.
  const reps = Math.min(15, baseReps + WEEK_REP_BUMP[weekIndex]);
  return { sets, reps };
}

// --- selection ---------------------------------------------------------------

export interface HypertrophyInput {
  painMap: PainMap;
  daysPerWeek?: number;
  block?: number;
  constraints: Constraints;
  isInSeason?: boolean;
}

/** How many exercises a session should contain, given how many groups it covers. */
function sessionSize(groupCount: number): number {
  return groupCount <= 3 ? 5 : 6;
}

/**
 * Picks movements for one session: a compound to open each primary group, then
 * isolation to fill the volume. `offset` rotates the pool so the second Push
 * day of a week isn't a carbon copy of the first.
 */
function pickForSession(
  groups: MuscleGroup[],
  offset: number,
  sorePain: Partial<Record<BodyArea, number>>,
  constraints: Constraints
): Movement[] {
  const usable = (g: MuscleGroup) => {
    const joint = GROUP_JOINT[g];
    // Skip a group entirely when the joint it loads is genuinely painful; the
    // athlete gets more volume elsewhere rather than being told to train through it.
    if (joint && (sorePain[joint] ?? 0) >= 7) return false;
    return !constraints.excludeRegions.includes(GROUP_REGION[g]);
  };

  const active = groups.filter(usable);
  if (active.length === 0) return [];

  const target = sessionSize(active.length);
  const chosen: Movement[] = [];
  const taken = new Set<string>();

  const take = (g: MuscleGroup, wantCompound: boolean): boolean => {
    const candidates = POOL.filter(
      (m) => m.group === g && m.compound === wantCompound &&
        !taken.has(m.ex.id) && !isExcluded(constraints, GROUP_REGION[g], m.ex.name)
    );
    if (candidates.length === 0) return false;
    const pick = candidates[offset % candidates.length];
    taken.add(pick.ex.id);
    chosen.push(pick);
    return true;
  };

  // One compound per group first — that's the session's backbone.
  for (const g of active) {
    if (chosen.length >= target) break;
    if (!take(g, true)) take(g, false);
  }
  // Then isolation, cycling the groups until the session is full.
  let guard = 0;
  while (chosen.length < target && guard < 40) {
    for (const g of active) {
      if (chosen.length >= target) break;
      if (!take(g, false)) take(g, true);
    }
    guard++;
  }
  return chosen;
}

function drillFrom(m: Movement, weekIndex: number, blockScale: number): ProgramDrill {
  const { sets, reps } = prescribe(m.compound, weekIndex);
  const cue = m.ex.cues?.[0] ?? "Control the lowering, full range, no swinging.";
  const role = m.compound ? "Main lift" : "Isolation";
  return {
    name: m.ex.name,
    sets: Math.max(2, Math.round(sets * blockScale)),
    reps,
    cue,
    reason: `${role} for ${GROUP_LABEL[m.group]} — ${m.ex.why ?? `builds the ${GROUP_LABEL[m.group]}`}`,
    progression: WEEK_PROGRESSION[weekIndex],
  };
}

/** Worst pain per area, mirroring painByArea() in lib/coach.ts. */
function painAreas(painMap: PainMap): Partial<Record<BodyArea, number>> {
  const out: Partial<Record<BodyArea, number>> = {};
  const SIDE = new Set(["left", "right"]);
  for (const [k, v] of Object.entries(painMap ?? {})) {
    const area = k.split("_").filter((t) => !SIDE.has(t)).join("_") as BodyArea;
    out[area] = Math.max(out[area] ?? 0, Number(v) || 0);
  }
  return out;
}

/** A 4-week hypertrophy block on a split sized to the athlete's week. */
export function buildHypertrophyProgram(input: HypertrophyInput): ProgramPlan {
  const block = Math.max(1, input.block ?? 1);
  const blockScale = 1 + (block - 1) * 0.08;
  const seasonScale = input.isInSeason ? 0.75 : 1;
  const split = splitFor(input.daysPerWeek ?? 3);
  const pain = painAreas(input.painMap);

  const weeks: ProgramWeek[] = WEEK_THEMES.map((theme, wi) => {
    // Annotated on the callback, not just the variable: without it the returned
    // object literal widens `focus: "strength"` to `string`, which no longer
    // satisfies GoalType.
    const sessions: ProgramSession[] = split.map((day, di): ProgramSession => {
      // Offset shifts per day AND per week, so week 2's Push day varies the
      // accessories rather than repeating week 1 exactly.
      const movements = pickForSession(day.groups, di + wi, pain, input.constraints);
      const drills = movements.map((m) => drillFrom(m, wi, blockScale * seasonScale));
      const covered = [...new Set(movements.map((m) => GROUP_LABEL[m.group]))];
      return {
        day: di + 1,
        title: `Day ${di + 1} · ${day.name}${covered.length ? ` — ${covered.join(", ")}` : ""}`,
        focus: "strength",
        drills,
      };
    // A split day whose every muscle group was excluded shouldn't render as an
    // empty card; drop it and let the remaining days carry the week.
    }).filter((s) => s.drills.length > 0);

    return { week: wi + 1, theme, intensity: WEEK_INTENSITY[wi], focusNote: WEEK_FOCUS[wi], sessions };
  });

  const names = split.map((s) => s.name).join(" / ");
  const blockNote = block > 1 ? ` Block ${block} — volume up ${Math.round((block - 1) * 8)}% on your last one.` : "";
  const seasonNote = input.isInSeason ? " Trimmed for in-season — enough to hold size without wrecking you." : "";

  return {
    goal: "strength",
    summary:
      `A 4-week hypertrophy block on a ${names} split, ${split.length} days a week. ` +
      `Compounds open each session, isolation fills the volume, and reps stay in the 6-15 ` +
      `range while the weight climbs — Base → Build → Peak → Deload.${blockNote}${seasonNote}`,
    constraints: input.constraints.summary,
    weeks,
    block,
  };
}
