import test from "node:test";
import assert from "node:assert/strict";
import {
  currentStreak, goalAchieved, isStreakMilestone, metricLabel, STREAK_MILESTONES,
} from "./milestones";

const set = (...days: string[]) => new Set(days);

test("a streak counts back from yesterday when today is not logged yet", () => {
  /**
   * The job runs in the morning. Somebody on a 29-day run who has not checked
   * in YET today is still on 29 — counting only from today would read every
   * streak as broken until they opened the app, and the 30-day message would
   * fire on the wrong day or never.
   */
  assert.equal(currentStreak(set("2026-03-08", "2026-03-09", "2026-03-10"), "2026-03-10"), 3);
  assert.equal(currentStreak(set("2026-03-08", "2026-03-09"), "2026-03-10"), 2, "yesterday's run was discarded");
  // Two days ago is a broken streak, not a shorter one.
  assert.equal(currentStreak(set("2026-03-07", "2026-03-08"), "2026-03-10"), 0);
  assert.equal(currentStreak(set(), "2026-03-10"), 0);
});

test("a gap ends the streak rather than being skipped over", () => {
  assert.equal(currentStreak(set("2026-03-10", "2026-03-09", "2026-03-07", "2026-03-06"), "2026-03-10"), 2);
});

test("only the lengths worth saying something about", () => {
  for (const n of STREAK_MILESTONES) assert.equal(isStreakMilestone(n), true, `${n} is not a milestone`);
  for (const n of [1, 6, 8, 13, 29, 31, 99, 400]) assert.equal(isStreakMilestone(n), false, `${n} fired a message`);
});

test("a faster time is a better result, a heavier lift is a better result", () => {
  // The bug this prevents is congratulating somebody for getting slower.
  assert.equal(goalAchieved("sprint_20m", 2.9, 3.0), true);
  assert.equal(goalAchieved("sprint_20m", 3.1, 3.0), false);
  assert.equal(goalAchieved("squat_1rm", 141, 140), true);
  assert.equal(goalAchieved("squat_1rm", 139, 140), false);
  // Exactly on target counts, in both directions.
  assert.equal(goalAchieved("run_5k_min", 20, 20), true);
  assert.equal(goalAchieved("deadlift_1rm", 200, 200), true);
});

test("a metric with no label still reads as English", () => {
  assert.equal(metricLabel("squat_1rm"), "back squat 1RM");
  assert.equal(metricLabel("some_new_metric"), "some new metric");
});
