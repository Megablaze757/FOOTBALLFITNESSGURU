import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHECKIN_COLUMNS_0115, splitCheckIn } from "./checkin-columns";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LIST, THE MIGRATION, AND THE TWO PLACES THAT WRITE A CHECK-IN.
 *
 * lib/checkin-columns.ts explains the hazard. This keeps the three in step,
 * because each one drifting has its own failure and none of them is loud:
 *
 *   a name here the migration never adds  -> stripped out of every write, so
 *                                            the answer silently never saves
 *   a column there that is missing here   -> the thing that rejects the row
 *   a write path not using the split      -> that path still loses the entry
 * ═══════════════════════════════════════════════════════════════════════════
 */

const migration = readFileSync("supabase/migrations/0115_checkin_sleep_stress_soreness_cycle.sql", "utf8");
const form = readFileSync("components/JournalForm.tsx", "utf8");
const pwa = readFileSync("components/PWA.tsx", "utf8");

test("the list is exactly what 0115 adds", () => {
  const added = [...migration.matchAll(/add column if not exists (\w+)/g)].map((m) => m[1]);
  assert.ok(added.length > 0, "0115 adds no columns — the migration was rewritten");
  assert.deepEqual([...added].sort(), [...CHECKIN_COLUMNS_0115].sort(),
    "the columns the migration adds and the ones the writes treat as optional have drifted");
});

test("a payload from before any of this splits into itself", () => {
  // The shape sitting in somebody's localStorage right now. It must write
  // exactly as it always did, with nothing moved and nothing invented.
  const old = {
    pain_map: { knee_left: 4 }, fatigue_score: 6, sleep_quality: 7,
    nutrition_quality: 5, weight_kg: null, is_match_day: false, match_minutes_played: 0,
  };
  const { stable, optional } = splitCheckIn(old);
  assert.deepEqual(stable, old);
  assert.deepEqual(optional, {});
});

test("a payload with the new answers splits them out", () => {
  const { stable, optional } = splitCheckIn({
    fatigue_score: 6, sleep_hours: 7.5, stress_score: 3, soreness_score: 8, cycle_phase: "luteal",
  });
  assert.deepEqual(stable, { fatigue_score: 6 });
  assert.deepEqual(optional, { sleep_hours: 7.5, stress_score: 3, soreness_score: 8, cycle_phase: "luteal" });
});

test("a null answer still travels as an answer", () => {
  // Null is "not asked", and the column is nullable, so it belongs in the
  // optional half rather than being dropped — otherwise clearing an answer
  // on a second check-in that day would leave the old value in place.
  const { optional } = splitCheckIn({ sleep_hours: null, cycle_phase: null });
  assert.deepEqual(optional, { sleep_hours: null, cycle_phase: null });
  assert.ok("sleep_hours" in optional, "a cleared answer was dropped instead of written as null");
});

test("both write paths go through the fallback", () => {
  for (const [name, src] of [["the check-in form", form], ["the offline replay", pwa]] as const) {
    assert.match(src, /upsertWithOptional\(/,
      `${name} writes daily_check_ins directly, so one unmigrated column rejects the row`);
    // And not also the raw way, which would be the real path with the safe one
    // sitting beside it unused.
    assert.doesNotMatch(src, /from\("daily_check_ins"\)\s*\n?\s*\.upsert\(/,
      `${name} still has a direct upsert of daily_check_ins`);
  }
});

test("the replay splits the payload rather than guessing at it", () => {
  assert.match(pwa, /splitCheckIn\(item\.payload\)/,
    "the offline replay no longer splits the queued payload, so a queued entry " +
    "made before the migration would be retried until the queue cap dropped it");
});
