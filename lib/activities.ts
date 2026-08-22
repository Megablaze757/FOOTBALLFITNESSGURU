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
 * The drill row for an activity.
 *
 * One set, measured in minutes. `reps` carries the minutes as well because the
 * older summary fields are what a log written before per-set detail reads, and
 * a row that says "1 × 0" everywhere those are shown would look like a session
 * that never happened.
 */
export function activityDrill(name: string, minutes: number): TrainingDrill | null {
  const label = name.trim();
  const mins = Math.round(Number(minutes));
  if (!label || !Number.isFinite(mins) || mins <= 0) return null;
  return {
    name: label,
    measure: "minutes",
    duration_seconds: mins * 60,
    sets: 1,
    reps: mins,
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
 * The minutes an activity adds to a session that has no length of its own.
 *
 * Only ever a SUGGESTION, and only when the field is empty. Somebody who logs
 * an hour of padel inside a ninety-minute session has said something the app
 * should not overwrite — see the note on session length in TrainingLogInput.
 */
export function suggestedSessionMinutes(drills: Pick<TrainingDrill, "measure" | "duration_seconds" | "reps">[]): number | null {
  const total = drills.filter(isActivityDrill).reduce((n, d) => n + activityMinutes(d), 0);
  return total > 0 ? total : null;
}
