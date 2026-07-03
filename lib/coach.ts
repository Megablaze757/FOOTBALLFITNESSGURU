// =============================================================================
// AI Coaching engine — constraint-aware drill recommendations, goal-based
// program generation, and "what's working" analysis.
//
// Pure and dependency-free (runs in the browser on GitHub Pages, and is
// unit-tested). The /coach page uses this directly; an optional Claude Edge
// Function can enrich the program, falling back to buildProgram().
// =============================================================================

import type { PainMap, TrainingLog } from "./types";

export type GoalType = "speed" | "agility" | "strength" | "endurance" | "injury_recovery" | "skill";
export type BodyArea = "knee" | "ankle" | "hamstring" | "hip" | "lower_back" | "shoulder";

export const GOALS: { id: GoalType; label: string; blurb: string }[] = [
  { id: "speed", label: "Speed", blurb: "Top-end sprint speed & acceleration" },
  { id: "agility", label: "Agility", blurb: "Change of direction & reactivity" },
  { id: "strength", label: "Strength & power", blurb: "Force, jumps, explosiveness" },
  { id: "endurance", label: "Endurance", blurb: "Aerobic base & repeat efforts" },
  { id: "injury_recovery", label: "Injury recovery", blurb: "Rehab & return to play" },
  { id: "skill", label: "Ball skill", blurb: "Control, dribbling, passing" },
];

interface DrillDef {
  id: string;
  name: string;
  targets: GoalType[];
  load: Partial<Record<BodyArea, number>>; // 0–3 mechanical load per joint
  equipment: "none" | "band" | "weights" | "box" | "ball" | "cones" | "bike";
  level: 1 | 2 | 3;
  cue: string;
}

// Library spans low- and high-impact options so the engine can substitute around
// pain (e.g. agility work that spares a sore knee).
const LIBRARY: DrillDef[] = [
  { id: "ladder_quickfeet", name: "Ladder quick-feet", targets: ["agility", "speed"], load: { ankle: 1 }, equipment: "none", level: 1, cue: "Stay on the balls of your feet, fast ground contacts" },
  { id: "reactive_mirror", name: "Reactive mirror drill", targets: ["agility"], load: {}, equipment: "none", level: 2, cue: "React to a partner — no pre-planning your steps" },
  { id: "lateral_shuffle", name: "Lateral shuffle gates", targets: ["agility"], load: { knee: 1, ankle: 1 }, equipment: "cones", level: 1, cue: "Low hips, push off the outside foot" },
  { id: "cone_weave", name: "Cone weave dribble", targets: ["agility", "skill"], load: { ankle: 1 }, equipment: "ball", level: 1, cue: "Small touches, eyes up between cones" },
  { id: "t_drill", name: "T-drill", targets: ["agility", "speed"], load: { knee: 1, ankle: 1 }, equipment: "cones", level: 2, cue: "Decelerate under control before each turn" },
  { id: "a_skips", name: "A-skips", targets: ["speed"], load: { ankle: 1 }, equipment: "none", level: 1, cue: "Tall posture, drive the knee, snap the foot down" },
  { id: "resisted_sprint", name: "Resisted sprint starts", targets: ["speed"], load: { hamstring: 2 }, equipment: "band", level: 2, cue: "Aggressive arm drive, lean into the band" },
  { id: "flying_sprints", name: "Flying 20m sprints", targets: ["speed"], load: { hamstring: 2, knee: 1 }, equipment: "none", level: 3, cue: "Build to 95%, relaxed face and shoulders" },
  { id: "pogo_hops", name: "Pogo hops", targets: ["speed", "strength"], load: { ankle: 2 }, equipment: "none", level: 2, cue: "Stiff ankles, minimal ground time" },
  { id: "box_jumps", name: "Box jumps", targets: ["strength", "speed"], load: { knee: 2, ankle: 2 }, equipment: "box", level: 2, cue: "Land soft and quiet, full hip extension up" },
  { id: "depth_drop", name: "Depth drop to sprint", targets: ["speed", "strength"], load: { knee: 3, ankle: 2 }, equipment: "box", level: 3, cue: "Absorb then explode — minimal pause" },
  { id: "bulgarian_split", name: "Bulgarian split squat", targets: ["strength"], load: { knee: 2, hip: 1 }, equipment: "weights", level: 2, cue: "Vertical shin, control the descent" },
  { id: "single_leg_rdl", name: "Single-leg RDL", targets: ["strength", "injury_recovery"], load: { hamstring: 1 }, equipment: "weights", level: 2, cue: "Hinge at the hip, flat back, slow tempo" },
  { id: "nordic_curl", name: "Nordic hamstring curl", targets: ["strength", "injury_recovery"], load: { hamstring: 2 }, equipment: "none", level: 2, cue: "Resist the lower as long as you can" },
  { id: "copenhagen", name: "Copenhagen plank", targets: ["strength", "injury_recovery"], load: { hip: 1 }, equipment: "none", level: 2, cue: "Squeeze the top leg, hips high" },
  { id: "band_lateral_walk", name: "Band lateral walks", targets: ["injury_recovery", "strength"], load: {}, equipment: "band", level: 1, cue: "Tension on the band the whole set, knees tracking out" },
  { id: "spanish_squat", name: "Spanish squat iso-hold", targets: ["injury_recovery"], load: { knee: 1 }, equipment: "band", level: 1, cue: "Knees forward, hold the burn — great for sore knees" },
  { id: "bike_intervals", name: "Bike intervals", targets: ["endurance", "injury_recovery"], load: {}, equipment: "bike", level: 2, cue: "Hard efforts, easy spins — zero impact" },
  { id: "tempo_runs", name: "Tempo runs", targets: ["endurance"], load: { hamstring: 1, knee: 1 }, equipment: "none", level: 2, cue: "~75% effort, smooth and repeatable" },
  { id: "dribbling_grid", name: "Tight-space dribbling", targets: ["skill", "agility"], load: { ankle: 1 }, equipment: "ball", level: 1, cue: "Both feet, manipulate the ball in small spaces" },
  { id: "passing_wall", name: "Wall passing reps", targets: ["skill"], load: {}, equipment: "ball", level: 1, cue: "First touch out of your feet, weight the pass" },
];

/** Look up a drill's coaching info by (fuzzy) name — used by the coach chat. */
export function drillInfo(name: string): { name: string; cue: string; targets: GoalType[]; loadAreas: string[] } | null {
  const q = name.toLowerCase().trim();
  if (!q) return null;
  // Exact, or a substantial (>=4 char) substring match either way — avoids tiny
  // tokens like "is" matching inside a drill name.
  const d = LIBRARY.find((x) => x.name.toLowerCase() === q)
    ?? (q.length >= 4 ? LIBRARY.find((x) => q.includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(q)) : undefined);
  if (!d) return null;
  return { name: d.name, cue: d.cue, targets: d.targets, loadAreas: Object.keys(d.load).filter((a) => (d.load as Record<string, number>)[a] >= 2) };
}

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
}

/**
 * Rank drills for a goal while respecting current pain: drills that load a sore
 * joint are penalised (or excluded when pain is high), and the reason explains why.
 */
export function recommendDrills(input: RecommendInput): Recommendation[] {
  const pain = painByArea(input.painMap);
  const recent = new Set((input.recentDrillNames ?? []).map((n) => n.toLowerCase()));
  const soreAreas = (Object.keys(pain) as BodyArea[]).filter((a) => (pain[a] ?? 0) >= 4);

  const scored = LIBRARY.map((d) => {
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

    const sparesSore = soreAreas.length > 0 && soreAreas.every((a) => (d.load[a] ?? 0) <= 1);
    if (soreAreas.length && sparesSore && onGoal) score += 3; // reward smart substitutions

    return { d, score, hardAvoid, sparesSore };
  })
    .filter((s) => !s.hardAvoid && s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, input.count ?? 5).map(({ d, sparesSore }) => ({
    id: d.id,
    name: d.name,
    cue: d.cue,
    reason: buildReason(d, input.goal, soreAreas, sparesSore),
    ...prescription(d, input.goal),
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

function buildReason(d: DrillDef, goal: GoalType, soreAreas: BodyArea[], spares: boolean): string {
  const goalLabel = GOALS.find((g) => g.id === goal)?.label.toLowerCase() ?? goal;
  if (soreAreas.length && spares) {
    return `Develops ${goalLabel} with minimal load on your ${soreAreas.map(prettyArea).join(" / ")} while it's sore.`;
  }
  if (d.targets.includes(goal)) return `Direct ${goalLabel} work — ${d.cue.toLowerCase()}.`;
  return `Supports ${goalLabel} as a complement.`;
}

function prescription(d: DrillDef, goal: GoalType): { sets: number; reps: number } {
  if (goal === "endurance") return { sets: 1, reps: d.equipment === "bike" ? 8 : 6 };
  if (goal === "strength") return { sets: 4, reps: d.level >= 2 ? 6 : 8 };
  if (goal === "injury_recovery") return { sets: 3, reps: 12 };
  return { sets: 4, reps: d.level >= 3 ? 4 : 8 }; // speed/agility/skill
}

// --- Program generation -----------------------------------------------------

export interface ProgramDrill { name: string; sets: number; reps: number; cue: string; reason: string }
export interface ProgramSession { day: number; title: string; focus: GoalType; drills: ProgramDrill[] }
export interface ProgramWeek { week: number; theme: string; intensity: string; sessions: ProgramSession[] }
export interface ProgramPlan {
  goal: GoalType;
  summary: string;
  constraints: string[];
  weeks: ProgramWeek[];
  block?: number;
}

const THEMES = ["Base", "Build", "Peak", "Deload"];
const REHAB_THEMES = ["Protect & activate", "Controlled load", "Build capacity", "Return to sprint"];

export interface BuildProgramInput {
  goal: GoalType;
  painMap: PainMap;
  isInSeason?: boolean;
  daysPerWeek?: number;
  block?: number; // 1-based; each block progresses volume slightly
}

/** A 4-week block tailored to the goal, with pain-aware drill selection and a taper. */
export function buildProgram(input: BuildProgramInput): ProgramPlan {
  const block = Math.max(1, input.block ?? 1);
  const blockScale = 1 + (block - 1) * 0.08; // +8% volume per completed block
  const days = Math.max(2, Math.min(5, input.daysPerWeek ?? (input.goal === "endurance" ? 4 : 3)));
  const pain = painByArea(input.painMap);
  const sore = (Object.keys(pain) as BodyArea[]).filter((a) => (pain[a] ?? 0) >= 4);
  const rehab = input.goal === "injury_recovery";
  const themes = rehab ? REHAB_THEMES : THEMES;

  // Session focuses rotate the primary goal with a complementary stimulus.
  const focusRotation: GoalType[] =
    rehab ? ["injury_recovery", "injury_recovery", "endurance"]
    : input.goal === "endurance" ? ["endurance", "endurance", "strength", "endurance"]
    : [input.goal, "strength", input.goal === "speed" ? "agility" : "speed"];

  const weeks: ProgramWeek[] = THEMES.map((_, wi) => {
    const week = wi + 1;
    const isDeload = week === 4;
    const volScale = (input.isInSeason ? 0.7 : 1) * blockScale;
    const weekScale = isDeload ? 0.6 : 0.85 + week * 0.05;

    const sessions: ProgramSession[] = Array.from({ length: days }, (_, di) => {
      const focus = focusRotation[di % focusRotation.length];
      const recs = recommendDrills({ goal: focus, painMap: input.painMap, count: 3 });
      const drills: ProgramDrill[] = recs.map((r) => ({
        name: r.name,
        sets: Math.max(1, Math.round(r.sets * volScale * weekScale)),
        reps: r.reps,
        cue: r.cue,
        reason: r.reason,
      }));
      return { day: di + 1, title: sessionTitle(focus, di), focus, drills };
    });

    return { week, theme: themes[wi], intensity: isDeload ? "Light" : week >= 3 ? "High" : "Moderate", sessions };
  });

  return {
    goal: input.goal,
    summary: programSummary(input.goal, sore, input.isInSeason ?? false, block),
    constraints: sore.length ? [`Protecting your ${sore.map(prettyArea).join(", ")} — high-impact loading on these is dialled back.`] : [],
    weeks,
    block,
  };
}

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

function programSummary(goal: GoalType, sore: BodyArea[], inSeason: boolean, block: number): string {
  const g = GOALS.find((x) => x.id === goal)?.label ?? goal;
  const season = inSeason ? "in-season (recovery-weighted)" : "off-season (higher volume)";
  const blockNote = block > 1 ? ` Block ${block} — volume stepped up ${Math.round((block - 1) * 8)}% from your last block.` : "";
  const note = sore.length ? ` Built around your sore ${sore.map(prettyArea).join(" & ")}, swapping in lower-impact options.` : "";
  return `A 4-week ${g.toLowerCase()} block, ${season}, progressing Base → Build → Peak → Deload.${blockNote}${note}`;
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
      if (d.load_kg != null) {
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
