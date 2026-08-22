// =============================================================================
// The three numbers Home leads with, chosen by what this athlete actually does.
//
// Home showed everybody the same thing: a rank, an XP bar and how many XP were
// left until the next level. That is a number about using the app, on the
// screen an athlete opens to find out how their training is going — and the
// audit that prompted this said the app read like "a second job", which is
// exactly what a homepage full of scores does.
//
// So the XP came off Home entirely (it still has a whole page of its own, one
// tap away on Performance) and this took its place: distance and pace for a
// runner, weight moved for a lifter, contact minutes for a rugby player,
// sessions and hard days for a footballer. Each against the same week last
// week, because a number with nothing to compare it to is trivia.
//
// PRIMARY ACTIVITY, NOT PROFILE SPORT. Someone who signed up as "gym" and then
// logged nothing but runs for a month should see mileage. The profile is the
// tie-break, not the answer — see primaryActivity().
// =============================================================================

import type { SportId } from "./exercises";
import type { TrainingLog } from "./types";
import { tonnage, totalDistanceKm, averagePaceSeconds } from "./load";
import { formatPace } from "./running";
import { durationMinutes } from "./training-duration";

export type HomeStatKey =
  | "sessions"
  | "minutes"
  | "distance"
  | "avgPace"
  | "tonnage"
  | "contactLoad"
  | "hardDays"
  | "avgIntensity";

export type StatTrend = "up" | "down" | "flat";

export interface HomeStat {
  key: HomeStatKey;
  /** Short enough for a 2-across tile on a 320px phone. */
  label: string;
  value: string;
  /** How it compares with the same seven days a week ago. Null when there is nothing to compare. */
  sub: string | null;
  trend: StatTrend | null;
  /**
   * Which direction is worth celebrating.
   *
   * Pace is the reason this exists: a smaller number is a faster runner, so an
   * arrow pointing down is good news and colouring it red would be a lie. A few
   * stats are honestly neither — more minutes is not better than fewer — and
   * those get a neutral arrow rather than a verdict nobody asked for.
   */
  goodWhen: "up" | "down" | "either";
}

/**
 * A run is anything logged with a distance or a run type.
 *
 * Not `session_type` — that column says workout / active rest / rest day, which
 * is about how hard the day was, not what was done on it.
 */
function isRun(log: TrainingLog): boolean {
  return (Number(log.distance_km) || 0) > 0 || log.run_type != null;
}

/** A lift is anything with a load on the bar. Bodyweight work doesn't count here. */
function isLift(log: TrainingLog): boolean {
  return (log.drills ?? []).some((d) => (Number((d as { load_kg?: number }).load_kg) || 0) > 0);
}

/**
 * What this athlete mostly does, which is not always what they signed up as.
 *
 * The threshold is a clear majority rather than a plurality: switching someone's
 * homepage away from their stated sport on 40% of sessions would be the app
 * arguing with them. At 60% it is telling them something true.
 *
 * Needs a real sample too — three sessions of evidence, so one week off does not
 * re-label a runner as a footballer.
 */
export function primaryActivity(sport: SportId | string | null | undefined, logs: TrainingLog[]): SportId | "running" | "gym" {
  const activity = logs.filter((l) => l.session_type !== "rest_day");
  if (activity.length >= 3) {
    const runs = activity.filter(isRun).length / activity.length;
    if (runs >= 0.6) return "running";
    const lifts = activity.filter(isLift).length / activity.length;
    if (lifts >= 0.6) return "gym";
  }
  return (sport ?? "football") as SportId;
}

/** Three keys per activity, in the order they matter to that athlete. */
const BY_ACTIVITY: Record<string, [HomeStatKey, HomeStatKey, HomeStatKey]> = {
  football: ["sessions", "minutes", "hardDays"],
  rugby: ["sessions", "contactLoad", "minutes"],
  basketball: ["sessions", "minutes", "hardDays"],
  running: ["distance", "avgPace", "sessions"],
  weightlifting: ["tonnage", "sessions", "minutes"],
  gym: ["tonnage", "sessions", "minutes"],
};

/**
 * Tried in order when one of the three above has nothing to show.
 *
 * A lifter who logged four sessions and never typed a weight would otherwise
 * lead with "0 kg", which reads as a failed week rather than a missing field.
 */
const FALLBACK: HomeStatKey[] = ["sessions", "minutes", "distance", "tonnage", "hardDays", "avgIntensity"];

const LABEL: Record<HomeStatKey, string> = {
  sessions: "Sessions",
  minutes: "Time",
  distance: "Distance",
  avgPace: "Avg pace",
  tonnage: "Weight moved",
  contactLoad: "Contact",
  hardDays: "Hard days",
  avgIntensity: "Avg effort",
};

const GOOD: Record<HomeStatKey, HomeStat["goodWhen"]> = {
  sessions: "up",
  minutes: "either",
  distance: "up",
  // Fewer seconds per kilometre is faster.
  avgPace: "down",
  tonnage: "up",
  // More contact is not an achievement — it is load to be managed.
  contactLoad: "either",
  hardDays: "either",
  // Harder is not better. It is the number that says whether a light week was
  // actually light.
  avgIntensity: "either",
};

/** The raw number behind a stat. Null means "this athlete records nothing here". */
function raw(key: HomeStatKey, logs: TrainingLog[]): number | null {
  const activity = logs.filter((l) => l.session_type !== "rest_day");
  switch (key) {
    case "sessions":
      return activity.length;
    case "minutes":
      return Math.round(activity.reduce((n, l) => n + durationMinutes(l), 0));
    case "distance": {
      const km = totalDistanceKm(activity);
      return km > 0 ? km : null;
    }
    case "avgPace":
      return averagePaceSeconds(activity);
    case "tonnage": {
      const kg = tonnage(activity);
      return kg > 0 ? Math.round(kg) : null;
    }
    case "contactLoad": {
      const mins = activity.reduce((n, l) => n + (Number(l.contact_minutes) || 0), 0);
      return mins > 0 ? mins : null;
    }
    case "hardDays": {
      // 8 is where the check-in's own intensity scale stops calling it moderate.
      const hard = activity.filter((l) => (Number(l.intensity) || 0) >= 8).length;
      return hard > 0 ? hard : null;
    }
    case "avgIntensity": {
      // The backstop, and the one number almost every logged session carries.
      // Without it an athlete who trains without a barbell, a stopwatch or a
      // tape measure gets two tiles and a gap.
      const rated = activity.filter((l) => (Number(l.intensity) || 0) > 0);
      if (!rated.length) return null;
      return +(rated.reduce((n, l) => n + Number(l.intensity), 0) / rated.length).toFixed(1);
    }
  }
}

function format(key: HomeStatKey, value: number): string {
  switch (key) {
    case "minutes":
      return value >= 60 ? `${Math.floor(value / 60)}h ${value % 60}m` : `${value}m`;
    case "distance":
      // Tenths on the headline. The stored hundredths matter when you are
      // reading back a single run, not when you are glancing at a week.
      return `${value.toFixed(1)} km`;
    case "avgPace":
      return `${formatPace(value)}/km`;
    case "tonnage":
      return value >= 1000 ? `${(value / 1000).toFixed(1)}t` : `${value} kg`;
    case "contactLoad":
      return `${value} min`;
    case "avgIntensity":
      return `${value}/10`;
    default:
      return String(value);
  }
}

/**
 * How the week moved. Percentage, not absolute, so one rule fits kilometres and
 * kilograms — and a 5% deadband, because a runner who did 32.1km instead of
 * 32.0km has not trended upwards.
 */
function compare(key: HomeStatKey, now: number, before: number | null): { sub: string | null; trend: StatTrend | null } {
  if (before == null || before === 0) return { sub: null, trend: null };
  const change = (now - before) / before;
  if (Math.abs(change) < 0.05) return { sub: "Same as last week", trend: "flat" };
  const pct = Math.round(Math.abs(change) * 100);
  const up = change > 0;
  // Pace reads as faster/slower, not more/less — "12% more pace" is not English.
  const word = key === "avgPace" ? (up ? "slower" : "faster") : up ? "more" : "less";
  return { sub: `${pct}% ${word} than last week`, trend: up ? "up" : "down" };
}

/**
 * The three tiles, ready to render.
 *
 * `week` and `previous` are the two seven-day windows; the caller slices them,
 * because Home already holds 28 days of rows for the acute:chronic ratio and
 * has no reason to fetch them twice.
 *
 * Returns [] when the athlete has trained on neither, which is Home's cue to
 * render nothing at all rather than three zeros under a heading.
 */
export function homeStats(
  sport: SportId | string | null | undefined,
  week: TrainingLog[],
  previous: TrainingLog[] = []
): HomeStat[] {
  const trained = (rows: TrainingLog[]) => rows.some((l) => l.session_type !== "rest_day");
  if (!trained(week) && !trained(previous)) return [];

  const activity = primaryActivity(sport, [...week, ...previous]);
  const wanted = BY_ACTIVITY[activity] ?? BY_ACTIVITY.football;

  const out: HomeStat[] = [];
  const seen = new Set<HomeStatKey>();
  for (const key of [...wanted, ...FALLBACK]) {
    if (out.length === 3 || seen.has(key)) continue;
    seen.add(key);
    const value = raw(key, week);
    if (value == null) continue;
    const { sub, trend } = compare(key, value, raw(key, previous));
    out.push({ key, label: LABEL[key], value: format(key, value), sub, trend, goodWhen: GOOD[key] });
  }
  return out;
}
