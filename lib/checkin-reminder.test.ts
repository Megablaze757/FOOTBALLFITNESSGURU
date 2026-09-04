import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  checkinReminderDue, checkinReminderSince, daysBetween,
  CHECKIN_REMINDER_GAP_DAYS, CHECKIN_REMINDER_STOP_DAYS,
} from "./checkin-reminder";

const JOINED = "2026-01-01";

test("a reminder waits three days of actual silence", () => {
  // The complaint: it emailed on any morning you had not checked in YET, so
  // the people who use the app properly got mail for being late by an hour.
  for (const gap of [0, 1, 2]) {
    const today = new Date(Date.parse(`2026-03-10T00:00:00Z`) + gap * 86_400_000).toISOString().slice(0, 10);
    assert.equal(checkinReminderDue("2026-03-10", JOINED, today), false, `emailed after ${gap} days`);
  }
  assert.equal(checkinReminderDue("2026-03-10", JOINED, "2026-03-13"), true, "did not email after three days");
});

test("and then it waits again, instead of going daily from day three", () => {
  /**
   * "Only after three days" on its own moves the nagging rather than stopping
   * it: day 3, day 4, day 5, one every morning at the person least likely to
   * want one. At most one every three days.
   */
  const due: number[] = [];
  for (let gap = 0; gap <= 15; gap++) {
    const today = new Date(Date.parse("2026-03-10T00:00:00Z") + gap * 86_400_000).toISOString().slice(0, 10);
    if (checkinReminderDue("2026-03-10", JOINED, today)) due.push(gap);
  }
  assert.deepEqual(due, [3, 6, 9, 12, 15]);
});

test("it gives up after a month rather than mailing forever", () => {
  // Continuing to mail somebody who has not opened the app in a month is how a
  // sending domain earns a spam reputation, which costs the people who DO want
  // their password reset.
  const at = (gap: number) =>
    new Date(Date.parse("2026-03-10T00:00:00Z") + gap * 86_400_000).toISOString().slice(0, 10);
  assert.equal(checkinReminderDue("2026-03-10", JOINED, at(CHECKIN_REMINDER_STOP_DAYS)), true);
  for (const gap of [33, 36, 60, 90]) {
    assert.equal(checkinReminderDue("2026-03-10", JOINED, at(gap)), false, `still mailing at ${gap} days`);
  }
});

test("somebody who has never checked in gets the same grace, from when they joined", () => {
  // Not an email on day one because there is no row yet.
  assert.equal(checkinReminderDue(null, "2026-03-10", "2026-03-10"), false);
  assert.equal(checkinReminderDue(null, "2026-03-10", "2026-03-12"), false);
  assert.equal(checkinReminderDue(null, "2026-03-10", "2026-03-13"), true);
});

test("a clock disagreeing does not produce mail", () => {
  // A check-in dated tomorrow gives a negative gap. Nothing is due on it.
  assert.equal(checkinReminderDue("2026-03-15", JOINED, "2026-03-10"), false);
  assert.equal(daysBetween("2026-03-15", "2026-03-10"), -5);
  assert.equal(daysBetween("nonsense", "2026-03-10"), 0);
});

test("the window fetched is wide enough to answer the question", () => {
  // Fetching a shorter window than the rule reads makes every lapsed athlete
  // look like they have never checked in, which is a different rule.
  assert.equal(daysBetween(checkinReminderSince("2026-03-31"), "2026-03-31"), CHECKIN_REMINDER_STOP_DAYS);
});

test("there is exactly one sender, and it is the Worker", () => {
  /**
   * THERE USED TO BE TWO. The Cloudflare Worker queued a check-in notification
   * and drained it to email on its 08:00 cron; a Supabase Edge Function on a
   * pg_cron job sent the same reminder directly. Both were correct on their own
   * and neither knew the other existed, so the athlete got it twice — and
   * nothing inside the app could show that.
   *
   * The Edge Function is gone (migration 0097 unschedules its cron). This fails
   * if a second sender comes back, because the failure mode is invisible from
   * every screen in the product.
   */
  const worker = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");
  /**
   * Asserted as a property, not as a line of source. This used to match
   * `checkinReminderDue(last, profile.created_at…` exactly, and went red when
   * the decision moved into lib/reminder-plan.ts — which was a refactor that
   * strengthened the rule rather than removing it. What matters is that the
   * Worker asks the shared rule and reads a WINDOW of check-ins to do it.
   */
  assert.match(worker, /reminderPlan\(input\)/, "the Worker no longer applies the shared rule");
  assert.match(worker, /check_in_date=gte\.\$\{since\}/,
    "the Worker is back to deciding from today's check-ins alone, which cannot tell a lapsed athlete from a new one");
  assert.ok(!/check_in_date=eq\.\$\{today\}&select=user_id/.test(worker),
    "the Worker is back to a one-day query");

  for (const gone of [
    "supabase/functions/send-daily-reminders",
    "supabase/functions/send-workout-reminders",
    "supabase/functions/weekly-summary",
    "supabase/functions/deadline-reminders",
    "supabase/functions/milestone-notifications",
  ]) {
    assert.ok(!existsSync(new URL(`../${gone}`, import.meta.url)), `${gone} is back — that is a second sender`);
  }

  // And the schedule that invoked them is not quietly still in the repo.
  const cron = readFileSync(new URL("../supabase/cron/schedule.sql", import.meta.url), "utf8");
  for (const job of ["send-daily-reminders", "weekly-summary", "deadline-reminders",
                     "milestone-notifications", "send-workout-reminders"]) {
    assert.ok(!cron.includes(`invoke_edge('${job}')`), `${job} is still scheduled from pg_cron`);
  }
});

test("unscheduling the old cron jobs survives a database that never had pg_cron", () => {
  /**
   * THIS FAILED IN PRODUCTION, which is why it is a test.
   *
   * The first version of migration 0097 went straight to `select 1 from
   * cron.job`, and the project it was written for had never enabled pg_cron —
   * so the whole script died on `42P01: relation "cron.job" does not exist`
   * before reaching anything else in the file it is bundled with.
   *
   * The guard must come BEFORE any reference to cron.job and must return, not
   * wrap: PL/pgSQL parses a SQL statement when it first executes, so the only
   * reliable way to never look for a missing table is to never reach the line.
   */
  // Comments stripped first: the header explains the fix and quotes the very
  // query it is describing, and a test that trips on its own explanation is a
  // test nobody keeps.
  const sql = readFileSync(
    new URL("../supabase/migrations/0097_reminders_move_to_the_worker.sql", import.meta.url), "utf8")
    .replace(/^\s*--.*$/gm, "");
  const guard = sql.indexOf("pg_namespace");
  const use = sql.indexOf("from cron.job");
  assert.ok(guard > -1, "nothing checks whether pg_cron is installed");
  assert.ok(use > -1, "the migration no longer unschedules anything");
  assert.ok(guard < use, "the guard comes after the query it is supposed to protect");
  assert.match(sql.slice(guard, use), /\breturn;/, "the guard does not return before reaching cron.job");
});

import { reminderStep, NEW_JOINER_GAP_DAYS, NEW_JOINER_WINDOW_DAYS } from "./checkin-reminder";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE "USE IT ONCE AND NEVER COME BACK" SHAPE, and the app was sitting quietly
 * through it by design.
 *
 * Somebody signs up Monday, checks in once, hears nothing Tuesday or Wednesday,
 * and the first contact is a Thursday email to a person who has forgotten they
 * signed up. Three days of grace is right for a regular who missed a Tuesday
 * and wrong for somebody with no habit to fall back on.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a brand new joiner hears the next day, not three days later", () => {
  // Joined Monday, checked in once, nothing since.
  assert.equal(checkinReminderDue("2026-08-24", "2026-08-24", "2026-08-25", 1), true,
    "still silent on the one morning it could still matter");
  assert.equal(checkinReminderDue("2026-08-24", "2026-08-24", "2026-08-26", 1), true);
});

test("an established athlete keeps the three-day grace", () => {
  const joined = "2026-01-01";
  assert.equal(checkinReminderDue("2026-08-24", joined, "2026-08-25", 90), false,
    "nagging somebody who missed one Tuesday");
  assert.equal(checkinReminderDue("2026-08-24", joined, "2026-08-27", 90), true);
});

/**
 * A missing count means "we did not look", not "they are new" — and a two-year
 * habit must never be put back on the new-joiner cadence by an absent field.
 */
test("an unknown check-in count is treated as established", () => {
  assert.equal(reminderStep("2026-08-24", "2026-08-25"), 3);
  assert.equal(checkinReminderDue("2026-08-24", "2026-08-24", "2026-08-25"), false);
});

test("the new-joiner window closes, and it closes on both conditions", () => {
  assert.equal(reminderStep("2026-08-24", "2026-08-25", 1), NEW_JOINER_GAP_DAYS);
  // Past the window by age.
  assert.equal(reminderStep("2026-08-01", "2026-08-25", 3), 3);
  // Past it by habit: joined days ago but already logging every day.
  assert.equal(reminderStep("2026-08-24", "2026-08-25", NEW_JOINER_WINDOW_DAYS + 1), 3);
});

/** The total volume of mail is unchanged — only when it arrives. */
test("the thirty-day stop still stops a new joiner", () => {
  assert.equal(checkinReminderDue("2026-07-01", "2026-07-01", "2026-08-25", 1), false);
});
