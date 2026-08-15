// =============================================================================
// Strength standards: what your lifts are worth, and which parts of you are
// strong.
//
// The app could already tell you your squat was going up. It could not tell you
// whether your squat was GOOD, which is the question people actually want
// answered — "am I strong?" is a comparison, and a line going up is not one.
//
// RELATIVE TO BODYWEIGHT, NOT ABSOLUTE, and this is the whole design.
//
// The ranked-gym charts going round social media give absolute numbers: a 215lb
// overhead press is "Olympian", 40lb is "Wood". That is a chart for one person.
// A 100kg man and a 55kg woman do not share an overhead press standard, and
// pretending they do means the ladder tells the big athlete they are elite for
// being big and tells the small one they are hopeless for being small. Neither
// message is true and neither is useful.
//
// Strength coaches have measured this properly for decades and the answer is
// multiples of bodyweight, adjusted by sex. A 1.5x bodyweight squat is the same
// achievement at 60kg as at 100kg, which is exactly what a standard is for. The
// app already knows bodyweight and sex, so nothing extra is asked of anybody.
//
// A DIFFERENT VOCABULARY FROM THE XP LADDER, ON PURPOSE. lib/gamification.ts
// already owns Iron, Bronze, Silver, Gold, Platinum, Emerald, Diamond,
// Champion, Legend, Elite and Apex. Reusing those words here would make "Gold"
// mean two unrelated things on the same screen — your level says Gold II, your
// bench says Gold, and they have nothing to do with each other. This codebase
// has been bitten by one vocabulary meaning two things before. So strength
// borrows the language lifters already use for it.
//
// Pure + tested.
// =============================================================================

import { estimate1RM, exerciseKey } from "./exercise-stats";
import { setsOf } from "./training-sets";
import type { MuscleGroup } from "./hypertrophy";
import type { TrainingLog } from "./types";

export type Sex = "male" | "female";

export interface StrengthTier {
  name: string;
  /** 0 = untrained. Used for ordering, XP and colour. */
  index: number;
  color: string;
  blurb: string;
}

/**
 * Seven rungs, named the way strength is actually described.
 *
 * "Intermediate" is not as exciting as "Titan", and it is chosen anyway: an
 * athlete who reads "Advanced" next to their deadlift can look that word up and
 * find the same standard everywhere else in the sport. A made-up word ranks you
 * against nothing. The engagement is supposed to come from the ladder being
 * real and from watching a body light up as you climb it, not from the noun.
 */
export const STRENGTH_TIERS: StrengthTier[] = [
  { name: "Untrained", index: 0, color: "#8d9299", blurb: "Everyone starts here" },
  { name: "Novice", index: 1, color: "#c07a44", blurb: "A few months of honest training" },
  { name: "Intermediate", index: 2, color: "#c3ccd8", blurb: "A year or two in, and it shows" },
  { name: "Advanced", index: 3, color: "#e3b53f", blurb: "Stronger than most people in any gym" },
  { name: "Exceptional", index: 4, color: "#5fd3c4", blurb: "Competitive-level strength" },
  { name: "Master", index: 5, color: "#7cc6ff", blurb: "Very few people lift this" },
  { name: "World Class", index: 6, color: "#c084fc", blurb: "The top of the sport" },
];

export const TOP_TIER = STRENGTH_TIERS.length - 1;

export function tierAt(index: number): StrengthTier {
  return STRENGTH_TIERS[Math.max(0, Math.min(TOP_TIER, Math.round(index)))];
}

/**
 * A lift the app can rank, and what it takes.
 *
 * Six thresholds per sex, as multiples of bodyweight, each being the entry
 * point to the tier of the same position — clear the first and you are a
 * Novice, clear the last and you are World Class.
 *
 * THESE ARE APPROXIMATE POPULATION STANDARDS, not measurements of this app's
 * users, and they are stated as such on screen. They line up with the figures
 * strength coaches and the well-known standards tables have used for years;
 * they are not precise to the kilo and no standard is. What they have to be is
 * honest about the SHAPE — a deadlift standard above a squat standard above a
 * bench standard, women's upper-body multiples further below men's than their
 * lower-body ones, because that is the actual population difference and
 * flattening it would quietly tell every woman she is worse at pressing than
 * she is.
 */
export interface LiftStandard {
  key: string;
  label: string;
  /** Names in the training log that count as this lift, lower-cased. */
  aliases: string[];
  /** What it trains. Drives the body figure. */
  muscles: MuscleGroup[];
  /** Bodyweight multiples for tiers 1..6. */
  male: number[];
  female: number[];
}

export const LIFT_STANDARDS: LiftStandard[] = [
  {
    key: "squat",
    label: "Back squat",
    aliases: ["back squat", "squat", "barbell squat", "barbell back squat", "high bar squat", "low bar squat"],
    muscles: ["quads", "glutes"],
    male: [0.75, 1.25, 1.75, 2.25, 2.75, 3.25],
    female: [0.5, 0.9, 1.3, 1.7, 2.1, 2.5],
  },
  {
    key: "front_squat",
    label: "Front squat",
    aliases: ["front squat", "barbell front squat"],
    muscles: ["quads", "glutes", "core"],
    male: [0.6, 1.0, 1.4, 1.8, 2.2, 2.6],
    female: [0.4, 0.7, 1.05, 1.35, 1.7, 2.0],
  },
  {
    key: "deadlift",
    label: "Deadlift",
    aliases: ["deadlift", "barbell deadlift", "conventional deadlift", "sumo deadlift"],
    muscles: ["hamstrings", "glutes", "back"],
    male: [1.0, 1.5, 2.1, 2.6, 3.1, 3.6],
    female: [0.6, 1.0, 1.5, 2.0, 2.4, 2.8],
  },
  {
    key: "romanian_deadlift",
    label: "Romanian deadlift",
    aliases: ["romanian deadlift", "rdl", "barbell rdl", "stiff leg deadlift"],
    muscles: ["hamstrings", "glutes"],
    male: [0.7, 1.1, 1.6, 2.0, 2.4, 2.8],
    female: [0.45, 0.75, 1.1, 1.45, 1.8, 2.1],
  },
  {
    key: "bench",
    label: "Bench press",
    aliases: ["bench press", "bench", "barbell bench press", "flat bench press", "flat barbell bench press"],
    muscles: ["chest", "triceps", "shoulders"],
    male: [0.5, 0.85, 1.25, 1.65, 2.0, 2.4],
    female: [0.3, 0.5, 0.75, 1.0, 1.25, 1.5],
  },
  {
    key: "ohp",
    label: "Overhead press",
    aliases: ["overhead press", "ohp", "military press", "strict press", "barbell overhead press", "standing press", "shoulder press"],
    muscles: ["shoulders", "triceps"],
    male: [0.35, 0.55, 0.8, 1.0, 1.2, 1.45],
    female: [0.2, 0.35, 0.5, 0.65, 0.8, 0.95],
  },
  {
    key: "row",
    label: "Barbell row",
    aliases: ["barbell row", "bent over row", "bent-over row", "pendlay row", "barbell bent over row"],
    muscles: ["back", "biceps"],
    male: [0.5, 0.8, 1.15, 1.5, 1.8, 2.1],
    female: [0.3, 0.5, 0.75, 1.0, 1.2, 1.4],
  },
  {
    key: "hip_thrust",
    label: "Hip thrust",
    aliases: ["hip thrust", "barbell hip thrust", "glute bridge"],
    muscles: ["glutes"],
    male: [1.0, 1.6, 2.3, 3.0, 3.6, 4.2],
    female: [0.8, 1.3, 1.9, 2.5, 3.0, 3.5],
  },
];

const STANDARD_BY_ALIAS = new Map<string, LiftStandard>();
for (const lift of LIFT_STANDARDS) {
  for (const alias of lift.aliases) STANDARD_BY_ALIAS.set(exerciseKey(alias), lift);
}

/** The rankable lift a logged drill name refers to, if any. */
export function standardFor(name: string): LiftStandard | null {
  return STANDARD_BY_ALIAS.get(exerciseKey(name)) ?? null;
}

// --- ranking a lift -----------------------------------------------------------

export interface LiftRank {
  lift: LiftStandard;
  /** Best estimated 1RM seen, in kg. */
  best: number;
  /** Bodyweight multiple that represents. */
  ratio: number;
  tier: StrengthTier;
  /** kg still to lift to reach the next tier. Null at the top. */
  toNextKg: number | null;
  nextTier: StrengthTier | null;
  /** 0..1 through the current tier. 1 at the top tier. */
  progress: number;
  lastDate: string;
}

/**
 * Where a lift sits, given who is lifting it.
 *
 * Returns null rather than guessing when bodyweight is unknown: a ratio needs a
 * denominator, and inventing one would rank someone against a stranger. The UI
 * asks for weight instead, which is a question with an obvious answer.
 */
export function rankLift(
  lift: LiftStandard,
  best1RM: number,
  bodyweightKg: number,
  sex: Sex,
): Omit<LiftRank, "lift" | "lastDate"> | null {
  if (!(bodyweightKg > 0) || !(best1RM > 0)) return null;
  const thresholds = sex === "female" ? lift.female : lift.male;
  const ratio = best1RM / bodyweightKg;

  // How many thresholds are cleared. Index 0 is Untrained, so a lift clearing
  // none of them still ranks — everybody starts somewhere and a zero is not a
  // verdict on a person.
  let index = 0;
  for (let i = 0; i < thresholds.length; i++) if (ratio >= thresholds[i]) index = i + 1;

  const tier = tierAt(index);
  if (index >= TOP_TIER) {
    return { best: best1RM, ratio, tier, toNextKg: null, nextTier: null, progress: 1 };
  }

  const floor = index === 0 ? 0 : thresholds[index - 1];
  const ceiling = thresholds[index];
  const span = ceiling - floor;
  return {
    best: best1RM,
    ratio,
    tier,
    nextTier: tierAt(index + 1),
    toNextKg: Math.max(0, Math.round((ceiling * bodyweightKg - best1RM) * 10) / 10),
    progress: span > 0 ? Math.max(0, Math.min(1, (ratio - floor) / span)) : 0,
  };
}

/**
 * Every rankable lift in the log, best effort first.
 *
 * BEST EVER, not most recent. A rank you can lose by having a bad Tuesday is a
 * rank that punishes training on tired legs, and this app already decided that
 * argument once when XP was made monotonic — see `computeXp`. You lifted it;
 * nothing that happens afterwards makes that un-happen.
 */
export function rankedLifts(
  logs: TrainingLog[] | null | undefined,
  bodyweightKg: number,
  sex: Sex,
): LiftRank[] {
  const best = new Map<string, { value: number; date: string; lift: LiftStandard }>();

  for (const log of logs ?? []) {
    for (const drill of log.drills ?? []) {
      const lift = standardFor(String(drill.name ?? ""));
      if (!lift) continue;
      // Every set is a candidate, because the top set is not always the best
      // effort — 5 at 100kg estimates higher than 1 at 105kg.
      for (const set of setsOf(drill)) {
        if (set.load_kg == null || set.load_kg <= 0) continue;
        const e1rm = estimate1RM(set.load_kg, set.reps);
        if (e1rm == null) continue;
        const seen = best.get(lift.key);
        if (!seen || e1rm > seen.value) {
          best.set(lift.key, { value: e1rm, date: String(log.log_date ?? ""), lift });
        }
      }
    }
  }

  const out: LiftRank[] = [];
  for (const { value, date, lift } of best.values()) {
    const rank = rankLift(lift, value, bodyweightKg, sex);
    if (rank) out.push({ ...rank, lift, lastDate: date });
  }
  return out.sort((a, b) => b.tier.index - a.tier.index || b.ratio - a.ratio);
}

// --- ranking a body part ------------------------------------------------------

export interface BodyPartStrength {
  muscle: MuscleGroup;
  /** Null when nothing that trains this has ever been ranked. */
  tier: StrengthTier | null;
  /** The lift that earned it. */
  from: string | null;
  /** 0..1 toward the next tier, for the ring on the figure. */
  progress: number;
}

/**
 * How strong each part of the body is, from the lifts that train it.
 *
 * NOT TESTED IS NOT UNTRAINED, and keeping them apart is the point. A muscle
 * with no ranked lift returns a null tier, not a zero — "we have never seen you
 * train this" and "you are weak here" are different sentences, and showing the
 * second when the first is true is how a progress screen starts lying to
 * somebody. This codebase has made exactly that mistake before, in the funnel,
 * where an absent step read as a catastrophic drop to zero.
 *
 * The best tier wins rather than the average. A muscle is as strong as the
 * hardest thing it has done; averaging in a light accessory lift would mean
 * training a muscle MORE could lower its rank, which is absurd on its face.
 */
export function bodyPartStrength(ranks: LiftRank[]): BodyPartStrength[] {
  const byMuscle = new Map<MuscleGroup, { tier: StrengthTier; from: string; progress: number }>();

  for (const rank of ranks) {
    for (const muscle of rank.lift.muscles) {
      const seen = byMuscle.get(muscle);
      if (!seen || rank.tier.index > seen.tier.index
        || (rank.tier.index === seen.tier.index && rank.progress > seen.progress)) {
        byMuscle.set(muscle, { tier: rank.tier, from: rank.lift.label, progress: rank.progress });
      }
    }
  }

  return ALL_MUSCLES.map((muscle) => {
    const hit = byMuscle.get(muscle);
    return {
      muscle,
      tier: hit?.tier ?? null,
      from: hit?.from ?? null,
      progress: hit?.progress ?? 0,
    };
  });
}

export const ALL_MUSCLES: MuscleGroup[] = [
  "chest", "back", "shoulders", "biceps", "triceps", "core",
  "quads", "hamstrings", "glutes", "calves", "adductors",
];

/**
 * Muscles the standards can actually reach.
 *
 * Calves and adductors have no barbell lift with a published standard, so they
 * would sit permanently grey on the figure and read as a failure to train them.
 * They are excluded from the strength view entirely rather than shown as
 * eternally unknown — weekly volume in lib/muscle-volume.ts is where those two
 * are answered, and pointing at the right screen beats a dead pixel on this one.
 */
export const RANKABLE_MUSCLES: MuscleGroup[] = Array.from(
  new Set(LIFT_STANDARDS.flatMap((l) => l.muscles)),
);

// --- what it is all worth ------------------------------------------------------

/**
 * Total strength tiers earned across the body — the number XP is paid on.
 *
 * Summed over MUSCLES rather than over lifts, deliberately. Paying per lift
 * rewards logging the same squat under six different names; paying per body
 * part rewards actually getting stronger somewhere new, and caps naturally at
 * however many parts there are.
 *
 * Monotonic, because it is computed from best-ever efforts. See `rankedLifts`.
 */
export function strengthTierTotal(parts: BodyPartStrength[]): number {
  return parts.reduce((n, p) => n + (p.tier?.index ?? 0), 0);
}

/**
 * The one line to put at the top of the panel.
 *
 * Priority is deliberate and matches the rule the rest of the app is held to —
 * one obvious top, in the order that is most useful:
 *
 *   1. Nothing ranked yet        -> say how to start
 *   2. A lift within reach       -> the specific kilos to the next rung
 *   3. Otherwise                 -> the strongest thing about you
 */
export function strengthHeadline(ranks: LiftRank[], parts: BodyPartStrength[]): string {
  if (ranks.length === 0) {
    return "Log a squat, bench, deadlift or press with a weight and you'll get ranked.";
  }
  const closest = ranks
    .filter((r) => r.toNextKg != null && r.nextTier)
    .sort((a, b) => (a.toNextKg ?? 0) - (b.toNextKg ?? 0))[0];
  if (closest && closest.toNextKg != null && closest.toNextKg <= 20) {
    return `${closest.toNextKg}kg on your ${closest.lift.label.toLowerCase()} to reach ${closest.nextTier?.name}.`;
  }
  const strongest = parts.filter((p) => p.tier).sort((a, b) => (b.tier?.index ?? 0) - (a.tier?.index ?? 0))[0];
  if (strongest?.tier) {
    return `Your ${MUSCLE_WORD[strongest.muscle]} are your strongest asset — ${strongest.tier.name} from your ${(strongest.from ?? "").toLowerCase()}.`;
  }
  return "Keep logging weights and the ranks will follow.";
}

/** How an athlete says it, which is not always how the code says it. */
export const MUSCLE_WORD: Record<MuscleGroup, string> = {
  chest: "chest", back: "back", shoulders: "shoulders", biceps: "biceps",
  triceps: "triceps", core: "core", quads: "quads", hamstrings: "hamstrings",
  glutes: "glutes", calves: "calves", adductors: "adductors",
};

/**
 * The three numbers the reward system needs, from one pass over the log.
 *
 * Built here rather than in the page because they have to agree: a badge that
 * reads `bestStrengthTier` and XP that reads `strengthTiers` must be describing
 * the same athlete, and the surest way to make two numbers disagree is to
 * compute them in two places.
 *
 * ALL THREE ARE MONOTONIC, because all three come from best-ever efforts. XP in
 * this app never goes down and a badge is never taken back — see `computeXp`.
 */
export function strengthStats(
  logs: TrainingLog[] | null | undefined,
  bodyweightKg: number,
  sex: Sex,
): { strengthTiers: number; bestStrengthTier: number; musclesRanked: number } {
  // No bodyweight, no ratio. Zero is the honest answer rather than a rank
  // computed against an average body nobody has.
  if (!(bodyweightKg > 0)) return { strengthTiers: 0, bestStrengthTier: 0, musclesRanked: 0 };

  const ranks = rankedLifts(logs, bodyweightKg, sex);
  const parts = bodyPartStrength(ranks);
  return {
    strengthTiers: strengthTierTotal(parts),
    bestStrengthTier: ranks.reduce((n, r) => Math.max(n, r.tier.index), 0),
    musclesRanked: parts.filter((p) => p.tier != null).length,
  };
}
