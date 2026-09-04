import { test } from "node:test";
import assert from "node:assert/strict";
import { reminderPlan, workoutReminderDue, silent, type ReminderInput } from "./reminder-plan";
import { CHECKIN_REMINDER_STOP_DAYS } from "./checkin-reminder";

const base: ReminderInput = {
  today: "2026-09-04",
  joined: "2026-01-01",
  lastCheckIn: "2026-09-04",
  checkInsEver: 40,
  lastTrainingLog: "2026-09-04",
  hasActiveProgram: true,
  wantsCheckinEmail: true,
  wantsWorkoutEmail: true,
  wantsCards: true,
};

const on = (over: Partial<ReminderInput>) => reminderPlan({ ...base, ...over });

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * "THE REMINDERS ARE NOT GOOD."
 *
 * The workout email had no cadence rule of any kind: an active program plus no
 * log yet today was enough, so it went out every single morning, forever, to
 * people who had already stopped. lib/checkin-reminder.ts exists because the
 * check-in email did precisely that and it was fixed — and the sender directly
 * below it was left as it was.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the workout email is not a daily email", () => {
  // Trained yesterday, nothing logged today. Somebody with a habit, one morning
  // in. There is nothing here worth an envelope.
  assert.equal(on({ lastTrainingLog: "2026-09-03" }).workoutEmail, false);
  assert.equal(on({ lastTrainingLog: "2026-09-02" }).workoutEmail, false);
  // Three days of silence is a real absence.
  assert.equal(on({ lastTrainingLog: "2026-09-01" }).workoutEmail, true);
  // And then it waits again rather than going daily from day three.
  assert.equal(on({ lastTrainingLog: "2026-08-31" }).workoutEmail, false);
  assert.equal(on({ lastTrainingLog: "2026-08-30" }).workoutEmail, false);
  assert.equal(on({ lastTrainingLog: "2026-08-29" }).workoutEmail, true);
});

/** Silence is the honest end state, and a sending domain's reputation is spent
 *  on the athletes who need a password reset. */
test("it stops entirely rather than mailing somebody for ever", () => {
  const gone = new Date(Date.parse("2026-09-04T00:00:00Z") - (CHECKIN_REMINDER_STOP_DAYS + 3) * 86_400_000)
    .toISOString().slice(0, 10);
  const plan = on({ lastTrainingLog: gone, lastCheckIn: gone });
  assert.equal(plan.workoutEmail, false);
  assert.equal(plan.checkinEmail, false);
  // The cards remain — an app somebody chooses to open is not an intrusion.
  assert.equal(plan.checkinCard, true);
});

/**
 * Two senders, each behaving reasonably, adding up to something nobody would
 * have chosen: both linked to /journal and both asked for the thing you do on
 * the same screen.
 */
test("never two emails in one day", () => {
  // 08:00 sends the check-in; 19:00 must not then send the workout one.
  const both = on({ lastCheckIn: "2026-09-01", lastTrainingLog: "2026-09-01" });
  assert.equal(both.checkinEmail, true, "the check-in is due");
  assert.equal(both.workoutEmail, false, "and it is the one that goes — not both");
  // The workout CARD still appears, so nothing is hidden from somebody who opens
  // the app. Only the second envelope is dropped.
  assert.equal(both.workoutCard, true);

  // On a day the check-in is NOT due, the evening email is free to go.
  const only = on({ lastCheckIn: "2026-09-04", lastTrainingLog: "2026-09-01" });
  assert.equal(only.checkinEmail, false);
  assert.equal(only.workoutEmail, true);
});

test("nothing is asked for that has already been done", () => {
  const done = on({ lastCheckIn: "2026-09-04", lastTrainingLog: "2026-09-04" });
  assert.deepEqual(done, { checkinCard: false, checkinEmail: false, workoutCard: false, workoutEmail: false });
  assert.ok(silent(done), "a row that shows nowhere and sends nothing is a row nobody asked for");
});

test("no program means no workout reminder of either kind", () => {
  const plan = on({ hasActiveProgram: false, lastTrainingLog: "2026-08-01" });
  assert.equal(plan.workoutCard, false);
  assert.equal(plan.workoutEmail, false);
});

/** Preferences are not advisory. */
test("an athlete who turned it off hears nothing of that kind", () => {
  const noMail = on({ lastCheckIn: "2026-09-01", wantsCheckinEmail: false, wantsWorkoutEmail: false });
  assert.equal(noMail.checkinEmail, false);
  assert.equal(noMail.workoutEmail, false);

  // Cards off, mail on: the row still has to exist for the mail to ride on.
  const mailOnly = on({ lastCheckIn: "2026-09-01", wantsCards: false });
  assert.equal(mailOnly.checkinCard, true, "the notification row is what the email is sent from");
  assert.equal(mailOnly.checkinEmail, true);

  // Both off: nothing at all.
  assert.ok(silent(on({
    lastCheckIn: "2026-09-01", lastTrainingLog: "2026-09-01",
    wantsCards: false, wantsCheckinEmail: false, wantsWorkoutEmail: false,
  })));
});

/**
 * A new joiner gets the accelerated CHECK-IN cadence and the ordinary workout
 * one. Three days without training in your first week is a rest day; three days
 * without a check-in in your first week is the habit not forming.
 */
test("a new athlete is chased about the habit, not about training", () => {
  const day2 = { today: "2026-09-04", joined: "2026-09-02", checkInsEver: 1 };
  assert.equal(on({ ...day2, lastCheckIn: "2026-09-03", lastTrainingLog: "2026-09-03" }).checkinEmail, true);
  assert.equal(on({ ...day2, lastCheckIn: "2026-09-04", lastTrainingLog: "2026-09-03" }).workoutEmail, false);
});

/** Never mailed on a date the clocks disagree about. */
test("a log dated in the future does not trigger anything", () => {
  assert.equal(workoutReminderDue("2026-09-20", "2026-01-01", "2026-09-04"), false);
  assert.equal(on({ lastTrainingLog: "2026-09-20", lastCheckIn: "2026-09-20" }).workoutEmail, false);
});

/** Never trained at all: the clock starts when they joined, not at the epoch. */
test("somebody who has never logged is measured from the day they joined", () => {
  assert.equal(workoutReminderDue(null, "2026-09-04", "2026-09-04"), false, "not on day one");
  assert.equal(workoutReminderDue(null, "2026-09-01", "2026-09-04"), true);
  assert.equal(workoutReminderDue(null, "2026-01-01", "2026-09-04"), false, "and not for ever after");
});
