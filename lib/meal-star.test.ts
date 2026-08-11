import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSchedule } from "./meal-schedule";
import {
  planTargets, buildWeek, effectiveMealPrefs, DEFAULT_PREFS, MEALS,
  type BodyStats, type MealPrefs,
} from "./meal-plan";

const ATHLETE: BodyStats = {
  sex: "male", age: 22, heightCm: 180, weightKg: 78, activity: "high", goal: "maintain",
};

// --- the two screens must agree -----------------------------------------------

/**
 * THE PLAN AND THE TICK-LIST SHOWED DIFFERENT FOOD FOR THE SAME DAY.
 *
 * A plan is stored as one seed and rebuilt wherever it is shown, which only
 * works if every caller feeds `buildWeek` the same inputs. Two did not: the
 * Meal plan tab merged starred dishes and note-inferred dislikes into prefs
 * first, and the Today tick-list passed the raw saved prefs.
 *
 * Starring is worth STARRED_BONUS in the planner and exempts a dish from the
 * had-it-last-week rule, so it does not nudge the week — it rebuilds a
 * different one. The moment anybody starred anything, the two screens
 * disagreed. `effectiveMealPrefs` is the single derivation both now use.
 */
test("starring a dish does not make the plan and the tick-list disagree", () => {
  const targets = planTargets(ATHLETE);
  const saved: MealPrefs = { ...DEFAULT_PREFS };
  const notes = "I don't like yoghurt";
  const starred = [MEALS.find((m) => m.slot === "Dinner")!.id];

  const ids = (p: MealPrefs) =>
    buildWeek(targets, 7, p, parseSchedule(notes), {}, []).flatMap((d) => d.meals.map((m) => m.meal.id));

  // What each screen now does.
  const planTab = ids(effectiveMealPrefs(saved, notes, starred));
  const todayTab = ids(effectiveMealPrefs({ ...DEFAULT_PREFS, ...saved }, notes, starred));
  assert.deepEqual(todayTab, planTab, "the two screens must rebuild the identical week");

  // And the bug is real: the old Today behaviour — raw prefs, no starred, no
  // note dislikes — genuinely produced a different week, so this is not a test
  // that would have passed anyway.
  const oldToday = ids({ ...DEFAULT_PREFS, ...saved });
  assert.notDeepEqual(oldToday, planTab, "if these match, the fixture no longer exercises the bug");
});

test("effectiveMealPrefs folds in both the stars and the notes", () => {
  const out = effectiveMealPrefs({ ...DEFAULT_PREFS }, "no fish", ["some_meal"]);
  assert.deepEqual(out.starred, ["some_meal"]);
  assert.ok(out.dislikes.includes("salmon_fillet"), `notes were not read: ${out.dislikes.join(", ")}`);
});
