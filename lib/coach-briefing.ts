// =============================================================================
// Everything the coach should already know about you, before you ask.
//
// The chat was given four facts: your goal, the names of your sore areas, a
// readiness colour, and the names of the drills in your next session. So an
// athlete could ask "is my rehab plan going ok?" and be answered by something
// that had never seen their rehab plan — which is what was reported, and is a
// worse experience than having no coach at all. A coach who confidently answers
// a question it cannot see the evidence for is not a coach, it is a hazard.
//
// WHY A BRIEFING STRING RATHER THAN A JSON BLOB. The thing on the other end is
// a language model, and prose beats nested objects for it — "Left hamstring
// 6/10, reported 2 days ago, on stage 2 of a 4-stage protocol" carries the
// relationship between those numbers in a way `{area, level, days, stage}` does
// not. It is also readable in a log, which matters when somebody complains the
// coach said something odd and the only way to find out why is to see exactly
// what it was told.
//
// WHY IT IS BUILT HERE AND NOT IN THE EDGE FUNCTION. The function has a service
// key and could fetch all of this itself, which would be one round trip fewer.
// It would also be a second implementation of every derived number in the app —
// a second nutrition calculation, a second definition of "sore", a second
// strength ranking — and this codebase has already been bitten by exactly that
// (see the note at the top of lib/nutrition.ts about two calorie targets). The
// page has these numbers because it renders them; sending them costs a few
// hundred tokens and guarantees the coach is talking about the same athlete the
// screen is showing.
//
// OMISSION IS EXPLICIT. Every section says when it has nothing, because "no
// nutrition logged" and "nutrition not sent to the model" produce very
// different answers, and only one of them is honest.
// =============================================================================

import type { GoalType } from "./coach";
import type { EffortCheck } from "./effort";
import type { Bodyweight } from "./bodyweight";
import type { LiftRank, BodyPartStrength, WeakLink } from "./strength-standards";
import type { NutritionTargets } from "./nutrition";
import type { RecoveryProtocol } from "./essentials";

export interface BriefingInput {
  /** Who they are. */
  sport?: string | null;
  positions?: string[];
  focus?: string | null;
  sex?: "male" | "female" | null;
  bodyweight?: Bodyweight | null;

  /** The block. */
  goal?: GoalType | null;
  blockWeek?: number | null;
  adherencePct?: number | null;
  inSeason?: boolean;
  nextSessionTitle?: string | null;
  nextSessionDrills?: { name: string; prescription?: string; intensity?: string }[];
  effort?: EffortCheck | null;

  /** Today. */
  readinessStatus?: "Green" | "Yellow" | "Red" | null;
  readinessReason?: string | null;
  fatigue?: number | null;
  sleepQuality?: number | null;

  /** Where it hurts, already aged — see lib/pain.ts. */
  pain?: Record<string, number>;
  painReportedOn?: string | null;
  protocols?: RecoveryProtocol[];

  /** Fuel. */
  targets?: NutritionTargets | null;
  eatenToday?: { calories: number | null; protein: number | null } | null;
  avgCalories?: number | null;
  avgProtein?: number | null;

  /** Strength. */
  ranks?: LiftRank[];
  parts?: BodyPartStrength[];
  /**
   * The lagging muscle, WITH the lift that would move it — `weakestLink`
   * returns the suggestion alongside the tier, and dropping it would leave the
   * coach naming a problem it had been handed the fix for.
   */
  weak?: WeakLink | null;
  benchmarks?: Record<string, number>;
}

/** A section, rendered only when it has something to say. */
type Section = { heading: string; lines: string[] };

export function buildBriefing(a: BriefingInput): string {
  const sections: Section[] = [
    athlete(a), block(a), today(a), injuries(a), fuel(a), strength(a),
  ];
  return sections
    .filter((s) => s.lines.length > 0)
    .map((s) => `## ${s.heading}\n${s.lines.join("\n")}`)
    .join("\n\n");
}

function athlete(a: BriefingInput): Section {
  const lines: string[] = [];
  const who = [a.sport, a.positions?.length ? a.positions.join(" / ") : null].filter(Boolean).join(" — ");
  if (who) lines.push(`Plays: ${who}`);
  if (a.focus) lines.push(`Training focus: ${a.focus}`);
  if (a.bodyweight) {
    lines.push(`Bodyweight: ${a.bodyweight.kg}kg (from their ${a.bodyweight.source}${a.bodyweight.date ? ` on ${a.bodyweight.date}` : ""})`);
  } else {
    // Said out loud so the coach asks rather than guessing — every strength
    // standard in this app is a multiple of this number.
    lines.push("Bodyweight: not recorded. Strength ranks cannot be computed without it.");
  }
  return { heading: "Athlete", lines };
}

function block(a: BriefingInput): Section {
  const lines: string[] = [];
  if (a.goal) lines.push(`Current block: ${String(a.goal).replace("_", " ")}${a.inSeason ? ", in season" : ""}`);
  else lines.push("No active training block.");
  if (a.blockWeek) lines.push(`Week ${a.blockWeek} of the block.`);
  if (a.adherencePct != null) lines.push(`Sessions completed: ${a.adherencePct}% of the block so far.`);
  if (a.nextSessionTitle) lines.push(`Next session: ${a.nextSessionTitle}`);
  for (const d of a.nextSessionDrills ?? []) {
    lines.push(`  - ${d.name}${d.prescription ? ` — ${d.prescription}` : ""}${d.intensity ? ` @ ${d.intensity}` : ""}`);
  }
  // The verdict, not the raw numbers — it is already the conclusion.
  if (a.effort?.note) lines.push(`Effort check: ${a.effort.note}`);
  return { heading: "Training block", lines };
}

function today(a: BriefingInput): Section {
  const lines: string[] = [];
  if (a.readinessStatus) {
    lines.push(`Readiness: ${a.readinessStatus}${a.readinessReason ? ` — ${a.readinessReason}` : ""}`);
  } else {
    lines.push("No check-in today, so readiness is unknown.");
  }
  if (a.fatigue != null) lines.push(`Fatigue: ${a.fatigue}/10`);
  if (a.sleepQuality != null) lines.push(`Sleep quality: ${a.sleepQuality}/10`);
  return { heading: "Today", lines };
}

/**
 * THE SECTION THE COMPLAINT WAS ABOUT.
 *
 * Not just "sore areas: hamstring" — the level, how old the report is, and the
 * actual rehab protocol with its stages, so a question about the plan can be
 * answered from the plan.
 */
function injuries(a: BriefingInput): Section {
  const lines: string[] = [];
  const entries = Object.entries(a.pain ?? {}).filter(([, v]) => (Number(v) || 0) > 0);

  if (entries.length === 0) {
    lines.push("Nothing sore reported.");
    return { heading: "Injuries and pain", lines };
  }

  const when = a.painReportedOn ? ` (reported ${a.painReportedOn})` : "";
  lines.push(`Reported pain${when}:`);
  for (const [area, level] of entries.sort((x, y) => Number(y[1]) - Number(x[1]))) {
    lines.push(`  - ${area.replace(/_/g, " ")}: ${level}/10`);
  }

  for (const p of a.protocols ?? []) {
    lines.push(`Rehab protocol in play — "${p.title}" (${p.when}):`);
    for (const stage of p.stages ?? []) {
      lines.push(`  ${stage.phase} [${stage.window}] — ${stage.focus} Move on when: ${stage.criteria}`);
    }
    if (p.redFlags?.length) lines.push(`  Red flags to escalate: ${p.redFlags.join("; ")}`);
  }
  return { heading: "Injuries and pain", lines };
}

function fuel(a: BriefingInput): Section {
  const lines: string[] = [];
  if (a.targets) {
    lines.push(`Daily target: ${a.targets.calories} kcal, ${a.targets.protein}g protein, ${a.targets.carbs}g carbs, ${a.targets.fats}g fat.`);
  }
  if (a.eatenToday && (a.eatenToday.calories != null || a.eatenToday.protein != null)) {
    lines.push(`Eaten today: ${a.eatenToday.calories ?? 0} kcal, ${a.eatenToday.protein ?? 0}g protein.`);
  }
  if (a.avgCalories != null) {
    lines.push(`Recent average: ${a.avgCalories} kcal a day${a.avgProtein != null ? `, ${a.avgProtein}g protein` : ""}.`);
  }
  if (lines.length === 0) lines.push("No nutrition logged.");
  return { heading: "Nutrition", lines };
}

function strength(a: BriefingInput): Section {
  const lines: string[] = [];
  for (const r of (a.ranks ?? []).slice(0, 8)) {
    lines.push(`  - ${r.lift.label}: ${Math.round(r.best)}kg (${r.ratio.toFixed(2)}× bodyweight) — ${r.tier.name}${r.source === "tested" ? ", tested" : ""}`);
  }
  if (lines.length > 0) lines.unshift("Ranked lifts:");

  const ranked = (a.parts ?? []).filter((p) => p.tier);
  if (ranked.length > 0) {
    lines.push(`Body parts ranked: ${ranked.map((p) => `${p.muscle} ${p.tier!.name}`).join(", ")}`);
  }
  if (a.weak) {
    lines.push(
      `Weakest link: ${a.weak.muscle} at ${a.weak.tier.name}, ${a.weak.behind} tier${a.weak.behind === 1 ? "" : "s"} behind the rest. ` +
      `A lift that would move it: ${a.weak.suggest}.`);
  }
  const bench = Object.entries(a.benchmarks ?? {});
  if (bench.length > 0) {
    lines.push(`Tested benchmarks: ${bench.map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ")}`);
  }
  if (lines.length === 0) lines.push("No lifts ranked yet.");
  return { heading: "Strength and testing", lines };
}
