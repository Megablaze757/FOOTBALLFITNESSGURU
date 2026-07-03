import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveInsight, actionLabel } from "./insights";
import type { InsightSummary } from "./trends";
import type { DailyInsight } from "./types";

const local: InsightSummary = {
  riskScore: 0.4,
  fatigueTrend: "stable",
  focusBodyPart: "left knee",
  weightDeltaKg: null,
  avgSleep: 7,
  series: [],
};

test("falls back to local when no insight row", () => {
  const r = resolveInsight(null, local);
  assert.equal(r.source, "local");
  assert.equal(r.riskScore, 0.4);
  assert.equal(r.summaryText, null);
});

test("prefers the AI insight when present", () => {
  const insight = {
    risk_score: 0.82,
    fatigue_trend: "declining",
    ai_summary_text: "Knee pain spiked.",
    recommended_action: "static_stretching_lower_body",
    focus_body_part: "left knee",
  } as DailyInsight;
  const r = resolveInsight(insight, local);
  assert.equal(r.source, "ai");
  assert.equal(r.riskScore, 0.82);
  assert.equal(r.fatigueTrend, "declining");
  assert.equal(r.summaryText, "Knee pain spiked.");
});

test("falls back when the insight is missing numeric fields", () => {
  const partial = { risk_score: null, fatigue_trend: null } as DailyInsight;
  assert.equal(resolveInsight(partial, local).source, "local");
});

test("actionLabel humanizes the enum", () => {
  assert.equal(actionLabel("static_stretching_lower_body"), "Lower-body stretching");
  assert.equal(actionLabel(null), null);
});
