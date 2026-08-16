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
  /**
   * What they have ALREADY done today, if anything.
   *
   * The briefing described the next session and never whether the athlete had
   * just finished one — so a question asked an hour after training got answered
   * as though the day had not started, with the coach recommending the session
   * they had already done. The training log for today is one row and every page
   * that builds a briefing already has it.
   */
  trainedToday?: { title?: string | null; minutes?: number | null; intensity?: number | null } | null;
  nextSessionDrills?: { name: string; prescription?: string; intensity?: string }[];
  /**
   * EVERY exercise the block actually prescribes, deduplicated.
   *
   * Without this the briefing carried ONE session, and a question about the
   * programme as a whole had almost nothing behind it — so the coach filled the
   * gap with plausible gym exercises and told an athlete their preacher curls
   * were going well. They had never been prescribed a preacher curl. An
   * invented specific is worse than a general answer, because it reads as
   * evidence the coach has actually looked.
   */
  programExercises?: string[];
  /** What they have actually logged recently, which is what "going well" is about. */
  loggedExercises?: string[];
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
  /**
   * THE ATHLETE'S OWN GENERATED PLAN, which is not the same thing as `protocols`.
   *
   * `protocols` are the app's static guidance for a body area — good, generic,
   * and identical for everybody with a sore hamstring. This is the graded
   * loading plan written for THIS injury, with the stage they are actually on.
   *
   * Its absence was the whole of "it's not reading my injury plan in ask
   * coach": the coach had the textbook and not the athlete's notes, so it
   * answered about hamstrings in general when it had been asked about theirs.
   */
  rehab?: string | null;

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
  /**
   * THE CLOSED LIST. Named as one, on purpose: the model has to be able to tell
   * "these are the only exercises in the programme" from "here are some
   * examples", and a bare list reads as the second.
   */
  if (a.programExercises?.length) {
    lines.push(`The block prescribes exactly these ${a.programExercises.length} exercises and no others:`);
    lines.push(`  ${a.programExercises.join(", ")}`);
    /**
     * THE RULE TRAVELS WITH THE LIST, IN THE BRIEFING ITSELF.
     *
     * It was written into the coach-chat Edge Function's system prompt, which
     * would have been the right home if that function served the request. It
     * does not: `invokeAI` prefers the Cloudflare Worker whenever
     * NEXT_PUBLIC_API_URL is set, the Worker answers /coach-chat, and its
     * source is not in this repository — so a rule living in the Supabase
     * function's prompt could never fire, and deploying that function would
     * not have changed anything.
     *
     * The briefing is built here, in the browser, and sent with every question.
     * Putting the instruction beside the data it governs means it reaches
     * whatever backend is actually serving the call, today, with no deploy —
     * and keeps working if the routing changes again.
     */
    lines.push(
      "RULE: that list is complete. Do not name any exercise as being in their programme, " +
      "or comment on how it is going, unless it appears above or in what they have logged. " +
      "To suggest something new, say plainly that it is a suggestion and not currently prescribed.",
    );
  } else {
    lines.push("The block's exercise list is not available, so do not describe what it contains.");
  }

  if (a.loggedExercises?.length) {
    lines.push(`Actually logged recently: ${a.loggedExercises.join(", ")}.`);
  } else {
    lines.push("Nothing logged recently, so there is no evidence about how any exercise is going.");
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

  /**
   * ALREADY TRAINED, said plainly and with an instruction attached.
   *
   * The model will otherwise keep recommending today's session to somebody who
   * has done it — the briefing gave it every reason to and nothing to stop it.
   */
  if (a.trainedToday) {
    const bits = [
      a.trainedToday.title ? `"${a.trainedToday.title}"` : null,
      a.trainedToday.minutes ? `${a.trainedToday.minutes} min` : null,
      a.trainedToday.intensity != null ? `they rated it ${a.trainedToday.intensity}/10` : null,
    ].filter(Boolean);
    lines.push(
      `ALREADY TRAINED TODAY${bits.length ? `: ${bits.join(", ")}` : "."} ` +
      `Do not tell them to do today's session — it is done. Talk about recovery, tomorrow, or what they asked.`,
    );
  } else {
    lines.push("Not trained yet today.");
  }
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

  /**
   * THE ATHLETE'S OWN PLAN GOES FIRST, and it goes in even when nothing is
   * sore today. Somebody three weeks into a hamstring rehab who has a good
   * morning still has a hamstring rehab, and the old order returned early on
   * "nothing sore reported" — so the plan they asked about was omitted exactly
   * on the days they felt well enough to ask what to do next.
   */
  if (a.rehab) lines.push(a.rehab);

  if (entries.length === 0) {
    lines.push(a.rehab
      ? "Nothing sore reported today, which does not end the plan above."
      : "Nothing sore reported.");
    return { heading: "Injuries and pain", lines };
  }

  const when = a.painReportedOn ? ` (reported ${a.painReportedOn})` : "";
  lines.push(`Reported pain${when}:`);
  for (const [area, level] of entries.sort((x, y) => Number(y[1]) - Number(x[1]))) {
    lines.push(`  - ${area.replace(/_/g, " ")}: ${level}/10`);
  }

  // The app's generic guidance for the area, AFTER their own plan — it is the
  // textbook, and the plan above is their notes.
  for (const p of a.protocols ?? []) {
    lines.push(`General protocol for this area — "${p.title}" (${p.when}):`);
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
