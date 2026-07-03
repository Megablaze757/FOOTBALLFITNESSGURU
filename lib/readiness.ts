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
export function assessReadiness(input: CheckInInput): ReadinessResult {
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
  const score = Math.round(score01 * 100);

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

  return { status, score, advice: buildAdvice(status, { sleep, fatigue, pain, focus }), focus_body_part: focus };
}

function buildAdvice(
  status: ReadinessStatus,
  ctx: { sleep: number; fatigue: number; pain: { part: string | null; value: number }; focus: string | null }
): string {
  const { sleep, fatigue, pain, focus } = ctx;

  if (status === "Red") {
    if (pain.value >= PAIN_HARD_LIMIT && focus) {
      return `${capitalize(focus)} pain is high (${pain.value}/10). Skip sprints today — focus on gentle mobility and static stretching around the area.`;
    }
    if (sleep <= SLEEP_HARD_LIMIT) {
      return `Sleep quality is very low (${sleep}/10). Prioritise rest and light recovery work; heavy training now raises injury risk.`;
    }
    return "Your overall load is high. Treat today as active recovery: stretching, mobility and hydration.";
  }

  if (status === "Yellow") {
    if (focus && pain.value > 0) {
      return `Mostly recovered, but watch your ${focus} (${pain.value}/10). Keep intensity moderate and warm up thoroughly.`;
    }
    if (fatigue >= 7) {
      return "Fatigue is elevated. A moderate session is fine — avoid maximal efforts and keep volume in check.";
    }
    return "You're moderately ready. Train as planned but listen to your body and ease off if anything flares up.";
  }

  return "You're well recovered and ready to go. Good day for a higher-intensity session.";
}

function clamp1to10(v: number | null): number {
  if (v == null || Number.isNaN(v)) return 5; // neutral default
  return Math.min(10, Math.max(1, Math.round(v)));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
