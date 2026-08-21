import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromAiItems, scaleItem, totalOf } from "./food-estimate";

/**
 * "AI estimate doesn't estimate protein, fats or carbs — only calories."
 *
 * It always did. The prompt asks for all four, the reader validates the macros
 * against the calorie figure, and the entry stores every one of them. What the
 * screen showed was "~620 kcal · 41g protein" — two of the four — so as far as
 * anybody using it was concerned, carbs and fat were never estimated. A number
 * that is computed, stored, and never displayed does not exist.
 */

const raw = [
  { name: "Chicken breast", qty: 200, unit: "g", kcal: 330, protein: 62, carbs: 0, fats: 7 },
  { name: "Basmati rice", qty: 180, unit: "g", kcal: 234, protein: 5, carbs: 51, fats: 1 },
];

test("the estimate carries all four macros, not just the calories", () => {
  const estimate = fromAiItems(raw);
  assert.equal(estimate.total.kcal > 0, true);
  assert.equal(estimate.total.protein, 67);
  assert.equal(estimate.total.carbs, 51);
  assert.equal(estimate.total.fats, 8);
  for (const item of estimate.items) {
    assert.ok(item.macros.carbs >= 0 && item.macros.fats >= 0, `${item.name} lost a macro`);
  }
});

test("all four are on the screen the athlete accepts", () => {
  // THE ACTUAL BUG, and it is one line of JSX.
  const ui = readFileSync(new URL("../components/MealCheckIn.tsx", import.meta.url), "utf8");
  const summary = ui.slice(ui.indexOf("~{finalMacros?.kcal"), ui.indexOf("~{finalMacros?.kcal") + 400);
  for (const macro of ["kcal", "protein", "carbs", "fats"]) {
    assert.match(summary, new RegExp(macro), `the estimate summary does not show ${macro}`);
  }
});

test("each value can be overridden outright", () => {
  // The quantity field is the better primitive nine times in ten — correct the
  // portion and every macro follows — and it cannot express "the model got the
  // protein wrong". A label in your hand beats an estimate.
  const ui = readFileSync(new URL("../components/MealCheckIn.tsx", import.meta.url), "utf8");
  assert.match(ui, /\["kcal", "protein", "carbs", "fats"\] as const/, "there is no per-macro override");
  assert.match(ui, /const macros = finalMacros \?\? shown\.total;/, "the override is not what gets logged");
  assert.match(ui, /Blank means/, "it does not say what an empty box means");
});

test("scaling a portion keeps every macro in step", () => {
  // The override sits beside the items rather than inside one, precisely so it
  // survives this: rescaling an item must not silently undo a stated macro.
  const estimate = fromAiItems(raw);
  const halved = scaleItem(estimate.items[0], 100);
  assert.equal(halved.macros.protein, 31);
  assert.equal(halved.macros.fats, 4);
  assert.equal(halved.macros.carbs, 0);
  const total = totalOf([halved, estimate.items[1]]);
  assert.equal(total.protein, 36);
});

test("a macro the model left out is zero, not a guess", () => {
  const estimate = fromAiItems([{ name: "Mystery", qty: 1, unit: "each", kcal: 200 }]);
  assert.equal(estimate.total.protein, 0);
  assert.equal(estimate.total.carbs, 0);
  assert.equal(estimate.total.fats, 0);
  assert.ok(estimate.total.kcal > 0, "the calories it did give must survive");
});
