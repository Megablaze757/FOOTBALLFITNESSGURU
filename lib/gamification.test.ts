import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeXp, levelFor, rankFor, rankLadder, evaluateAchievements, dailyQuests, EMPTY_STATS,
  ACHIEVEMENTS,
} from "./gamification";

test("XP accumulates from activity and levels rise", () => {
  assert.equal(computeXp(EMPTY_STATS), 0);
  const s = { ...EMPTY_STATS, checkIns: 5, trainingSessions: 3, streak: 5 };
  const xp = computeXp(s); // 50 + 36 + 25 = 111
  assert.equal(xp, 111);
  const lvl = levelFor(xp);
  assert.ok(lvl.level >= 2, `level ${lvl.level}`); // past the 100-xp first threshold
  assert.ok(lvl.progress >= 0 && lvl.progress <= 1);
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

test("the apex tier has no division and never runs out", () => {
  assert.equal(rankFor(26).tier, "Legend");
  assert.equal(rankFor(26).rank, "Legend");
  assert.equal(rankFor(500).rank, "Legend");
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
  for (let i = 1; i < ladder.length; i++) {
    assert.ok(ladder[i].fromLevel > ladder[i - 1].fromLevel, "tiers must start in order");
    assert.equal(rankFor(ladder[i].fromLevel).tier, ladder[i].tier);
  }
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
