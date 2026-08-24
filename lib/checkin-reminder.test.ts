import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("both senders apply the same rule, and neither mails daily any more", () => {
  /**
   * There are TWO of these — the Cloudflare Worker queues a notification, and a
   * Supabase Edge Function sends mail directly on a cron. Deno cannot import
   * from lib/, so the Edge Function carries its own copy of the arithmetic and
   * this is what stops the two drifting into disagreeing about who gets mail.
   */
  const worker = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");
  assert.match(worker, /checkinReminderDue/, "the Worker no longer uses the shared rule");
  assert.ok(!/daily_check_ins\?check_in_date=eq\.\$\{today\}&select=user_id`\),\s*\n\s*reminderProfiles/.test(worker),
    "the Worker still decides from today's check-ins alone");

  const deno = readFileSync(new URL("../supabase/functions/send-daily-reminders/index.ts", import.meta.url), "utf8");
  assert.match(deno, new RegExp(`GAP_DAYS = ${CHECKIN_REMINDER_GAP_DAYS}\\b`), "the Edge Function's gap drifted from lib");
  assert.match(deno, new RegExp(`STOP_DAYS = ${CHECKIN_REMINDER_STOP_DAYS}\\b`), "the Edge Function's cutoff drifted from lib");
  assert.match(deno, /gap % GAP_DAYS === 0/, "the Edge Function went back to mailing every day");
  assert.ok(!/\.eq\("check_in_date", today\)/.test(deno), "the Edge Function still looks only at today");
});
