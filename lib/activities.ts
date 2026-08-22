// =============================================================================
// The training you did that nobody programmed.
//
// The check-in could record two things: the session the block prescribed, and a
// run. Anything else — an hour of padel, a Sunday bike ride, a kickabout, a
// swim — had no way in. The drill picker is the wrong door for it: it adds an
// exercise with sets, reps and a weight, and "3 × 10 padel at 0kg" is not a
// record of a game of padel. So people either skipped it, which loses the load
// entirely, or typed it as a lift, which corrupts the volume numbers.
//
// An activity is measured in TIME, and that is the whole difference. Stored as
// an ordinary drill with `measure: "minutes"` — a shape the log, the session
// summary and the training-set helpers already understand — so this needs no
// migration and nothing downstream has to learn a new kind of row.
//
// The session's minutes and intensity are what drive training load, and both
// are already on the form. An activity therefore counts toward the acute:chronic
// ratio, the week's totals and the streak exactly as a gym session does, which
// is the point: a week with four hours of padel in it was being read as a week
// of rest.
// =============================================================================

import type { TrainingDrill } from "./types";

export interface Activity {
  id: string;
  label: string;
  emoji: string;
  /**
   * A starting intensity out of ten, so the session is not logged at zero load
   * by somebody who came to record a bike ride and not to rate it.
   *
   * Deliberately conservative — these are the recreational versions. An athlete
   * who went hard changes it, and the field is right there.
   */
  intensity: number;
}

/**
 * Ordered by how often people actually log them, not alphabetically. The list
 * is a shortcut, never a limit: anything typed is accepted.
 */
export const ACTIVITIES: Activity[] = [
  { id: "cycling", label: "Cycling", emoji: "🚴", intensity: 6 },
  { id: "swimming", label: "Swimming", emoji: "🏊", intensity: 6 },
  { id: "padel", label: "Padel", emoji: "🎾", intensity: 6 },
  { id: "tennis", label: "Tennis", emoji: "🎾", intensity: 6 },
  { id: "football", label: "Football", emoji: "⚽", intensity: 7 },
  { id: "basketball", label: "Basketball", emoji: "🏀", intensity: 7 },
  { id: "walking", label: "Walking", emoji: "🚶", intensity: 3 },
  { id: "hiking", label: "Hiking", emoji: "🥾", intensity: 5 },
  { id: "climbing", label: "Climbing", emoji: "🧗", intensity: 6 },
  { id: "yoga", label: "Yoga", emoji: "🧘", intensity: 3 },
  { id: "boxing", label: "Boxing", emoji: "🥊", intensity: 7 },
  { id: "martial_arts", label: "Martial arts", emoji: "🥋", intensity: 7 },
  { id: "rowing", label: "Rowing", emoji: "🚣", intensity: 6 },
  { id: "badminton", label: "Badminton", emoji: "🏸", intensity: 5 },
  { id: "squash", label: "Squash", emoji: "🎾", intensity: 7 },
  { id: "golf", label: "Golf", emoji: "⛳", intensity: 3 },
  { id: "skiing", label: "Skiing", emoji: "⛷️", intensity: 6 },
  { id: "surfing", label: "Surfing", emoji: "🏄", intensity: 6 },
  { id: "dance", label: "Dance", emoji: "💃", intensity: 5 },
  { id: "skating", label: "Skating", emoji: "🛼", intensity: 5 },
];

/**
 * The known activity a piece of free text means, or null.
 *
 * Matched on the whole word so "padel" finds padel and "paddleboarding" does
 * not — the emoji and the suggested intensity are worth having only while they
 * are right, and a near-miss is worse than no match at all.
 */
export function matchActivity(text: string): Activity | null {
  const value = text.trim().toLowerCase();
  if (!value) return null;
  return ACTIVITIES.find((a) => a.id === value || a.label.toLowerCase() === value)
    ?? ACTIVITIES.find((a) => new RegExp(`\\b${a.label.toLowerCase()}\\b`).test(value))
    ?? null;
}

/**
 * When in the day a session happened.
 *
 * A DAY IS NOT ONE SESSION. "Spin this morning, padel this afternoon" and
 * "rugby training, gym later" are two sessions each, and the log held one
 * duration and one effort for the whole day — so the second session either
 * overwrote the first or was left out. Both are wrong in the same direction:
 * a double day is the hardest kind, and it was recorded as the lightest.
 *
 * The database enforces one ROW per day (unique_training_day, migration 0006),
 * which is the right shape — the check-in is a day. So the sessions live inside
 * the day's `drills` JSONB, which needs no migration and no reader anywhere has
 * to learn about a second row.
 */
export const PARTS_OF_DAY = [
  { id: "morning" as const, label: "Morning", emoji: "🌅" },
  { id: "afternoon" as const, label: "Afternoon", emoji: "☀️" },
  { id: "evening" as const, label: "Evening", emoji: "🌙" },
];

export type PartOfDay = (typeof PARTS_OF_DAY)[number]["id"];

/**
 * The drill row for an activity.
 *
 * One set, measured in minutes. `reps` carries the minutes as well because the
 * older summary fields are what a log written before per-set detail reads, and
 * a row that says "1 × 0" everywhere those are shown would look like a session
 * that never happened.
 *
 * `effort` and `part_of_day` are what make two sessions in a day possible. Both
 * optional: an entry added before they existed, or by somebody who did not
 * bother, still reads correctly — see `dayTotals`.
 */
export function activityDrill(
  name: string,
  minutes: number,
  extra: { effort?: number | null; part?: PartOfDay | null } = {},
): TrainingDrill | null {
  const label = name.trim();
  const mins = Math.round(Number(minutes));
  if (!label || !Number.isFinite(mins) || mins <= 0) return null;
  const effort = Number(extra.effort);
  return {
    name: label,
    measure: "minutes",
    duration_seconds: mins * 60,
    sets: 1,
    reps: mins,
    ...(Number.isFinite(effort) && effort > 0 ? { effort: Math.min(10, Math.round(effort)) } : {}),
    ...(extra.part ? { part_of_day: extra.part } : {}),
  };
}

/** Whether a logged drill is an activity rather than an exercise. */
export function isActivityDrill(drill: Pick<TrainingDrill, "measure">): boolean {
  return drill.measure === "minutes";
}

/** How long an activity drill lasted, in whole minutes. */
export function activityMinutes(drill: Pick<TrainingDrill, "duration_seconds" | "reps">): number {
  const seconds = Number(drill.duration_seconds);
  if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds / 60);
  return Math.max(0, Math.round(Number(drill.reps) || 0));
}

/**
 * The session that was already in the day's boxes, written down as a session.
 *
 * Called once, when a SECOND session is added: up to that point the day's
 * length and effort are that session's own numbers, and after it they are the
 * day's total. Without this the first session simply disappears into an
 * unexplained total — the gym work you did this morning becoming part of a
 * number that says "150 min" with a padel match next to it.
 *
 * Named after the sport, because "Gym session" is wrong for a footballer whose
 * first session was training with their club.
 */
export function mainSessionDrill(sport: string | null | undefined, minutes: number, intensity: number | null): TrainingDrill | null {
  return activityDrill(mainSessionLabel(sport), minutes, { effort: intensity });
}

/**
 * What the day's own session is called, for a given sport.
 *
 * Exported because the runner's clock has to find its entry again: a runner who
 * adds a second session gets their run folded into the list, and editing the
 * run time afterwards must move that entry rather than leave it saying 40 min
 * next to a clock reading 45.
 */
export function mainSessionLabel(sport: string | null | undefined): string {
  return MAIN_SESSION_LABEL[String(sport)] ?? "Training session";
}

const MAIN_SESSION_LABEL: Record<string, string> = {
  football: "Football training",
  rugby: "Rugby training",
  basketball: "Basketball training",
  running: "Run",
  weightlifting: "Gym session",
  gym: "Gym session",
};

export interface DayTotals {
  /** Everything trained today, in minutes. */
  minutes: number | null;
  /**
   * The day's effort out of ten, weighted by how long each session lasted.
   *
   * WHY WEIGHTED AND NOT AVERAGED. Training load is minutes × effort, and the
   * app stores one of each per day. A twenty-minute spin at 9 and a
   * ninety-minute padel game at 5 average to 7, which multiplied by 110 minutes
   * claims far more load than either session earned. Weighting by duration
   * makes minutes × intensity come out at exactly the sum of the two sessions'
   * load, which is the number every readiness and ACWR calculation downstream
   * is built on.
   */
  intensity: number | null;
  /** How many separate sessions the day holds. One or zero is the ordinary case. */
  sessions: number;
}

/**
 * The day's headline numbers, from its sessions.
 *
 * EVERY session is in the list by the time this is asked. The check-in folds
 * the day's own boxes into the list the moment a second session is added (see
 * `mainSessionDrill`), precisely so this function has one place to look — a
 * total that came half from a list and half from a box either double-counts
 * the first session or loses it, and both have been shipped by apps that tried
 * to keep the two in step.
 */
export function dayTotals(
  drills: Pick<TrainingDrill, "measure" | "duration_seconds" | "reps" | "effort">[],
): DayTotals {
  const parts: { minutes: number; effort: number | null }[] = drills
    .filter(isActivityDrill)
    .map((d) => ({ minutes: activityMinutes(d), effort: Number.isFinite(Number(d.effort)) ? Number(d.effort) : null }));

  if (!parts.length) return { minutes: null, intensity: null, sessions: 0 };

  const minutes = parts.reduce((n, p) => n + p.minutes, 0);
  const rated = parts.filter((p) => p.effort != null);
  const ratedMinutes = rated.reduce((n, p) => n + p.minutes, 0);
  // Absent is not zero: a session logged with no effort is one the app does not
  // know the difficulty of, and averaging it in as a nought would drag the
  // day's number down for having recorded LESS.
  const intensity = ratedMinutes > 0
    ? Math.round(rated.reduce((n, p) => n + p.minutes * (p.effort as number), 0) / ratedMinutes)
    : null;

  return { minutes: minutes > 0 ? minutes : null, intensity, sessions: parts.length };
}
