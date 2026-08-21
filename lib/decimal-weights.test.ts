import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimate1RM } from "./exercise-stats";
import { tonnage } from "./load";
import { drillTonnage, withSets, setsOf } from "./training-sets";
import type { TrainingDrill, TrainingLog } from "./types";

/**
 * "Can't log weights like 12.5kg or 12.25kg."
 *
 * The store was never the problem: load_kg lives inside the JSONB `drills`
 * column, so there is no numeric precision to round it away. The input was —
 * a bare number field with inputMode="numeric" puts a keypad on screen with no
 * decimal point on it, and 12.5 simply cannot be typed one-handed in a gym.
 *
 * These pin both halves: the field accepts hundredths, and nothing downstream
 * truncates them on the way to a 1RM or a volume total.
 */

test("the weight field takes hundredths, and offers a keypad that can type them", () => {
  const input = readFileSync(new URL("../components/NumberInput.tsx", import.meta.url), "utf8");
  assert.match(input, /inputMode=\{inputMode \?\? \(decimal \? "decimal" : "numeric"\)\}/,
    "a numeric keypad has no decimal point on it");
  assert.match(input, /step=\{step \?\? \(decimal \? "0\.01" : undefined\)\}/, "the field steps in whole numbers");
  assert.match(input, /onChange\(decimal \? n : Math\.trunc\(n\)\)/, "decimals are truncated on the way out");

  const log = readFileSync(new URL("../components/TrainingLogInput.tsx", import.meta.url), "utf8");
  const kg = log.slice(log.indexOf('label === "kg"') - 400, log.indexOf('label === "kg"') + 400);
  assert.match(kg, /decimal/, "the kg field does not ask for the decimal keypad");
});

test("a decimal load survives the round trip through a set", () => {
  const drill: TrainingDrill = { name: "Dumbbell curl", sets: 3, reps: 10, load_kg: 12.5 };
  // Expanded from the simple three-box row...
  for (const set of setsOf(drill)) {
    assert.equal(set.load_kg, 12.5, "expanding the drill into sets rounded the load");
  }
  // ...and written back as per-set detail, which is what a heavier session logs.
  const detailed = withSets(drill, [
    { reps: 10, load_kg: 12.5 }, { reps: 10, load_kg: 12.25 }, { reps: 8, load_kg: 12.5 },
  ]);
  assert.deepEqual(setsOf(detailed).map((s) => s.load_kg), [12.5, 12.25, 12.5]);
  assert.equal(drillTonnage(drill), 375, "3 × 10 × 12.5");
});

test("volume adds hundredths without drifting", () => {
  // 12.25 is the awkward one: it is not representable exactly in binary, so a
  // total built by repeated addition can land at 367.49999999999994 and a
  // display that trusts it shows 367.49999999999994 kg moved.
  const logs = [{
    drills: [
      { name: "Dumbbell curl", sets: 3, reps: 10, load_kg: 12.25 },
      { name: "Lateral raise", sets: 3, reps: 12, load_kg: 6.5 },
    ],
  }] as TrainingLog[];
  const total = tonnage(logs);
  assert.ok(Math.abs(total - 601.5) < 1e-6, `tonnage came out at ${total}`);
});

test("a 1RM estimated from a decimal load stays sane", () => {
  // Epley on 12.5 × 8 is 12.5 × (1 + 8/30) = 15.833…, and a rank built on a
  // number with fourteen decimal places in it is a rank nobody can read.
  const oneRm = estimate1RM(12.5, 8);
  assert.ok(oneRm != null);
  assert.ok(Number.isInteger(oneRm!), `1RM came back as ${oneRm}`);
  assert.equal(oneRm, 16);
  // And the small loads people actually use decimals for are not rounded to
  // nothing on the way in.
  assert.equal(estimate1RM(2.5, 1), 3);
  assert.equal(estimate1RM(0.5, 1), 1);
});

test("nothing in the training log stores a weight in a rounded column", () => {
  // load_kg is inside the JSONB drills blob, which is why decimals were always
  // safe at rest. If a migration ever promotes it to a numeric column, this is
  // the test that has to be thought about.
  const migration = readFileSync(new URL("../supabase/migrations/0006_phase6_training_logs.sql", import.meta.url), "utf8");
  assert.match(migration, /drills\s+jsonb/i, "drills is no longer JSONB — check load_kg's precision");
  assert.ok(!/load_kg\s+numeric\(\d+,\s*0\)/i.test(migration), "load_kg is stored with no decimal places");
});
