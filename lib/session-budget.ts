// =============================================================================
// The last safety rail on every generated programme.
//
// Selection, progression, weekly volume, custom exercise targets and AI repair
// all legitimately change a session. None of those passes can see what a later
// pass will add, so duration belongs at the boundary after all of them. This is
// deliberately deterministic: rebuilding a saved plan produces the same cuts.
// =============================================================================

import type { GoalType, ProgramDrill, ProgramPlan, ProgramSession, Slot } from "./engine";
import { contributesToMuscle, LANDMARKS, volumeBreakdown, type MuscleGroup } from "./muscle-volume";
import {
  drillSeconds,
  prescribedDurationMinutes,
  sessionSeconds,
  withPrescribedDurationMinutes,
} from "./session-time";

export const STANDARD_SESSION_MAX_MINUTES = 90;
export const ENDURANCE_SESSION_MAX_MINUTES = 120;
export const ACTIVE_REST_MAX_MINUTES = 60;
export const FINISHER_MAX_MINUTES = 30;

function isDedicatedEndurance(session: ProgramSession, goal: GoalType): boolean {
  return goal === "endurance"
    && session.focus === "endurance"
    && session.drills.filter((d) => d.slot === "primary" || d.slot === "secondary" || d.slot === "accessory").length === 0;
}

export function sessionBudgetMinutes(session: ProgramSession, goal: GoalType): number {
  return isDedicatedEndurance(session, goal)
    ? ENDURANCE_SESSION_MAX_MINUTES
    : STANDARD_SESSION_MAX_MINUTES;
}

function exactMinutes(session: ProgramSession): number {
  return sessionSeconds(session) / 60;
}

function withSets(drill: ProgramDrill, sets: number): ProgramDrill {
  const next = Math.max(1, Math.round(sets));
  const prescription = drill.prescription?.replace(/^\s*\d+\s*[×x]\s*/, `${next} × `);
  return { ...drill, sets: next, ...(prescription ? { prescription } : {}) };
}

function trimTimedDrill(drill: ProgramDrill, maxMinutes: number): ProgramDrill {
  const current = prescribedDurationMinutes(drill);
  if (current == null || current <= maxMinutes) return drill;
  return withPrescribedDurationMinutes(drill, maxMinutes);
}

type FitNode = {
  score: number;
  previous: FitNode | null;
  index: number;
  drill: ProgramDrill | null;
};

type FitOption = { drill: ProgramDrill | null; minutes: number; score: number };

function firstIndex(drills: ProgramDrill[], test: (drill: ProgramDrill) => boolean): number | null {
  const index = drills.findIndex(test);
  return index < 0 ? null : index;
}

/**
 * Pieces that make a session recognisably complete.
 *
 * The fit pass can choose among accessories, but it cannot "win" by dropping
 * the only warm-up, the session's main work, a prescribed rehab exercise, its
 * sport skill, or all conditioning/cool-down. Those are structural promises,
 * not low-scoring optional extras.
 */
function requiredPieces(drills: ProgramDrill[]): Set<number> {
  const required = new Set<number>();
  const keepFirst = (test: (drill: ProgramDrill) => boolean) => {
    const index = firstIndex(drills, test);
    if (index != null) required.add(index);
  };

  drills.forEach((drill, index) => {
    if (drill.rehab || drill.skill) required.add(index);
  });
  keepFirst((d) => d.slot === "warmup");
  keepFirst((d) => d.slot === "primary");
  if (![...required].some((i) => drills[i].slot === "primary")) keepFirst((d) => d.slot === "secondary");
  if (![...required].some((i) => ["primary", "secondary"].includes(drills[i].slot ?? ""))) {
    keepFirst((d) => d.slot == null && !d.skill);
  }
  keepFirst((d) => d.slot === "conditioning");
  keepFirst((d) => d.slot === "cooldown");
  if (required.size === 0 && drills.length) required.add(0);
  return required;
}

function valueOf(drill: ProgramDrill, index: number, drills: ProgramDrill[], session: ProgramSession, goal: GoalType): number {
  const slot: Slot | undefined = drill.slot;
  const base = drill.rehab ? 2200
    : drill.preferred ? 2100
    : drill.skill ? 1200
    : slot === "primary" ? 1900
    : slot === "secondary" ? 1100
    : slot === "conditioning" ? (session.focus === "endurance" || goal === "endurance" ? 1350 : 800)
    // THE FIRST ONE IS STRUCTURAL; THE REST ARE NICE TO HAVE.
    //
    // A flat 750 for every warm-up drill ranked all of them above accessory
    // work at 600 — so when the checklist started guaranteeing a warm-up on
    // every session (see lib/program-validate.ts), a tight time budget kept
    // three band exercises and dropped a working set to pay for them. Measured:
    // muscles reaching the productive band fell from 88% to 79%.
    //
    // Being warmed up at all is worth more than an accessory. The third
    // mobility drill is not.
    : slot === "warmup" ? (firstIndex(drills, (d) => d.slot === "warmup") === index ? 750 : 320)
    : slot === "accessory" ? 600
    : slot === "cooldown" ? (firstIndex(drills, (d) => d.slot === "cooldown") === index ? 450 : 200)
    : 700;
  // Stable tie-break: if two combinations deliver the same training value,
  // retain the exercise the programme ranked earlier.
  return base + (drills.length - index) / 100;
}

function optionsFor(
  drill: ProgramDrill,
  index: number,
  drills: ProgramDrill[],
  session: ProgramSession,
  goal: GoalType,
  required: boolean,
  capFinisher: boolean,
  fullDose: boolean,
): FitOption[] {
  let full = drill;
  if (capFinisher && drill.slot === "conditioning") {
    full = trimTimedDrill(drill, FINISHER_MAX_MINUTES);
  }

  const value = valueOf(full, index, drills, session, goal);
  const variants: ProgramDrill[] = [full];
  const floor = full.slot === "primary" ? 3 : full.slot === "secondary" || full.slot === "accessory" ? 2 : 1;
  if (!fullDose) {
    for (let sets = full.sets - 1; sets >= floor; sets -= 1) variants.push(withSets(full, sets));
  }

  const byMinute = new Map<number, FitOption>();
  for (const variant of variants) {
    const minutes = Math.max(1, Math.ceil(drillSeconds(variant) / 60));
    const doseRatio = Math.max(0.4, Math.min(1, variant.sets / Math.max(1, full.sets)));
    const option = { drill: variant, minutes, score: value * (0.68 + 0.32 * doseRatio) };
    const previous = byMinute.get(minutes);
    if (!previous || option.score > previous.score) byMinute.set(minutes, option);
  }
  const options = [...byMinute.values()];
  if (!required && !fullDose) options.push({ drill: null, minutes: 0, score: 0 });
  return options;
}

/**
 * Multiple-choice knapsack: for each prescribed exercise choose its full dose,
 * a viable reduced dose, or (only when optional) leave it out. The winning set
 * is the highest training value that fits the real time budget, not whatever
 * happens to remain after deleting rows from the bottom.
 */
function bestCombination(
  session: ProgramSession,
  goal: GoalType,
  maxMinutes: number,
  preserveFullMuscles: ReadonlySet<MuscleGroup>,
): ProgramDrill[] | null {
  const required = requiredPieces(session.drills);
  const hasMainWork = session.drills.some((d) => d.slot === "primary" || d.slot === "secondary" || d.slot === "accessory" || d.slot == null);
  let states = new Map<number, FitNode>([[0, { score: 0, previous: null, index: -1, drill: null }]]);

  session.drills.forEach((drill, index) => {
    const next = new Map<number, FitNode>();
    const choices = optionsFor(
      drill, index, session.drills, session, goal, required.has(index),
      hasMainWork && drill.slot === "conditioning",
      [...preserveFullMuscles].some((muscle) => contributesToMuscle(drill.name, muscle)),
    );
    for (const [used, state] of states) for (const choice of choices) {
      const minutes = used + choice.minutes;
      if (minutes > maxMinutes) continue;
      const score = state.score + choice.score;
      const incumbent = next.get(minutes);
      if (!incumbent || score > incumbent.score) {
        next.set(minutes, { score, previous: state, index, drill: choice.drill });
      }
    }
    states = next;
  });

  let winner: [number, FitNode] | null = null;
  for (const entry of states) {
    if (!winner || entry[1].score > winner[1].score || (entry[1].score === winner[1].score && entry[0] < winner[0])) winner = entry;
  }
  if (!winner) return null;

  const selected = new Array<ProgramDrill | null>(session.drills.length).fill(null);
  let node: FitNode | null = winner[1];
  while (node && node.index >= 0) {
    selected[node.index] = node.drill;
    node = node.previous;
  }
  return selected.filter((drill): drill is ProgramDrill => drill != null);
}

export function fitSessionToBudget(
  session: ProgramSession,
  goal: GoalType,
  preserveFullMuscles: ReadonlySet<MuscleGroup> = new Set<MuscleGroup>(),
): ProgramSession {
  if (session.kind === "active_rest") {
    return {
      ...session,
      durationMinutes: Math.min(ACTIVE_REST_MAX_MINUTES, Math.max(5, session.durationMinutes ?? 30)),
    };
  }

  const max = sessionBudgetMinutes(session, goal);
  const dedicatedEndurance = isDedicatedEndurance(session, goal);
  if (dedicatedEndurance && session.drills.length === 1) {
    // One minute is reserved for the transition/setup included by the estimator.
    return { ...session, drills: [trimTimedDrill(session.drills[0], max - 1)] };
  }
  if (exactMinutes(session) <= max) return session;

  const fitted = bestCombination(session, goal, max, preserveFullMuscles);
  if (fitted && fitted.length) return { ...session, drills: fitted };

  // Weekly volume locks can occasionally be mutually impossible inside one
  // pathological AI-written session. Fall back to the best ordinary fit, not
  // to a single exercise; preserving the complete session shape is safer than
  // pretending every hard constraint could be honoured at once.
  if (preserveFullMuscles.size > 0) {
    const ordinary = bestCombination(session, goal, max, new Set<MuscleGroup>());
    if (ordinary && ordinary.length) return { ...session, drills: ordinary };
  }

  // A malformed generated session can make its required pieces alone exceed
  // the budget (for example one 180-minute custom drill). Keep its highest
  // priority piece and make that dose honest rather than returning an overrun.
  const first = session.drills.find((d) => d.rehab || d.slot === "primary") ?? session.drills[0];
  return first ? { ...session, drills: [trimTimedDrill(first, max - 1)] } : session;
}

/** Apply real workload caps to every local, customised and AI-repaired plan. */
export function enforceProgramSessionBudgets(plan: ProgramPlan): ProgramPlan {
  return {
    ...plan,
    weeks: plan.weeks.map((week) => ({
      ...week,
      sessions: (() => {
        const originalDose = volumeBreakdown(week);
        const preserve = new Set<MuscleGroup>();
        let fitted = week.sessions.map((session) => fitSessionToBudget(session, plan.goal));

        // A time fit must not leave a token dose behind. Re-solve the week with
        // the original, already volume-balanced dose locked for any muscle that
        // fell below maintenance. One repair can expose the next weak link, so
        // accumulate constraints until the whole week fits at once. Other
        // accessories remain available to trade on every pass.
        for (let pass = 0; pass < Object.keys(originalDose.direct).length; pass += 1) {
          const fittedDose = volumeBreakdown({ ...week, sessions: fitted });
          const neglected = (Object.keys(originalDose.direct) as MuscleGroup[]).filter(
            (muscle) => originalDose.direct[muscle] > 0 && fittedDose.total[muscle] < LANDMARKS.maintenance,
          );
          const additions = neglected.filter((muscle) => !preserve.has(muscle));
          if (!additions.length) break;
          additions.forEach((muscle) => preserve.add(muscle));
          fitted = week.sessions.map((session) => fitSessionToBudget(session, plan.goal, preserve));
        }
        return fitted;
      })(),
    })),
  };
}
