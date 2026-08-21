// =============================================================================
// Training-load management — sRPE, acute:chronic workload ratio (ACWR), streaks,
// and a weekly report. Real sports-science used by pro setups; pure + tested.
// =============================================================================

import { totalReps } from "./training-sets";
import { intervalEffort } from "./running";
import type { DailyCheckIn, NutritionLog, TrainingLog } from "./types";
import { todayLocal, daysAgoLocal } from "./day";
import { durationMinutes, durationSeconds, isActivity } from "./training-duration";

/**
 * How much harder a minute of contact is than a minute of running.
 *
 * Rugby's injury driver is collisions, not running volume — so sixty minutes of
 * contact and sixty minutes of shuttles used to score identically, and ACWR
 * understated a contact week exactly when it mattered. 2x is the conservative
 * end of the collision-load literature; it is a weighting, not a measurement,
 * and it is deliberately blunt rather than falsely precise.
 *
 * Contact minutes are ADDITIONAL to total_minutes, not instead of them: an
 * athlete logs 80 minutes with 20 of contact, and those 20 count once as
 * ordinary minutes and once more again.
 */
export const CONTACT_WEIGHT = 2;

/**
 * Session load in arbitrary units = duration × intensity (session-RPE), with
 * contact minutes weighted up. Falls back to rep volume when there's no
 * duration.
 *
 * The unit stays arbitrary on purpose. ACWR is a RATIO of two averages of this
 * function, so what matters is that the formula is consistent across an
 * athlete's history — not what the number means. That's also why tonnage and
 * distance are reported separately rather than substituted in here: mixing
 * kilograms into a minutes-based series would make the ratio meaningless for
 * anyone who logs both.
 */
export function sessionLoad(t: TrainingLog): number {
  if (!isActivity(t)) return 0;
  /**
   * INTERVAL SESSIONS CARRY THEIR OWN DURATION.
   *
   * An athlete logging 8 × 90 seconds with 2 minutes jog has described a
   * 26-minute session precisely, and if they didn't also fill in the duration
   * box this used to fall through to counting reps — scoring a hill session by
   * how many drills were in it. The efforts plus the recoveries are a floor on
   * how long the session was, so use them when there is nothing better.
   *
   * A logged duration still wins where there is one: it includes the warm-up
   * and cool-down, which the interval fields cannot see.
   */
  const measured = intervalEffort({
    intervals: t.intervals,
    effortSeconds: t.interval_seconds,
    recoverySeconds: t.recovery_seconds,
    totalMinutes: t.total_minutes,
    zone: t.zone,
    type: t.run_type,
  });
  const exactDuration = durationMinutes(t);
  const duration = exactDuration > 0 ? exactDuration : (measured ? measured.workMinutes + measured.recoveryMinutes : 0);

  const minutes = duration + (t.contact_minutes ?? 0) * (CONTACT_WEIGHT - 1);
  /**
   * The athlete's own rating wins where they gave one — it is the only input
   * that knows they were ill, or that the hill was steeper than usual. The
   * derived intensity is the fallback, and it is a far better one than nothing:
   * see `intervalEffort`, which blends the zone of the efforts with the easy
   * running around them by their actual minutes.
   */
  const sRPE = minutes * (t.intensity ?? measured?.intensity ?? 0);
  if (sRPE > 0) return sRPE;
  // totalReps, not sets × reps. A drill logged set by set has varied reps, and
  // multiplying the rounded average would quietly misreport volume — which
  // feeds ACWR, which tells athletes when to back off.
  return (t.drills ?? []).reduce((s, d) => s + totalReps(d), 0);
}

/**
 * Total weight moved: sets × reps × load, summed.
 *
 * The honest headline for a lifter. sRPE is a poor fit for strength work — a
 * heavy triple and a set of twenty can sit at the same RPE for wildly different
 * work — and this is computable from drills we already store, so it needs no new
 * input from the athlete.
 */
export function tonnage(logs: TrainingLog[]): number {
  return logs.reduce(
    (total, t) =>
      total +
      (t.drills ?? []).reduce(
        (s, d) => s + (Number(d.sets) || 0) * (Number(d.reps) || 0) * (Number(d.load_kg) || 0),
        0
      ),
    0
  );
}

/** Total distance. The unit a runner actually plans and thinks in. */
export function totalDistanceKm(logs: TrainingLog[]): number {
  // The column stores hundredths and the log accepts hundredths. Rounding the
  // total to tenths made a correctly saved 5.66km appear as 5.7km on Progress,
  // which looked exactly like the input had been changed after saving.
  return +logs.reduce((s, t) => s + (Number(t.distance_km) || 0), 0).toFixed(2);
}

/**
 * Average pace across a set of runs, in seconds per kilometre.
 *
 * DISTANCE-WEIGHTED, not a mean of the paces. Averaging "5:00/km" and
 * "6:00/km" gives 5:30 whether the first was a 1km strider or a 20km long run,
 * and a runner who did both would be shown a number that describes neither. The
 * honest figure is total time over total distance, which is what a watch
 * reports for a single run and what this reports for a week of them.
 *
 * Only runs with BOTH numbers count. A run logged with a distance and no time
 * has no pace, and treating its time as zero would report a pace of nothing at
 * all — absent is not zero.
 *
 * `pace_seconds_per_km` is stored on the row and deliberately not read here:
 * it is derived from the same two fields, and recomputing from the totals is
 * the only way to weight it. Rows written before that column existed still
 * count, because they still have the distance and the duration.
 */
export function averagePaceSeconds(logs: TrainingLog[]): number | null {
  let km = 0;
  let seconds = 0;
  for (const log of logs) {
    const distance = Number(log.distance_km) || 0;
    const time = durationSeconds(log);
    if (distance <= 0 || time <= 0) continue;
    km += distance;
    seconds += time;
  }
  return km > 0 ? Math.round(seconds / km) : null;
}

export type LoadZone = "building" | "detraining" | "optimal" | "caution" | "danger";

export interface ACWR {
  acute: number; // avg daily load, last 7d
  chronic: number; // avg daily load, last 28d
  ratio: number | null; // acute / chronic
  zone: LoadZone;
  message: string;
}

function dailyLoadMap(logs: TrainingLog[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of logs) m.set(t.log_date, (m.get(t.log_date) ?? 0) + sessionLoad(t));
  return m;
}

/**
 * The map is keyed by `log_date`, which is the athlete's LOCAL day (see
 * lib/day.ts). Walking the window with `getTime() - i * 86400_000` and reading
 * it back with toISOString produced UTC days, so for anyone whose local date
 * differs from UTC's the whole window was offset by one — the acute:chronic
 * ratio was computed over the wrong seven days, in an engine whose entire job
 * is flagging load spikes.
 */
function windowAvg(map: Map<string, number>, asOf: Date, days: number): number {
  let total = 0;
  for (let i = 0; i < days; i++) {
    total += map.get(daysAgoLocal(i, asOf)) ?? 0;
  }
  return total / days;
}

/**
 * Acute:chronic workload ratio. The "sweet spot" is ~0.8–1.3; >1.5 is a load
 * spike associated with elevated injury risk; <0.8 is detraining.
 */
export function computeACWR(logs: TrainingLog[], asOf = new Date()): ACWR {
  const map = dailyLoadMap(logs);
  const acute = +windowAvg(map, asOf, 7).toFixed(0);
  const chronic = +windowAvg(map, asOf, 28).toFixed(0);

  if (chronic === 0) {
    return { acute, chronic, ratio: null, zone: "building", message: "Building your baseline — keep logging training to unlock load tracking." };
  }
  const ratio = +(acute / chronic).toFixed(2);
  let zone: LoadZone;
  let message: string;
  if (ratio < 0.8) { zone = "detraining"; message = "Load is dropping off — you may be detraining. Add volume back gradually."; }
  else if (ratio <= 1.3) { zone = "optimal"; message = "Load is in the sweet spot — well balanced and progressing safely."; }
  else if (ratio <= 1.5) { zone = "caution"; message = "Load is climbing fast. Hold here rather than adding more this week."; }
  else { zone = "danger"; message = "Sharp load spike — elevated injury risk. Back off volume for a few days."; }
  return { acute, chronic, ratio, zone, message };
}

/** Consecutive check-in days ending today (or yesterday). */
// The athlete's day, not UTC's — a streak is a human thing. See lib/day.ts for
// the check-ins this lost before it was fixed.
export function checkInStreak(dates: string[], today = todayLocal()): number {
  const set = new Set(dates);
  let streak = 0;
  let cursor = new Date(today);
  // Allow the streak to count if today isn't logged yet but yesterday was.
  if (!set.has(today)) cursor = new Date(cursor.getTime() - 86400_000);
  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor = new Date(cursor.getTime() - 86400_000);
  }
  return streak;
}

export interface WeeklyReport {
  checkIns: number;
  avgReadinessInputs: { sleep: number | null; fatigue: number | null };
  sessions: number;
  totalLoad: number;
  loadTrend: "up" | "down" | "flat";
  nutritionDays: number;
  topWin: string;
  focus: string;
}

/** A plain-language weekly summary from the last 7 days vs the prior 7. */
export function weeklyReport(
  checkIns: DailyCheckIn[],
  training: TrainingLog[],
  nutrition: NutritionLog[],
  asOf = new Date()
): WeeklyReport {
  // Local days, because every *_date column they are compared against is one.
  const cutoff = daysAgoLocal(7, asOf);
  const prevCutoff = daysAgoLocal(14, asOf);

  const weekCheck = checkIns.filter((c) => c.check_in_date > cutoff);
  const weekTrain = training.filter((t) => isActivity(t) && t.log_date > cutoff);
  const prevTrain = training.filter((t) => isActivity(t) && t.log_date > prevCutoff && t.log_date <= cutoff);
  const weekNut = nutrition.filter((n) => n.log_date > cutoff);

  const totalLoad = Math.round(weekTrain.reduce((s, t) => s + sessionLoad(t), 0));
  const prevLoad = prevTrain.reduce((s, t) => s + sessionLoad(t), 0);
  const loadTrend = totalLoad > prevLoad * 1.1 ? "up" : totalLoad < prevLoad * 0.9 ? "down" : "flat";

  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null;
  };

  const win =
    weekTrain.length >= 4 ? `${weekTrain.length} training sessions logged — strong consistency.`
    : weekCheck.length >= 5 ? "You checked in most days — great habit streak."
    : weekNut.length >= 4 ? "Nutrition logged consistently this week."
    : "You kept the daily loop going.";

  const focus =
    loadTrend === "up" ? "Load is rising — protect recovery (sleep + mobility) this week."
    : weekTrain.length < 3 ? "Aim for one more quality session next week."
    : "Hold this rhythm and chase a benchmark PR.";

  return {
    checkIns: weekCheck.length,
    avgReadinessInputs: { sleep: avg(weekCheck.map((c) => c.sleep_quality)), fatigue: avg(weekCheck.map((c) => c.fatigue_score)) },
    sessions: weekTrain.length,
    totalLoad,
    loadTrend,
    nutritionDays: weekNut.length,
    topWin: win,
    focus,
  };
}

/**
 * Did this training entry actually record anything?
 *
 * A `training_logs` row can exist with every field null — one gets upserted
 * alongside a check-in that touched none of it. Treating that as "you've logged
 * training" is the difference between prompting someone to log their session
 * and silently deciding they already did.
 *
 * Distance and contact minutes count in their own right: a runner who enters
 * 8km and nothing else has told us about a session, and a check for drills or
 * minutes alone would throw it away.
 */
export function hasTrainingContent(t: {
  drills?: unknown[] | null;
  total_minutes?: number | null;
  duration_seconds?: number | null;
  intensity?: number | null;
  distance_km?: number | null;
  contact_minutes?: number | null;
  run_type?: string | null;
  session_type?: string | null;
} | null | undefined): boolean {
  if (!t) return false;
  return !!(
    (t.drills?.length ?? 0) > 0 ||
    t.total_minutes ||
    t.duration_seconds ||
    t.intensity ||
    t.distance_km ||
    t.contact_minutes ||
    // A run type alone is a logged session: picking "Recovery run" and nothing
    // else still says what you did, and the 80/20 easy-hard report needs the row.
    t.run_type ||
    t.session_type === "active_rest" ||
    t.session_type === "rest_day"
  );
}
