import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { completionsFrom } from "./challenge-xp";
import { boardsFor, CHALLENGE_POOL, type Board } from "./challenge-pool";
import { EMPTY_WEEK, type WeekActivity } from "./challenges";

const busy: WeekActivity = {
  check_ins: 7, training_sessions: 5, nutrition_logs: 6, benchmarks: 2, videos: 2,
  streak: 30, rest_days: 3, perfect_days: 3, calorie_goal_days: 5, easy_sessions: 3,
};

test("nothing done, nothing owed", () => {
  const b = boardsFor({ who: {}, week: EMPTY_WEEK, today: EMPTY_WEEK, todayIso: "2026-08-12" });
  assert.deepEqual(completionsFrom([b.daily, b.weekly]), []);
});

test("a completed challenge is recorded at the price it advertised", () => {
  const b = boardsFor({ who: {}, week: busy, today: busy, todayIso: "2026-08-12" });
  const rows = completionsFrom([b.daily, b.weekly]);
  assert.ok(rows.length > 0, "a full week finished nothing at all");
  for (const r of rows) {
    const shown = [...b.daily.list, ...b.weekly.list].find((c) => c.id === r.challenge_id);
    assert.ok(shown, `${r.challenge_id} was recorded but never on a board`);
    assert.equal(r.xp, shown.xp, "recorded a different number from the one on the card");
    assert.ok(r.xp > 0 && r.xp <= 500);
  }
});

/**
 * ONLY WHAT IS ACTUALLY FINISHED. Paying for a challenge in progress is the
 * same broken promise as not paying for a finished one, and it is unrecoverable
 * — the ledger is insert-only, so an over-payment cannot be taken back.
 */
test("an unfinished challenge is never recorded", () => {
  const b = boardsFor({ who: {}, week: busy, today: EMPTY_WEEK, todayIso: "2026-08-12" });
  const paid = new Set(completionsFrom([b.daily]).map((r) => r.challenge_id));
  for (const c of b.daily.list) {
    // Today is empty, so nothing on the daily board can be complete.
    assert.ok(!paid.has(c.id), `${c.id} was paid for on a day with no activity`);
  }
});

/**
 * THE WHOLE REASON THIS IS A LEDGER AND NOT A SUM.
 *
 * The boards rotate: today's daily challenge is gone tomorrow. A total computed
 * from "challenges currently complete" would therefore FALL at midnight, and XP
 * going down is the exact regression computeXp was fixed for — missing one day
 * used to delete up to 300 XP and could drop a level, fired on the day someone
 * was already most likely to stop.
 *
 * The period is what makes the ledger work: same challenge, different day, a
 * separate row — so it pays again next week, and only once this week.
 */
test("the same challenge on the same day is one payment, not many", () => {
  const b = boardsFor({ who: {}, week: busy, today: busy, todayIso: "2026-08-12" });
  const rows = completionsFrom([b.daily, b.weekly]);
  const keys = rows.map((r) => `${r.challenge_id}|${r.period}`);
  assert.equal(new Set(keys).size, keys.length, "the same completion was recorded twice");
});

test("a new day is a new period, so tomorrow can pay again", () => {
  const mon = boardsFor({ who: {}, week: busy, today: busy, todayIso: "2026-08-10" });
  const tue = boardsFor({ who: {}, week: busy, today: busy, todayIso: "2026-08-11" });
  assert.notEqual(mon.daily.period, tue.daily.period, "two days share a period");
  // And the weekly board holds still across days inside one week, or the weekly
  // challenge would pay out seven times.
  assert.equal(mon.weekly.period, tue.weekly.period, "the weekly period moved mid-week");
});

test("a new week is a new period for the weekly board", () => {
  const a = boardsFor({ who: {}, week: busy, today: busy, todayIso: "2026-08-10" });
  const b = boardsFor({ who: {}, week: busy, today: busy, todayIso: "2026-08-20" });
  assert.notEqual(a.weekly.period, b.weekly.period);
});

test("boards pair each list with the window it was picked against", () => {
  const b = boardsFor({ who: {}, week: busy, today: EMPTY_WEEK, todayIso: "2026-08-12" });
  assert.equal(b.daily.activity, EMPTY_WEEK, "the daily board is not carrying today");
  assert.equal(b.weekly.activity, busy, "the weekly board is not carrying the week");
  assert.equal(b.daily.window, "daily");
  assert.equal(b.weekly.window, "weekly");
});

test("every board a real athlete gets is fully populated", () => {
  const b = boardsFor({
    who: { sport: "rugby", position: "Prop", goal: "strength", focus: "performance" },
    week: busy, today: EMPTY_WEEK, todayIso: "2026-08-12",
  });
  assert.equal(b.daily.list.length, 2);
  assert.equal(b.weekly.list.length, 3);
  for (const c of [...b.daily.list, ...b.weekly.list]) {
    assert.ok(CHALLENGE_POOL.some((t) => t.id === c.id), `${c.id} is not in the pool`);
  }
});

/**
 * The ledger is insert-only by design — XP that the client can edit is XP that
 * means nothing, and there is no legitimate reason to erase a completion. RLS
 * has to actually say so, not just the comment above it.
 */
test("the migration grants no way to change or erase a payment", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0075_challenge_completions.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /for select\s+using \(auth\.uid\(\) = user_id\)/i);
  assert.match(sql, /for insert\s+with check \(auth\.uid\(\) = user_id\)/i);
  for (const forbidden of [/for update/i, /for delete/i, /for all/i]) {
    assert.ok(!forbidden.test(sql), `0075 grants ${forbidden} on an insert-only ledger`);
  }
});

/**
 * And the page has to pay it. This was dead code for a month — `challengeXp`
 * exported, called by nobody, while five cards a page advertised XP that never
 * arrived. A guard, because "nothing calls it" is invisible in review.
 */
test("the rewards page actually adds challenge XP to the total", () => {
  const src = readFileSync(new URL("../app/(app)/rewards/page.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.match(src, /recordCompletions\(/, "completions are never written");
  assert.match(src, /fetchChallengeXp\(/, "the earned total is never read");
  assert.match(src, /computeXp\(stats\)\s*\+\s*earnedFromChallenges/,
    "challenge XP is fetched and then not added to anything");
  // Recorded BEFORE it is read, or today's completions do not count until the
  // next visit and the cards look unpaid on the render that finished them.
  assert.ok(src.indexOf("recordCompletions(") < src.indexOf("fetchChallengeXp("),
    "the total is read before today's completions are written");
});

test("no board can be built without a period to record it against", () => {
  const boards: Board[] = Object.values(boardsFor({ who: {}, week: busy, today: busy, todayIso: "2026-08-12" }));
  for (const b of boards) assert.ok(b.period.length > 0, `${b.window} board has no period`);
});
