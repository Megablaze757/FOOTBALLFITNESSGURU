import { RACE_METRICS, easyShare, riegel, runType, type ZoneId } from "./running";
import type { StrengthBenchmark, TrainingLog } from "./types";
import { durationMinutes } from "./training-duration";

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 28;
const CHART_WEEKS = 8;

export interface RunWindowStats {
  distanceKm: number;
  durationMinutes: number;
  runs: number;
  avgPaceSecPerKm: number | null;
  avgHr: number | null;
  longestKm: number;
}

export interface ZoneProgress extends RunWindowStats {
  previousDistanceKm: number;
  distanceDeltaKm: number;
  previousPaceSecPerKm: number | null;
  /** Positive means faster than the previous 28 days. */
  paceGainSecPerKm: number | null;
  previousAvgHr: number | null;
}

export interface RunWeek {
  date: string;
  value: number;
  runs: number;
}

export interface RunZoneTotal {
  zone: ZoneId;
  distanceKm: number;
  pct: number;
}

export interface RaceProgress {
  key: string;
  distanceKm: number;
  testDate: string;
  latestMinutes: number;
  bestMinutes: number;
  isPb: boolean;
  /** Positive means the latest test was faster than the previous test. */
  gainSeconds: number | null;
}

export interface RunnerRank {
  label: string;
  colour: string;
  improvementPct: number;
  baseline5kSeconds: number;
  best5kSeconds: number;
  nextLabel: string | null;
  secondsToNext: number | null;
  progressPct: number;
}

export interface RunningProgressSummary {
  current: RunWindowStats;
  previous: RunWindowStats;
  distanceDeltaKm: number;
  weekly: RunWeek[];
  zones: RunZoneTotal[];
  unzonedKm: number;
  zone2: ZoneProgress;
  split: ReturnType<typeof easyShare>;
  races: RaceProgress[];
  rank: RunnerRank | null;
}

const RUNNER_RANKS = [
  { label: "Baseline", minPct: 0, colour: "#94a3b8" },
  { label: "Bronze", minPct: 1, colour: "#d58b5b" },
  { label: "Silver", minPct: 3, colour: "#cbd5e1" },
  { label: "Gold", minPct: 5, colour: "#e3b53f" },
  { label: "Platinum", minPct: 8, colour: "#67e8f9" },
  { label: "Diamond", minPct: 12, colour: "#a78bfa" },
] as const;

function dayNumber(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function isoFromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function round2(value: number): number {
  return +value.toFixed(2);
}

function isRun(log: TrainingLog): boolean {
  return Boolean(log.run_type) || Number(log.distance_km) > 0;
}

function effectiveZone(log: TrainingLog): ZoneId | null {
  if (log.zone && log.zone >= 1 && log.zone <= 5) return log.zone;
  return log.run_type ? runType(log.run_type)?.primaryZone ?? null : null;
}

function windowStats(logs: TrainingLog[]): RunWindowStats {
  const runs = logs.filter(isRun);
  const distanceKm = runs.reduce((sum, log) => sum + (Number(log.distance_km) || 0), 0);
  const totalDurationMinutes = runs.reduce((sum, log) => sum + durationMinutes(log), 0);
  const paced = runs.filter((log) => Number(log.distance_km) > 0 && durationMinutes(log) > 0);
  const pacedKm = paced.reduce((sum, log) => sum + Number(log.distance_km), 0);
  const pacedMinutes = paced.reduce((sum, log) => sum + durationMinutes(log), 0);
  const withHr = runs.filter((log) => Number(log.avg_hr) > 0);
  const hrWeight = (log: TrainingLog) => durationMinutes(log) > 0 ? durationMinutes(log) : 1;
  const totalHrWeight = withHr.reduce((sum, log) => sum + hrWeight(log), 0);

  return {
    distanceKm: round2(distanceKm),
    durationMinutes: +totalDurationMinutes.toFixed(2),
    runs: runs.length,
    avgPaceSecPerKm: pacedKm > 0 ? Math.round((pacedMinutes * 60) / pacedKm) : null,
    avgHr: totalHrWeight > 0
      ? Math.round(withHr.reduce((sum, log) => sum + Number(log.avg_hr) * hrWeight(log), 0) / totalHrWeight)
      : null,
    longestKm: round2(Math.max(0, ...runs.map((log) => Number(log.distance_km) || 0))),
  };
}

function raceProgress(rows: StrengthBenchmark[]): RaceProgress[] {
  return Object.entries(RACE_METRICS).flatMap(([key, distanceKm]) => {
    const points = rows
      .filter((row) => Number(row.metrics?.[key]) > 0)
      .map((row) => ({ date: row.test_date, minutes: Number(row.metrics[key]) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!points.length) return [];
    const latest = points[points.length - 1];
    const previous = points[points.length - 2];
    const bestMinutes = Math.min(...points.map((point) => point.minutes));
    return [{
      key,
      distanceKm,
      testDate: latest.date,
      latestMinutes: latest.minutes,
      bestMinutes,
      isPb: latest.minutes === bestMinutes,
      gainSeconds: previous ? Math.round((previous.minutes - latest.minutes) * 60) : null,
    }];
  });
}

function runnerRank(rows: StrengthBenchmark[]): RunnerRank | null {
  // Put 1500m, 5k and 10k on one comparable scale. This is a PERSONAL progress
  // rank, deliberately not an age/sex population table: a fair app should not
  // label a masters runner "beginner" beside a 20-year-old because their clock
  // times differ. Every athlete ranks up by improving their own 5k equivalent.
  const points = rows.flatMap((row) => Object.entries(RACE_METRICS).flatMap(([key, distanceKm]) => {
    const minutes = Number(row.metrics?.[key]);
    if (!(minutes > 0)) return [];
    return [{ date: row.test_date, seconds: riegel(minutes * 60, distanceKm, 5) }];
  })).sort((a, b) => a.date.localeCompare(b.date) || a.seconds - b.seconds);

  if (!points.length) return null;
  const firstDate = points[0].date;
  const baseline = Math.min(...points.filter((point) => point.date === firstDate).map((point) => point.seconds));
  const best = Math.min(...points.map((point) => point.seconds));
  const improvementPct = Math.max(0, ((baseline - best) / baseline) * 100);
  let index = 0;
  for (let i = 0; i < RUNNER_RANKS.length; i++) {
    if (improvementPct >= RUNNER_RANKS[i].minPct) index = i;
  }
  const rank = RUNNER_RANKS[index];
  const next = RUNNER_RANKS[index + 1] ?? null;
  const band = next ? next.minPct - rank.minPct : 1;
  const progressPct = next ? Math.round(((improvementPct - rank.minPct) / band) * 100) : 100;
  const targetSeconds = next ? baseline * (1 - next.minPct / 100) : null;

  return {
    label: rank.label,
    colour: rank.colour,
    improvementPct: +improvementPct.toFixed(1),
    baseline5kSeconds: Math.round(baseline),
    best5kSeconds: Math.round(best),
    nextLabel: next?.label ?? null,
    secondsToNext: targetSeconds == null ? null : Math.max(1, Math.ceil(best - targetSeconds)),
    progressPct: Math.max(0, Math.min(100, progressPct)),
  };
}

/**
 * Runner-specific performance from data the app already records.
 *
 * The comparison windows are equal 28-day blocks. That is long enough to stop
 * one long Sunday run dominating the answer and short enough for the result to
 * reflect the training block the athlete is actually in.
 */
export function summarizeRunProgress(
  logs: TrainingLog[],
  benchmarks: StrengthBenchmark[],
  asOf: string,
): RunningProgressSummary {
  const today = dayNumber(asOf);
  const currentStart = today - (WINDOW_DAYS - 1);
  const previousStart = today - (WINDOW_DAYS * 2 - 1);
  const previousEnd = currentStart - 1;
  const inRange = (log: TrainingLog, start: number, end: number) => {
    const day = dayNumber(log.log_date);
    return day >= start && day <= end;
  };

  const currentLogs = logs.filter((log) => inRange(log, currentStart, today) && isRun(log));
  const previousLogs = logs.filter((log) => inRange(log, previousStart, previousEnd) && isRun(log));
  const current = windowStats(currentLogs);
  const previous = windowStats(previousLogs);

  const currentZone2 = currentLogs.filter((log) => effectiveZone(log) === 2);
  const previousZone2 = previousLogs.filter((log) => effectiveZone(log) === 2);
  const zone2Now = windowStats(currentZone2);
  const zone2Before = windowStats(previousZone2);

  const chartStart = today - CHART_WEEKS * 7 + 1;
  const weekly: RunWeek[] = Array.from({ length: CHART_WEEKS }, (_, index) => ({
    date: isoFromDay(chartStart + index * 7),
    value: 0,
    runs: 0,
  }));
  for (const log of logs.filter(isRun)) {
    const day = dayNumber(log.log_date);
    if (day < chartStart || day > today) continue;
    const index = Math.floor((day - chartStart) / 7);
    weekly[index].value += Number(log.distance_km) || 0;
    weekly[index].runs += 1;
  }
  for (const week of weekly) week.value = round2(week.value);

  const knownZoneKm = currentLogs.reduce((sum, log) => effectiveZone(log) ? sum + (Number(log.distance_km) || 0) : sum, 0);
  const zones = ([1, 2, 3, 4, 5] as ZoneId[]).map((zone) => {
    const distanceKm = currentLogs.reduce(
      (sum, log) => effectiveZone(log) === zone ? sum + (Number(log.distance_km) || 0) : sum,
      0,
    );
    return {
      zone,
      distanceKm: round2(distanceKm),
      pct: knownZoneKm > 0 ? Math.round((distanceKm / knownZoneKm) * 100) : 0,
    };
  });

  const splitRuns = currentLogs
    .filter((log): log is TrainingLog & { run_type: NonNullable<TrainingLog["run_type"]> } => Boolean(log.run_type))
    .map((log) => ({
      type: log.run_type,
      km: log.distance_km,
      minutes: durationMinutes(log),
      zone: log.zone,
      intervals: log.intervals,
      effortSeconds: log.interval_seconds,
      recoverySeconds: log.recovery_seconds,
    }));

  return {
    current,
    previous,
    distanceDeltaKm: round2(current.distanceKm - previous.distanceKm),
    weekly,
    zones,
    unzonedKm: round2(Math.max(0, current.distanceKm - knownZoneKm)),
    zone2: {
      ...zone2Now,
      previousDistanceKm: zone2Before.distanceKm,
      distanceDeltaKm: round2(zone2Now.distanceKm - zone2Before.distanceKm),
      previousPaceSecPerKm: zone2Before.avgPaceSecPerKm,
      paceGainSecPerKm: zone2Now.avgPaceSecPerKm != null && zone2Before.avgPaceSecPerKm != null
        ? zone2Before.avgPaceSecPerKm - zone2Now.avgPaceSecPerKm
        : null,
      previousAvgHr: zone2Before.avgHr,
    },
    split: easyShare(splitRuns),
    races: raceProgress(benchmarks),
    rank: runnerRank(benchmarks),
  };
}
