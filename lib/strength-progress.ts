// =============================================================================
// How much stronger has each part of you actually got?
//
// The ranks answer "am I strong" — a comparison against everyone at your
// bodyweight. They do not answer "am I getting stronger", which is the question
// somebody four months into a programme is actually asking, and the only one
// that says whether the training worked.
//
// A TIER IS TOO COARSE TO SHOW PROGRESS. Novice to Intermediate on the squat is
// half a bodyweight of load; an athlete can train hard for three months, add
// 20kg, and watch the badge not move once. The percentage moves every session.
//
// WHY "SINCE YOU STARTED" AND NOT "LAST 30 DAYS".
//
// A recent window has a failure mode that makes it useless: `best in the last
// 30 days` against `best in the 30 before` reports a DECLINE for anybody who
// simply did not go heavy this month. Deload weeks, in-season blocks and
// tapers would all read as losing strength, and an athlete told they are going
// backwards when they are peaking correctly will change something that was
// working. Best-ever against your opening month cannot do that — it is
// non-decreasing by construction, and "what have I added" is what the question
// means anyway.
//
// The cost is honesty about what it does NOT show: a genuine regression is
// invisible here. That belongs on a per-lift chart with real dates, which is
// what ExerciseProgress already is; this is the per-muscle summary beside it.
// =============================================================================

import { estimate1RM } from "./exercise-stats";
import { setsOf } from "./training-sets";
import { resolveLift, type LiftStandard } from "./strength-standards";
import type { MuscleGroup } from "./hypertrophy";
import type { TrainingLog } from "./types";

/**
 * How long the opening window is.
 *
 * A single first session is a terrible baseline — the first time somebody
 * squats they are learning the movement, not testing it, and anchoring to that
 * manufactures a huge percentage that says nothing about training. Four weeks
 * is long enough to include a real effort and short enough to still be "when
 * you started".
 */
export const BASELINE_DAYS = 28;

/**
 * The least history worth reporting a percentage over.
 *
 * Under six weeks the number is mostly the difference between learning a lift
 * and knowing it, and "+40% in your first fortnight" is a promise the next
 * fortnight cannot keep.
 */
export const MIN_HISTORY_DAYS = 42;

export interface LiftProgress {
  lift: LiftStandard;
  /** The movement as the athlete logged it — "Incline dumbbell press", not "Bench press". */
  label: string;
  baselineKg: number;
  bestKg: number;
  /** Percentage added since the opening window. Never negative. */
  pct: number;
  firstDate: string;
  bestDate: string;
}

export interface MuscleProgress {
  muscle: MuscleGroup;
  /** Null when nothing that trains it has enough history. */
  gain: LiftProgress | null;
}

/** Best estimated 1RM per lift per day, from the raw logs. */
interface DayBest { date: string; e1rm: number; lift: LiftStandard; label: string }

/**
 * Best estimated 1RM per lift per day, from the raw logs.
 *
 * KEYED BY THE VARIANT, NOT THE BASE LIFT. `resolveLift` maps a dumbbell bench
 * onto the barbell bench's STANDARD, which is right for ranking — the question
 * there is "how strong is your chest" and any honest evidence answers it. It is
 * wrong here. A percentage gain is a series over time, and folding a dumbbell
 * press into the same series as a barbell one would show a step change on the
 * day somebody switched equipment and call it progress.
 *
 * The conversion factor is deliberately NOT applied: a ratio of two numbers is
 * unchanged by scaling both, so the percentage is the same either way, and
 * leaving the kilos as they were logged means the evidence line underneath
 * shows the weights the athlete actually put on the bar.
 */
function dailyBests(logs: TrainingLog[] | null | undefined): Map<string, DayBest[]> {
  const byLift = new Map<string, DayBest[]>();
  for (const log of logs ?? []) {
    const date = String(log.log_date ?? "");
    if (!date) continue;
    for (const drill of log.drills ?? []) {
      const r = resolveLift(String(drill.name ?? ""));
      if (!r) continue;
      for (const set of setsOf(drill)) {
        if (set.load_kg == null || set.load_kg <= 0) continue;
        const e1rm = estimate1RM(set.load_kg, set.reps);
        if (e1rm == null) continue;
        const rows = byLift.get(r.key) ?? [];
        rows.push({ date, e1rm, lift: r.lift, label: r.label });
        byLift.set(r.key, rows);
      }
    }
  }
  return byLift;
}

/** What each ranked lift has gained since its opening window. */
export function liftProgress(logs: TrainingLog[] | null | undefined, today: string): LiftProgress[] {
  const out: LiftProgress[] = [];

  for (const rows of dailyBests(logs).values()) {
    rows.sort((a, b) => a.date.localeCompare(b.date));
    const first = rows[0];
    const lastDate = rows[rows.length - 1].date;

    // Enough history for the number to mean something.
    if (daysBetween(first.date, today) < MIN_HISTORY_DAYS) continue;

    const baselineEnd = addDays(first.date, BASELINE_DAYS);
    const opening = rows.filter((r) => r.date < baselineEnd);
    // BEST of the opening window, not the first set in it. Anchoring to a
    // warm-up set on day one invents a percentage out of nothing.
    const baselineKg = Math.max(...opening.map((r) => r.e1rm));

    // Best ever, matching how the ranks themselves read the log — a personal
    // best is a personal best whenever it happened.
    const best = rows.reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
    if (!(baselineKg > 0) || best.e1rm <= baselineKg) continue;

    out.push({
      lift: first.lift,
      label: first.label,
      baselineKg: round1(baselineKg),
      bestKg: round1(best.e1rm),
      pct: Math.round(((best.e1rm - baselineKg) / baselineKg) * 100),
      firstDate: first.date,
      bestDate: best.date,
    });
    void lastDate;
  }

  return out.sort((a, b) => b.pct - a.pct);
}

/**
 * The gain to show against each muscle group.
 *
 * The lift with the BIGGEST percentage among those that train it, not the
 * heaviest. "Your quads are up 22%" should name the lift that actually moved
 * them; the heaviest lift is often the one that has been stuck longest, and
 * reporting its 3% beside a squat that added 22% understates real work.
 */
export function muscleProgress(
  logs: TrainingLog[] | null | undefined,
  today: string,
  muscles: MuscleGroup[],
): MuscleProgress[] {
  const gains = liftProgress(logs, today);
  return muscles.map((muscle) => {
    const forMuscle = gains.filter((g) => g.lift.muscles.includes(muscle));
    return {
      muscle,
      gain: forMuscle.length ? forMuscle.reduce((a, b) => (b.pct > a.pct ? b : a)) : null,
    };
  });
}

/** One sentence for the whole picture, or null when there is nothing to say. */
export function progressHeadline(rows: MuscleProgress[]): string | null {
  const withGain = rows.filter((r): r is MuscleProgress & { gain: LiftProgress } => !!r.gain);
  if (withGain.length === 0) return null;
  const best = withGain.reduce((a, b) => (b.gain.pct > a.gain.pct ? b : a));
  return `Your ${best.muscle} have gained the most — up ${best.gain.pct}% on your ${best.gain.label.toLowerCase()} since you started.`;
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function addDays(date: string, n: number): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t)) return date;
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
