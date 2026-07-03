// Presentation helpers for AI insights (daily_insights) and the local fallback.

import type { DailyInsight, FatigueTrend } from "./types";
import type { InsightSummary } from "./trends";

// Maps the worker's recommended_action enum to a human label.
const ACTION_LABELS: Record<string, string> = {
  rest: "Rest day",
  static_stretching_lower_body: "Lower-body stretching",
  mobility: "Mobility work",
  light_recovery: "Light recovery",
  moderate_drill: "Moderate drills",
  heavy_sprint: "High-intensity sprints",
};

export function actionLabel(action: string | null): string | null {
  if (!action) return null;
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

export interface ResolvedInsight {
  source: "ai" | "local";
  riskScore: number; // 0..1
  fatigueTrend: FatigueTrend;
  focusBodyPart: string | null;
  summaryText: string | null; // present only for the AI source
  recommendedAction: string | null;
}

/**
 * Prefer the AI-generated insight; fall back to the locally-computed trend
 * summary when the worker hasn't produced one yet (not deployed, webhook not
 * wired, or check-in too recent).
 */
export function resolveInsight(
  insight: DailyInsight | null,
  local: InsightSummary
): ResolvedInsight {
  if (insight && insight.risk_score != null && insight.fatigue_trend != null) {
    return {
      source: "ai",
      riskScore: insight.risk_score,
      fatigueTrend: insight.fatigue_trend,
      focusBodyPart: insight.focus_body_part,
      summaryText: insight.ai_summary_text,
      recommendedAction: insight.recommended_action,
    };
  }
  return {
    source: "local",
    riskScore: local.riskScore,
    fatigueTrend: local.fatigueTrend,
    focusBodyPart: local.focusBodyPart,
    summaryText: null,
    recommendedAction: null,
  };
}
