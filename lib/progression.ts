// =============================================================================
// What the NEXT block should be, decided by what happened in the last one.
//
// WHY THIS EXISTS. The block counter was the only thing that moved. Block two
// added eight percent volume, block three another eight, and block four another
// — whether the athlete completed twelve sessions out of twelve or four, and
// whether they finished the last one feeling strong or wrecked. That is not
// progression, it is a counter with a multiplier attached to it, and it fails in
// the direction that costs people: the athlete who missed half the block because
// life happened gets handed MORE work, which is the surest way to make them miss
// the next one too.
//
// A coach does the opposite of a counter. They ask three questions before
// writing the next block — did you do it, how did it feel, and did you get
// stronger — and every one of those is already in this database. Sessions ticked
// off are in `programs.completed_sessions`. Reported effort is on every training
// log, and lib/effort.ts already compares it against what the block asked for.
// The logs carry sets, reps and load.
//
// So this reads them. It does not invent a new source of truth, and it does not
// touch the block that is already running — the athlete is mid-way through that
// one and changing it under them is its own kind of wrong.
//
// Pure + tested.
// =============================================================================

import { effortCheck, type EffortVerdict } from "./effort";
import { setCount, topLoad } from "./training-sets";
import type { ProgramPlan } from "./engine";
import type { TrainingLog } from "./types";

export type BlockVerdict = "push" | "hold" | "repeat" | "back_off";

export interface BlockReview {
  /** Share of the block's sessions actually ticked off, 0-1. */
  adherence: number;
  /** How hard it felt against how hard it was written — see lib/effort.ts. */
  effort: EffortVerdict;
  /** True when the main lifts moved up over the block. */
  gotStronger: boolean | null;
  verdict: BlockVerdict;
  /** What to multiply the next block's sets by. */
  volumeScale: number;
  /** One sentence for the athlete, in their numbers. */
  headline: string;
}

/**
 * How much a block may grow when everything went well.
 *
 * Eight percent, which is where the old fixed number came from and is a
 * sensible ceiling — a block that adds much more than that is not progressive
 * overload, it is a different block. What changes here is that it has to be
 * EARNED rather than granted by the calendar.
 */
const PUSH = 1.08;
/** Earned partly: they trained, it landed about right, but they missed some. */
const HOLD = 1.04;
/** Not earned: the same dose again, so they get a block they can finish. */
const REPEAT = 1;
/**
 * And down, when the last block was harder than it was written to be.
 *
 * Ten percent off is a real reduction rather than a gesture. Somebody reporting
 * nines against a block written at seven is not being brave, they are two weeks
 * from a strain, and adding volume on top of that is the single worst thing this
 * function could do.
 */
const BACK_OFF = 0.9;

/** Below this, the block was not really trained and must not grow. */
const ADHERENCE_REPEAT = 0.6;
/** At or above this, they did the work. */
const ADHERENCE_PUSH = 0.85;

export function reviewBlock(
  plan: ProgramPlan | null | undefined,
  completedSessions: string[] | null | undefined,
  logs: TrainingLog[] | null | undefined,
): BlockReview {
  const total = (plan?.weeks ?? []).reduce((n, w) => n + (w.sessions?.length ?? 0), 0);
  const done = (completedSessions ?? []).length;
  const adherence = total > 0 ? Math.min(1, done / total) : 0;

  const effort = effortCheck((logs ?? []).map((l) => l.intensity), plan).verdict;
  const gotStronger = strengthTrend(logs ?? []);

  /**
   * ORDER MATTERS, AND EFFORT COMES FIRST.
   *
   * An athlete can complete every session of a block that is too hard for them
   * — that is what "too hard" usually looks like from the outside, right up
   * until it stops. Checking adherence first would read a full attendance
   * record as permission to add more, which is exactly the case where adding
   * more is dangerous.
   */
  let verdict: BlockVerdict;
  if (effort === "too_hard") verdict = "back_off";
  else if (adherence < ADHERENCE_REPEAT) verdict = "repeat";
  else if (adherence >= ADHERENCE_PUSH) verdict = "push";
  else verdict = "hold";

  const volumeScale =
    verdict === "push" ? PUSH : verdict === "hold" ? HOLD : verdict === "repeat" ? REPEAT : BACK_OFF;

  return {
    adherence,
    effort,
    gotStronger,
    verdict,
    volumeScale,
    headline: headlineFor(verdict, done, total, effort, gotStronger),
  };
}

/**
 * Did the main lifts go up over the block?
 *
 * Compares the heaviest set of each exercise in the first half of the logs
 * against the second half, and asks whether more of them rose than fell. Null
 * when there is not enough logged load to say — which is most athletes early
 * on, and saying nothing is better than calling a coin toss.
 *
 * Deliberately not part of the verdict. It is the athlete's headline, not the
 * engine's decision: strength moves for reasons this function cannot see, and
 * a block that added muscle without adding kilos is not a failed block.
 */
function strengthTrend(logs: TrainingLog[]): boolean | null {
  const dated = [...logs]
    .filter((l) => l.log_date)
    .sort((a, b) => String(a.log_date).localeCompare(String(b.log_date)));
  if (dated.length < 4) return null;

  const half = Math.floor(dated.length / 2);
  const best = (slice: TrainingLog[]) => {
    const out = new Map<string, number>();
    for (const l of slice) {
      for (const d of l.drills ?? []) {
        const load = topLoad(d);
        if (load == null || load <= 0) continue;
        if (setCount(d) <= 0) continue;
        const key = String(d.name ?? "").trim().toLowerCase();
        if (!key) continue;
        out.set(key, Math.max(out.get(key) ?? 0, load));
      }
    }
    return out;
  };

  const early = best(dated.slice(0, half));
  const late = best(dated.slice(half));

  let up = 0;
  let down = 0;
  for (const [name, lateLoad] of late) {
    const earlyLoad = early.get(name);
    if (earlyLoad == null) continue;
    if (lateLoad > earlyLoad) up++;
    else if (lateLoad < earlyLoad) down++;
  }
  if (up + down < 2) return null;
  return up > down;
}

function headlineFor(
  verdict: BlockVerdict,
  done: number,
  total: number,
  effort: EffortVerdict,
  gotStronger: boolean | null,
): string {
  const attendance = `You finished ${done} of ${total} session${total === 1 ? "" : "s"}`;
  const strength =
    gotStronger === true ? " and your main lifts went up" :
    gotStronger === false ? " and your main lifts held where they were" : "";

  switch (verdict) {
    case "back_off":
      return (
        `${attendance}${strength}, but you have been rating them harder than this block was written. ` +
        `The next one comes down about 10% so you finish it fresh — that is the point of a block, not a setback.`
      );
    case "repeat":
      return (
        `${attendance}${strength}. Rather than adding work on top of a block you did not get through, ` +
        `the next one is the same dose. Finish this one and the one after it goes up.`
      );
    case "push":
      return (
        `${attendance}${strength}${effort === "too_easy" ? ", and you have been rating them easier than written" : ""}. ` +
        `That has earned it — the next block adds about 8% more work.`
      );
    default:
      return (
        `${attendance}${strength}. Solid. The next block adds a little — about 4% — rather than a full step, ` +
        `so the extra lands on a week you will actually complete.`
      );
  }
}
