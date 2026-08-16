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
import { IMPORTED_EXERCISES, STAPLES } from "./exercise-catalog";
import { isExcluded, type Constraints, type Region } from "./constraints";
import { MOVEMENTS } from "./movements";
import { standardFor } from "./strength-standards";
import { runZoneLabel, runZoneFeel } from "./running";
// From ./engine, not ./coach: coach.ts imports this module, so taking the
// program shapes from there made the two files import each other.
import type { ProgramPlan, ProgramWeek, ProgramSession, ProgramDrill, BodyArea } from "./engine";

/**
 * The one muscle-group vocabulary in the app.
 *
 * `adductors` is here for the S&C side rather than this one — `groupOf` below
 * never returns it, because the imported gym catalogue has no adductor
 * category. It exists because groin injury is second only to hamstring in
 * football and the movement library carries Copenhagen planks and adductor
 * isometrics specifically for it; folding those into "legs" would hide the one
 * thing they are in the programme to do. See lib/muscle-volume.ts.
 */
export type MuscleGroup =
  | "chest" | "back" | "shoulders" | "biceps" | "triceps"
  | "quads" | "hamstrings" | "glutes" | "calves" | "adductors" | "core";

const GROUP_LABEL: Record<MuscleGroup, string> = {
  chest: "chest", back: "back", shoulders: "shoulders", biceps: "biceps", triceps: "triceps",
  quads: "quads", hamstrings: "hamstrings", glutes: "glutes", calves: "calves",
  adductors: "adductors", core: "core",
};

// Muscle groups map onto the coarse exclusion regions so "I don't train legs"
// and "no arms" work here exactly as they do in the general engine.
const GROUP_REGION: Record<MuscleGroup, Region> = {
  chest: "chest", back: "back", shoulders: "shoulders",
  biceps: "arms", triceps: "arms",
  quads: "legs", hamstrings: "legs", glutes: "legs", calves: "legs", adductors: "legs",
  core: "core",
};

// Which joint each group loads, for pain-aware substitution.
const GROUP_JOINT: Partial<Record<MuscleGroup, BodyArea>> = {
  quads: "knee", hamstrings: "hamstring", glutes: "hip", calves: "ankle",
  adductors: "hip",
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

/**
 * Staples, and their rank among themselves.
 *
 * A flat bonus was not enough. STAPLES is ordered — the barbell squat, deadlift
 * and bench first, the accessories that merely happen to be staples last — and
 * a flat bonus threw that ordering away, leaving ties broken by whether the
 * catalogue happened to carry coaching cues. "Bench Press" had none and
 * "Dumbbell Bench Press" did, so the dumbbell variant anchored every chest day
 * in the app: the wrong lift, chosen for a reason that has nothing to do with
 * training.
 */
const STAPLE_RANK = new Map(STAPLES.map((n, i) => [n.toLowerCase(), STAPLES.length - i]));

/**
 * How good a fit a movement is for the slot it is being considered for.
 *
 * "HAS COACHING CUES" WAS NOT A GOOD ENOUGH PROXY. It was the only signal here,
 * and it produced main lifts like "Close Grip Bench Press" for chest — a
 * triceps press whose own catalogue entry says so — plus "Cheat Curl", "JM
 * Press" and "Tate Press" anchoring sessions. Those are all real exercises and
 * none of them is what a coach opens a chest day with.
 *
 * An explicit staple list beats a proxy, because the question "which movements
 * should a programme be built on" has a known answer that does not need to be
 * inferred. Cues still count — they mean the athlete gets real coaching on the
 * screen — and advanced lifts are still penalised, but neither can now outrank
 * a squat for the slot that decides what the session is.
 */
function quality(ex: Exercise): number {
  let q = (ex.cues?.length ?? 0) > 0 ? 10 : 0;
  // Scaled so the LAST staple still outranks the best non-staple, and the
  // ordering within the list survives.
  const staple = STAPLE_RANK.get(ex.name.toLowerCase());
  if (staple != null) q += 40 + staple;
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

/**
 * The muscle group behind an exercise NAME, for reading a plan back.
 *
 * A built programme carries names, not catalogue objects, so anything auditing
 * one after the fact has nothing else to go on. Lower-cased and de-duplicated
 * the same way POOL is, so the two cannot disagree about what "Cable Fly" is.
 */
const GROUP_BY_NAME: Map<string, MuscleGroup> =
  new Map(POOL.map((m) => [m.ex.name.toLowerCase(), m.group]));

export function muscleGroupForName(name: string): MuscleGroup | null {
  return GROUP_BY_NAME.get(name.trim().toLowerCase()) ?? null;
}

/** True when the named exercise is a compound, for weighting assistance work. */
export function isCompoundName(name: string): boolean {
  const hit = POOL.find((m) => m.ex.name.toLowerCase() === name.trim().toLowerCase());
  return hit ? hit.compound : false;
}

/**
 * WHAT ELSE A COMPOUND TRAINS — the half of the volume that was going missing.
 *
 * Every exercise in the imported catalogue carries exactly one muscle label:
 * "Bench Press" is Chest, full stop. So a push day of bench, incline press,
 * dips and a fly counted as sixteen chest sets and ZERO for triceps or front
 * delts — and then the volume audit told an athlete doing four heavy pressing
 * movements a week that they were neglecting their triceps.
 *
 * The general S&C engine has never had this problem: lib/muscle-volume.ts maps
 * each movement PATTERN to its movers and credits the assisting ones at half.
 * The bodybuilding catalogue had no pattern field, so it got a single group and
 * the assistance simply vanished. Two engines, two answers, same athlete —
 * except here it was the engine the question mattered most to.
 *
 * Derived from the name, because that is all a saved plan carries. Isolation is
 * deliberately absent: a cable fly assists nothing, and a leg extension that
 * quietly credited glutes would be the same lie in the other direction.
 */
const ASSIST: { re: RegExp; primary: MuscleGroup; assists: MuscleGroup[] }[] = [
  // --- pressing ---
  // Overhead first: "Incline Bench Press" must not be read as a shoulder press,
  // and "Seated Dumbbell Press" must not be read as a bench press.
  { re: /overhead press|shoulder press|military press|\bpush press\b|arnold press|\bz press\b/i, primary: "shoulders", assists: ["triceps"] },
  { re: /incline (bench )?press|incline (dumbbell|barbell|smith)/i, primary: "chest", assists: ["shoulders", "triceps"] },
  { re: /bench press|chest press|\bdips?\b|push ?ups?|floor press|decline press/i, primary: "chest", assists: ["triceps", "shoulders"] },
  { re: /close grip bench/i, primary: "triceps", assists: ["chest", "shoulders"] },
  // --- pulling ---
  { re: /pull ?ups?|chin ?ups?|pulldown|pull down/i, primary: "back", assists: ["biceps"] },
  { re: /\brows?\b|rowing|\bt.?bar\b|pendlay|seal row/i, primary: "back", assists: ["biceps"] },
  // --- hinging ---
  // Deadlift variants that are hamstring-led, and the back that holds the bar.
  { re: /romanian deadlift|\brdl\b|stiff leg|good morning/i, primary: "hamstrings", assists: ["glutes", "back"] },
  { re: /deadlift|rack pull/i, primary: "hamstrings", assists: ["glutes", "back", "quads"] },
  { re: /hip thrust|glute bridge|pull through/i, primary: "glutes", assists: ["hamstrings"] },
  // --- squatting ---
  { re: /leg press|hack squat/i, primary: "quads", assists: ["glutes"] },
  { re: /lunge|split squat|step ?ups?|bulgarian/i, primary: "quads", assists: ["glutes", "hamstrings"] },
  { re: /squat/i, primary: "quads", assists: ["glutes"] },
  // --- loaded carries and full-body pulls ---
  { re: /farmer|suitcase carry|\bshrugs?\b/i, primary: "back", assists: ["core"] },
];

/**
 * The muscles an exercise NAME trains, primary mover first.
 *
 * Returns the catalogue's own single group when nothing above matches, so an
 * exercise this table has never heard of is counted exactly as it was before
 * rather than dropped. The primary is taken from the catalogue rather than from
 * the regex where the two are both available — the catalogue is curated data
 * and the regex is a heuristic, and where a heuristic disagrees with data the
 * data wins.
 */
export function musclesForName(name: string): MuscleGroup[] {
  const primary = muscleGroupForName(name);
  const hit = ASSIST.find((a) => a.re.test(name));
  if (!hit) return primary ? [primary] : [];
  // "Legs" is one bucket in the catalogue and legGroup() splits it by name, so
  // for lower-body work the catalogue's answer and the table's can disagree
  // legitimately (a Romanian deadlift is filed under Whole Body). Trust the
  // catalogue when it has an opinion, and drop the primary out of the assists
  // so nothing is credited twice.
  const lead = primary ?? hit.primary;
  return [lead, ...hit.assists.filter((a) => a !== lead), ...(hit.primary === lead ? [] : [hit.primary])];
}

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
/**
 * The training splits people actually recognise from the gym.
 *
 * Named by method rather than after the coaches and brands that popularised
 * them: "5/3/1", "Starting Strength" and the like are specific published
 * programmes belonging to specific authors, and putting those names on output
 * we generate would be claiming something that isn't ours. The structures
 * themselves — push/pull/legs, upper/lower, a body-part split — are common
 * property, and they're what someone is actually asking for.
 */
export type SplitStyle = "auto" | "ppl" | "upper_lower" | "full_body" | "arnold" | "bro";

export const SPLIT_STYLES: { id: SplitStyle; label: string; blurb: string; days: number }[] = [
  { id: "ppl", label: "Push / Pull / Legs", blurb: "The default for a reason — each muscle twice a week at 6 days", days: 3 },
  { id: "upper_lower", label: "Upper / Lower", blurb: "Four days, high frequency, easy to recover from", days: 4 },
  { id: "arnold", label: "Arnold-style", blurb: "Chest & back, shoulders & arms, legs — classic golden-era pairing", days: 3 },
  { id: "bro", label: "Body-part split", blurb: "One muscle a day, high volume — the classic bodybuilding week", days: 5 },
  { id: "full_body", label: "Full body", blurb: "Everything each session — best return on three days a week", days: 3 },
];

/**
 * FREQUENCY IS THE HALF OF VOLUME NOBODY ASKS FOR.
 *
 * Weekly sets per muscle is the number that drives growth, and it is
 * frequency x sets-per-session. This function only controls the first term, and
 * it was quietly capping it: three days routed to push/pull/legs, which trains
 * every muscle ONCE a week, so a measured aesthetics block came out at 7 sets
 * for chest, 4 for glutes and 3 for calves against a productive band that
 * starts at 10. Somebody who asked to build muscle was handed a maintenance
 * dose and told it was a hypertrophy programme.
 *
 * Push/pull/legs is a fine split — at SIX days, where it hits everything twice,
 * which is what its own blurb says. At three it is the wrong shape, and full
 * body three times a week is the textbook answer for that day count.
 */
export function splitFor(daysPerWeek: number, style: SplitStyle = "auto"): SplitDay[] {
  // Six, not five. The cap meant a 6-day athlete got a 5-day week and the sixth
  // day of training they told us about simply vanished — measurably: 5 days and
  // 6 days produced byte-identical volume.
  const days = Math.max(2, Math.min(6, Math.round(daysPerWeek) || 3));
  const PUSH: MuscleGroup[] = ["chest", "shoulders", "triceps"];
  const PULL: MuscleGroup[] = ["back", "biceps"];
  // Core rides with legs. Push/pull/legs has no home for it otherwise, and a
  // 6-day PPL week measured ZERO core sets — the one group a bodybuilding split
  // drops entirely by accident rather than by choice.
  const LEGS: MuscleGroup[] = ["quads", "hamstrings", "glutes", "calves", "core"];
  const UPPER: MuscleGroup[] = ["chest", "back", "shoulders", "biceps", "triceps"];
  // Calves belong on a lower day. Leaving them off meant the only place they
  // were ever trained was the Legs day of a push/pull/legs week, so on
  // upper/lower — the split the engine picks by default at four days — they
  // were never trained at all, and the volume audit could not even report it
  // because a muscle at zero reads as "not part of this block" rather than as
  // an omission.
  const LOWER: MuscleGroup[] = ["quads", "hamstrings", "glutes", "calves", "core"];

  // A chosen style wins over the day count, then repeats or truncates to fit
  // the week — someone who picked push/pull/legs and trains 5 days wants PPL
  // twice over, not to be silently moved onto upper/lower.
  if (style !== "auto") {
    const cycle: SplitDay[] =
      style === "ppl" ? [{ name: "Push", groups: PUSH }, { name: "Pull", groups: PULL }, { name: "Legs", groups: LEGS }]
      : style === "upper_lower" ? [{ name: "Upper", groups: UPPER }, { name: "Lower", groups: LOWER }]
      : style === "arnold" ? [
          { name: "Chest & back", groups: ["chest", "back"] },
          { name: "Shoulders & arms", groups: ["shoulders", "biceps", "triceps"] },
          { name: "Legs", groups: LEGS },
        ]
      : style === "bro" ? [
          { name: "Chest", groups: ["chest"] },
          { name: "Back", groups: ["back"] },
          { name: "Shoulders", groups: ["shoulders"] },
          { name: "Arms", groups: ["biceps", "triceps"] },
          { name: "Legs", groups: LEGS },
        ]
      : [
          { name: "Full body A", groups: ["quads", "chest", "back", "shoulders"] },
          { name: "Full body B", groups: ["hamstrings", "back", "chest", "biceps", "triceps"] },
          { name: "Full body C", groups: ["glutes", "chest", "back", "shoulders", "core"] },
        ];
    return Array.from({ length: days }, (_, i) => {
      const base = cycle[i % cycle.length];
      // Second time through the cycle, label it so the two aren't identical
      // names in the calendar.
      const round = Math.floor(i / cycle.length);
      return round === 0 ? base : { ...base, name: `${base.name} B` };
    });
  }

  /**
   * The three full-body days.
   *
   * FREQUENCY IS DELIBERATE, and so is its limit. A group appearing on one day
   * of three has to take its whole week in that session, which the session
   * budget will not carry — but widening every day to fix that makes it worse,
   * not better: the same budget divided more ways gives everything less. Seven
   * groups on a full-body day measured six weekly sets for calves where six
   * groups measured nine.
   *
   * So each day stays at five or six groups, the ones that recover fastest and
   * cost least per set (calves, core) double up, and the honest statement about
   * what three days can deliver is made in the plan summary rather than papered
   * over here. See `reachableTarget`.
   */
  const FULL_A: MuscleGroup[] = ["quads", "chest", "back", "shoulders", "core"];
  const FULL_B: MuscleGroup[] = ["hamstrings", "glutes", "back", "chest", "biceps", "triceps"];
  const FULL_C: MuscleGroup[] = ["quads", "glutes", "chest", "back", "shoulders", "calves"];

  switch (days) {
    case 2:
      return [
        { name: "Full body A", groups: FULL_A },
        { name: "Full body B", groups: FULL_B },
      ];
    case 3:
      // FULL BODY, NOT PUSH/PULL/LEGS. Three days of PPL is one session per
      // muscle per week; three full-body days is three, and the same total
      // work spread over three exposures grows more muscle than one.
      return [
        { name: "Full body A", groups: FULL_A },
        { name: "Full body B", groups: FULL_B },
        { name: "Full body C", groups: FULL_C },
      ];
    case 4:
      return [
        { name: "Upper A", groups: UPPER },
        { name: "Lower A", groups: LOWER },
        { name: "Upper B", groups: ["back", "chest", "shoulders", "triceps", "biceps"] },
        { name: "Lower B", groups: ["hamstrings", "quads", "glutes", "calves"] },
      ];
    case 5:
      return [
        { name: "Push", groups: PUSH },
        { name: "Pull", groups: PULL },
        { name: "Legs", groups: LEGS },
        { name: "Upper", groups: UPPER },
        { name: "Lower", groups: LOWER },
      ];
    default:
      // Six days is where push/pull/legs finally does what it promises — every
      // muscle twice a week.
      return [
        { name: "Push", groups: PUSH },
        { name: "Pull", groups: PULL },
        { name: "Legs", groups: LEGS },
        { name: "Push B", groups: PUSH },
        { name: "Pull B", groups: PULL },
        { name: "Legs B", groups: LEGS },
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

/**
 * HOW HARD EACH WEEK IS, IN REPS IN RESERVE.
 *
 * RIR is how many more reps you could have done when you racked it, and it is
 * the unit hypertrophy programming is actually written in — because "how much
 * weight" depends on the person and "how close to failure" does not. Three in
 * reserve is technique work at a real load; one is genuinely hard; zero is
 * failure, which belongs at the end of a block on isolation work and nowhere
 * near a heavy compound.
 *
 * The block accumulates: same lifts, same or rising reps, less left in the tank
 * each week, then a deload that takes the effort off rather than the exercises.
 * That last point is what makes a deload a deload — a week of different, easier
 * movements is not a deload, it is a different week.
 */
const WEEK_RIR = [3, 2, 1, 4];

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
  /** Which recognised split to build; "auto" picks one from the day count. */
  style?: SplitStyle;
  /**
   * Tested one-rep maxes, keyed as lib/benchmarks.ts stores them.
   *
   * Optional, and absent for most athletes — the block is written in reps and
   * reps-in-reserve without it. Where a max IS known, the anchor lifts get an
   * actual weight, which is the difference between a plan and a worksheet.
   */
  oneRepMax?: Record<string, number>;
}

/**
 * VOLUME IS THE TARGET, NOT AN ACCIDENT OF SESSION LENGTH.
 *
 * The session used to be sized first — five to eight exercises, spread evenly
 * over whichever groups the day trained — and the weekly set count per muscle
 * was whatever fell out of that. What fell out was too little: a group trained
 * once a week got one or two movements, which is six or seven sets against a
 * productive band that starts at ten. The app then measured that itself and
 * told the athlete their programme neglected the muscle it had just written a
 * plan for. Somebody who asked to build muscle was handed maintenance.
 *
 * So the arithmetic now runs the other way round. A muscle needs a weekly set
 * total; the split says how many times a week it is trained; those two give the
 * sets it needs TODAY, and the exercise count follows from that. Session length
 * is the output.
 */

/**
 * Weekly sets per muscle a hypertrophy block aims at.
 *
 * Twelve, which is inside LANDMARKS.productiveLow..productiveHigh (10-20) and
 * near the bottom of it deliberately: this is a target for every group the
 * split trains, including the ones an athlete has never trained before, and
 * aiming at the middle of the band would write a week most people cannot
 * recover from. The block adds volume from there — see WEEK_SETS_DELTA and the
 * per-block scale.
 */
const WEEKLY_SET_TARGET = 12;

/** Average working sets one exercise contributes — compound 4, isolation 3. */
const SETS_PER_EXERCISE = 3.5;

/**
 * The most working sets one session should carry.
 *
 * Twenty-eight, which is around an hour and a quarter of lifting. This is the
 * constraint that makes the arithmetic honest: a full-body day covering six
 * muscle groups cannot give all six their weekly dose in one go, and pretending
 * otherwise would write a three-hour session nobody finishes. Where the budget
 * binds, `allocate` decides who goes short — evenly, rather than always the
 * same two groups at the end of the list.
 */
const MAX_SETS_PER_SESSION = 28;

/** And the most exercises for any ONE muscle in a session. */
const MAX_EXERCISES_PER_GROUP = 4;

/**
 * The weekly set target this athlete's week can actually deliver.
 *
 * THE CEILING IS ARITHMETIC, NOT PROGRAMMING. Days times the session budget is
 * all the sets there are; divided by the number of muscle groups in the split
 * it gives the most any one of them can average. Three days is 84 sets over ten
 * groups — about eight each, against a productive band that starts at ten. No
 * amount of cleverness in the picker changes that, and every previous attempt
 * to hide it just moved the shortfall onto whichever groups sat last in the
 * list, which is why calves and core were short in every single block.
 *
 * Aiming at a target the week can reach shares what is missing evenly instead,
 * and lets the plan say the true thing out loud — see `volumeShortfall` in
 * lib/muscle-volume.ts, which reports it from the finished block rather than
 * from this formula.
 */
function reachableTarget(days: number, groups: MuscleGroup[]): (g: MuscleGroup) => number {
  const weekly = Math.max(1, days) * MAX_SETS_PER_SESSION;
  const totalWeight = groups.reduce((n, g) => n + PRIORITY[g], 0) || 1;
  return (g) => Math.min(WEEKLY_SET_TARGET, (weekly * PRIORITY[g]) / totalWeight);
}

/**
 * WHO GOES SHORT WHEN THE WEEK CANNOT PAY FOR EVERYTHING.
 *
 * Dividing the budget equally is the fair answer and the wrong one. Three days
 * over ten muscle groups is eight sets each — which drags the movements the
 * block is actually built on, the squat and the row and the press, down below
 * the productive band so that the calf raises can sit at eight too. A coach with
 * three sessions to spend does the opposite: the big compound groups get a real
 * dose and the small ones get what is left, because that is where the growth
 * and the strength come from and because calves and arms recover on a fraction
 * of the work.
 *
 * The small groups do not fall through the floor — lib/muscle-volume.ts holds
 * every trained muscle at maintenance regardless. These weights decide who gets
 * the PRODUCTIVE dose when there is not enough to go round, not who gets
 * trained.
 */
const PRIORITY: Record<MuscleGroup, number> = {
  quads: 1.5, hamstrings: 1.5, glutes: 1.5, chest: 1.5, back: 1.5, shoulders: 1.2,
  calves: 0.6, biceps: 0.7, triceps: 0.7, core: 0.6, adductors: 0.6,
};

/**
 * How many exercises each group gets this session.
 *
 * `frequency` is how many days in the week train that group — the other half of
 * weekly volume, and the half that decides whether a group needs four movements
 * today or two. Everything gets at least one: a group named in the split and
 * then given nothing is worse than a short dose, because the athlete has no way
 * to tell it was meant to be there.
 *
 * When the session budget binds, the exercise removed comes from whichever
 * group is currently BEST supplied relative to its target. That is what stops
 * the shortfall always landing on calves and core, which is exactly where it
 * used to land: they sat last in every list, so they were what the loop ran out
 * of room for, every session, every week.
 */
function allocate(
  active: MuscleGroup[],
  frequency: (g: MuscleGroup) => number,
  weeklyTarget: (g: MuscleGroup) => number,
): Map<MuscleGroup, number> {
  const out = new Map<MuscleGroup, number>();
  for (const g of active) {
    const perSession = weeklyTarget(g) / Math.max(1, frequency(g));
    const want = Math.ceil(perSession / SETS_PER_EXERCISE);
    out.set(g, Math.max(1, Math.min(MAX_EXERCISES_PER_GROUP, want)));
  }

  const totalSets = () => [...out.values()].reduce((n, x) => n + x, 0) * SETS_PER_EXERCISE;
  let guard = 0;
  while (totalSets() > MAX_SETS_PER_SESSION && guard++ < 50) {
    // Best supplied = highest projected weekly sets as a share of target.
    let worst: MuscleGroup | null = null;
    let best = -Infinity;
    for (const g of active) {
      const n = out.get(g) ?? 0;
      if (n <= 1) continue;
      const share = (n * SETS_PER_EXERCISE * Math.max(1, frequency(g))) / weeklyTarget(g);
      if (share > best) { best = share; worst = g; }
    }
    if (!worst) break; // everything is down to one; the budget cannot go lower
    out.set(worst, (out.get(worst) ?? 1) - 1);
  }
  return out;
}

/**
 * Picks movements for one session: a compound to open each primary group, then
 * isolation to fill each group's allocation. `offset` rotates the pool so the
 * second Push day of a week isn't a carbon copy of the first.
 */
function pickForSession(
  groups: MuscleGroup[],
  offset: number,
  sorePain: Partial<Record<BodyArea, number>>,
  constraints: Constraints,
  frequency: (g: MuscleGroup) => number,
  weeklyTarget: (g: MuscleGroup) => number,
  /**
   * How many earlier days this week have already opened on this muscle group.
   *
   * THE PRIMARY IS NOT ROTATED BY DAY. It used to be: the offset that varies
   * the accessories was also picking the anchor, so quads — trained on days two
   * and four — got the pool's second and fourth choices and the back squat, the
   * first, was never selected in any block the engine produced. The best lift
   * for a muscle was unreachable for the same reason a wheel is: it kept
   * turning.
   *
   * Counting the group's own appearances instead gives back squat on the first
   * leg day and front squat on the second, which is variety with a reason
   * rather than variety as a side effect.
   */
  anchored: (g: MuscleGroup) => number,
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

  const quota = allocate(active, frequency, weeklyTarget);
  const chosen: Movement[] = [];
  const taken = new Set<string>();
  const count = new Map<MuscleGroup, number>();

  const take = (g: MuscleGroup, wantCompound: boolean): boolean => {
    const candidates = POOL.filter(
      (m) => m.group === g && m.compound === wantCompound &&
        !taken.has(m.ex.id) && !isExcluded(constraints, GROUP_REGION[g], m.ex.name)
    );
    if (candidates.length === 0) return false;
    const nth = count.get(g) ?? 0;
    // The FIRST movement for a group is its anchor and is chosen by rank, not
    // by rotation — see `anchored`. Everything after it strides through the
    // pool, so a group with four slots gets four different movements rather
    // than four neighbours.
    const index = nth === 0
      ? anchored(g) % candidates.length
      : (offset + nth * 3) % candidates.length;
    const pick = candidates[index];
    taken.add(pick.ex.id);
    chosen.push(pick);
    count.set(g, (count.get(g) ?? 0) + 1);
    return true;
  };

  // One compound per group first — that's the session's backbone.
  for (const g of active) {
    if (!take(g, true)) take(g, false);
  }
  // Then isolation, cycling the groups until every quota is filled. Cycling
  // rather than finishing one group at a time so that a pool which runs dry
  // late doesn't strand the groups after it.
  let guard = 0;
  while (guard++ < 40) {
    let added = false;
    for (const g of active) {
      if ((count.get(g) ?? 0) >= (quota.get(g) ?? 1)) continue;
      if (take(g, false) || take(g, true)) added = true;
    }
    if (!added) break;
  }
  return chosen;
}

/**
 * REST IS A PROGRAMMING VARIABLE, NOT A DETAIL.
 *
 * Sixty seconds and three minutes between sets are two different training
 * stimuli off the same sets and reps — the short rest costs load on the later
 * sets, which is the thing the volume is there to accumulate. The S&C engine
 * has prescribed rest since it was written (36 of 40 drills carry one). The
 * hypertrophy engine prescribed it on 4 of 35, and those four were the cardio
 * finishers: every actual lift went out with no rest guidance at all.
 *
 * Compounds get three minutes because they are limited by systemic fatigue and
 * a rushed third set of squats is a worse set of squats. Isolation gets ninety
 * seconds because a cable fly recovers locally and quickly.
 */
const REST_ANCHOR = 180;
const REST_COMPOUND = 120;
const REST_ISOLATION = 60;

/**
 * A WORKING WEIGHT, WHERE THE APP ALREADY KNOWS ENOUGH TO GIVE ONE.
 *
 * The Benchmarks page stores tested one-rep maxes and the programme has never
 * once used them. Somebody could log a 140kg squat and still be handed "4 × 8,
 * pick something you could do 2-3 more reps with" — being asked a question the
 * app could answer.
 *
 * From the 1RM via the Epley relation, run backwards. The load for a set is
 * decided by how many reps it will take to reach failure, which is the
 * prescribed reps PLUS the reps left in reserve: 8 reps at 2 RIR is a weight
 * you could have done 10 with. So the week's RIR moves the bar as much as the
 * rep target does, and the block gets heavier as RIR falls even though the reps
 * on the page have not changed. That is progressive overload written down.
 *
 * Rounded to 2.5kg because that is the smallest plate pair on most racks, and
 * a prescription of 87.3kg is a prescription nobody can load.
 *
 * Returns null — and the drill falls back to reps-in-reserve — whenever the
 * lift has no tested max. An estimate presented as a number is worse than an
 * honest instruction: see `intensity` in drillFrom.
 */
function loadFor(
  m: Movement,
  weekIndex: number,
  oneRepMax: Record<string, number> | undefined,
): string | null {
  if (!oneRepMax) return null;
  const standard = standardFor(m.ex.name);
  const key = standard?.benchmarkKey;
  if (!key) return null;
  const max = Number(oneRepMax[key]);
  if (!Number.isFinite(max) || max <= 0) return null;

  const { reps } = prescribe(m.compound, weekIndex);
  const rir = WEEK_RIR[weekIndex] ?? 2;
  const repsToFailure = reps + rir;
  const working = max / (1 + repsToFailure / 30);
  const rounded = Math.max(20, Math.round(working / 2.5) * 2.5);
  return `${rounded}kg · leave ${rir} in the tank`;
}

function drillFrom(m: Movement, weekIndex: number, blockScale: number, load: string | null, anchor: boolean): ProgramDrill {
  const { sets, reps } = prescribe(m.compound, weekIndex);
  const cue = m.ex.cues?.[0] ?? "Control the lowering, full range, no swinging.";
  const role = m.compound ? "Main lift" : "Isolation";
  const rir = WEEK_RIR[weekIndex] ?? 2;

  /**
   * SAY WHAT THE LIFT DOES, not what its slot is called.
   *
   * This read `Main lift for chest — a pressing movement that overloads the
   * triceps` on a close-grip bench, which is the plan contradicting itself
   * inside a single sentence: the slot label came from the muscle group the
   * engine filled, and the description came from the exercise. When the
   * catalogue's own words disagree with the group, the catalogue is describing
   * the movement and the group is describing the job it was picked for — so
   * name the job first and let the description stand on its own.
   */
  const why = m.ex.why ?? `builds the ${GROUP_LABEL[m.group]}`;
  return {
    name: m.ex.name,
    sets: Math.max(2, Math.round(sets * blockScale)),
    reps,
    cue,
    reason: `${role} for ${GROUP_LABEL[m.group]}. ${why}`,
    progression: WEEK_PROGRESSION[weekIndex],
    // Three minutes is for the lift the session is BUILT on — the heaviest
    // thing you do, limited by systemic fatigue. Giving every compound the same
    // rest priced a hypertrophy day at 145 minutes, which is not a session
    // anybody finishes; the second and third compounds recover in two.
    rest: !m.compound ? REST_ISOLATION : anchor ? REST_ANCHOR : REST_COMPOUND,
    // Reps in reserve, not RPE, and spelled out — "RPE 8" is jargon to most
    // people using this, and "leave 2 in the tank" is the same instruction.
    intensity: load ?? (rir === 0 ? "to failure" : `leave ${rir} in the tank`),
    tempo: m.ex.tempo && m.ex.tempo !== "Controlled" ? m.ex.tempo : undefined,
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
  const split = splitFor(input.daysPerWeek ?? 3, input.style ?? "auto");
  const pain = painAreas(input.painMap);

  /**
   * How many days a week each muscle is trained — the other half of volume.
   *
   * Computed once from the split and handed to every session, because a group's
   * dose today depends on whether it comes round again on Thursday. Without it
   * the engine cannot tell a once-a-week chest day from one of three, and gave
   * both the same two exercises.
   */
  const freq = new Map<MuscleGroup, number>();
  for (const day of split) for (const g of day.groups) freq.set(g, (freq.get(g) ?? 0) + 1);
  const frequency = (g: MuscleGroup) => freq.get(g) ?? 1;
  const weeklyTarget = reachableTarget(split.length, [...freq.keys()]);

  /**
   * THE BLOCK'S MOVEMENTS, CHOSEN ONCE.
   *
   * This is the change that turns four weeks of workouts into a training block.
   *
   * The offset used to include the week index, so every session re-picked its
   * exercises: a measured four-week block had ONE movement out of thirty-five
   * present in all four weeks, and the main lift of day one went Close Grip
   * Bench → Decline Bench → Dumbbell Bench → Incline Bench. You cannot add
   * weight to a lift you do once. Progressive overload — the mechanism the
   * whole thing exists to drive — was impossible by construction, and the plan
   * said so in its own progression line: "pick a weight you could do 2-3 more
   * reps with" is advice you can only act on if the lift is still there next
   * week.
   *
   * So the movements are fixed for the block and the LOAD is what progresses:
   * same lifts, reps climbing inside the range, reps-in-reserve falling from
   * three to one, then a deload that eases the same session rather than
   * replacing it. Variety belongs between blocks, which is what the `block`
   * counter is for — it shifts this offset, so block two is a different set of
   * exercises trained the same way.
   */
  const anchoredSoFar = new Map<MuscleGroup, number>();
  const blockMovements = split.map((day, di) => {
    // Rank offset carried into the next block, so block two opens on different
    // lifts trained the same way — variety between blocks, never inside one.
    const anchored = (g: MuscleGroup) => (anchoredSoFar.get(g) ?? 0) + (block - 1);
    const picked = pickForSession(
      day.groups, di + (block - 1) * 7, pain, input.constraints, frequency, weeklyTarget, anchored,
    );
    for (const g of new Set(picked.map((m) => m.group))) {
      anchoredSoFar.set(g, (anchoredSoFar.get(g) ?? 0) + 1);
    }
    return picked;
  });

  const weeks: ProgramWeek[] = WEEK_THEMES.map((theme, wi) => {
    // Annotated on the callback, not just the variable: without it the returned
    // object literal widens `focus: "strength"` to `string`, which no longer
    // satisfies GoalType.
    const sessions: ProgramSession[] = split.map((day, di): ProgramSession => {
      const movements = blockMovements[di];
      // The anchor is the first movement of the session — see pickForSession.
      const drills = movements.map((m, mi) =>
        drillFrom(m, wi, blockScale * seasonScale, loadFor(m, wi, input.oneRepMax), mi === 0));
      const covered = [...new Set(movements.map((m) => GROUP_LABEL[m.group]))];
      // A finisher, and the only aerobic work a bodybuilding split had. Without
      // it "gym + build muscle" — the most common pair in the app — was the one
      // combination that could never prescribe a run, however much someone
      // wanted the conditioning. Kept to ONE, at the end, and easy on the down
      // week, because it is a finisher on a hypertrophy day and not the point
      // of it.
      const finisher = cardioFinisher(di + wi, wi === 3, input.constraints);
      if (finisher && drills.length) drills.push(finisher);
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

/**
 * One easy conditioning movement to close a hypertrophy session.
 *
 * Drawn from the shared movement catalogue rather than a private list, so it is
 * the same runs, bike and rower the rest of the app knows about, and the same
 * "no running" note excludes them here as everywhere else.
 *
 * Rotated by session so it isn't the identical twenty minutes twelve times, and
 * held to recovery effort on the deload week. Deliberately capped at RPE 7: a
 * VO2 session on top of a leg day is not a finisher, it is a second workout,
 * and it would eat the recovery the hypertrophy block is spending.
 */
/**
 * The longest a finisher may be. Past this it is a second session.
 *
 * Thirty, not twenty. Twenty was the first guess and it cut too deep — an easy
 * thirty-minute spin after lifting is an ordinary thing to prescribe, and
 * removing it left a gym strength block with no aerobic work of any kind. What
 * had to go is the seventy-five-minute long run, and everything at forty and
 * fifty that is a training session in its own right.
 */
const MAX_FINISHER_MINUTES = 30;

/**
 * Roughly how long a conditioning movement takes, from its own dose.
 *
 * Minutes where the unit is minutes; otherwise sets times reps of whatever it
 * is, plus the rests, which is close enough to sort a twelve-minute interval
 * set from a seventy-five-minute run.
 */
function finisherMinutes(m: (typeof MOVEMENTS)[number]): number {
  const sets = Math.max(1, m.dose.sets);
  if (/min/i.test(m.dose.unit)) return sets * m.dose.reps;
  if (/\bs\b|sec/i.test(m.dose.unit)) {
    return (sets * m.dose.reps + Math.max(0, sets - 1) * (m.dose.rest ?? 60)) / 60;
  }
  // Distance work: price the rests, which dominate a short-interval set, and
  // allow a generous half-minute per effort.
  return (sets * 30 + Math.max(0, sets - 1) * (m.dose.rest ?? 60)) / 60;
}

function cardioFinisher(offset: number, deload: boolean, constraints: Constraints): ProgramDrill | null {
  const ceiling = deload ? 4 : 7;
  /**
   * A FINISHER HAS TO BE FINISHER-LENGTH.
   *
   * The effort ceiling was the only filter, so a "Long run" — one by seventy-five
   * minutes, easy enough to pass an RPE test — was landing at the end of a
   * hypertrophy day. That is not a finisher; it is a second session bolted onto
   * a first, and it put a real generated day at 135 minutes with an hour of it
   * after the last set. Nobody noticed because nothing on the screen added the
   * session up. See lib/session-time.ts, which is how this surfaced.
   *
   * Thirty minutes is the bar. It keeps intervals, tempo work and an easy
   * recovery run, and drops the forty-, fifty- and seventy-five-minute runs
   * that are sessions in their own right.
   */
  const pool = MOVEMENTS.filter(
    (m) => m.slot === "conditioning" &&
      (m.dose.rpe ?? 10) <= ceiling &&
      finisherMinutes(m) <= MAX_FINISHER_MINUTES &&
      !isExcluded(constraints, m.region, m.name),
  );
  if (!pool.length) return null;

  const m = pool[offset % pool.length];
  // Same rule as the general engine: if it's a run, the zone is the
  // instruction and goes in the prescription, with the talk test as the cue.
  const zone = runZoneLabel(m.id);
  const feel = runZoneFeel(m.id);
  return {
    name: m.name,
    sets: m.dose.sets,
    reps: m.dose.reps,
    cue: feel ? `${zone} — ${feel}` : m.cue,
    reason: deload
      ? "Easy aerobic work on a down week — moves blood without adding to the bill."
      : "Keeps the engine going alongside the lifting, at an effort that won't cost you the next session.",
    prescription: zone
      ? `${m.dose.sets} × ${m.dose.reps} ${m.dose.unit} · ${zone}`
      : `${m.dose.sets} × ${m.dose.reps} ${m.dose.unit}`,
    progression: deload
      ? "Hold it easy. The down week is where the last three turn into muscle."
      : "Add a couple of minutes a week, or keep it flat — this is a finisher, not a session to chase.",
    slot: "conditioning",
    rest: m.dose.rest,
    intensity: m.dose.rpe ? `RPE ${m.dose.rpe}` : undefined,
  };
}
