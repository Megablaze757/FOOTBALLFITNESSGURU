// =============================================================================
// WHAT AN ATHLETE HEARS FROM US IN ONE DAY.
//
// ═══════════════════════════════════════════════════════════════════════════
// THREE THINGS WERE WRONG, AND TWO OF THEM WERE ALREADY FIXED ONCE.
//
// 1. THE WORKOUT EMAIL WENT EVERY SINGLE DAY. lib/checkin-reminder.ts exists
//    because the check-in email did exactly that, and its note says why it is
//    wrong: "somebody who stopped using the app got one every single day,
//    forever… the people it reaches hardest are exactly the people already
//    ignoring it." The workout reminder sat one function below it in the same
//    file with no such rule at all — an unconditional email, every morning, to
//    anyone with an active program who had not logged yet. The fix was written
//    and then not applied to the sender next to it.
//
// 2. TWO EMAILS, ONE DAY, ONE ACTION. Somebody who logged neither got "Your
//    daily log" at 08:00 and "Log today's training or rest day" at 19:00 —
//    both linking to /journal, both asking for the thing you do on the same
//    screen. The split hours are deliberate and right (calling a day's training
//    "missing" at breakfast would be absurd), which is exactly why nobody
//    noticed the pair: each sender was reasonable and the total was not.
//
// 3. NOTHING STOPPED THEM DISAGREEING. The cadence lived inside one sender, so
//    the only way the other could honour it was for somebody to remember. This
//    is one decision, for one athlete, for one day, made in one place.
//
//    The two senders still run in separate cron invocations eleven hours apart
//    and never speak. They do not have to: every input here is a fact about the
//    day, so the evening run can ask "did the morning email them?" and get the
//    same answer the morning got — the property lib/checkin-reminder.ts was
//    already built on, used across two runs instead of two rows.
// ═══════════════════════════════════════════════════════════════════════════
//
// Pure, so the Worker can be a fetch and a loop. The Worker is deployed by hand
// and the rules are the part that has a wrong answer.
// =============================================================================

import {
  checkinReminderDue, daysBetween,
  CHECKIN_REMINDER_GAP_DAYS, CHECKIN_REMINDER_STOP_DAYS,
} from "./checkin-reminder";

export interface ReminderInput {
  today: string;
  /** The day they joined, as the clock the grace period starts on. */
  joined: string;
  lastCheckIn: string | null;
  /** Check-ins in the window fetched — see reminderStep for what it decides. */
  checkInsEver: number;
  lastTrainingLog: string | null;
  hasActiveProgram: boolean;
  /** Their email preferences, already read. Null profile means: send nothing. */
  wantsCheckinEmail: boolean;
  wantsWorkoutEmail: boolean;
  /** The in-app switch, which is one setting covering both cards. */
  wantsCards: boolean;
}

export interface ReminderPlan {
  checkinCard: boolean;
  checkinEmail: boolean;
  workoutCard: boolean;
  workoutEmail: boolean;
}

/**
 * The workout email waits for a real absence, exactly as the check-in one does.
 *
 * Deliberately the SAME numbers rather than a second set to tune: two cadences
 * would have to be reasoned about together every time either moved, and there
 * is no evidence anybody wants a different gap for the two. What differs is the
 * thing it counts — days since training was logged, not since a check-in.
 *
 * No new-joiner acceleration here. That exists because the first week decides
 * whether somebody keeps the check-in habit; a new athlete may legitimately not
 * train for three days, and a daily "log today's training" through their first
 * week is the nagging this module exists to stop.
 */
export function workoutReminderDue(
  lastLog: string | null,
  joined: string,
  today: string,
): boolean {
  const anchor = lastLog ?? joined;
  const gap = daysBetween(anchor, today);
  if (gap < CHECKIN_REMINDER_GAP_DAYS) return false;
  if (gap > CHECKIN_REMINDER_STOP_DAYS) return false;
  return gap % CHECKIN_REMINDER_GAP_DAYS === 0;
}

/**
 * Everything one athlete gets today, from both runs.
 *
 * The cards are unchanged and stay daily: a notification inside an app somebody
 * chose to open is not the intrusion an email is, and the same-day nudge is the
 * whole point of it. Only the mail is rationed.
 */
export function reminderPlan(input: ReminderInput): ReminderPlan {
  const checkedInToday = input.lastCheckIn === input.today;
  const loggedToday = input.lastTrainingLog === input.today;

  const checkinCard = !checkedInToday;
  const workoutCard = input.hasActiveProgram && !loggedToday;

  const checkinEmail = checkinCard
    && input.wantsCheckinEmail
    && checkinReminderDue(input.lastCheckIn, input.joined, input.today, input.checkInsEver);

  /**
   * AT MOST ONE EMAIL PER DAY, and the check-in wins.
   *
   * It is the shorter ask — sixty seconds against a session to write up — and
   * it is the one the rest of the app depends on: readiness has nothing to
   * score without it. Somebody who checks in usually goes on to log training;
   * the reverse is much less true.
   *
   * The workout CARD still appears either way, so nothing is hidden from
   * somebody who opens the app. Only the second envelope is dropped.
   */
  const workoutEmail = workoutCard
    && input.wantsWorkoutEmail
    && !checkinEmail
    && workoutReminderDue(input.lastTrainingLog, input.joined, input.today);

  return {
    checkinCard: checkinCard && (input.wantsCards || checkinEmail),
    checkinEmail,
    workoutCard: workoutCard && (input.wantsCards || workoutEmail),
    workoutEmail,
  };
}

/** Whether the day produces anything at all — a row that shows nowhere
 *  and sends nothing is a row nobody asked for. */
export function silent(plan: ReminderPlan): boolean {
  return !plan.checkinCard && !plan.checkinEmail && !plan.workoutCard && !plan.workoutEmail;
}
