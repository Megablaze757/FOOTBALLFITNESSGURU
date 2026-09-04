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
  assert.match(promise!, /two weights/i, "does not say what actually changes");
});

test("each day promises the nearest real thing, and stops when it is far off", () => {
  // Two logs in, the fatigue trend is two days away — worth saying.
  assert.match(whatTomorrowBrings(ctx({ checkIns: 2 }))!, /fatigue trend/i);
  assert.match(whatTomorrowBrings(ctx({ checkIns: 3 }))!, /fatigue trend/i);
  // Past every milestone, it says the true thing about the week rather than
  // inventing a fourth feature to promise.
  assert.match(whatTomorrowBrings(ctx({ checkIns: 5 }))!, /week of logs/i);
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
  const withProgram = whatTomorrowBrings(ctx({ checkIns: 6, hasProgram: true }));
  const without = whatTomorrowBrings(ctx({ checkIns: 6, hasProgram: false }));
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
  // The count and the join date both have to reach the rule. Since the decision
  // moved into lib/reminder-plan.ts this is about the Worker FILLING them in —
  // a hardcoded 0 there would put every established athlete on the new-joiner
  // cadence, and a hardcoded large number would take the first week away.
  assert.match(worker, /joined: profile\.created_at\.slice\(0, 10\)/,
    "the Worker no longer tells the rule when somebody joined");
  assert.match(worker, /checkInsEver: seen\.get\(profile\.id\) \?\? 0/,
    "a day-one athlete is still waiting three days for the first email");
  assert.match(worker, /seen\.set\(row\.user_id, \(seen\.get\(row\.user_id\) \?\? 0\) \+ 1\)/,
    "the count is not being derived from real check-ins");
});

import { MILESTONES, nextMilestone } from "./first-week";
import { summarizeTrends } from "./trends";
import type { DailyCheckIn } from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RULE, ENFORCED RATHER THAN HELD.
 *
 * The first version of this file wrote the rule down — "every promise names a
 * thing the app genuinely does on that specific day" — and then broke it three
 * times out of three. Readiness was said to start comparing you against your
 * own normal on the second check-in; assessReadiness reads today's answers and
 * nothing else, and never has. Three days was said to be the fewest that can
 * draw a direction; computeFatigueTrend needs four. A week of load was said to
 * be what the readiness score reads; load needs twenty-eight days.
 *
 * Every one of those was written in good faith by somebody who had just read
 * the engine. A rule a person holds lasts exactly as long as their attention.
 *
 * So this test drives the REAL engine at one short of each milestone and at the
 * milestone, and fails unless the promised thing appears exactly there. The
 * copy cannot drift from the app, and the app cannot drift from the copy —
 * whichever one moves, the build stops.
 * ═══════════════════════════════════════════════════════════════════════════
 */
function logs(n: number): DailyCheckIn[] {
  return Array.from({ length: n }, (_, i) => ({
    check_in_date: `2026-08-${String(i + 1).padStart(2, "0")}`,
    pain_map: {},
    // A rising fatigue line, so a trend WOULD be reported the moment the engine
    // has enough points. A flat series would pass by saying nothing.
    fatigue_score: 2 + i * 2,
    sleep_quality: 7,
    nutrition_quality: 7,
    weight_kg: 80 - i * 0.4,
    is_match_day: false,
    match_minutes_played: null,
  })) as unknown as DailyCheckIn[];
}

test("the two-log promise is true: two weights are what make a comparison", () => {
  const at = MILESTONES.find((m) => m.at === 2);
  assert.ok(at, "the two-log milestone is gone — this test needs updating with it");

  assert.equal(summarizeTrends(logs(1)).weightDeltaKg, null,
    "one weight already reports a change, so the promise is late");
  assert.notEqual(summarizeTrends(logs(2)).weightDeltaKg, null,
    "two weights still report nothing, so the promise is a lie");
});

test("the four-log promise is true: the fatigue trend needs four points", () => {
  const at = MILESTONES.find((m) => m.at === 4);
  assert.ok(at, "the four-log milestone is gone — this test needs updating with it");

  assert.equal(summarizeTrends(logs(3)).fatigueTrend, "stable",
    "three logs already report a direction, so the promise is late");
  assert.notEqual(summarizeTrends(logs(4)).fatigueTrend, "stable",
    "four logs still report nothing, so the promise is a lie");
});

/**
 * The claim that started all this, kept as a test so it cannot come back.
 * assessReadiness takes one day's answers. It compares nobody to anything.
 */
test("nothing claims readiness compares them against their own normal", () => {
  const said = MILESTONES.map((m) => m.promise).join(" ");
  assert.ok(!/your own normal|own baseline|compar\w+ (?:you|today) against/i.test(said),
    "a promise about a personal readiness baseline is back, and the engine still has none");
});

test("every milestone is reachable inside the first week", () => {
  for (const m of MILESTONES) {
    assert.ok(m.at >= 1 && m.at <= FIRST_WEEK_DAYS,
      `${m.at} logs is not something somebody reaches in their first week`);
    assert.ok(m.promise.length > 20, "a milestone with nothing to say");
  }
  // Ordered, or nextMilestone returns the wrong one.
  const ats = MILESTONES.map((m) => m.at);
  assert.deepEqual([...ats].sort((a, b) => a - b), ats, "milestones are out of order");
});

test("nextMilestone returns the next one, and null past the last", () => {
  assert.equal(nextMilestone(0)?.at, 2);
  assert.equal(nextMilestone(1)?.at, 2);
  assert.equal(nextMilestone(2)?.at, 4);
  assert.equal(nextMilestone(4), null);
  assert.equal(nextMilestone(99), null);
});
