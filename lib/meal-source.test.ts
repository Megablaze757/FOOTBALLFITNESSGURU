import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planTargets, buildWeek, shoppingList, mealTags, DEFAULT_PREFS,
  type BodyStats, type MealPrefs, type PlannedDay,
} from "./meal-plan";

/**
 * "Better recipes."
 *
 * The recipes were fine. What the athlete was being SERVED was not: an omnivore
 * with no restrictions got 8 meat and 12 fish meals out of 112 across four
 * weeks, and in budget mode got none at all. See SOURCE_WEEKLY_BUDGET in
 * ./meal-plan for why — `proteinShortfall` clamps at zero, so once a dish
 * clears the protein target only money separates it from the rest, and animal
 * protein is dearer in every case.
 *
 * The tests that matter here are the ones that walk four consecutive weeks.
 * A single week says almost nothing: week one is the cost-optimal week by
 * construction, because nothing is in the trolley yet.
 */

const ATHLETES: [string, BodyStats][] = [
  ["bulking 78kg", { sex: "male", age: 25, heightCm: 180, weightKg: 78, activity: "high", goal: "build" }],
  ["cutting 60kg", { sex: "female", age: 30, heightCm: 165, weightKg: 60, activity: "moderate", goal: "cut" }],
  ["bulking 95kg", { sex: "male", age: 35, heightCm: 190, weightKg: 95, activity: "high", goal: "build" }],
  ["maintaining 68kg", { sex: "female", age: 22, heightCm: 172, weightKg: 68, activity: "high", goal: "maintain" }],
];

interface Run {
  /** Meal ids served, in order, across every week. */
  ids: string[];
  /** Lunches and dinners only — the slots the source pass applies to. */
  mains: string[];
  mainsWithSource: string[];
  weeks: PlannedDay[][];
  shop: number;
}

function fourWeeks(stats: BodyStats, prefs: MealPrefs, sources: string[]): Run {
  const targets = planTargets(stats);
  const out: Run = { ids: [], mains: [], mainsWithSource: [], weeks: [], shop: 0 };
  let recent: string[] = [];
  for (let w = 0; w < 4; w++) {
    const week = buildWeek(targets, w, prefs, undefined, {}, recent);
    out.weeks.push(week);
    out.shop += shoppingList(week).total;
    const ids: string[] = [];
    for (const day of week) {
      for (const planned of day.meals) {
        ids.push(planned.meal.id);
        if (planned.meal.slot === "Lunch" || planned.meal.slot === "Dinner") {
          out.mains.push(planned.meal.id);
          const tags = mealTags(planned.meal) as string[];
          if (sources.some((s) => tags.includes(s))) out.mainsWithSource.push(planned.meal.id);
        }
      }
    }
    out.ids.push(...ids);
    recent = ids;
  }
  out.shop /= 4;
  return out;
}

const share = (r: Run) => r.mainsWithSource.length / Math.max(1, r.mains.length);

test("somebody who eats everything is served meat and fish", () => {
  // THE TEST THAT WOULD HAVE CAUGHT IT. Nothing in the planner was wrong in
  // isolation — it was doing exactly what the score asked — and no unit test
  // on any single term would have noticed that a month of an omnivore's food
  // was 82% plant protein.
  for (const [name, stats] of ATHLETES) {
    const run = fourWeeks(stats, DEFAULT_PREFS, ["meat", "fish"]);
    // A third, against a measured worst case of 36% and a pre-fix worst case
    // of 18%. Set to catch the regression rather than to pin the calibration —
    // a floor at the measured number would fail on any recipe added to the book.
    assert.ok(
      share(run) >= 0.33,
      `${name}: only ${Math.round(share(run) * 100)}% of mains carry meat or fish`
    );
    // Both, not just the cheaper one. Fish alone would still be a plan that
    // ignores half of what they said they eat.
    const tags = new Set(run.mainsWithSource.flatMap((id) =>
      (mealTags(run.weeks.flat().flatMap((d) => d.meals).find((p) => p.meal.id === id)!.meal) as string[])));
    assert.ok(tags.has("meat"), `${name}: no meat at all in four weeks`);
    assert.ok(tags.has("fish"), `${name}: no fish at all in four weeks`);
  }
});

test("keeping meat on the menu never costs the athlete protein", () => {
  // The guarantee, and the reason the pass is built the way it is rather than
  // as another term in the score. Every previous attempt at variety in this
  // file bought it out of the protein target, because that is always the
  // cheapest place to take it from.
  for (const [name, stats] of ATHLETES) {
    const targets = planTargets(stats);
    const run = fourWeeks(stats, DEFAULT_PREFS, ["meat", "fish"]);
    for (const week of run.weeks) {
      for (const day of week) {
        assert.ok(
          day.macros.protein >= targets.protein * 0.9,
          `${name}: a day landed at ${Math.round(day.macros.protein)}g against a ${targets.protein}g target`
        );
      }
    }
  }
});

test("a pescatarian gets fish, and still never gets meat", () => {
  const prefs: MealPrefs = { ...DEFAULT_PREFS, pattern: "pescatarian" };
  for (const [name, stats] of ATHLETES) {
    const run = fourWeeks(stats, prefs, ["fish"]);
    // Lower than the omnivore floor because there is one source rather than
    // two, and the book holds 20 fish dishes against 44 with animal protein.
    // Measured worst case 29%, pre-fix worst case 9%.
    assert.ok(share(run) >= 0.25, `${name}: only ${Math.round(share(run) * 100)}% of mains carry fish`);
    // The pass reaches for a whole different dish, so it is a place the diet
    // filter could be bypassed. It must not be.
    for (const week of run.weeks) {
      for (const day of week) {
        for (const planned of day.meals) {
          assert.ok(!(mealTags(planned.meal) as string[]).includes("meat"), `${name}: ${planned.meal.name}`);
        }
      }
    }
  }
});

test("a dislike still wins over the pattern", () => {
  // The pass reaches past the meal the score chose, so it is a place a dislike
  // could be bypassed. Somebody who eats everything but will not eat fish
  // should get meat instead — not fish, and not nothing.
  const prefs: MealPrefs = {
    ...DEFAULT_PREFS,
    dislikes: ["salmon_fillet", "tuna_tin", "prawns", "white_fish"],
  };
  const run = fourWeeks(ATHLETES[0][1], prefs, ["meat"]);
  for (const week of run.weeks) {
    for (const day of week) {
      for (const planned of day.meals) {
        for (const item of planned.meal.items) {
          assert.ok(!prefs.dislikes.includes(item.foodId), `${planned.meal.name} contains ${item.foodId}`);
        }
      }
    }
  }
  assert.ok(run.mainsWithSource.length > 0, "no meat at all for someone who eats meat and won't eat fish");
});

test("a vegan plan is untouched by any of this", () => {
  // PATTERN_SOURCES is empty for the two plant patterns, so the pass should not
  // run at all — not merely find nothing.
  const prefs: MealPrefs = { ...DEFAULT_PREFS, pattern: "vegan" };
  const run = fourWeeks(ATHLETES[2][1], prefs, ["meat", "fish", "dairy", "egg"]);
  assert.equal(run.mainsWithSource.length, 0);
});

test("budget mode is not quietly made dearer by this", () => {
  // Run for budget shoppers, the pass took their meat-or-fish mains from 0% to
  // 18% and their weekly shop from £88.28 to £96.03 — a 9% rise nobody asked
  // for. `sourceBudget` is zero in budget mode for that reason, and this is
  // what holds it there.
  for (const [name, stats] of ATHLETES) {
    const normal = fourWeeks(stats, DEFAULT_PREFS, ["meat", "fish"]);
    const budget = fourWeeks(stats, { ...DEFAULT_PREFS, budget: true }, ["meat", "fish"]);
    assert.ok(
      budget.shop < normal.shop,
      `${name}: budget £${budget.shop.toFixed(2)} against normal £${normal.shop.toFixed(2)}`
    );
  }
});

test("the menu still turns over week on week", () => {
  // The pass runs last and can override both rotations, so it is exactly the
  // kind of change that silently reintroduces "Regenerate week does nothing".
  for (const [name, stats] of ATHLETES) {
    const run = fourWeeks(stats, DEFAULT_PREFS, ["meat", "fish"]);
    const perWeek = run.ids.length / 4;
    for (let w = 1; w < 4; w++) {
      const previous = new Set(run.ids.slice((w - 1) * perWeek, w * perWeek));
      const now = run.ids.slice(w * perWeek, (w + 1) * perWeek);
      const changed = now.filter((id) => !previous.has(id)).length / now.length;
      assert.ok(changed >= 0.15, `${name}: week ${w + 1} is ${Math.round(changed * 100)}% new`);
    }
  }
});
