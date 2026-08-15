import { test } from "node:test";
import assert from "node:assert/strict";
import { RANKABLE_MUSCLES, TOP_TIER } from "./strength-standards";
import {
  computeXp, levelFor, rankFor, rankLadder, evaluateAchievements, dailyQuests, EMPTY_STATS,
  ACHIEVEMENTS, activitySpans, standingRank, LADDER_MIN_ATHLETES, type ActivityStats,
} from "./gamification";

test("XP accumulates from activity and levels rise", () => {
  assert.equal(computeXp(EMPTY_STATS), 0);
  // longestStreak, not streak — XP is a record of what you did, and it is the
  // best run you have had that counts. See computeXp.
  const s = { ...EMPTY_STATS, checkIns: 5, trainingSessions: 3, longestStreak: 5 };
  const xp = computeXp(s); // 50 + 36 + 25 = 111
  assert.equal(xp, 111);
  const lvl = levelFor(xp);
  assert.ok(lvl.level >= 2, `level ${lvl.level}`); // past the 100-xp first threshold
  assert.ok(lvl.progress >= 0 && lvl.progress <= 1);
});

/**
 * XP NEVER GOES DOWN. THIS IS THE WHOLE POINT.
 *
 * `streak` was the only term in the sum that could decrease, so missing one day
 * deleted up to 300 XP and could drop a level — a rank going backwards, fired
 * on the exact day someone was already most likely to stop. Every term is
 * monotonic now.
 */
test("breaking a streak never costs you a level", () => {
  const onIt = {
    ...EMPTY_STATS, checkIns: 60, trainingSessions: 30, nutritionLogs: 40,
    restDaysLogged: 20, streak: 45, longestStreak: 45,
  };
  const broken = { ...onIt, streak: 0 }; // the morning after a missed day
  assert.equal(computeXp(broken), computeXp(onIt), "missing a day cost XP");
  assert.equal(levelFor(computeXp(broken)).level, levelFor(computeXp(onIt)).level);
});

/**
 * And nobody's total drops in the switch: longestStreak >= streak by
 * definition, so the worst case is that it is unchanged.
 */
test("moving to the best streak never takes XP away", () => {
  for (const [streak, longest] of [[0, 0], [5, 5], [0, 40], [12, 40], [60, 60]]) {
    const s = { ...EMPTY_STATS, checkIns: 30, streak, longestStreak: longest };
    const before = 30 * 10 + streak * 5;   // what the old sum would have given
    assert.ok(computeXp(s) >= before, `streak ${streak}/${longest} lost XP`);
  }
});

test("level 1 with no xp, progress toward next", () => {
  const l = levelFor(0);
  assert.equal(l.level, 1);
  assert.equal(l.rank, "Iron III");
  assert.equal(l.xpIntoLevel, 0);
});

test("the ladder climbs tier by tier, division by division", () => {
  // You enter a tier at III and promote out of I, as in every game that uses
  // divisions — so the label moves every single level.
  assert.equal(rankFor(1).rank, "Iron III");
  assert.equal(rankFor(2).rank, "Iron II");
  assert.equal(rankFor(3).rank, "Iron I");
  assert.equal(rankFor(4).rank, "Bronze III");
  assert.equal(rankFor(10).rank, "Gold III");
  assert.equal(rankFor(16).rank, "Emerald III");
  assert.equal(rankFor(19).rank, "Diamond III");
});

/**
 * THE TOP OF THE LADDER USED TO BE A DEAD END, and this test pinned it as
 * intended behaviour — "the apex tier has NO division and never runs out".
 *
 * It never running out was true in the sense that it never errored, and false
 * in the sense that mattered: `rankFor` returned a bare "Legend" from the
 * moment you arrived, forever. Roughly twenty-two months of committed use and
 * then the rank badge never changes again, on the one screen whose entire job
 * is showing progress. The test was describing the bug accurately.
 *
 * The apex counts up now — every three levels is another Legend division, with
 * no ceiling. Ascending rather than descending is deliberate: divisions count
 * DOWN because a tier has a top to promote out of, and this one has none.
 */
test("the apex tier keeps promoting, forever", () => {
  assert.equal(rankFor(25).tier, "Legend");
  assert.equal(rankFor(25).rank, "Legend I");
  assert.equal(rankFor(28).rank, "Legend II");
  assert.equal(rankFor(31).rank, "Legend III");

  // There is always a next one, however long someone plays.
  const far = rankFor(500);
  assert.equal(far.tier, "Legend");
  assert.ok(far.division.length > 0, "level 500 has no division");
  assert.notEqual(far.rank, rankFor(497).rank, "500 levels in and the rank has stopped moving");
});

/**
 * EVERY LEVEL SITS IN A NAMED DIVISION. Champion used to span 4 against a
 * 3-item division list, so it took the same "wider than the list" branch as the
 * apex and rendered a bare "Champion" for four levels — the dead end in
 * miniature, and the kind of thing that is invisible until someone is in it.
 */
test("no level renders a bare tier name", () => {
  const bare: string[] = [];
  for (let lvl = 1; lvl <= 120; lvl++) {
    const r = rankFor(lvl);
    if (!r.division) bare.push(`${lvl}: ${r.rank}`);
  }
  assert.deepEqual(bare, []);
});

test("every level has a rank, colour and emoji", () => {
  for (let lvl = 1; lvl <= 60; lvl++) {
    const r = rankFor(lvl);
    assert.ok(r.rank.length > 0, `level ${lvl} has no rank`);
    assert.match(r.color, /^#[0-9a-f]{6}$/i, `level ${lvl} colour ${r.color}`);
    assert.ok(r.emoji.length > 0, `level ${lvl} has no emoji`);
  }
});

test("ranks never go backwards as you level up", () => {
  const order: string[] = [];
  for (let lvl = 1; lvl <= 40; lvl++) {
    const t = rankFor(lvl).tier;
    if (order[order.length - 1] !== t) order.push(t);
  }
  assert.deepEqual(order, [
    "Iron", "Bronze", "Silver", "Gold", "Platinum", "Emerald", "Diamond", "Champion", "Legend",
  ]);
});

test("the ladder view lists where each tier starts", () => {
  const ladder = rankLadder();
  assert.equal(ladder[0].fromLevel, 1);
  const byLevel = ladder.filter((t) => t.earnedBy === "level");
  for (let i = 1; i < byLevel.length; i++) {
    assert.ok(byLevel[i].fromLevel > byLevel[i - 1].fromLevel, "tiers must start in order");
    assert.equal(rankFor(byLevel[i].fromLevel).tier, byLevel[i].tier);
  }
});

/**
 * The last two rungs are NOT levels, and the ladder has to say so.
 *
 * Elite and Apex are standings — held against everyone else, and losable. Shown
 * anyway, because a ladder that hides its top two rungs until they are
 * reachable is one whose best rungs nobody knows exist. But listing them
 * without saying how they are earned would read as two levels nobody can climb
 * to, which is worse than not showing them.
 */
test("the ladder shows the standing ranks, and explains them", () => {
  const ladder = rankLadder();
  const standing = ladder.filter((t) => t.earnedBy === "standing");
  assert.deepEqual(standing.map((t) => t.tier), ["Elite", "Apex"]);
  for (const t of standing) {
    assert.ok(t.note && t.note.length > 0, `${t.tier} does not say how it is earned`);
    // And no level can produce one, however high — otherwise the note lies.
    assert.notEqual(rankFor(t.fromLevel).tier, t.tier);
    assert.notEqual(rankFor(9999).tier, t.tier);
  }
  // They sit at the top, after Legend.
  assert.equal(ladder[ladder.length - 1].tier, "Apex");
});

test("achievements unlock from stats", () => {
  const s = { ...EMPTY_STATS, checkIns: 1, streak: 7, videos: 1 };
  const { unlocked } = evaluateAchievements(s, levelFor(computeXp(s)).level);
  const ids = unlocked.map((a) => a.id);
  assert.ok(ids.includes("first_checkin"));
  assert.ok(ids.includes("streak_7"));
  assert.ok(ids.includes("first_video"));
  assert.ok(!ids.includes("streak_30"));
});

test("daily quests reflect today's state", () => {
  const q = dailyQuests({ checkedInToday: true, trainedToday: false, nutritionToday: false });
  assert.equal(q.find((x) => x.id === "checkin")!.done, true);
  assert.equal(q.find((x) => x.id === "train")!.done, false);
  assert.equal(q.length, 3);
});

test("resting is not punished by the reward system", () => {
  /**
   * THE CONTRADICTION THIS FIXES. Every other system in the app treats backing
   * off as a skill — ACWR flags a load spike as an injury risk, readiness tells
   * a Red day to take active recovery, and the engine writes a deload into every
   * block. Gamification was the one place that treated it as nothing: a
   * training day paid 22 (10 check-in + 12 session), a rest day paid 10, and
   * fifty sessions earned a badge called "Machine".
   *
   * For a fifteen-year-old chasing a badge, that argued in the direction that
   * gets people hurt.
   */
  const base = { ...EMPTY_STATS, checkIns: 1 };
  const rested = computeXp({ ...base, restDaysLogged: 1 });
  const trained = computeXp({ ...base, trainingSessions: 1 });

  assert.ok(rested > computeXp(base), "a rest day must earn something, or the app pays nothing for its own advice");
  assert.ok(
    trained > rested,
    "training must still outrank resting — the point is to remove the penalty, not to invert the incentive"
  );
});

test("the badges reward recovery, not just accumulation", () => {
  // Ten rest days is a badge. Before, no amount of correct recovery unlocked
  // anything at all.
  const resting = { ...EMPTY_STATS, restDaysLogged: 10 };
  const { unlocked } = evaluateAchievements(resting, 1);
  assert.ok(unlocked.some((a) => a.id === "rest_10"), "logging rest days unlocks nothing");
});

test("no badge name tells an athlete to train harder", () => {
  /**
   * The Rewards page's own subtitle is "XP builds up from things you were doing
   * anyway. Nothing here needs chasing." It then handed out "Grinder" and
   * "Machine" for logging sessions. A name that instructs is not the same as a
   * name that records, and an injury-risk app should only ever do the second.
   *
   * Pins the copy, because this is the kind of thing that creeps back in one
   * cheerful pull request at a time.
   */
  const exhorting = /grind|machine|beast|savage|no days off|relentless|animal/i;

  /**
   * Scoped to badges gated on TRAINING VOLUME, which is the actual risk.
   *
   * My first version matched the vocabulary anywhere and caught "Week warrior"
   * and "Unstoppable" — both of which are check-in streaks. Checking in takes
   * ten seconds, carries no injury risk, and is a thing the app genuinely wants
   * every day; a bit of character on those badges urges nothing dangerous. The
   * principle is not "no energetic words", it is "do not push an athlete toward
   * more sessions", so the test asks which badges are gated on sessions.
   */
  const volumeGated = ACHIEVEMENTS.filter((a) => {
    const many = { ...EMPTY_STATS, trainingSessions: 999, completedSessions: 999 };
    return a.test(many, 1) && !a.test(EMPTY_STATS, 1);
  });
  assert.ok(volumeGated.length >= 2, "expected the session-count badges to be found by this probe");
  const offenders = volumeGated.filter((a) => exhorting.test(a.name));
  assert.deepEqual(
    offenders.map((a) => a.name), [],
    "a badge gated on session count must record what happened, not urge more of it"
  );
});

/**
 * EVERY BADGE HAS TO BE EARNABLE, and two of them nearly weren't.
 *
 * `streak` is computed from the dates the pages load, and they load 60 days —
 * a streak is broken by the first missing day, so fetching more would be waste.
 * That caps `streak` at 60 whatever the athlete actually does, so a "90-day
 * streak" badge would sit on the page forever, greyed out, unreachable, telling
 * people the app was broken. Same for `longestStreak`, and for
 * `perfectDaysLast7`, which cannot exceed 7.
 *
 * Asserted against a maxed-out athlete: everything must unlock for someone who
 * has done all of it.
 */
test("no badge asks for something the app cannot measure", () => {
  const WINDOW_DAYS = 60;
  const maxed: ActivityStats = {
    checkIns: 5000, streak: WINDOW_DAYS, trainingSessions: 5000, completedSessions: 5000,
    completedBlocks: 200, benchmarks: 500, videos: 500, nutritionLogs: 5000,
    checkInsLast7: 7, restDaysLogged: 2000,
    longestStreak: WINDOW_DAYS, weeksActive: Math.floor(WINDOW_DAYS / 7), perfectDaysLast7: 7,
    // Both are derived from the same 60 days of dates, so both are capped by it.
    perfectDays: WINDOW_DAYS,
    // A comeback needs a gap of 7 days plus the day that closes it, so 60 days
    // cannot hold more than this many however erratic the athlete is.
    comebacks: Math.floor(WINDOW_DAYS / 8),
    // Lifetime counters from ladder_standing_log rather than derived from the
    // 60-day activity window, so the window's cap does not apply to them.
    apexDays: 5000, apexBestRun: 5000, eliteDays: 5000, eliteBestRun: 5000,
    // Every rankable body part at the top of the ladder. Bounded by the ladder
    // itself rather than by the window, so it is a real ceiling: no strength
    // badge may ask for more tiers than a body has parts to earn them in.
    strengthTiers: RANKABLE_MUSCLES.length * TOP_TIER,
    // The real ceilings: the top rung on a single lift, and every rankable
    // muscle ranked. No strength badge may ask for more than a body can give.
    bestStrengthTier: TOP_TIER,
    musclesRanked: RANKABLE_MUSCLES.length,
  };
  const { locked } = evaluateAchievements(maxed, 999);
  assert.deepEqual(
    locked.map((a) => a.id), [],
    "these can never be unlocked by anyone, because the stat cannot reach the threshold"
  );
});

test("a brand new athlete has everything to play for", () => {
  const { unlocked } = evaluateAchievements(EMPTY_STATS, 1);
  assert.deepEqual(unlocked.map((a) => a.id), [], "a badge unlocked before doing anything is not a badge");
});

/**
 * Ids are the primary key of `achievement_unlocks` (migration 0074) and the key
 * of the rarity map. Two badges sharing one would merge into a single row and
 * each would report the other's rarity.
 */
test("badge ids are unique, stable slugs", () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9_]+$/, `${id} is stored — keep it a slug`);
  const names = ACHIEVEMENTS.map((a) => a.name);
  assert.equal(new Set(names).size, names.length, "two badges with the same name are indistinguishable on the grid");
});

/**
 * THE LADDERS HAVE TO KEEP GOING.
 *
 * The first set stopped at "log 50 sessions", so a committed athlete collected
 * everything inside a couple of months and the page had nothing left to say.
 * Every counting ladder should reach somewhere a regular user is not.
 */
test("there is always something above where you are", () => {
  const twoMonthsIn: ActivityStats = {
    ...EMPTY_STATS,
    checkIns: 60, streak: 20, trainingSessions: 45, completedSessions: 40,
    completedBlocks: 2, benchmarks: 2, videos: 3, nutritionLogs: 25,
    checkInsLast7: 7, restDaysLogged: 15, longestStreak: 20, weeksActive: 8, perfectDaysLast7: 2,
  };
  const { locked } = evaluateAchievements(twoMonthsIn, 12);
  assert.ok(locked.length >= 8, `only ${locked.length} badges left for a two-month athlete to chase`);
});

/**
 * A whole-loop day — checked in, trained, ate for it — is the thing this app is
 * built around, and nothing marked it: every badge counted one habit alone.
 */
test("doing the whole loop in a day is worth something", () => {
  const partial: ActivityStats = { ...EMPTY_STATS, checkIns: 1, trainingSessions: 1, perfectDaysLast7: 0 };
  const whole: ActivityStats = { ...partial, perfectDaysLast7: 1 };
  const before = evaluateAchievements(partial, 1).unlocked.map((a) => a.id);
  const after = evaluateAchievements(whole, 1).unlocked.map((a) => a.id);
  assert.ok(after.includes("full_house"));
  assert.ok(!before.includes("full_house"));
});

/**
 * COMING BACK IS THE HARD PART. `streak` pays only for the run you are ON, so
 * one missed day of a forty-day run leaves nothing to show for the forty —
 * which is exactly the moment someone decides whether to open the app again.
 */
test("a streak you had still counts after it breaks", () => {
  const lapsed: ActivityStats = { ...EMPTY_STATS, checkIns: 40, streak: 0, longestStreak: 40 };
  const ids = evaluateAchievements(lapsed, 5).unlocked.map((a) => a.id);
  assert.ok(ids.includes("best_streak_21"), "a broken 40-day streak was worth nothing at all");
  assert.ok(!ids.includes("streak_14"), "the current-streak badges must still need a current streak");
});

// --- the two counters added for the third batch of badges --------------------

/**
 * COMING BACK, counted. The streak resets to zero the moment someone misses a
 * day, so an athlete with an interrupted history has nothing the reward system
 * can see. These badges are the only ones that pay for it, which makes the
 * counter behind them worth pinning down.
 */
test("a comeback is a real absence closed, not a missed weekend", () => {
  const spans = (dates: string[]) => activitySpans(dates, [], [], "2026-03-01");

  // Straight through: no gaps, no comebacks.
  assert.equal(spans(["2026-01-01", "2026-01-02", "2026-01-03"]).comebacks, 0);
  // A weekend off is not a comeback — that is ordinary life, not a return.
  assert.equal(spans(["2026-01-01", "2026-01-02", "2026-01-05"]).comebacks, 0);
  // Six days away: still short of the week that makes it a return.
  assert.equal(spans(["2026-01-01", "2026-01-07"]).comebacks, 0);
  // Seven days away, then back. That is one.
  assert.equal(spans(["2026-01-01", "2026-01-08"]).comebacks, 1);
  // Two separate absences, two returns.
  assert.equal(spans(["2026-01-01", "2026-01-20", "2026-01-21", "2026-02-15"]).comebacks, 2);
});

test("a comeback does not cost you the streak you had", () => {
  // The whole point of the badge: forty days, a fortnight off, then back. The
  // current streak is 1 and the app must still be able to see the forty.
  const long = Array.from({ length: 40 }, (_, i) =>
    new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10));
  const s = activitySpans([...long, "2026-03-01"], [], [], "2026-03-01");
  assert.equal(s.longestStreak, 40);
  assert.equal(s.comebacks, 1);
});

test("a complete day is all three, and it is counted beyond this week", () => {
  const check = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"];
  const train = ["2026-01-01", "2026-01-02", "2026-01-04"];
  const food = ["2026-01-01", "2026-01-02", "2026-01-03"];
  // 01 and 02 have all three. 03 has no training, 04 has no food.
  const s = activitySpans(check, train, food, "2026-03-01");
  assert.equal(s.perfectDays, 2);
  // Long past the seven-day window, so the resetting counter sees none of it —
  // which is exactly why the unresetting one had to exist.
  assert.equal(s.perfectDaysLast7, 0);

  // Training and eating on a day you never checked in is not a complete day.
  assert.equal(activitySpans([], ["2026-01-01"], ["2026-01-01"], "2026-01-01").perfectDays, 0);
});

// --- the two rungs above Legend ----------------------------------------------

/**
 * "TOP 1%" OF TWELVE PEOPLE IS NOT A PERCENTILE.
 *
 * These two ranks make claims about everybody else, so they are the only ones
 * that cannot be earned by grinding alone. Below the population floor the
 * ladder simply ends at Legend — a badge asserting a percentile that has not
 * been measured is a lie the first person to notice never trusts again.
 */
test("no standing rank is awarded below the athlete floor", () => {
  for (const athletes of [1, 12, 99]) {
    assert.equal(standingRank({ athletes, position: 1 }), null,
      `world number one was awarded with only ${athletes} athletes`);
  }
  assert.ok(standingRank({ athletes: LADDER_MIN_ATHLETES, position: 1 }),
    "the floor itself should qualify");
});

test("the top two ranks go to the standing, not the level", () => {
  // 200 athletes: the top 1% is two people. First is the world number one, the
  // other is Elite.
  assert.equal(standingRank({ athletes: 200, position: 1 })?.tier, "Apex");
  assert.equal(standingRank({ athletes: 200, position: 2 })?.tier, "Elite");
  assert.equal(standingRank({ athletes: 200, position: 3 }), null, "third of 200 is not the top 1%");

  // At exactly 100 the top 1% is one person, who is also number one — so Elite
  // is genuinely empty until the ladder passes 200. Correct rather than
  // convenient, and worth asserting so nobody 'fixes' it into a rounding error.
  assert.equal(standingRank({ athletes: 100, position: 1 })?.tier, "Apex");
  assert.equal(standingRank({ athletes: 100, position: 2 }), null);
});

test("a standing outranks any level, and its absence changes nothing", () => {
  // Level 4 is Bronze. Being number one of a real ladder beats it.
  assert.equal(rankFor(4, { athletes: 500, position: 1 }).tier, "Apex");
  // And every existing caller passes no standing at all, which must behave
  // exactly as it did before these tiers existed.
  assert.equal(rankFor(4).tier, "Bronze");
  assert.equal(rankFor(999).tier, "Legend");
});

test("nonsense standings are refused rather than rendered", () => {
  for (const s of [
    { athletes: 500, position: 0 },
    { athletes: 500, position: 501 },
    { athletes: Number.NaN, position: 1 },
    { athletes: 500, position: Number.POSITIVE_INFINITY },
  ]) {
    assert.equal(standingRank(s), null, `${JSON.stringify(s)} should not earn a rank`);
  }
  assert.equal(standingRank(null), null);
  assert.equal(standingRank(undefined), null);
});

test("the standing ranks say what they mean", () => {
  assert.match(standingRank({ athletes: 500, position: 1 })?.note ?? "", /No\. 1 in the world/);
  assert.match(standingRank({ athletes: 500, position: 3 })?.note ?? "", /Top 1%/);
});
