// =============================================================================
// Is this block actually the right difficulty?
//
// The engine prescribes an effort for every working drill — `intensity: "RPE 8"`
// on each ProgramDrill — and the check-in records how hard the session actually
// felt, in `training_logs.intensity` on the same 1-10 scale. Nothing has ever
// compared the two.
//
// So an athlete could report 9 out of 10 on every session of a block written at
// RPE 7, for a month, and the app would keep handing them the same block. That
// is the single most useful thing a coach does with a training diary, and both
// numbers were already in the database.
//
// WHY NOT PER SESSION. `completed_sessions` stores ids like "w1d2" with no date
// attached, so a training log cannot be matched to the session it came from
// without inventing a mapping. Comparing the block's typical working effort
// against the athlete's typical reported effort answers the same question — is
// this too hard for me — and needs nothing that does not exist.
//
// WHY IT REFUSES ON SMALL SAMPLES. One brutal Tuesday is not a verdict about a
// block. Three sessions is few enough to be actionable within a week and enough
// that a single bad day cannot carry it.
// =============================================================================

import type { ProgramPlan } from "./coach";

/** The fewest logged sessions that can support a verdict. */
export const MIN_SESSIONS_FOR_VERDICT = 3;

/**
 * How far from prescribed counts as wrong.
 *
 * A point and a half, not one. RPE self-reports are noisy — the same session on
 * two days honestly rates 7 and 8 — so a threshold of 1 would flag half of all
 * blocks as mis-prescribed and the advice would become noise. At 1.5 the
 * athlete is consistently a full step-and-a-half away, which is a real
 * mismatch rather than the resolution limit of the scale.
 */
export const EFFORT_TOLERANCE = 1.5;

export type EffortVerdict = "too_hard" | "on_target" | "too_easy" | "unknown";

export interface EffortCheck {
  verdict: EffortVerdict;
  /** Sessions that carried a usable reported effort. */
  sessions: number;
  avgReported: number | null;
  prescribed: number | null;
  /** Reported minus prescribed. Positive means harder than intended. */
  gap: number | null;
  /** What to say about it, or null when there is nothing to say. */
  note: string | null;
}

const EMPTY: EffortCheck = {
  verdict: "unknown", sessions: 0, avgReported: null, prescribed: null, gap: null, note: null,
};

/**
 * How hard a set should feel, written the way people talk.
 *
 * THE CODEBASE ALREADY DECIDED THIS AND THEN APPLIED IT TO ONE ENGINE. See
 * drillFrom in lib/hypertrophy.ts: "Reps in reserve, not RPE, and spelled out —
 * 'RPE 8' is jargon to most people using this, and 'leave 2 in the tank' is the
 * same instruction." Correct, and the S&C engine, the preference pass and the
 * template days all carried on emitting a bare `RPE 8`.
 *
 * Measured over 606 distinct athlete-facing strings from generated blocks, RPE
 * was the only piece of jargon left with no explanation attached to it
 * anywhere. Running zones already carry theirs inline — "Zone 2 (Easy) — full
 * sentences without gasping" — and reps-in-reserve is plain English already.
 *
 * BOTH, NOT EITHER. The number stays, because somebody who knows the scale
 * reads it instantly and because it is what the check-in asks them to report
 * back. The words go next to it, because somebody who does not know the scale
 * currently has nothing at all to go on.
 */
export function effortText(rpe: number | null | undefined): string | undefined {
  if (rpe == null || !Number.isFinite(rpe)) return undefined;
  const n = Math.max(1, Math.min(10, rpe));
  if (n >= 10) return "RPE 10 — to failure, nothing left";
  if (n <= 5) return `RPE ${trim(n)} — easy, well short of hard`;
  const left = 10 - n;
  // A HALF-POINT RPE IS A RANGE, NOT A ROUNDING. 7.5 is "two or three left",
  // and rounding it to three states a precision the prescription never had —
  // the engine writes 7.5 precisely because it is between two rep counts.
  if (!Number.isInteger(left)) {
    return `RPE ${trim(n)} — ${Math.floor(left)}–${Math.ceil(left)} reps left in you`;
  }
  return `RPE ${trim(n)} — ${left} rep${left === 1 ? "" : "s"} left in you`;
}

/** A range, for template days that prescribe one. */
export function effortRangeText(low: number, high: number): string {
  const lowLeft = Math.round(10 - Math.min(low, high));
  const highLeft = Math.round(10 - Math.max(low, high));
  return `RPE ${trim(low)}–${trim(high)} — ${highLeft}–${lowLeft} reps left in you`;
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Pull "RPE 8" out of a drill's intensity string. */
export function rpeOf(intensity: string | null | undefined): number | null {
  const text = String(intensity ?? "");

  const m = text.match(/RPE\s*([\d.]+)/i);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 && n <= 10 ? n : null;
  }

  /**
   * REPS IN RESERVE IS THE SAME SCALE, WRITTEN THE WAY PEOPLE TALK.
   *
   * The hypertrophy engine prescribes effort as "leave 2 in the tank" rather
   * than "RPE 8", because RPE is jargon to most of the people using this and
   * the two say the same thing. This function only understood the jargon — so
   * the moment that change shipped, every lift in a hypertrophy block became
   * invisible here and `prescribedEffort` fell back to the only drills still
   * carrying an RPE string: the cardio finishers.
   *
   * The block was then being judged by its warm-down. An athlete reporting a
   * perfectly reasonable 7 against a block written at 7 was told they were
   * training far too hard, because the number it compared against was the easy
   * run at the end. Caught by lib/progression.test.ts, which reads this to
   * decide what the NEXT block should be — so the error was about to start
   * shrinking blocks that were landing exactly right.
   *
   * RIR and RPE are complements on the same ten-point scale: two left in the
   * tank is an eight, none left is a ten.
   */
  const rir = text.match(/leave\s*([\d.]+)\s*in the tank/i);
  if (rir) {
    const left = Number(rir[1]);
    if (!Number.isFinite(left) || left < 0 || left > 10) return null;
    return 10 - left;
  }
  if (/to failure/i.test(text)) return 10;

  return null;
}

/**
 * The effort this block is written at.
 *
 * MEDIAN, and warm-ups and cool-downs excluded. A session is mostly light work
 * by count — mobility, skips, a cool-down — so a mean over every drill reports
 * a hard strength day as RPE 4 and would tell an athlete grinding at 9 that
 * they are training too easy. What the block asks of you is what its WORKING
 * sets ask of you.
 */
export function prescribedEffort(plan: ProgramPlan | null | undefined): number | null {
  const rpes: number[] = [];
  for (const week of plan?.weeks ?? []) {
    for (const session of week.sessions ?? []) {
      for (const drill of session.drills ?? []) {
        if (drill.slot === "warmup" || drill.slot === "cooldown") continue;
        const r = rpeOf(drill.intensity);
        if (r != null) rpes.push(r);
      }
    }
  }
  if (rpes.length === 0) return null;
  rpes.sort((a, b) => a - b);
  const mid = Math.floor(rpes.length / 2);
  const median = rpes.length % 2 ? rpes[mid] : (rpes[mid - 1] + rpes[mid]) / 2;
  return round1(median);
}

/**
 * How the block is landing, from what the athlete reported against what it asked.
 *
 * `reported` is training_logs.intensity — 1-10, the same scale as RPE, which is
 * why these are comparable at all. Rows without one are skipped rather than
 * counted as zero: a session logged without an effort rating is missing
 * information, not an easy session.
 */
export function effortCheck(
  reported: (number | null | undefined)[],
  plan: ProgramPlan | null | undefined,
): EffortCheck {
  const prescribed = prescribedEffort(plan);
  const used = reported
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 10);

  if (prescribed == null || used.length < MIN_SESSIONS_FOR_VERDICT) {
    return { ...EMPTY, sessions: used.length, prescribed };
  }

  const avgReported = round1(used.reduce((a, b) => a + b, 0) / used.length);
  const gap = round1(avgReported - prescribed);

  let verdict: EffortVerdict = "on_target";
  if (gap >= EFFORT_TOLERANCE) verdict = "too_hard";
  else if (gap <= -EFFORT_TOLERANCE) verdict = "too_easy";

  return { verdict, sessions: used.length, avgReported, prescribed, gap, note: noteFor(verdict, avgReported, prescribed, used.length) };
}

function noteFor(v: EffortVerdict, reported: number, prescribed: number, sessions: number): string | null {
  const basis = `across your last ${sessions} logged session${sessions === 1 ? "" : "s"}`;
  if (v === "too_hard") {
    return `You are rating sessions ${reported}/10 ${basis}, and this block is written at about ${prescribed}. ` +
      `That is harder than intended — drop a set from the main lifts, or take an extra rest day this week. ` +
      `Training consistently above what a block asks for is how a good block turns into an injury.`;
  }
  if (v === "too_easy") {
    return `You are rating sessions ${reported}/10 ${basis}, and this block is written at about ${prescribed}. ` +
      `There is room to push — add load to the main lifts before adding sessions.`;
  }
  return null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
