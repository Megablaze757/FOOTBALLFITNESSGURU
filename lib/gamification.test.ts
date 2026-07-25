import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeXp, levelFor, rankFor, rankLadder, evaluateAchievements, dailyQuests, EMPTY_STATS,
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
