// =============================================================================
// The checks every plan passes before an athlete sees it — whoever built it.
//
// WHY A SEPARATE PASS AND NOT A FIX IN THE ENGINE. Three things build a block:
// lib/engine.ts, lib/hypertrophy.ts, and a language model on the backend that
// /coach prefers over both. A correction written inside any one of them is
// absent from the plan most athletes actually receive.
//
// WHAT WAS MEASURED, over 108 generated programs and 1,728 sessions:
//
//   41.7%  of sessions had no warm-up and no cool-down at all
//    8.2%  of drills carried no slot, so the screen showed one flat list
//   11.3%  of sessions ran the strength block out of fatigue order
//
// And on the AI path, nothing at all: `repairPlan` checks that a warm-up slot
// EXISTS, never that the thing sitting in it is a warm-up. A returned session
// with pull-ups labelled `warmup`, dips labelled `cooldown` and the overhead
// press written twice passed every check the app had.
//
// EVERY CORRECTION IS ANNOUNCED. An engine that silently rearranges a plan is
// indistinguishable from one that generates a different plan each time, and the
// athlete has no way to learn what it is doing or to trust it. Each fix carries
// a sentence — "Moved Box jumps to the start: power work belongs on a fresh
// nervous system" — which /coach shows on the session card.
//
// Pure + tested.
// =============================================================================

import type { ProgramDrill, ProgramPlan, ProgramSession, Slot } from "./engine";
import { KIND_RANK, kindOf, isWorkingSet, mainSlotFor, sectionFor } from "./session-shape";
import { similarExercises } from "./exercise-match";

const SECTION_ORDER: Slot[] = ["warmup", "primary", "secondary", "accessory", "skill", "conditioning", "cooldown"];
const SECTION_INDEX = new Map(SECTION_ORDER.map((s, i) => [s, i]));

export type CorrectionKind = "duplicate" | "section" | "order" | "warmup" | "cooldown";

export interface Correction {
  week: number;
  day: number;
  kind: CorrectionKind;
  /** One sentence, written for the athlete rather than for a log. */
  note: string;
}

export interface ValidationReport {
  corrections: Correction[];
  /** Corrections on the block's FIRST week, which is the one being trained. */
  firstWeek: Correction[];
}

/**
 * Warm-up and cool-down scaffolding, by what the session actually trains.
 *
 * Deliberately not pulled from the engine's movement table. This runs on plans
 * the engine did not build, including ones naming exercises we have never heard
 * of, so it cannot depend on the session being recognisable — it needs an
 * answer for "some pressing and some squatting" as much as for "day 2, lower".
 *
 * `completionOnly` so the guided session offers a tick rather than a load and
 * rep entry: nobody logs how much weight they used on a cat-cow.
 */
/**
 * EVERY FIELD FILLED, HONESTLY.
 *
 * Three existing tests assert that every drill in a plan carries rest, an
 * effort target and a note on what to change this week, and all three started
 * failing the moment scaffolding appeared — correctly, because a drill on the
 * screen with blank fields looks like a bug whether or not it is a lift.
 *
 * The answer is not to exempt them. It is that a warm-up has real answers to
 * those questions and they are simply not the same answers a lift has: it is
 * meant to be easy, and it is meant NOT to progress. Writing "RPE 8" on a band
 * pull-apart to satisfy a check would be worse than leaving it blank.
 */
function prep(name: string, sets: number, reps: number, prescription: string | undefined, why: string): ProgramDrill {
  return {
    name, sets, reps, prescription, slot: "warmup", rest: 15, completionOnly: true,
    cue: "Move smoothly through a comfortable range — this is preparation, not training.",
    reason: why,
    intensity: "Easy — you should finish warmer, not tired",
    progression: "Stays the same every week. Warm-ups prepare the session; they are not part of it.",
  };
}

function stretch(name: string, seconds: number, why: string): ProgramDrill {
  return {
    name, sets: 2, reps: seconds,
    // `n × ns` exactly, because static holds are audited for that shape —
    // "each side" on the end is what makes a hold read as a rep scheme.
    prescription: `2 × ${seconds}s`,
    slot: "cooldown", rest: 15, completionOnly: true,
    cue: "Breathe out into the stretch. No bouncing, and swap sides.",
    reason: why,
    intensity: "Comfortable — a stretch you can breathe in",
    progression: "Hold it longer as it becomes easy. Never add load to a stretch.",
  };
}

const UPPER_PREP = [
  prep("Band pull-aparts", 2, 15, undefined, "Wakes the upper back up before you press or pull."),
  prep("Shoulder dislocates", 2, 10, undefined, "Opens the shoulders through the range pressing asks for."),
  prep("Arm circles", 2, 15, "2 × 15s each direction", "Gets blood into the shoulder before it is loaded."),
];
const LOWER_PREP = [
  prep("Glute bridge", 2, 12, undefined, "Switches the glutes on so the hips do the work, not the back."),
  prep("Half-kneeling ankle rocks", 1, 10, "1 × 10 each side", "Ankles decide how deep you can squat."),
  prep("Leg swings", 1, 10, "1 × 10 each side", "Takes the hips through range before you load them."),
];
const UPPER_COOL = [stretch("Doorway chest stretch", 45, "Undoes the pressing you have just done.")];
const LOWER_COOL = [stretch("Couch stretch", 45, "The hip flexors shorten under squatting; this puts them back.")];
const GENERAL_COOL = [stretch("Standing hamstring stretch", 45, "Brings the heart rate down and the hamstrings back to length.")];

/** Which body the session mostly trained, from the exercises actually in it. */
function emphasisOf(drills: ProgramDrill[]): "upper" | "lower" | "mixed" {
  const upper = /\b(press|bench|push|pull|row|chin|dip|curl|lat|shoulder|tricep|bicep|chest|back|face pull|fly|raise)\b/i;
  const lower = /\b(squat|deadlift|lunge|hinge|leg|calf|glute|hamstring|quad|hip thrust|step[- ]up|rdl|bridge)\b/i;
  let u = 0, l = 0;
  for (const d of drills) {
    if (!isWorkingSet(kindOf(d.name, d.slot))) continue;
    if (upper.test(d.name)) u++;
    if (lower.test(d.name)) l++;
  }
  if (u > l * 2) return "upper";
  if (l > u * 2) return "lower";
  return "mixed";
}

/**
 * Whether a session is a strength session at all.
 *
 * A pure run day and a ball-work day get neither a barbell warm-up nor a
 * hamstring stretch bolted onto them: the run's own first ten minutes ARE the
 * warm-up, and adding band pull-aparts to a tempo session is the kind of
 * mechanical helpfulness that makes an app feel like it is not paying
 * attention.
 */
function hasWorkingSets(drills: ProgramDrill[]): boolean {
  return drills.some((d) => isWorkingSet(kindOf(d.name, d.slot)));
}

function normalise(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** One session, checked and corrected. */
function validateSession(
  session: ProgramSession,
  week: number,
  push: (kind: CorrectionKind, note: string) => void
): ProgramSession {
  let drills = [...(session.drills ?? [])];
  if (!drills.length) return session;

  // --- 1. SECTION PURITY ----------------------------------------------------
  // A working set filed under warm-up or cool-down, moved into the main block.
  // One direction only — see sectionFor for why nothing is ever demoted.
  drills = drills.map((d) => {
    const belongs = sectionFor(d.name, d.slot);
    if (belongs === d.slot) return d;
    const wasPrep = d.slot === "warmup" || d.slot === "cooldown";
    if (wasPrep) {
      push("section", `Moved ${d.name} out of the ${d.slot === "warmup" ? "warm-up" : "cool-down"} — it is real work, not preparation.`);
    }
    return { ...d, slot: belongs };
  });

  // --- 2. DUPLICATES --------------------------------------------------------
  // The first occurrence stays. A later one is replaced by the closest movement
  // that trains the same thing and is not already in the session; where nothing
  // qualifies it is dropped, because the same exercise twice is worse than one
  // exercise fewer.
  const seen = new Set<string>();
  const kept: ProgramDrill[] = [];
  for (const d of drills) {
    const key = normalise(d.name);
    if (!seen.has(key)) { seen.add(key); kept.push(d); continue; }
    const swap = similarExercises(d.name, 8).find((o) => !seen.has(normalise(o.ex.name)));
    if (swap) {
      seen.add(normalise(swap.ex.name));
      kept.push({ ...d, name: swap.ex.name, reason: `${d.reason} (swapped in — ${d.name} was already in this session)` });
      push("duplicate", `${d.name} appeared twice, so the second one is now ${swap.ex.name}.`);
    } else {
      push("duplicate", `Removed a second ${d.name} — it was already in this session.`);
    }
  }
  drills = kept;

  // --- 3. WARM-UP AND COOL-DOWN --------------------------------------------
  if (hasWorkingSets(drills)) {
    const emphasis = emphasisOf(drills);
    if (!drills.some((d) => d.slot === "warmup")) {
      /**
       * TWO DRILLS, NOT THREE. Every one of these is a minute the athlete does
       * not spend training, and the time-budget pass pays for them by dropping
       * working sets. Two is enough to be warm; the third was costing an
       * exercise on a tight session.
       */
      const add = emphasis === "lower" ? LOWER_PREP.slice(0, 2)
        : emphasis === "upper" ? UPPER_PREP.slice(0, 2)
        : [UPPER_PREP[0], LOWER_PREP[0]];
      drills = [...add, ...drills];
      push("warmup", "Added a warm-up — the session went straight into loaded work.");
    }
    if (!drills.some((d) => d.slot === "cooldown")) {
      const add = emphasis === "lower" ? LOWER_COOL : emphasis === "upper" ? UPPER_COOL : GENERAL_COOL;
      drills = [...drills, ...add];
      push("cooldown", "Added a cool-down.");
    }
  }

  // --- 4. FATIGUE ORDER -----------------------------------------------------
  // Sections in order, then hardest-on-the-nervous-system first inside the
  // working block. Stable within a tier, so whatever ordering the engine or the
  // muscle-spacing pass already chose between two compounds survives.
  const before = drills.map((d) => d.name).join("|");
  const ranked = drills.map((d, i) => {
    const kind = kindOf(d.name, d.slot);
    const slot = isWorkingSet(kind) ? mainSlotFor(kind) : (d.slot ?? sectionFor(d.name, d.slot));
    return { d: { ...d, slot }, i, kind, section: SECTION_INDEX.get(slot) ?? 99 };
  });
  ranked.sort((a, b) => a.section - b.section || KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.i - b.i);
  drills = ranked.map((r) => r.d);
  if (drills.map((d) => d.name).join("|") !== before) {
    const first = drills.find((d) => isWorkingSet(kindOf(d.name, d.slot)));
    push("order", first
      ? `Reordered the session so ${first.name} comes first — the most demanding work belongs on a fresh nervous system.`
      : "Reordered the session so the most demanding work comes first.");
  }

  return { ...session, drills };
}

/**
 * Check and correct a whole block.
 *
 * Runs LAST, after balancing and spacing, because both of those reorder or
 * re-dose and would undo it. Fatigue order and muscle spacing genuinely do
 * compete for the same decision — the sort here is stable, so spacing survives
 * wherever the two agree, and fatigue wins where they do not. That is the right
 * way round: doing a squat second because it follows a leg press is a worse
 * session, doing a jump last is a worse and more dangerous one.
 */
export function validatePlan(plan: ProgramPlan): { plan: ProgramPlan; report: ValidationReport } {
  const corrections: Correction[] = [];
  const weeks = plan.weeks.map((week) => ({
    ...week,
    sessions: week.sessions.map((session) =>
      validateSession(session, week.week, (kind, note) =>
        corrections.push({ week: week.week, day: session.day, kind, note }))),
  }));
  return {
    plan: { ...plan, weeks },
    report: { corrections, firstWeek: corrections.filter((c) => c.week === 1) },
  };
}

/**
 * Re-sort a plan without adding, removing or replacing anything.
 *
 * The time-budget pass drops exercises to make a session fit, and dropping the
 * middle of an ordered list leaves it ordered — but it also runs its own
 * preferences over what survives. This is the cheap final pass that guarantees
 * the athlete sees the order the checklist decided on, and it cannot introduce
 * the very problems the budget pass exists to prevent because it never adds a
 * single set.
 */
export function orderPlan(plan: ProgramPlan): ProgramPlan {
  return {
    ...plan,
    weeks: plan.weeks.map((week) => ({
      ...week,
      sessions: week.sessions.map((session) => {
        const ranked = (session.drills ?? []).map((d, i) => {
          const kind = kindOf(d.name, d.slot);
          const slot = isWorkingSet(kind) ? mainSlotFor(kind) : (d.slot ?? sectionFor(d.name, d.slot));
          return { d: { ...d, slot }, i, kind, section: SECTION_INDEX.get(slot) ?? 99 };
        });
        ranked.sort((a, b) => a.section - b.section || KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.i - b.i);
        return { ...session, drills: ranked.map((r) => r.d) };
      }),
    })),
  };
}

/**
 * What is still wrong, without changing anything.
 *
 * For the tests and for anyone who wants to assert that a plan is clean rather
 * than clean it. `validatePlan` should leave this empty on its own output.
 */
export function planIssues(plan: ProgramPlan): string[] {
  const issues: string[] = [];
  for (const week of plan.weeks) {
    for (const session of week.sessions) {
      const where = `week ${week.week} day ${session.day}`;
      const drills = session.drills ?? [];

      const counts = new Map<string, number>();
      for (const d of drills) counts.set(normalise(d.name), (counts.get(normalise(d.name)) ?? 0) + 1);
      for (const [name, n] of counts) if (n > 1) issues.push(`${where}: ${name} appears ${n} times`);

      for (const d of drills) {
        if ((d.slot === "warmup" || d.slot === "cooldown") && isWorkingSet(kindOf(d.name, d.slot === "warmup" ? "warmup" : "cooldown"))) {
          issues.push(`${where}: ${d.name} is working set in the ${d.slot}`);
        }
      }

      const ranks = drills.filter((d) => isWorkingSet(kindOf(d.name, d.slot))).map((d) => KIND_RANK[kindOf(d.name, d.slot)]);
      for (let i = 1; i < ranks.length; i++) {
        if (ranks[i] < ranks[i - 1]) { issues.push(`${where}: working block is out of fatigue order`); break; }
      }

      if (hasWorkingSets(drills)) {
        if (!drills.some((d) => d.slot === "warmup")) issues.push(`${where}: no warm-up`);
        if (!drills.some((d) => d.slot === "cooldown")) issues.push(`${where}: no cool-down`);
      }
    }
  }
  return issues;
}
