// =============================================================================
// Personalised weekly challenges.
//
// The fixed achievement list (lib/gamification.ts) is the same twelve badges
// for everyone, so once you've unlocked them there's nothing left to chase.
// These are generated per athlete, targeting whatever they're actually
// neglecting.
//
// THE DESIGN CONSTRAINT: an AI that invents free-text goals creates badges that
// can never unlock. "Eat clean for a week" is not something code can check, so
// it would sit there permanently unearned, which is worse than not offering it.
//
// So the model never writes the rule — only the words. It picks a metric from a
// fixed vocabulary of things already tracked, sets a target and a window, and
// writes the title and blurb around that. Evaluation is then ordinary
// arithmetic, and a challenge that says "log your food 5 days this week" is
// checked by counting nutrition logs.
//
// Pure + tested. The local generator below runs when the AI is unavailable, so
// every athlete gets challenges either way.
// =============================================================================

import type { ActivityStats } from "./gamification";

/** Everything a challenge may be measured against. Nothing else is accepted. */
export type ChallengeMetric =
  | "check_ins" | "training_sessions" | "program_sessions"
  | "nutrition_logs" | "benchmarks" | "videos" | "streak";

export const CHALLENGE_METRICS: ChallengeMetric[] = [
  "check_ins", "training_sessions", "program_sessions",
  "nutrition_logs", "benchmarks", "videos", "streak",
];

const METRIC_LABEL: Record<ChallengeMetric, string> = {
  check_ins: "check-ins",
  training_sessions: "training sessions",
  program_sessions: "program sessions ticked off",
  nutrition_logs: "days of food logged",
  benchmarks: "benchmark tests",
  videos: "clips analysed",
  streak: "day streak",
};

export interface Challenge {
  id: string;
  title: string;
  blurb: string;
  icon: string;
  metric: ChallengeMetric;
  target: number;
  xp: number;
}

export interface ChallengeProgress {
  challenge: Challenge;
  current: number;
  pct: number;      // 0..100
  complete: boolean;
}

/** What the athlete has done in the challenge window (the last 7 days). */
export interface WeekActivity {
  check_ins: number;
  training_sessions: number;
  program_sessions: number;
  nutrition_logs: number;
  benchmarks: number;
  videos: number;
  streak: number;
}

export const EMPTY_WEEK: WeekActivity = {
  check_ins: 0, training_sessions: 0, program_sessions: 0,
  nutrition_logs: 0, benchmarks: 0, videos: 0, streak: 0,
};

// Nobody should be handed "train 7 days this week". Targets are clamped to
// something a real week can hold.
const MAX_TARGET: Record<ChallengeMetric, number> = {
  check_ins: 7, training_sessions: 6, program_sessions: 6,
  nutrition_logs: 7, benchmarks: 3, videos: 3, streak: 30,
};

export function clampTarget(metric: ChallengeMetric, target: number): number {
  const n = Math.round(Number(target) || 0);
  return Math.max(1, Math.min(MAX_TARGET[metric] ?? 7, n));
}

/** XP scaled to how much work the challenge actually is. */
function xpFor(metric: ChallengeMetric, target: number): number {
  const per: Record<ChallengeMetric, number> = {
    check_ins: 15, training_sessions: 25, program_sessions: 25,
    nutrition_logs: 15, benchmarks: 40, videos: 35, streak: 8,
  };
  return Math.round((per[metric] ?? 15) * target);
}

/**
 * Validate one AI-proposed challenge. Anything with an unknown metric, a
 * missing title or a nonsense target is rejected rather than repaired — a
 * challenge nobody can complete is worse than one fewer challenge.
 */
export function parseChallenge(raw: unknown, index: number): Challenge | null {
  const c = raw as Record<string, unknown> | null;
  if (!c) return null;
  const metric = String(c.metric ?? "") as ChallengeMetric;
  if (!CHALLENGE_METRICS.includes(metric)) return null;
  const title = String(c.title ?? "").trim().slice(0, 60);
  if (!title) return null;
  const target = clampTarget(metric, Number(c.target));
  return {
    id: `ai_${metric}_${target}_${index}`,
    title,
    blurb: String(c.blurb ?? "").trim().slice(0, 140) || `Hit ${target} ${METRIC_LABEL[metric]} this week.`,
    icon: String(c.icon ?? "🎯").slice(0, 4),
    metric,
    target,
    xp: xpFor(metric, target),
  };
}

export function parseChallenges(raw: unknown): Challenge[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: Challenge[] = [];
  const usedMetrics = new Set<ChallengeMetric>();
  for (let i = 0; i < list.length; i++) {
    const c = parseChallenge(list[i], i);
    // Three challenges on the same metric is one challenge with three names.
    if (!c || usedMetrics.has(c.metric)) continue;
    usedMetrics.add(c.metric);
    out.push(c);
    if (out.length === 3) break;
  }
  return out;
}

/**
 * Challenges without the AI: aim at whatever the athlete has been skipping.
 * Deterministic, so the week's challenges don't shuffle on every page load.
 */
export function localChallenges(stats: ActivityStats, week: WeekActivity): Challenge[] {
  const candidates: Challenge[] = [];
  const push = (metric: ChallengeMetric, target: number, title: string, blurb: string, icon: string) =>
    candidates.push({
      id: `local_${metric}`, title, blurb, icon, metric,
      target: clampTarget(metric, target), xp: xpFor(metric, clampTarget(metric, target)),
    });

  // Weakest habit first — the point is to fix the gap, not reward the streak
  // they already have.
  if (week.nutrition_logs < 4) {
    push("nutrition_logs", 5, "Fuel like a pro", "Log what you eat on 5 days this week. Training is only half of it.", "🍽️");
  }
  if (week.check_ins < 5) {
    push("check_ins", 5, "Know your body", "Check in on 5 days. It takes a minute and it drives everything else.", "📋");
  }
  if (week.training_sessions < 3) {
    push("training_sessions", 3, "Three solid sessions", "Get three training sessions logged this week.", "🏋️");
  }
  if (stats.videos === 0) {
    push("videos", 1, "See yourself move", "Upload one clip and get a technique breakdown.", "🎥");
  }
  if (stats.benchmarks === 0) {
    push("benchmarks", 1, "Set your baseline", "Log a benchmark test so progress has something to measure against.", "📏");
  }
  // Fallbacks so there's always something to chase.
  push("program_sessions", 3, "Stick to the plan", "Tick off three sessions from your program.", "✅");
  push("check_ins", 6, "Nearly perfect week", "Six check-ins. Consistency is the whole game.", "🔥");

  const seen = new Set<ChallengeMetric>();
  return candidates.filter((c) => !seen.has(c.metric) && seen.add(c.metric)).slice(0, 3);
}

/** Score a challenge against the week's activity. Ordinary arithmetic. */
export function evaluateChallenge(c: Challenge, week: WeekActivity): ChallengeProgress {
  const current = Math.max(0, Number(week[c.metric]) || 0);
  const pct = c.target > 0 ? Math.min(100, Math.round((current / c.target) * 100)) : 0;
  return { challenge: c, current, pct, complete: current >= c.target };
}

export function evaluateChallenges(list: Challenge[], week: WeekActivity): ChallengeProgress[] {
  return list.map((c) => evaluateChallenge(c, week));
}

/** XP from every completed challenge — feeds the same level ladder. */
export function challengeXp(list: Challenge[], week: WeekActivity): number {
  return evaluateChallenges(list, week).filter((p) => p.complete).reduce((n, p) => n + p.challenge.xp, 0);
}

export { METRIC_LABEL };
