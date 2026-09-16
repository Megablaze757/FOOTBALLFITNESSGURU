import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NEARLY, RETURN_WINDOW_DAYS, SESSION_MILESTONES,
  WIN_BACK_AFTER_DAYS, WIN_BACK_UNTIL_DAYS,
  nextMilestone, returnedAfter, winBack, type Facts,
} from "./win-back";
import { CHECKIN_REMINDER_STOP_DAYS } from "./checkin-reminder";
import { STREAK_MILESTONES } from "./milestones";

const TODAY = "2026-09-16";
const daysAgo = (n: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

const facts = (over: Partial<Facts> = {}): Facts => ({
  name: "Sam",
  lastActive: daysAgo(40),
  sessions: 47,
  longestStreak: 23,
  best: null,
  wantsEmail: true,
  alreadySent: false,
  ...over,
});

// ═══════════════════════════════════════════════════════════════════════════
// WHEN. The line sits after the reminders stop, not on top of them.
// ═══════════════════════════════════════════════════════════════════════════

test("it starts after the reminders have already given up", () => {
  assert.ok(WIN_BACK_AFTER_DAYS > CHECKIN_REMINDER_STOP_DAYS,
    "the win-back fires while the reminder is still sending, so both land in one inbox");
});

test("too soon, and nothing is sent", () => {
  assert.equal(winBack(facts({ lastActive: daysAgo(WIN_BACK_AFTER_DAYS - 1) }), TODAY), null);
  assert.ok(winBack(facts({ lastActive: daysAgo(WIN_BACK_AFTER_DAYS) }), TODAY), "the first eligible day sends nothing");
});

/** Six months on, a message about last spring's training is a stranger with their data. */
test("too long ago, and the honest end state is still silence", () => {
  assert.ok(winBack(facts({ lastActive: daysAgo(WIN_BACK_UNTIL_DAYS) }), TODAY));
  assert.equal(winBack(facts({ lastActive: daysAgo(WIN_BACK_UNTIL_DAYS + 1) }), TODAY), null);
});

test("a clock disagreement cannot mail somebody who trained this morning", () => {
  assert.equal(winBack(facts({ lastActive: "2027-01-01" }), TODAY), null);
});

test("never having logged anything is not a win-back", () => {
  assert.equal(winBack(facts({ lastActive: null }), TODAY), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// ONCE. Every other sender repeats on a gap; this one must not.
// ═══════════════════════════════════════════════════════════════════════════

test("one message, and then the silence that was chosen on purpose", () => {
  assert.ok(winBack(facts(), TODAY));
  assert.equal(winBack(facts({ alreadySent: true }), TODAY), null);
});

test("consent is checked before anything else is computed", () => {
  assert.equal(winBack(facts({ wantsEmail: false }), TODAY), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE RULE THE WHOLE FILE IS BUILT ON: NOTHING TO SAY, NOTHING SENT.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Four sessions, no lift, no streak. There is no sentence here that their
 * inbox does not already have twenty of, so the correct email is no email.
 */
test("an athlete with no story gets no email", () => {
  const nothing = facts({ sessions: 4, longestStreak: 2, best: null });
  assert.equal(winBack(nothing, TODAY), null);
});

test("a zero-value personal best is not a personal best", () => {
  const empty = facts({ sessions: 4, longestStreak: 2, best: { label: "bench press 1RM", value: 0, unit: "kg", on: "2026-06-01" } });
  assert.equal(winBack(empty, TODAY), null);
});

/** Below the app's own lowest streak milestone it is a few days, not a run. */
test("a streak too short to be a streak is not a story", () => {
  const short = facts({ sessions: 4, longestStreak: STREAK_MILESTONES[0] - 1, best: null });
  assert.equal(winBack(short, TODAY), null);
  const real = facts({ sessions: 4, longestStreak: STREAK_MILESTONES[0], best: null });
  assert.match(winBack(real, TODAY)!.subject, /days running/);
});

// ═══════════════════════════════════════════════════════════════════════════
// WHICH LINE. Unfinished business outranks a bigger finished number.
// ═══════════════════════════════════════════════════════════════════════════

test("being a few short of a milestone is the line it leads with", () => {
  const out = winBack(facts({ sessions: 47 }), TODAY)!;
  assert.equal(out.subject, "47 sessions. 3 off 50.");
  assert.match(out.body, /3 short of 50/);
});

/**
 * An unfinished thing beats a bigger finished one. "You logged 200 sessions"
 * is a compliment, and a compliment is easy to read and close.
 */
test("nearly-fifty outranks a personal best", () => {
  const both = facts({ sessions: 48, best: { label: "bench press 1RM", value: 100, unit: "kg", on: "2026-06-01" } });
  assert.match(winBack(both, TODAY)!.subject, /48 sessions/);
});

test("a personal best is used when there is no milestone in reach", () => {
  const out = winBack(facts({
    sessions: 30,
    best: { label: "bench press 1RM", value: 100, unit: "kg", on: "2026-06-01" },
  }), TODAY)!;
  assert.match(out.subject, /Your bench press 1RM is still 100kg/);
  assert.match(out.body, /Nothing has beaten it because nothing has been logged since/);
});

test("a milestone further off than NEARLY is not claimed as close", () => {
  const far = facts({ sessions: 50 - NEARLY - 1, best: null, longestStreak: 2 });
  assert.equal(winBack(far, TODAY), null, "a milestone six away was described as nearly there");
});

test("somebody past the last milestone is not offered a nonexistent one", () => {
  assert.equal(nextMilestone(SESSION_MILESTONES[SESSION_MILESTONES.length - 1] + 1), null);
  const veteran = facts({
    sessions: 600,
    best: { label: "deadlift 1RM", value: 180, unit: "kg", on: "2026-05-01" },
  });
  assert.match(winBack(veteran, TODAY)!.subject, /deadlift/, "a 600-session athlete was offered a milestone");
});

test("the milestones climb and start somewhere reachable", () => {
  for (let i = 1; i < SESSION_MILESTONES.length; i++) {
    assert.ok(SESSION_MILESTONES[i] > SESSION_MILESTONES[i - 1], "the ladder does not climb");
  }
  assert.ok(SESSION_MILESTONES[0] <= 10, "the first rung is out of reach of a new athlete");
});

test("zero sessions never reads as being one short of ten", () => {
  const none = facts({ sessions: 0, best: null, longestStreak: 0 });
  assert.equal(winBack(none, TODAY), null);
});

test("the weeks in the body match how long they have been gone", () => {
  const out = winBack(facts({
    sessions: 30, lastActive: daysAgo(77),
    best: { label: "back squat 1RM", value: 140, unit: "kg", on: "2026-07-01" },
  }), TODAY)!;
  assert.match(out.body, /11 weeks ago/);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE OUTCOME, WHICH IS TRAINING — NOT OPENING THE EMAIL.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Somebody who opened it and did not train is somebody the email failed to
 * bring back. Counting them is how a campaign reports 40% engagement while the
 * retention curve does not move.
 */
test("coming back means logging something, inside the window", () => {
  const sent = "2026-08-01";
  assert.equal(returnedAfter(sent, ["2026-08-05"]), true);
  assert.equal(returnedAfter(sent, ["2026-08-15"]), true, "the last day of the window does not count");
  assert.equal(returnedAfter(sent, ["2026-08-16"]), false);
  assert.equal(returnedAfter(sent, ["2026-07-30"]), false, "activity before the send was counted as a return");
  assert.equal(returnedAfter(sent, []), false);
});

test("the window is a fortnight, and the default is the one used", () => {
  assert.equal(RETURN_WINDOW_DAYS, 14);
  assert.equal(returnedAfter("2026-08-01", ["2026-08-20"], 30), true);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE SQL AND THIS FILE HAVE TO AGREE, AND NOTHING ELSE MAKES THEM.
// ═══════════════════════════════════════════════════════════════════════════

const migration = readFileSync("supabase/migrations/0114_win_back.sql", "utf8");

test("the candidate query uses the same window this file does", () => {
  const signature = migration.match(/win_back_candidates\(p_after int default (\d+), p_until int default (\d+)\)/);
  assert.ok(signature, "win_back_candidates is gone or its signature changed");
  assert.equal(Number(signature[1]), WIN_BACK_AFTER_DAYS,
    "the query offers athletes this file would refuse to write to");
  assert.equal(Number(signature[2]), WIN_BACK_UNTIL_DAYS);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FAILURE THE MIGRATION'S OWN COMMENT WARNS ABOUT.
 *
 * pending_notification_emails() ends its consent case with `else false`. A
 * category added to the constraint and not to the case produces rows that are
 * valid, queued, and never picked up — a feature that looks shipped, passes
 * every check, and does nothing at all.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the category is in the constraint AND in the thing that reads it", () => {
  assert.match(migration, /email_category in \([^)]*'win_back'/s,
    "win_back is not an allowed category, so the insert would be rejected");
  assert.match(migration, /when 'win_back' then p\.email_win_back/,
    "win_back is allowed but has no consent case, so it would queue and never send");
  assert.match(migration, /add column if not exists email_win_back/,
    "the consent case reads a column that does not exist");
});

/** Once is enforced by the database, not by the sender remembering. */
test("only one can ever exist per athlete", () => {
  assert.match(migration, /dedupe_key = 'win_back'/,
    "the candidate query does not exclude athletes who already had one");
});

test("it has its own switch rather than borrowing one", () => {
  for (const other of ["email_checkin_reminders", "email_workout_reminders", "email_weekly_summary"]) {
    assert.doesNotMatch(migration, new RegExp(`when 'win_back' then p\\.${other}`),
      `the win-back unsubscribes people from ${other}`);
  }
});
