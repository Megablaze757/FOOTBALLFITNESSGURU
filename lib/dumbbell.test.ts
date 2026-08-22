// The convention: a dumbbell weight is what is in one hand.
import test from "node:test";
import assert from "node:assert/strict";
import { isPerHand, handsFor, totalLoadKg, perHandFromTotal, loadUnitLabel } from "./dumbbell";

test("dumbbells and kettlebells are held one per hand", () => {
  assert.equal(isPerHand("Dumbbell bench press"), true);
  assert.equal(isPerHand("DB shoulder press"), true);
  assert.equal(isPerHand("Kettlebell swing"), true);
  assert.equal(isPerHand("Barbell back squat"), false);
  assert.equal(isPerHand("Leg press"), false);
});

test("a two-dumbbell lift moves twice what was typed", () => {
  // "I pressed the 30s" is 60kg of dumbbell. Recorded as 30 it was half the
  // session, every session.
  assert.equal(totalLoadKg("Dumbbell bench press", 30), 60);
  assert.equal(handsFor("Dumbbell shoulder press"), 2);
});

test("one-sided work is one dumbbell, and doubling it is the same error backwards", () => {
  for (const name of [
    "Single-arm dumbbell row", "One-arm dumbbell press", "Suitcase carry",
    "Alternating dumbbell curl", "Single-leg dumbbell RDL",
  ]) {
    assert.equal(handsFor(name), 1, name);
  }
  assert.equal(totalLoadKg("Single-arm dumbbell row", 40), 40);
});

test("a barbell weight is already the total", () => {
  assert.equal(totalLoadKg("Barbell bench press", 100), 100);
  assert.equal(handsFor("Barbell bench press"), 1);
});

test("an unlogged weight stays unlogged", () => {
  // Absent is not zero: a set with no weight typed is a set the app does not
  // know about, not a set with an empty bar.
  assert.equal(totalLoadKg("Dumbbell bench press", null), null);
  assert.equal(totalLoadKg("Dumbbell bench press", undefined), null);
  assert.equal(totalLoadKg("Dumbbell bench press", 0), null);
  assert.equal(totalLoadKg("Dumbbell bench press", Number.NaN), null);
});

test("a prescribed total converts back to what goes in each hand", () => {
  // 60kg of bench is the 30s, and printing 60 next to a dumbbell press asks
  // for a set nobody can do.
  assert.equal(perHandFromTotal("Dumbbell bench press", 60), 30);
  assert.equal(perHandFromTotal("Barbell bench press", 60), 60);
  assert.equal(perHandFromTotal("Single-arm dumbbell row", 40), 40);
});

test("the field says which number it wants", () => {
  assert.equal(loadUnitLabel("Dumbbell bench press"), "kg each");
  assert.equal(loadUnitLabel("Single-arm dumbbell row"), "kg");
  assert.equal(loadUnitLabel("Barbell back squat"), "kg");
});

test("the catalogue settles it when the name does not", () => {
  // A farmer's carry is two dumbbells and never says so; a goblet squat is one
  // dumbbell held in both hands and never says that either. The catalogue draws
  // the line already, in the plural: "Dumbbells" against "Dumbbell".
  assert.equal(handsFor("Farmer's carry"), 2);
  assert.equal(handsFor("Goblet squat"), 1);
});

test("an unknown name is counted as one, not guessed at", () => {
  // Doubling a number somebody entered as a total is the same error in reverse,
  // so anything the catalogue cannot identify keeps the reading it always had.
  assert.equal(handsFor("Some movement nobody has heard of"), 1);
  assert.equal(totalLoadKg("Some movement nobody has heard of", 50), 50);
});
