import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVE_WITHIN_DAYS, LAPSED_AFTER_DAYS, WINDOWS,
  daysBetween, daysSinceActive, everReturned, longestStreak, retentionCurve, retentionReport, standing,
  type Account,
} from "./retention";

const day = (joined: string, offsets: number[]): string[] =>
  offsets.map((n) => new Date(Date.parse(`${joined}T00:00:00Z`) + n * 86_400_000)
    .toISOString().slice(0, 10));

/** An account that joined on `joined` and was active on those day-offsets. */
const account = (id: string, joined: string, offsets: number[]): Account =>
  ({ id, joined, activeDays: day(joined, offsets) });

const TODAY = "2026-06-01";

test("days between two dates, both ways", () => {
  assert.equal(daysBetween("2026-01-01", "2026-01-08"), 7);
  assert.equal(daysBetween("2026-01-08", "2026-01-01"), -7);
  assert.equal(daysBetween("2026-01-01", "2026-01-01"), 0);
  // A month boundary and a leap year, because off-by-one here silently shifts
  // every account into the neighbouring window.
  assert.equal(daysBetween("2026-01-31", "2026-02-01"), 1);
  assert.equal(daysBetween("2024-02-28", "2024-03-01"), 2);
});

test("a date that cannot be parsed is zero rather than NaN", () => {
  assert.equal(daysBetween("not a date", TODAY), 0);
  assert.equal(daysBetween(TODAY, ""), 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE DENOMINATOR, WHICH IS THE WHOLE GAME.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Somebody who signed up yesterday has not failed to return in month two. If
 * they counted, every window would read lower the faster the app grew — a
 * retention chart that falls when things go well.
 */
test("an account too young for a window is not counted as having failed it", () => {
  const fresh = account("new", "2026-05-31", [0]);
  const curve = retentionCurve([fresh], TODAY);
  const monthTwo = curve.find((c) => c.window.label === "month two")!;
  assert.equal(monthTwo.eligible, 0, "a one-day-old account was asked about month two");
  assert.equal(monthTwo.returned, 0);

  const dayAfter = curve.find((c) => c.window.label === "the day after")!;
  assert.equal(dayAfter.eligible, 1, "an account a day old cannot answer the day-after question");
});

test("an account exactly old enough for a window is counted", () => {
  // Joined 14 days ago: week two runs days 8-14 and is therefore complete.
  const two = account("a", "2026-05-18", [10]);
  const weekTwo = retentionCurve([two], TODAY).find((c) => c.window.label === "week two")!;
  assert.equal(weekTwo.eligible, 1);
  assert.equal(weekTwo.returned, 1);
});

/**
 * Activity on the day somebody signs up is signing up. Counting it gives a
 * curve that starts near 100% and falls off a cliff of its own making.
 */
test("the day they joined is not retention", () => {
  const once = account("once", "2026-01-01", [0]);
  for (const result of retentionCurve([once], TODAY)) {
    assert.equal(result.returned, 0, `${result.window.label} counted the signup day`);
  }
  assert.equal(everReturned([once]).did, 0);
});

test("a day inside the window counts and a day outside it does not", () => {
  const inside = account("in", "2026-01-01", [10]);   // week two is days 8-14
  const outside = account("out", "2026-01-01", [20]); // weeks three and four
  const curve = retentionCurve([inside, outside], TODAY);
  const weekTwo = curve.find((c) => c.window.label === "week two")!;
  assert.equal(weekTwo.eligible, 2);
  assert.equal(weekTwo.returned, 1, "the day-20 account was counted in week two");
});

test("an account joining in the future is dropped rather than aged backwards", () => {
  const impossible = account("clock", "2027-01-01", [1]);
  const curve = retentionCurve([impossible, account("ok", "2026-01-01", [3])], TODAY);
  const week = curve.find((c) => c.window.label === "their first week")!;
  assert.equal(week.eligible, 1, "an account from the future was counted");
});

test("every reading carries its count and its range", () => {
  const accounts = [account("a", "2026-01-01", [3]), account("b", "2026-01-01", [])];
  const week = retentionCurve(accounts, TODAY).find((c) => c.window.label === "their first week")!;
  assert.match(week.reading, /^1 of 2/, week.reading);
  assert.match(week.reading, /too few/, "a rate from two people is being quoted straight");
  assert.ok(week.interval.high > 0.9, "the interval from 1 of 2 should admit almost anything");
});

test("the windows do not overlap and leave no gap", () => {
  for (let i = 1; i < WINDOWS.length; i++) {
    assert.equal(WINDOWS[i].from, WINDOWS[i - 1].to + 1,
      `${WINDOWS[i].label} does not start where ${WINDOWS[i - 1].label} ends`);
  }
  assert.equal(WINDOWS[0].from, 1, "the curve starts on the signup day");
});

// ═══════════════════════════════════════════════════════════════════════════
// STANDING: AND THE GROUP THE APP HAS DELIBERATELY STOPPED TALKING TO.
// ═══════════════════════════════════════════════════════════════════════════

test("each account lands in exactly one group", () => {
  const accounts = [
    account("active", "2026-01-01", [daysBetween("2026-01-01", TODAY) - 2]),
    account("slipping", "2026-01-01", [daysBetween("2026-01-01", TODAY) - 20]),
    account("lapsed", "2026-01-01", [3]),
    account("never", "2026-01-01", []),
  ];
  const where = standing(accounts, TODAY);
  assert.deepEqual(where.active.map((a) => a.id), ["active"]);
  assert.deepEqual(where.slipping.map((a) => a.id), ["slipping"]);
  assert.deepEqual(where.lapsed.map((a) => a.id), ["lapsed"]);
  assert.deepEqual(where.neverStarted.map((a) => a.id), ["never"]);

  const total = where.active.length + where.slipping.length + where.lapsed.length + where.neverStarted.length;
  assert.equal(total, accounts.length, "an account was counted twice or not at all");
});

/**
 * Signed up and never logged anything is a failure of the first session.
 * Logged for three months and stopped is a failure of the ninetieth. Averaging
 * them together hides both, so they are separate groups.
 */
test("never started is not the same as lapsed", () => {
  const where = standing([account("never", "2026-01-01", [])], TODAY);
  assert.equal(where.lapsed.length, 0, "somebody who never arrived was counted as having left");
  assert.equal(where.neverStarted.length, 1);
  assert.equal(daysSinceActive(where.neverStarted[0], TODAY), null);
});

test("the boundaries fall on the side the names promise", () => {
  const onTheLine = (gap: number) => {
    const joined = "2026-01-01";
    const last = new Date(Date.parse(`${TODAY}T00:00:00Z`) - gap * 86_400_000).toISOString().slice(0, 10);
    return standing([{ id: "x", joined, activeDays: [last] }], TODAY);
  };
  assert.equal(onTheLine(ACTIVE_WITHIN_DAYS).active.length, 1, "exactly a week quiet is not yet slipping");
  assert.equal(onTheLine(ACTIVE_WITHIN_DAYS + 1).slipping.length, 1);
  assert.equal(onTheLine(LAPSED_AFTER_DAYS).slipping.length, 1, "exactly thirty days is still reachable");
  assert.equal(onTheLine(LAPSED_AFTER_DAYS + 1).lapsed.length, 1);
});

/**
 * The line is where lib/checkin-reminder.ts stops sending. Past it, nothing in
 * the app contacts anybody at all — which is the hole this measurement exists
 * to make countable.
 */
test("the lapsed line is the line the reminders stop at", async () => {
  const { CHECKIN_REMINDER_STOP_DAYS } = await import("./checkin-reminder");
  assert.equal(LAPSED_AFTER_DAYS, CHECKIN_REMINDER_STOP_DAYS,
    "the measurement and the sender disagree about when somebody is gone");
});

test("a future activity date does not read as being active", () => {
  const ahead = { id: "x", joined: "2026-01-01", activeDays: ["2027-01-01"] };
  assert.equal(daysSinceActive(ahead, TODAY), null);
});

test("the most recent activity wins, whatever order the days arrive in", () => {
  const messy = { id: "x", joined: "2026-01-01", activeDays: ["2026-01-05", "2026-05-30", "2026-02-02"] };
  assert.equal(daysSinceActive(messy, TODAY), 2);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE REPORT.
// ═══════════════════════════════════════════════════════════════════════════

test("the report leads with where everybody stands", () => {
  const lines = retentionReport([
    account("a", "2026-01-01", [1, 2, 3]),
    account("b", "2026-01-01", []),
  ], TODAY);
  assert.match(lines[0], /2 accounts/);
  assert.match(lines[0], /never logged anything at all/);
  assert.match(lines[1], /Came back at least once/);
});

/**
 * A window nobody is old enough for is not a zero. Printing "0 of 0" invites
 * it being read as everybody having left.
 */
test("a window nobody is old enough for says so rather than reading zero", () => {
  const lines = retentionReport([account("new", "2026-05-31", [0])], TODAY);
  const monthThree = lines.find((l) => /month three/i.test(l))!;
  assert.match(monthThree, /no account is old enough/);
  assert.doesNotMatch(monthThree, /0 of 0/);
});

test("no accounts is said in words rather than as a row of zeros", () => {
  assert.deepEqual(retentionReport([], TODAY), ["No accounts yet."]);
});

test("the report survives rows with nothing in them", () => {
  const broken = [{ id: "x", joined: "", activeDays: [] }] as Account[];
  assert.doesNotThrow(() => retentionReport(broken, TODAY));
  assert.deepEqual(retentionReport(broken, TODAY), ["No accounts yet."]);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE LONGEST RUN THEY EVER PUT TOGETHER.
//
// Not lib/milestones.ts's currentStreak, which answers "how many in a row
// right now" — and that is zero for everybody this module is about.
// ═══════════════════════════════════════════════════════════════════════════

test("the longest run is found, not the last one", () => {
  // A five, then a gap, then a two. The five is the answer.
  assert.equal(longestStreak([
    "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05",
    "2026-02-01", "2026-02-02",
  ]), 5);
});

test("order and duplicates do not matter", () => {
  assert.equal(longestStreak(["2026-01-03", "2026-01-01", "2026-01-02", "2026-01-02"]), 3);
});

test("one day is a run of one, and no days is none", () => {
  assert.equal(longestStreak(["2026-01-01"]), 1);
  assert.equal(longestStreak([]), 0);
});

test("a gap of one day breaks the run", () => {
  assert.equal(longestStreak(["2026-01-01", "2026-01-03"]), 1);
});

/** A month boundary is consecutive; treating it as a gap would halve real streaks. */
test("a run across a month and a leap day is unbroken", () => {
  assert.equal(longestStreak(["2026-01-30", "2026-01-31", "2026-02-01"]), 3);
  assert.equal(longestStreak(["2024-02-28", "2024-02-29", "2024-03-01"]), 3);
});

test("an unparseable day is skipped rather than breaking the count", () => {
  assert.equal(longestStreak(["2026-01-01", "not a day", "2026-01-02"]), 2);
});
