// =============================================================================
// Streak milestones and "you hit your goal", as pure arithmetic.
//
// This logic used to live only inside a Supabase Edge Function, which is why it
// had no tests: nothing in the repo could import Deno. It now runs in the
// Cloudflare Worker alongside every other scheduled job, so the parts worth
// checking live here and the Worker does the fetching.
//
// Pure + tested.
// =============================================================================

/** Streak lengths worth saying something about. */
export const STREAK_MILESTONES = [7, 14, 21, 30, 60, 100, 180, 365] as const;

/** Metrics where a SMALLER number is a better result. */
export const LOWER_IS_BETTER = new Set([
  "sprint_10m", "sprint_20m", "sprint_40m", "bronco_s", "lane_agility_s",
  "run_1500m_min", "run_5k_min", "run_10k_min",
]);

export const METRIC_LABELS: Record<string, string> = {
  squat_1rm: "back squat 1RM", bench_1rm: "bench press 1RM", deadlift_1rm: "deadlift 1RM",
  sprint_10m: "10 m sprint", sprint_20m: "20 m sprint", sprint_40m: "40 m sprint",
  vertical_jump_cm: "vertical jump", yo_yo_level: "Yo-Yo IR1 level", bronco_s: "Bronco test",
  lane_agility_s: "lane agility", run_1500m_min: "1500 m time", run_5k_min: "5K time",
  run_10k_min: "10K time", snatch_1rm: "snatch 1RM", clean_jerk_1rm: "clean & jerk 1RM",
  front_squat_1rm: "front squat 1RM", ohp_1rm: "overhead press 1RM", pullups_max: "max pull-ups",
};

/** What to call a metric in a sentence. */
export function metricLabel(metric: string): string {
  return METRIC_LABELS[metric] ?? metric.replaceAll("_", " ");
}

/** Has this result reached the target, in whichever direction counts? */
export function goalAchieved(metric: string, current: number, target: number): boolean {
  return LOWER_IS_BETTER.has(metric) ? current <= target : current >= target;
}

/**
 * Consecutive check-in days ending today, or yesterday.
 *
 * YESTERDAY COUNTS, and that is the whole subtlety. The job runs in the
 * morning; somebody on a 29-day run who has not checked in yet TODAY is still
 * on 29, and refusing to count back from yesterday would make every streak read
 * as broken until they opened the app — so the 30-day milestone would fire on
 * the wrong day or not at all.
 */
export function currentStreak(dates: ReadonlySet<string>, today: string): number {
  const start = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(start)) return 0;
  let cursor = dates.has(today) ? start : start - 86_400_000;
  let count = 0;
  while (dates.has(new Date(cursor).toISOString().slice(0, 10))) {
    count++;
    cursor -= 86_400_000;
  }
  return count;
}

/** Is this streak length one worth a message? */
export function isStreakMilestone(streak: number): boolean {
  return (STREAK_MILESTONES as readonly number[]).includes(streak);
}
