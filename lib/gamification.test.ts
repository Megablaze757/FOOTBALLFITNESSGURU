import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeXp, levelFor, rankFor, evaluateAchievements, dailyQuests, EMPTY_STATS,
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
  assert.equal(l.rank, "Rookie");
  assert.equal(l.xpIntoLevel, 0);
});

test("ranks scale with level", () => {
  assert.equal(rankFor(1).rank, "Rookie");
  assert.equal(rankFor(10).rank, "Pro");
  assert.equal(rankFor(30).rank, "World Class");
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
