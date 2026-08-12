// =============================================================================
// The vocabulary and arithmetic of a challenge. The challenges themselves live
// in lib/challenge-pool.ts.
//
// THE DESIGN CONSTRAINT: a challenge with a free-text goal can never unlock.
// "Eat clean for a week" is not something code can check, so it would sit there
// permanently unearned, which is worse than not offering it at all. So a
// challenge never states its own rule — it names a metric from the fixed
// vocabulary below, sets a target, and writes words around that. Evaluation is
// then ordinary arithmetic, and "log your food 5 days this week" is checked by
// counting nutrition logs.
//
// EVERY METRIC HERE MUST BE COUNTABLE OVER THE WINDOW. That is a stronger rule
// than "the app tracks it somewhere", and it is where `program_sessions` came
// unstuck: programs.completed_sessions is `["w1d1", ...]` with no timestamps
// (migration 0041 says as much), so the only number available was the LIFETIME
// total. Fed to a week-long challenge it read as complete on day one for anyone
// who had ever ticked a session off — permanently. A metric that cannot be
// counted over the window does not belong in the vocabulary, so it is not in
// it, and the type stops anyone writing a challenge against it by mistake.
// =============================================================================

/** Everything a challenge may be measured against. Nothing else is accepted. */
export type ChallengeMetric =
  | "check_ins" | "training_sessions"
  | "nutrition_logs" | "benchmarks" | "videos" | "streak"
  // --- Added for the daily window ------------------------------------------
  // The seven above are cumulative counters, and over ONE day every one of them
  // collapses to "do the thing once" — which is exactly the three fixed quests
  // already on the page. A daily challenge drawn from that vocabulary can only
  // ever be a reworded quest. These are the ones that give a day something of
  // its own to say, and every one is evaluable from data already loaded.
  | "rest_days"          // checked in, did not train — the app's own advice, paid for
  | "perfect_days"       // checked in AND trained AND logged food
  | "calorie_goal_days"  // ate within range of the target on the row
  | "easy_sessions";     // logged at RPE 6 or under

export const CHALLENGE_METRICS: ChallengeMetric[] = [
  "check_ins", "training_sessions",
  "nutrition_logs", "benchmarks", "videos", "streak",
  "rest_days", "perfect_days", "calorie_goal_days", "easy_sessions",
];

const METRIC_LABEL: Record<ChallengeMetric, string> = {
  check_ins: "check-ins",
  training_sessions: "training sessions",
  nutrition_logs: "days of food logged",
  benchmarks: "benchmark tests",
  videos: "clips analysed",
  streak: "day streak",
  rest_days: "rest days logged",
  perfect_days: "complete days",
  calorie_goal_days: "days on your calorie target",
  easy_sessions: "easy sessions",
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

/**
 * What the athlete has done in the challenge window (the last 7 days).
 *
 * Every field is a count OVER THAT WINDOW. Handing this a lifetime total is the
 * one way to break every challenge on a metric at once — see the header.
 */
export interface WeekActivity {
  check_ins: number;
  training_sessions: number;
  nutrition_logs: number;
  benchmarks: number;
  videos: number;
  streak: number;
  rest_days: number;
  perfect_days: number;
  calorie_goal_days: number;
  easy_sessions: number;
}

export const EMPTY_WEEK: WeekActivity = {
  check_ins: 0, training_sessions: 0,
  nutrition_logs: 0, benchmarks: 0, videos: 0, streak: 0,
  rest_days: 0, perfect_days: 0, calorie_goal_days: 0, easy_sessions: 0,
};

// Nobody should be handed "train 7 days this week". Targets are clamped to
// something a real week can hold.
const MAX_TARGET: Record<ChallengeMetric, number> = {
  check_ins: 7, training_sessions: 6,
  nutrition_logs: 7, benchmarks: 3, videos: 3, streak: 30,
  rest_days: 4, perfect_days: 5, calorie_goal_days: 7, easy_sessions: 4,
};

export function clampTarget(metric: ChallengeMetric, target: number): number {
  const n = Math.round(Number(target) || 0);
  return Math.max(1, Math.min(MAX_TARGET[metric] ?? 7, n));
}

/**
 * XP scaled to how much work the challenge actually is. Exported because the
 * pool prices its templates with it — a second copy of this table is a second
 * copy that drifts, and the drift shows up as two challenges of identical
 * difficulty paying different amounts.
 */
export function xpFor(metric: ChallengeMetric, target: number): number {
  const per: Record<ChallengeMetric, number> = {
    check_ins: 15, training_sessions: 25,
    nutrition_logs: 15, benchmarks: 40, videos: 35, streak: 8,
    // A complete day is three habits at once, so it pays like three.
    rest_days: 20, perfect_days: 45, calorie_goal_days: 20, easy_sessions: 25,
  };
  return Math.round((per[metric] ?? 15) * target);
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
