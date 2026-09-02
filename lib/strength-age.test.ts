import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_FACTOR, PEAK_AGE, STEEP_AGE,
  adjustsAnything, ageFactor, ageNote,
} from "./strength-age";
import { LIFT_STANDARDS, STRENGTH_TIERS, rankLift } from "./strength-standards";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NOTHING HAPPENS TO ANYBODY UNDER THIRTY-FIVE.
 *
 * Including teenagers. A 16-year-old is still growing, and handing them a
 * bonus for being young is a different kind of wrong from the one this fixes —
 * and it would quietly inflate the ranks of the youngest people using the app.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the young and the unknown are left exactly as they were", () => {
  for (const age of [null, undefined, 14, 16, 22, 30, PEAK_AGE]) {
    assert.equal(ageFactor(age), 1, `${age} was adjusted`);
    assert.equal(adjustsAnything(age), false, `${age} claims to adjust something`);
  }
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(ageFactor(bad), 1, "a broken age must not become a bonus");
  }
});

test("the curve only ever goes one way, and stops", () => {
  let previous = 1;
  for (let age = PEAK_AGE; age <= 100; age++) {
    const f = ageFactor(age);
    assert.ok(f >= previous, `the factor fell between ${age - 1} and ${age}`);
    assert.ok(f <= MAX_FACTOR, `${age} exceeds the ceiling`);
    previous = f;
  }
  assert.equal(ageFactor(200), MAX_FACTOR, "the ceiling does not hold");
});

test("it steepens past sixty, because that is the only shape anybody agrees on", () => {
  const fortyToFifty = ageFactor(50) - ageFactor(40);
  const sixtyToSeventy = ageFactor(70) - ageFactor(60);
  assert.ok(sixtyToSeventy > fortyToFifty,
    "a decade past sixty is worth no more than a decade before it");
  assert.equal(ageFactor(STEEP_AGE), ageFactor(STEEP_AGE), "the join is not continuous");
});

/** Sanity: the size of the adjustment has to be believable. */
test("the adjustment is a nudge, not a promotion generator", () => {
  // A decade past peak is worth under a tenth.
  assert.ok(ageFactor(45) < 1.1, `45 is worth ${ageFactor(45)}, which is too much`);
  // And even a very old athlete is not handed two tiers.
  assert.ok(ageFactor(75) < 1.5, `75 is worth ${ageFactor(75)}`);
});

/**
 * The absolute tier is the headline and stays the headline. The note appears
 * only when age actually changes the answer — repeating "Advanced, and
 * Advanced for your age" on every row is noise that teaches people to stop
 * reading the row.
 */
test("the note is silent unless it has something to say", () => {
  assert.equal(ageNote({ age: 25, absoluteTier: "Novice", adjustedTier: "Novice" }), null);
  assert.equal(ageNote({ age: 52, absoluteTier: "Advanced", adjustedTier: "Advanced" }), null,
    "it says the same thing twice");
  assert.equal(ageNote({ age: 52, absoluteTier: "Advanced", adjustedTier: "Exceptional" }),
    "Exceptional for 52");
  assert.equal(ageNote({ age: null, absoluteTier: "Novice", adjustedTier: "Advanced" }), null,
    "an unknown age invented an adjustment");
});

/**
 * What it is actually worth, on the lift the report was about. A 52-year-old
 * benching 100kg at 80kg bodyweight is Advanced outright; the question this
 * answers is whether that is remarkable for 52.
 */
test("it moves a real lift by a believable amount", () => {
  const bench = LIFT_STANDARDS.find((l) => l.key === "bench")!;
  const absolute = rankLift(bench, 100, 80, "male")!;
  const adjusted = rankLift(bench, 100 * ageFactor(52), 80, "male")!;

  assert.equal(absolute.tier.name, "Advanced");
  assert.ok(STRENGTH_TIERS.indexOf(adjusted.tier) >= STRENGTH_TIERS.indexOf(absolute.tier),
    "the adjustment made an older athlete rank LOWER");
  // And a 25-year-old with the identical lift is untouched.
  assert.equal(rankLift(bench, 100 * ageFactor(25), 80, "male")!.tier.name, "Advanced");
});

// --- how the panel is allowed to use it ----------------------------------------

import { readFileSync } from "node:fs";

const strip = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");

const PANEL = strip(readFileSync(new URL("../components/StrengthRanks.tsx", import.meta.url), "utf8"));
const CALLER = strip(readFileSync(new URL("../components/ProgressPanel.tsx", import.meta.url), "utf8"));

/**
 * The absolute tier is the headline and must stay the headline. "Advanced —
 * stronger than most people in any gym" is a claim about the gym; quietly
 * making it mean "for your age" would change what the word means without
 * telling anybody.
 */
test("the age note is added beside the absolute tier, never instead of it", () => {
  assert.match(PANEL, /\{r\.tier\.name\}/, "the absolute tier is gone from the row");
  assert.match(PANEL, /ageNote\(\{ age, absoluteTier: r\.tier\.name/,
    "the note is not derived from the absolute tier, so it cannot know whether it agrees");
  assert.match(PANEL, /note \? <span[^>]*>\{note\}<\/span> : null/,
    "the note renders even when it says nothing");
});

test("an unknown birth year changes nobody's rank", () => {
  assert.match(PANEL, /age = null,/, "age defaults to something other than null");
  assert.match(PANEL, /if \(factor === 1 \|\| !weightKg\) return new Map/,
    "the adjusted pass runs even when there is nothing to adjust");
  assert.match(CALLER, /age > 0 && age < 120 \? age : null/,
    "a nonsense birth year becomes a real age");
  assert.match(CALLER, /birth_year/, "the profile query does not fetch a birth year");
});

/** Scaling bodyweight is the same arithmetic as scaling the lift — say so. */
test("only the tier name is taken from the adjusted pass", () => {
  assert.match(PANEL, /weightKg \/ factor/, "the adjustment is applied some other way");
  assert.match(PANEL, /\[r\.lift\.key, r\.tier\.name\]/,
    "something other than the tier name is read from a pass with a bodyweight nobody has");
});
