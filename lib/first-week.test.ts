import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isNew, whatTomorrowBrings, shouldAskForPush, reminderGraceDays,
  FIRST_WEEK_DAYS, NEW_ATHLETE_GRACE_DAYS, type FirstWeekContext,
} from "./first-week";

const ctx = (over: Partial<FirstWeekContext> = {}): FirstWeekContext =>
  ({ checkIns: 1, daysSinceJoined: 0, hasProgram: false, ...over });

test("new means new — a week, and only a few logs", () => {
  assert.equal(isNew(ctx()), true);
  assert.equal(isNew(ctx({ daysSinceJoined: FIRST_WEEK_DAYS })), true);
  assert.equal(isNew(ctx({ daysSinceJoined: FIRST_WEEK_DAYS + 1 })), false);
  // Somebody who joined yesterday and has logged nine times is not new either
  // — they have the habit, and the first-week scaffolding is in their way.
  assert.equal(isNew(ctx({ checkIns: 9 })), false);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EVERY PROMISE NAMES SOMETHING THE APP GENUINELY DOES ON THAT DAY.
 *
 * "Come back tomorrow for more insights" is the line that gets written into
 * apps like this, and the second day is where it is found out: somebody
 * returns, gets the same screen, and now knows the app will say anything.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the first check-in is told what the second one changes", () => {
  const promise = whatTomorrowBrings(ctx({ checkIns: 1 }));
  assert.ok(promise, "day one still ends in silence");
  assert.match(promise!, /your own normal/i, "does not say what actually changes");
});

test("each day promises the nearest real thing, not the same line again", () => {
  const said = [1, 2, 3, 4].map((checkIns) => whatTomorrowBrings(ctx({ checkIns })));
  assert.equal(new Set(said).size, said.length, "two days give the identical promise");
  assert.match(said[1]!, /trend/i, "three points is what draws a direction");
  assert.match(said[2]!, /week/i);
});

test("nothing logged means nothing promised", () => {
  assert.equal(whatTomorrowBrings(ctx({ checkIns: 0 })), null);
});

/**
 * Past the first week the app has plenty to say and does not need to keep
 * advertising itself. A permanent "keep going!" is wallpaper.
 */
test("the scaffolding comes down once they have a habit", () => {
  assert.equal(whatTomorrowBrings(ctx({ checkIns: 12, daysSinceJoined: 12 })), null);
  assert.equal(whatTomorrowBrings(ctx({ daysSinceJoined: 30 })), null);
});

test("the promise fits what they actually have", () => {
  const withProgram = whatTomorrowBrings(ctx({ checkIns: 5, hasProgram: true }));
  const without = whatTomorrowBrings(ctx({ checkIns: 5, hasProgram: false }));
  assert.notEqual(withProgram, without, "promises a programme to somebody with no programme");
  assert.match(withProgram!, /programme/i);
});

// --- asking for notifications --------------------------------------------------

/**
 * Asking on load is how an app gets denied forever: the browser remembers the
 * refusal, there is no second prompt, and the athlete had no idea what they
 * were being asked about.
 */
test("push is asked for on the second check-in, not the first and not on load", () => {
  assert.equal(shouldAskForPush(ctx({ checkIns: 1 })), false,
    "asks before it has given them anything");
  assert.equal(shouldAskForPush(ctx({ checkIns: 2 })), true);
  assert.equal(shouldAskForPush(ctx({ checkIns: 3 })), false, "asks more than once");
  assert.equal(shouldAskForPush(ctx({ checkIns: 2, daysSinceJoined: 40 })), false,
    "a returning lapsed athlete is not in their first week");
});

// --- the reminder clock ---------------------------------------------------------

/**
 * Three days of grace is right for somebody with a habit who missed a Tuesday.
 * For somebody on day one it is a week of silence at exactly the point the
 * habit is formed or lost — and by Thursday they have forgotten they signed up.
 */
test("a brand new athlete hears sooner than a lapsed regular", () => {
  assert.equal(reminderGraceDays(ctx()), NEW_ATHLETE_GRACE_DAYS);
  assert.equal(reminderGraceDays(ctx({ daysSinceJoined: 60, checkIns: 40 })), 3);
  assert.ok(NEW_ATHLETE_GRACE_DAYS < 3, "the whole point is that it is sooner");
});

import { readFileSync } from "node:fs";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE THREE HOLES, EACH CHECKED WHERE IT WAS.
 *
 * A first session that said nothing about tomorrow, a notification prompt
 * nobody could find, and an email clock that treated a day-one athlete like a
 * lapsed regular. Every one of them is invisible in normal use — you only meet
 * them by being new, once — so nothing but a test keeps them shut.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the first check-in no longer ends in a blank space", () => {
  const done = readFileSync(new URL("../components/CheckInDone.tsx", import.meta.url), "utf8");
  assert.match(done, /whatTomorrowBrings\(firstWeek\)/, "the done screen promises nothing");
  assert.match(done, /streak === 1/, "day one still renders an empty span where the streak goes");

  const page = readFileSync(new URL("../app/(app)/journal/page.tsx", import.meta.url), "utf8");
  assert.match(page, /firstWeek=\{data\?\.firstWeek/, "the context never reaches the screen");
  assert.match(page, /created_at/, "the join date is not loaded, so nobody can be new");
});

test("push is asked for in the check-in, not only buried in Profile", () => {
  const done = readFileSync(new URL("../components/CheckInDone.tsx", import.meta.url), "utf8");
  assert.match(done, /shouldAskForPush\(firstWeek\)/, "the only prompt is still on a page nobody opens");
  assert.match(done, /<PushToggle\s*\/>/, "it asks and then offers no way to say yes");
});

test("the Worker tells the reminder rule how new somebody is", () => {
  const worker = readFileSync(new URL("../cloudflare/src/index.ts", import.meta.url), "utf8");
  assert.match(worker, /checkinReminderDue\(last, profile\.created_at\.slice\(0, 10\), today, seen\.get/,
    "a day-one athlete is still waiting three days for the first email");
});
