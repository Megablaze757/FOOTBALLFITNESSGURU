// =============================================================================
// AI Coaching engine — constraint-aware drill recommendations, goal-based
// program generation, and "what's working" analysis.
//
// Pure and dependency-free (runs in the browser on GitHub Pages, and is
// unit-tested). The /coach page uses this directly; an optional Claude Edge
// Function can enrich the program, falling back to buildProgram().
// =============================================================================

import type { PainMap, TrainingLog } from "./types";
import { progressionForName, type SportId } from "./exercises";
import { parseConstraints, isExcluded, EMPTY_CONSTRAINTS, type Constraints, type Region } from "./constraints";
import { buildHypertrophyProgram, type SplitStyle } from "./hypertrophy";
import { positionLabel } from "./positions";
import { sportTerms } from "./sport-terms";
import { MOVEMENTS, regionOfMovement, type Movement, type GoalType, type BodyArea } from "./movements";
import { buildBlock, painByArea, type ProgramPlan, type TrainingFocus } from "./engine";

// The catalogue lives in ./movements and the block builder in ./engine. This
// module keeps the athlete-facing API — the goal lists, the recommendations and
// the progress analysis — so everything that already imports from "@/lib/coach"
// carries on working.
export type { GoalType, BodyArea } from "./movements";
export type { TrainingFocus, ProgramDrill, ProgramSession, ProgramWeek, ProgramPlan } from "./engine";
export { painByArea } from "./engine";

export const GOALS: { id: GoalType; label: string; blurb: string }[] = [
  { id: "speed", label: "Speed", blurb: "Top-end sprint speed & acceleration" },
  { id: "agility", label: "Agility", blurb: "Change of direction & reactivity" },
  { id: "strength", label: "Strength & power", blurb: "Force, jumps, explosiveness" },
  { id: "endurance", label: "Endurance", blurb: "Aerobic base & repeat efforts" },
  { id: "injury_recovery", label: "Injury recovery", blurb: "Rehab & return to play" },
  { id: "skill", label: "Ball skill", blurb: "Control, dribbling, passing" },
];

// Sport-aware goal presentation: which goals to surface (and in what order),
// with sport-specific labels. The underlying GoalType ids are unchanged so the
// program engine works identically — only the copy/ordering adapts.
type GoalOverride = { order: GoalType[]; labels?: Partial<Record<GoalType, { label: string; blurb: string }>> };

const SPORT_GOALS: Record<string, GoalOverride> = {
  football: { order: ["speed", "agility", "strength", "endurance", "skill", "injury_recovery"] },
  rugby: {
    order: ["strength", "speed", "endurance", "agility", "skill", "injury_recovery"],
    labels: {
      strength: { label: "Strength & collision power", blurb: "Force for contact, scrums & tackles" },
      skill: { label: "Contact & handling", blurb: "Tackling, rucking, ball handling" },
    },
  },
  weightlifting: {
    order: ["strength", "skill", "endurance", "injury_recovery"],
    labels: {
      strength: { label: "Maximal strength", blurb: "Build your squat, bench & deadlift 1RM" },
      skill: { label: "Lifting technique", blurb: "Groove the main-lift patterns" },
      endurance: { label: "Work capacity", blurb: "Conditioning between heavy sessions" },
    },
  },
  gym: {
    order: ["strength", "endurance", "injury_recovery"],
    labels: {
      strength: { label: "Strength & muscle", blurb: "Get stronger and build muscle" },
      endurance: { label: "Conditioning", blurb: "Fat loss & aerobic fitness" },
    },
  },
  basketball: {
    order: ["strength", "speed", "agility", "endurance", "skill", "injury_recovery"],
    labels: {
      strength: { label: "Vertical & power", blurb: "Jump higher, explode off the floor" },
      skill: { label: "Handling & finishing", blurb: "Ball control and court skills" },
    },
  },
  running: {
    order: ["endurance", "speed", "injury_recovery", "strength"],
    labels: {
      strength: { label: "Runner's strength", blurb: "Durability & economy for the legs" },
    },
  },
};

// Training-focus options for the onboarding quiz.
export const FOCI: { id: TrainingFocus; label: string; blurb: string }[] = [
  { id: "performance", label: "Sport performance", blurb: "Faster, stronger, more explosive for your sport" },
  { id: "fitness", label: "General fitness", blurb: "Conditioning, health and staying in shape" },
  { id: "aesthetics", label: "Muscle & aesthetics", blurb: "Build muscle and look the part" },
  { id: "rehab", label: "Rehab & return", blurb: "Recover from injury and rebuild safely" },
];

// Position / event suggestions per sport (free text still allowed).
export const POSITIONS_BY_SPORT: Record<string, string[]> = {
  football: ["Goalkeeper", "Centre back", "Full back", "Defensive mid", "Central mid", "Winger", "Striker"],
  rugby: ["Prop", "Hooker", "Lock", "Flanker", "No. 8", "Scrum-half", "Fly-half", "Centre", "Wing", "Full-back"],
  basketball: ["Point guard", "Shooting guard", "Small forward", "Power forward", "Centre"],
  running: ["Sprinter", "800m/1500m", "5k/10k", "Half marathon", "Marathon"],
  weightlifting: ["Powerlifting", "Olympic lifting", "General strength"],
  gym: ["Hypertrophy", "Strength", "General fitness"],
};

export function positionsForSport(sport: string | null | undefined): string[] {
  return POSITIONS_BY_SPORT[sport ?? "football"] ?? [];
}

/** Goals to show for a sport, ordered and relabelled. Falls back to all GOALS. */
export function goalsForSport(sport: string | null | undefined): { id: GoalType; label: string; blurb: string }[] {
  const base = new Map(GOALS.map((g) => [g.id, g]));
  const cfg = SPORT_GOALS[sport ?? "football"] ?? SPORT_GOALS.football;
  return cfg.order.map((id) => {
    const o = cfg.labels?.[id];
    const b = base.get(id)!;
    return { id, label: o?.label ?? b.label, blurb: o?.blurb ?? b.blurb };
  });
}

/**
 * The drill pool. This used to be a second, private library of 42 drills
 * declared right here — which is why no program ever contained a warm-up, any
 * core work, or a single one of the seven goalkeeper drills: they existed in
 * lib/exercises.ts, and this list could not see them. See lib/movements.ts.
 */
const LIBRARY: Movement[] = MOVEMENTS;

/** The training region a drill belongs to, if we've classified it. */
export function regionOfDrill(id: string): Region | undefined {
  return regionOfMovement(id);
}

/** Look up a drill's coaching info by (fuzzy) name — used by the coach chat. */
export function drillInfo(name: string): { name: string; cue: string; targets: GoalType[]; loadAreas: string[] } | null {
  const q = name.toLowerCase().trim();
  if (!q) return null;
  // Exact, or a substantial (>=4 char) substring match either way — avoids tiny
  // tokens like "is" matching inside a drill name.
  const d = LIBRARY.find((x) => x.name.toLowerCase() === q)
    ?? (q.length >= 4 ? LIBRARY.find((x) => q.includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(q)) : undefined);
  if (!d) return null;
  return {
    name: d.name,
    cue: d.cue,
    targets: d.targets,
    loadAreas: Object.keys(d.load).filter((a) => (d.load as Record<string, number>)[a] >= 2),
  };
}

function prettyArea(a: string): string {
  return a.replace("_", " ");
}

export interface Recommendation {
  id: string;
  name: string;
  cue: string;
  reason: string;
  sets: number;
  reps: number;
  flagged: boolean; // protects a sore area
}

export interface RecommendInput {
  goal: GoalType;
  painMap: PainMap;
  recentDrillNames?: string[];
  count?: number;
  sport?: SportId;
  focus?: TrainingFocus;
  /** Athlete's stated exclusions ("I don't train legs"). */
  constraints?: Constraints;
}

/**
 * Rank drills for a goal while respecting current pain: drills that load a sore
 * joint are penalised (or excluded when pain is high), and the reason explains why.
 */
export function recommendDrills(input: RecommendInput): Recommendation[] {
  const pain = painByArea(input.painMap);
  const recent = new Set((input.recentDrillNames ?? []).map((n) => n.toLowerCase()));
  const soreAreas = (Object.keys(pain) as BodyArea[]).filter((a) => (pain[a] ?? 0) >= 4);
  const constraints = input.constraints ?? EMPTY_CONSTRAINTS;

  // An exclusion the athlete typed is a hard filter, not a scoring penalty —
  // "I don't train legs" must mean zero leg work, not less of it.
  // Warm-ups and cool-downs aren't recommendations — nobody asks the coach what
  // to do and wants "ankle rocks" back. They're part of a session, not an answer.
  const allowed = LIBRARY
    .filter((d) => d.slot !== "warmup" && d.slot !== "cooldown")
    .filter((d) => !isExcluded(constraints, d.region, d.name));

  const scored = allowed.map((d) => {
    const onGoal = d.targets.includes(input.goal);
    let score = onGoal ? 10 : d.targets.some((t) => adjacent(input.goal, t)) ? 4 : 0;

    // Pain handling.
    let painCost = 0;
    let hardAvoid = false;
    for (const area of Object.keys(pain) as BodyArea[]) {
      const p = pain[area] ?? 0;
      const l = d.load[area] ?? 0;
      painCost += (p / 10) * l * 3;
      if (p >= 7 && l >= 2) hardAvoid = true;
    }
    score -= painCost;
    if (recent.has(d.name.toLowerCase())) score -= 2; // encourage variety

    // Sport preference: strongly favour drills for this sport, exclude drills
    // that only belong to *other* sports (a runner shouldn't get scrum drives).
    if (input.sport && d.sports) {
      if (d.sports.includes(input.sport)) score += 5;
      else score -= 8;
    }
    // Aesthetics (hypertrophy) leans on gym/weights work; fitness on conditioning.
    if (input.focus === "aesthetics" && (d.kit === "barbell" || d.kit === "dumbbell" || d.kit === "machine")) score += 3;
    if (input.focus === "fitness" && (d.targets.includes("endurance") || d.kit === "machine")) score += 3;

    const sparesSore = soreAreas.length > 0 && soreAreas.every((a) => (d.load[a] ?? 0) <= 1);
    if (soreAreas.length && sparesSore && onGoal) score += 3; // reward smart substitutions

    return { d, score, hardAvoid, sparesSore };
  }).sort((a, b) => b.score - a.score);

  const viable = scored.filter((s) => !s.hardAvoid && s.score > 0);
  // Heavy exclusions (say, no legs AND no cardio for a speed goal) can empty the
  // pool. Rather than hand back a session with nothing in it, relax the score
  // floor — but never the exclusions themselves, which the athlete chose.
  const pool = viable.length > 0 ? viable : scored.filter((s) => !s.hardAvoid);

  return pool.slice(0, input.count ?? 5).map(({ d, sparesSore }) => ({
    id: d.id,
    name: d.name,
    cue: d.cue,
    reason: buildReason(d, input.goal, soreAreas, sparesSore),
    ...prescription(d, input.goal, input.focus),
    flagged: sparesSore && soreAreas.length > 0,
  }));
}

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

function buildReason(d: Movement, goal: GoalType, soreAreas: BodyArea[], spares: boolean): string {
  const goalLabel = GOALS.find((g) => g.id === goal)?.label.toLowerCase() ?? goal;
  if (soreAreas.length && spares) {
    return `Develops ${goalLabel} with minimal load on your ${soreAreas.map(prettyArea).join(" / ")} while it's sore.`;
  }
  if (d.targets.includes(goal)) return `Direct ${goalLabel} work — ${d.cue.toLowerCase()}.`;
  return `Supports ${goalLabel} as a complement.`;
}

/**
 * Each movement now carries its own dose, so a deadlift and a calf raise stop
 * being prescribed identically because they share a goal. The training focus
 * still nudges it — hypertrophy wants more reps than a strength block does.
 */
function prescription(d: Movement, goal: GoalType, focus?: TrainingFocus): { sets: number; reps: number } {
  const { sets, reps } = d.dose;
  if (focus === "aesthetics" && (d.kit === "barbell" || d.kit === "dumbbell" || d.kit === "machine")) {
    return { sets: Math.max(sets, 3), reps: Math.max(reps, 10) };
  }
  if (focus === "fitness" && goal !== "strength") return { sets, reps: Math.max(reps, 8) };
  return { sets, reps };
}

// --- Program generation -----------------------------------------------------

export interface BuildProgramInput {
  goal: GoalType;
  painMap: PainMap;
  isInSeason?: boolean;
  daysPerWeek?: number;
  block?: number; // 1-based; each block progresses volume slightly
  sport?: SportId;
  focus?: TrainingFocus;
  /** One position, or every position they play — skill work covers all of them. */
  position?: string | string[];
  /** The athlete's free-text notes, e.g. "I don't train legs". */
  notes?: string | null;
  /** Gym split to follow — push/pull/legs, upper/lower, body-part and so on. */
  style?: SplitStyle;
}

/**
 * Whether this athlete should get a bodybuilding split rather than an S&C block.
 * Rehab always wins — someone coming back from injury needs the rehab
 * progression regardless of what they'd like to look like.
 */
function wantsHypertrophy(input: BuildProgramInput): boolean {
  if (input.goal === "injury_recovery" || input.focus === "rehab") return false;
  if (input.focus === "aesthetics") return true;              // "muscle & aesthetics", any sport
  return input.sport === "gym" && input.goal === "strength";  // "strength & muscle" in the gym
}

/**
 * A 4-week block tailored to the goal, with pain-aware selection and a taper.
 *
 * The block itself is built by ./engine — session structure, movement selection
 * and dosing all live there. What stays here is the athlete-facing copy: the
 * summary that explains the block, and showing them their own exclusions back so
 * it's visible the note was read rather than silently swallowed.
 */
export function buildProgram(input: BuildProgramInput): ProgramPlan {
  const block = Math.max(1, input.block ?? 1);
  const constraints = parseConstraints(input.notes);
  const pain = painByArea(input.painMap);
  const sore = (Object.keys(pain) as BodyArea[]).filter((a) => (pain[a] ?? 0) >= 4);

  // Training for muscle is a different sport to training for a sport. A
  // bodybuilder needs a split, isolation work and reps that stay in range —
  // hand those athletes to the hypertrophy engine instead.
  const plan = wantsHypertrophy(input)
    ? buildHypertrophyProgram({
        painMap: input.painMap,
        daysPerWeek: input.daysPerWeek,
        block,
        constraints,
        isInSeason: input.isInSeason,
        style: input.style,
      })
    : buildBlock({
        goal: input.goal,
        painMap: input.painMap,
        isInSeason: input.isInSeason,
        daysPerWeek: input.daysPerWeek,
        block,
        sport: input.sport,
        focus: input.focus,
        position: input.position,
        constraints,
      });

  return {
    ...plan,
    summary: programSummary(input.goal, sore, input.isInSeason ?? false, block, input.sport, input.position, input.focus),
    constraints: [
      ...(sore.length ? [`Protecting your ${sore.map(prettyArea).join(", ")} — high-impact loading on these is dialled back.`] : []),
      ...constraints.summary,
    ],
  };
}

const FOCUS_LABEL: Record<TrainingFocus, string> = {
  performance: "performance", fitness: "general fitness", aesthetics: "muscle & aesthetics", rehab: "rehab",
};

function programSummary(goal: GoalType, sore: BodyArea[], inSeason: boolean, block: number, sport?: SportId, position?: string | string[], focus?: TrainingFocus): string {
  const g = GOALS.find((x) => x.id === goal)?.label ?? goal;
  // "In-season" means nothing to a lifter and "off-season" nothing to a
  // gym-goer. Each sport names its own phases.
  const t = sportTerms(sport);
  const season = inSeason ? t.inSeason : t.offSeason;
  const who = [positionLabel(position), sport].filter(Boolean).join(" · ");
  const forWhom = who ? ` Tailored for a ${who}.` : "";
  const focusNote = focus && focus !== "performance" ? ` Weighted toward ${FOCUS_LABEL[focus]}.` : "";
  const blockNote = block > 1 ? ` Block ${block} — volume stepped up ${Math.round((block - 1) * 8)}% from your last block.` : "";
  const note = sore.length ? ` Built around your sore ${sore.map(prettyArea).join(" & ")}, swapping in lower-impact options.` : "";
  return `A 4-week ${g.toLowerCase()} block, ${season}, progressing Base → Build → Peak → Deload.${forWhom}${focusNote}${blockNote}${note}`;
}

// --- "What's working" analysis ----------------------------------------------

export interface CoachInsights {
  progressions: { name: string; deltaKg: number }[];
  insights: string[];
  topDrill: string | null;
}

const DRILL_BY_NAME = new Map(LIBRARY.map((d) => [d.name.toLowerCase(), d]));

/**
 * Surface load progressions and pain/impact patterns from training history.
 * `checkIns` is [{ check_in_date, pain_map }] oldest->newest.
 */
export function analyzeProgress(
  logs: TrainingLog[],
  checkIns: { check_in_date: string; pain_map: PainMap | null }[]
): CoachInsights {
  const sorted = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));

  // Load progression per drill (earliest vs best).
  const loadByDrill = new Map<string, { first: number; best: number }>();
  const freq = new Map<string, number>();
  for (const log of sorted) {
    for (const d of log.drills ?? []) {
      const name = d.name?.trim();
      if (!name) continue;
      freq.set(name, (freq.get(name) ?? 0) + 1);
      // Only treat kg gains as "progression" for load-based lifts — you don't
      // add weight to wall passes, sprints or dribbling.
      const method = progressionForName(name);
      if (d.load_kg != null && d.load_kg > 0 && (method === "load" || method === null)) {
        const cur = loadByDrill.get(name) ?? { first: d.load_kg, best: d.load_kg };
        cur.best = Math.max(cur.best, d.load_kg);
        loadByDrill.set(name, cur);
      }
    }
  }
  const progressions = [...loadByDrill.entries()]
    .map(([name, v]) => ({ name, deltaKg: +(v.best - v.first).toFixed(1) }))
    .filter((p) => p.deltaKg > 0)
    .sort((a, b) => b.deltaKg - a.deltaKg)
    .slice(0, 4);

  const insights: string[] = [];
  for (const p of progressions.slice(0, 2)) {
    insights.push(`Your ${p.name} load is up ${p.deltaKg}kg — it's progressing well, keep it in.`);
  }

  // Pain-vs-impact pattern: does an area flare after high-impact-to-it sessions?
  const flare = detectFlare(sorted, checkIns);
  if (flare) {
    insights.push(
      `Your ${prettyArea(flare.area)} pain tends to rise after high-impact ${flare.area} sessions — ` +
        `swap some in for lower-impact options (e.g. ladder work, bike intervals, Spanish squats) while still training ${flare.goalHint}.`
    );
  }

  const topDrill = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { progressions, insights, topDrill };
}

function detectFlare(
  logs: TrainingLog[],
  checkIns: { check_in_date: string; pain_map: PainMap | null }[]
): { area: BodyArea; goalHint: string } | null {
  const painOn = new Map(checkIns.map((c) => [c.check_in_date, painByArea(c.pain_map ?? {})]));
  const dates = checkIns.map((c) => c.check_in_date).sort();

  const nextDate = (d: string) => dates.find((x) => x > d);
  const areas: BodyArea[] = ["knee", "ankle", "hamstring"];

  for (const area of areas) {
    let afterHigh: number[] = [];
    let afterLow: number[] = [];
    for (const log of logs) {
      const sessionLoad = Math.max(
        0,
        ...(log.drills ?? []).map((dr) => DRILL_BY_NAME.get(dr.name?.toLowerCase() ?? "")?.load[area] ?? 0)
      );
      const nd = nextDate(log.log_date);
      const nextPain = nd ? painOn.get(nd)?.[area] ?? 0 : 0;
      if (sessionLoad >= 2) afterHigh.push(nextPain);
      else afterLow.push(nextPain);
    }
    if (afterHigh.length >= 2 && afterLow.length >= 1) {
      const hi = mean(afterHigh);
      const lo = mean(afterLow);
      if (hi - lo >= 2) return { area, goalHint: area === "knee" ? "agility" : "speed" };
    }
  }
  return null;
}

function mean(a: number[]): number {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
}
