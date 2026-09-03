// =============================================================================
// Recovery engine — readiness scoring (Phase 1).
//
// Pure, dependency-free so it can be unit-tested and shared between the Next.js
// API route and the Supabase Edge Function (keep the two copies in sync).
//
// Phase 2 will replace/augment this with the Python AI microservice; the shape
// of ReadinessResult is intended to stay stable across that swap.
// =============================================================================

import type { CheckInInput, PainMap, ReadinessResult, ReadinessStatus } from "./types";

const PAIN_HARD_LIMIT = 7; // any joint at/above this forces Red
const SLEEP_HARD_LIMIT = 3; // sleep at/below this forces Red

// Acute:chronic workload thresholds, matching lib/load.ts. Kept here rather
// than imported so this module stays dependency-free and portable to the Edge
// Function — but they MUST agree with computeACWR's zone boundaries, or the
// dashboard and the verdict will disagree again.
const ACWR_SPIKE = 1.5;   // "danger" — sharp spike, elevated injury risk
const ACWR_CLIMBING = 1.3; // "caution" — climbing fast

/**
 * Training-load context for the readiness verdict.
 *
 * WHY THIS EXISTS. Readiness scored sleep, fatigue, nutrition and pain, and
 * nothing else. Training load lived on a separate page with its own colour. So
 * an athlete who slept well and hurt nowhere got a green "ready to train" while
 * the load panel was red — the app contradicting itself on the one question it
 * exists to answer. They aren't the same measurement, but they are the same
 * decision, and the athlete only makes one.
 */
export interface LoadContext {
  /** acute:chronic ratio; null until there are 28 days to average over. */
  acwr?: number | null;
  /**
   * Whether they have already trained today.
   *
   * WITHOUT THIS THE ADVICE IS WRITTEN FOR THE MORNING AND SHOWN ALL DAY. Every
   * line below told the athlete what to do with a session that, by the time
   * they read it, they had often already done — "train today, keep the
   * intensity, hold the volume" to somebody who trained at seven and opened the
   * app at nine. The training log for today is one row and the app already has
   * it; not passing it made the coach sound like it was not paying attention,
   * which is worse than saying nothing.
   *
   * It changes the ADVICE, never the score. Readiness is a statement about the
   * body's state and having trained does not make you more or less recovered
   * than the check-in said — it changes what there is left to decide.
   */
  trainedToday?: boolean;
  /**
   * ═════════════════════════════════════════════════════════════════════════
   * WHAT THE WATCH SAW, WHICH THE CHECK-IN CANNOT.
   *
   * lib/biometrics.ts computed this, and its own type annotated it "-15..+5
   * applied to readiness". Nothing applied it. The only component that read it
   * — BiometricSignalCard — was never mounted on a route, so HRV, resting
   * heart rate and sleep duration moved the score by exactly zero while the
   * code said otherwise and the marketing fact list implied the same.
   *
   * It belongs here for the reason ACWR does: suppressed HRV and an elevated
   * resting heart rate are strain you cannot feel, and the athlete makes one
   * decision, not two. `sleep_quality` on the check-in is how rested you FEEL
   * out of ten; sleep hours off a watch is how long you were actually asleep.
   * Related, not the same, and the second is the one you cannot talk yourself
   * out of.
   *
   * Absent means absent: no wearable, no readings, or too little history for a
   * baseline all give 0, which changes nothing. It is not a penalty for having
   * no watch.
   * ═════════════════════════════════════════════════════════════════════════
   */
  biometric?: { adjustment: number; note: string | null } | null;
}

function maxPain(painMap: PainMap): { part: string | null; value: number } {
  let part: string | null = null;
  let value = 0;
  for (const [k, v] of Object.entries(painMap ?? {})) {
    const n = Number(v) || 0;
    if (n > value) {
      value = n;
      part = k;
    }
  }
  return { part, value };
}

/** Human-friendly body part label, e.g. "knee_left" -> "left knee". */
export function prettyBodyPart(key: string | null): string | null {
  if (!key) return null;
  const parts = key.split("_");
  const side = parts.find((p) => p === "left" || p === "right");
  const joint = parts.filter((p) => p !== "left" && p !== "right").join(" ");
  return side ? `${side} ${joint}` : joint;
}

/**
 * Weighted readiness assessment.
 *
 * Score (0-100, higher = more ready) blends sleep, fatigue, nutrition and the
 * worst current pain. Hard limits short-circuit to Red regardless of the blend.
 */
export function assessReadiness(input: CheckInInput, load?: LoadContext): ReadinessResult {
  const sleep = clamp1to10(input.sleep_quality);
  const fatigue = clamp1to10(input.fatigue_score); // higher = more tired (worse)
  const nutrition = clamp1to10(input.nutrition_quality);
  const pain = maxPain(input.pain_map);
  const focus = prettyBodyPart(pain.part);

  // Normalize each factor to a 0-1 "good" scale.
  const sleepGood = (sleep - 1) / 9;
  const fatigueGood = (10 - fatigue) / 9; // invert: low fatigue is good
  const nutritionGood = (nutrition - 1) / 9;
  const painGood = 1 - Math.min(pain.value, 10) / 10;

  // Weights — pain and sleep dominate recovery readiness.
  const score01 =
    0.35 * painGood +
    0.3 * sleepGood +
    0.25 * fatigueGood +
    0.1 * nutritionGood;
  /**
   * The wearable moves the NUMBER, and the number decides the band.
   *
   * Not a second verdict shown beside this one — that is the mistake the ACWR
   * note below describes, and two panels disagreeing about one morning is
   * worse than either alone. The hard limits still short-circuit underneath
   * it: no amount of good HRV outranks a knee at 8/10 or three hours' sleep.
   */
  const adjustment = load?.biometric?.adjustment ?? 0;
  const score = Math.max(0, Math.min(100, Math.round(score01 * 100) + adjustment));

  let status: ReadinessStatus;
  if (pain.value >= PAIN_HARD_LIMIT || sleep <= SLEEP_HARD_LIMIT) {
    status = "Red";
  } else if (score >= 70) {
    status = "Green";
  } else if (score >= 45) {
    status = "Yellow";
  } else {
    status = "Red";
  }

  // A load spike is an injury risk the athlete cannot feel — that's the point
  // of measuring it. Feeling fine on the back of a 60% jump in weekly load is
  // exactly the state ACWR exists to catch, so it caps the verdict rather than
  // sitting in a separate panel disagreeing with it. It only ever caps: it
  // can't turn a Red day green.
  const acwr = load?.acwr ?? null;
  const spiking = acwr != null && acwr > ACWR_SPIKE;
  if (spiking && status === "Green") status = "Yellow";

  return {
    status,
    score,
    advice: buildAdvice(status, {
      sleep, fatigue, pain, focus, acwr,
      trainedToday: load?.trainedToday === true,
      // Only when it COST them something. "HRV is 14% above your norm" as the
      // opening line of a Red day reads as the app not having read the room.
      biometricNote: adjustment < 0 ? load?.biometric?.note ?? null : null,
    }),
    focus_body_part: focus,
  };
}

/**
 * SAY WHAT THE WATCH SAW, BEFORE ANYTHING ELSE.
 *
 * A score that drops ten points with no explanation is the app being
 * mysterious about the one number it exists to produce. The athlete checked in
 * feeling fine — the reason they are not Green is sitting in a metric they
 * have not looked at, and that is the entire value of wearing the watch.
 *
 * Prefixed rather than replacing the advice, because the advice still has to
 * say what to DO and "HRV is 18% below your norm" is not an instruction. And
 * done HERE rather than at each return: `return prefix + trainedToday ? a : b`
 * parses as `(prefix + trainedToday) ? a : b`, which is always truthy — one
 * wrapper cannot make that mistake eleven times.
 */
function buildAdvice(
  status: ReadinessStatus,
  ctx: Parameters<typeof adviceBody>[1] & { biometricNote?: string | null },
): string {
  const note = ctx.biometricNote;
  const body = adviceBody(status, { ...ctx, watchFlagged: !!note });
  if (!note) return body;
  // The note is built with a full stop; don't assume it and run two sentences
  // together if that ever changes.
  return `Your watch: ${/[.!?]$/.test(note) ? note : `${note}.`} ${body}`;
}

function adviceBody(
  status: ReadinessStatus,
  ctx: {
    trainedToday: boolean;
    sleep: number;
    fatigue: number;
    pain: { part: string | null; value: number };
    focus: string | null;
    acwr?: number | null;
    /**
     * The watch has already said something bad, and it is printed FIRST.
     *
     * Without this the advice contradicted its own opening line: a drop that
     * costs points without crossing a band still printed "You're well
     * recovered and ready to go" directly after "your body is under strain".
     * The reassurance is exactly what the watch is disputing, so it goes.
     */
    watchFlagged?: boolean;
  }
): string {
  const { sleep, fatigue, pain, focus, acwr, trainedToday, watchFlagged } = ctx;

  // Said first, because when it applies it's the reason for the verdict and the
  // athlete has no other way to know it. Percentages beat a bare ratio: "58%
  // more than your four-week average" is a sentence you can act on, "1.58" is
  // not.
  if (acwr != null && acwr > ACWR_SPIKE && status !== "Red") {
    const over = Math.round((acwr - 1) * 100);
    return trainedToday
      ? `Session done, on a week already ${over}% up on your average. Nothing else hard today.`
      : `You feel fine, but this week is ${over}% up on your average. Train — keep the intensity, not the volume.`;
  }

  if (status === "Red") {
    if (pain.value >= PAIN_HARD_LIMIT && focus) {
      return `${capitalize(focus)} pain is high (${pain.value}/10). No sprints today — gentle mobility and stretching around it.`;
    }
    if (sleep <= SLEEP_HARD_LIMIT) {
      return `Sleep is very low (${sleep}/10). Rest and light work only — heavy training now raises injury risk.`;
    }
    return "Load is high. Active recovery today — stretching, mobility, hydration.";
  }

  if (status === "Yellow") {
    if (focus && pain.value > 0) {
      return trainedToday
        ? `Session done. Watch that ${focus} (${pain.value}/10) — if it's still there tomorrow, act on it.`
        : `Mostly recovered. Watch your ${focus} (${pain.value}/10) — moderate intensity, warm up properly.`;
    }
    if (fatigue >= 7) {
      return trainedToday
        ? "Session done on a tired day. Nothing else hard — recovery is the work now."
        : "Fatigue is up. A moderate session is fine — no maximal efforts.";
    }
    return trainedToday
      ? "Session logged. Nothing more today — tonight's food and sleep decide what it was worth."
      : "Moderately ready. Train as planned, ease off if anything flares up.";
  }

  if (trainedToday) {
    if (watchFlagged) return "Session logged. Keep the rest of today easy.";
    return acwr != null && acwr > ACWR_CLIMBING
      ? "Good session, and you had the recovery for it. Load is climbing — keep the rest of today easy."
      : "Good session, and you had the recovery for it. Eat and sleep; that's where it becomes progress.";
  }
  if (acwr != null && acwr > ACWR_CLIMBING) {
    return watchFlagged
      ? "Load is climbing too. Take the intensity, not the extra volume."
      : "Well recovered, but your load is climbing fast. Take the intensity, not the extra volume.";
  }
  return watchFlagged
    ? "Everything you logged says fine, so train — but keep it honest and stop if it bites."
    : "You're well recovered and ready to go. Good day for a higher-intensity session.";
}

function clamp1to10(v: number | null): number {
  if (v == null || Number.isNaN(v)) return 5; // neutral default
  return Math.min(10, Math.max(1, Math.round(v)));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Today's readiness from the rows the app already has on the page.
 *
 * ONE ANSWER, NOT TWO. This was written inline on /coach and nowhere else, so
 * the check-in — which offers the same session to log — had no readiness at all
 * and handed over the unadjusted prescription. The plan page showed a Yellow
 * day eased to three sets while the check-in offered four to tick off, and the
 * athlete had to guess which screen to believe.
 *
 * Training load is part of the verdict rather than a separate panel: a score
 * built from sleep and soreness alone calls you Green on the back of a load
 * spike you cannot feel. Both callers therefore pass the same 28 days they
 * already loaded for the ACWR — no extra query, and no way for the two pages to
 * reach different numbers from the same data.
 */
export function readinessFor(
  checkIn: {
    pain_map?: Record<string, number> | null;
    fatigue_score?: number | null;
    sleep_quality?: number | null;
    nutrition_quality?: number | null;
    weight_kg?: number | null;
    is_match_day?: boolean | null;
    match_minutes_played?: number | null;
  } | null | undefined,
  acwr: number | null,
  /** Whether a session is already logged for today — changes the advice, not the score. */
  trainedToday = false,
  /**
   * Today's wearable signal, from biometricSignal(). Optional and absent-safe:
   * every caller that has no watch data passes nothing and nothing changes.
   */
  biometric: { adjustment: number; note: string | null } | null = null,
): ReadinessResult | null {
  if (!checkIn) return null;
  return assessReadiness(
    {
      pain_map: checkIn.pain_map ?? {},
      fatigue_score: checkIn.fatigue_score,
      sleep_quality: checkIn.sleep_quality,
      nutrition_quality: checkIn.nutrition_quality,
      weight_kg: checkIn.weight_kg,
      is_match_day: checkIn.is_match_day,
      match_minutes_played: checkIn.match_minutes_played,
    } as CheckInInput,
    { acwr, trainedToday, biometric },
  );
}
