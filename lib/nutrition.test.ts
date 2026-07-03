import { test } from "node:test";
import assert from "node:assert/strict";
import { nutritionTargets } from "./nutrition";

test("returns null without a weight", () => {
  assert.equal(nutritionTargets({ weightKg: null, goal: "speed", avgTrainingMinutes: 60 }), null);
});

test("strength goal uses 2.0 g/kg protein", () => {
  const t = nutritionTargets({ weightKg: 80, goal: "strength", avgTrainingMinutes: 0 })!;
  assert.equal(t.protein, 160);
});

test("endurance weights carbs higher than strength at the same weight", () => {
  const end = nutritionTargets({ weightKg: 70, goal: "endurance", avgTrainingMinutes: 60 })!;
  const str = nutritionTargets({ weightKg: 70, goal: "strength", avgTrainingMinutes: 60 })!;
  assert.ok(end.carbs > str.carbs);
});

test("calories rise with training volume", () => {
  const rest = nutritionTargets({ weightKg: 75, goal: "speed", avgTrainingMinutes: 0 })!;
  const hard = nutritionTargets({ weightKg: 75, goal: "speed", avgTrainingMinutes: 90 })!;
  assert.ok(hard.calories > rest.calories);
  assert.ok(hard.water_ml > rest.water_ml);
});

test("macros are positive and fats respect the hormone floor", () => {
  const t = nutritionTargets({ weightKg: 60, goal: "skill", avgTrainingMinutes: 30 })!;
  assert.ok(t.protein > 0 && t.carbs > 0 && t.fats >= Math.round(60 * 0.8));
});
