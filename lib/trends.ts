// =============================================================================
// Phase 2 (lite) — local trend analytics computed from check-in history.
//
// Pure and dependency-free. This stands in for the Python AI microservice until
// it is deployed; the output shape mirrors the daily_insights table so the swap
// is transparent to the dashboard.
// =============================================================================

import type { DailyCheckIn, PainMap } from "./types";
import { assessReadiness, prettyBodyPart } from "./readiness";

export type Trend = "improving" | "stable" | "declining";

export interface TrendPoint {
  date: string;
  maxPain: number;
  sleep: number | null;
  fatigue: number | null;
  readinessScore: number;
}

export interface InsightSummary {
  riskScore: number; // 0..1, higher = more risk (inverse of readiness)
  fatigueTrend: Trend;
  focusBodyPart: string | null;
  weightDeltaKg: number | null; // latest minus oldest in window
  avgSleep: number | null;
  series: TrendPoint[]; // oldest -> newest
}

function maxPainValue(painMap: PainMap | null | undefined): { part: string | null; value: number } {
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

/**
 * Build a trend summary from check-ins. Accepts rows in any order; sorts ascending.
 */
export function summarizeTrends(rows: DailyCheckIn[]): InsightSummary {
  const sorted = [...rows].sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));

  const series: TrendPoint[] = sorted.map((r) => {
    const readiness = assessReadiness({
      pain_map: r.pain_map ?? {},
      fatigue_score: r.fatigue_score,
      sleep_quality: r.sleep_quality,
      nutrition_quality: r.nutrition_quality,
      weight_kg: r.weight_kg,
      is_match_day: r.is_match_day,
      match_minutes_played: r.match_minutes_played,
    });
    return {
      date: r.check_in_date,
      maxPain: maxPainValue(r.pain_map).value,
      sleep: r.sleep_quality,
      fatigue: r.fatigue_score,
      readinessScore: readiness.score,
    };
  });

  const latest = sorted[sorted.length - 1];
  const riskScore = latest
    ? +(1 - series[series.length - 1].readinessScore / 100).toFixed(2)
    : 0;

  const focusBodyPart = latest ? prettyBodyPart(maxPainValue(latest.pain_map).part) : null;

  return {
    riskScore,
    fatigueTrend: computeFatigueTrend(series),
    focusBodyPart,
    weightDeltaKg: computeWeightDelta(sorted),
    avgSleep: average(series.map((p) => p.sleep)),
    series,
  };
}

/**
 * Fatigue trend over the window: compares the mean of the first half vs the
 * second half. Lower fatigue later = improving (recovery). Threshold avoids
 * flagging noise.
 */
export function computeFatigueTrend(series: TrendPoint[]): Trend {
  const vals = series.map((p) => p.fatigue).filter((v): v is number => v != null);
  if (vals.length < 4) return "stable";

  const mid = Math.floor(vals.length / 2);
  const firstHalf = average(vals.slice(0, mid));
  const secondHalf = average(vals.slice(mid));
  if (firstHalf == null || secondHalf == null) return "stable";

  const delta = secondHalf - firstHalf; // positive = getting more tired
  if (delta <= -1) return "improving";
  if (delta >= 1) return "declining";
  return "stable";
}

function computeWeightDelta(sorted: DailyCheckIn[]): number | null {
  const weights = sorted.map((r) => r.weight_kg).filter((w): w is number => w != null);
  if (weights.length < 2) return null;
  return +(weights[weights.length - 1] - weights[0]).toFixed(1);
}

export function average(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (!nums.length) return null;
  return +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1);
}
