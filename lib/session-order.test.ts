import test from "node:test";
import assert from "node:assert/strict";
import { spaceByMuscle, adjacentSameMuscle } from "./session-order";
import type { Slot } from "./movements";

/**
 * The rule under test, in the athlete's words: "not 2 chest exercises next to
 * each other."
 *
 * These use a toy muscle map rather than the real catalogue, so a failure points
 * at the ordering logic instead of at how some exercise happens to be
 * classified. The catalogue is exercised by the engine tests below it.
 */
type D = { name: string; slot?: Slot; skill?: boolean; rehab?: boolean };
const MUSCLE: Record<string, string> = {
  bench: "chest", fly: "chest", dip: "chest",
  row: "back", pulldown: "back",
  curl: "biceps", preacher: "biceps",
  squat: "quads", legext: "quads",
  crunch: "core", situp: "core", legraise: "core",
  calf: "calves",
  run: "", // deliberately unclassified
};
const muscleOf = (n: string) => MUSCLE[n] || null;
const isCompound = (n: string) => ["bench", "row", "squat", "dip", "pulldown"].includes(n);
const names = (ds: D[]) => ds.map((d) => d.name);
const order = (ds: D[]) => spaceByMuscle(ds, muscleOf, isCompound);

test("two exercises for the same muscle are not left adjacent", () => {
  const out = order([
    { name: "curl" }, { name: "preacher" }, { name: "fly" }, { name: "crunch" },
  ]);
  assert.equal(adjacentSameMuscle(out, muscleOf), 0, `still clashing: ${names(out).join(", ")}`);
});

test("it spends the abundant muscle first and saves the scarce separator", () => {
  /**
   * THE CASE THAT SEPARATES A CORRECT SPACER FROM A PLAUSIBLE ONE.
   *
   * Three core movements and one calf raise. There is no clash-free order —
   * three of a kind in four slots must touch somewhere — but there is a
   * one-clash order and a two-clash order, and the difference is entirely
   * whether the single separator is spent while it is not needed.
   *
   * Taking simply the first eligible drill puts the calf raise at the front,
   * where nothing precedes it to separate, and leaves core-core-core behind it:
   * two clashes. This is a real generated leg day, and the first version of this
   * test asserted only "zero clashes" on a case where BOTH rules scored zero —
   * so it passed while the rule it was written for was not implemented.
   */
  const out = order([
    { name: "calf" }, { name: "crunch" }, { name: "situp" }, { name: "legraise" },
  ]);
  assert.equal(adjacentSameMuscle(out, muscleOf), 1, `not the best available order: ${names(out).join(", ")}`);
  assert.notEqual(out[0].name, "calf", "the one separator was spent in the one slot that needed no separating");
});

test("it reaches zero clashes whenever a clash-free order exists", () => {
  const out = order([
    { name: "crunch" }, { name: "situp" }, { name: "legraise" },
    { name: "calf" }, { name: "fly" }, { name: "curl" },
  ]);
  assert.equal(adjacentSameMuscle(out, muscleOf), 0, names(out).join(", "));
});

test("an impossible tier degrades gracefully rather than shuffling for nothing", () => {
  // Four chest movements and nothing to break them up. There is no arrangement
  // with fewer than three clashes, so the only wrong answer is a changed order.
  const input: D[] = [{ name: "fly" }, { name: "fly" }, { name: "fly" }, { name: "fly" }];
  assert.deepEqual(names(order(input)), names(input));
});

test("it is stable: an already-alternating session comes out untouched", () => {
  const input: D[] = [
    { name: "bench", slot: "primary" }, { name: "row", slot: "primary" },
    { name: "fly", slot: "accessory" }, { name: "curl", slot: "accessory" },
    { name: "crunch", slot: "accessory" },
  ];
  assert.deepEqual(names(order(input)), names(input));
});

test("running it twice changes nothing the second time", () => {
  const input: D[] = [
    { name: "crunch" }, { name: "situp" }, { name: "calf" }, { name: "legraise" },
    { name: "fly" }, { name: "curl" }, { name: "preacher" },
  ];
  const once = order(input);
  assert.deepEqual(names(order(once)), names(once));
});

test("warm-ups stay first and cool-downs stay last", () => {
  const out = order([
    { name: "bench", slot: "primary" },
    { name: "crunch", slot: "cooldown" },
    { name: "fly", slot: "warmup" },
    { name: "curl", slot: "accessory" },
    { name: "row", slot: "primary" },
  ]);
  assert.equal(out[0].name, "fly", "the warm-up must open the session");
  assert.equal(out[out.length - 1].name, "crunch", "the cool-down must close it");
});

test("compounds are never pushed behind isolation work", () => {
  // You do not squat well after leg extensions. The hypertrophy engine emits no
  // slots at all, so this ordering rests entirely on the compound test.
  const out = order([
    { name: "legext" }, { name: "squat" }, { name: "fly" }, { name: "bench" },
    { name: "curl" }, { name: "row" },
  ]);
  const lastCompound = out.map((d) => isCompound(d.name)).lastIndexOf(true);
  const firstIsolation = out.map((d) => isCompound(d.name)).indexOf(false);
  assert.ok(lastCompound < firstIsolation, `compounds and isolation interleaved: ${names(out).join(", ")}`);
});

test("rehab work stays at the very front", () => {
  // It is put first deliberately — the exercises that are the reason the athlete
  // can train at all should not be what they run out of time for.
  const out = order([
    { name: "bench", slot: "primary" },
    { name: "calf", rehab: true },
    { name: "fly", slot: "accessory" },
    { name: "row", slot: "primary" },
  ]);
  assert.equal(out[0].name, "calf");
});

test("the clash across a tier boundary counts too", () => {
  // The last compound and the first isolation movement are as adjacent as any
  // other pair. Ordering each tier in isolation cannot see this join, and left
  // hundreds of avoidable clashes exactly here.
  const out = order([
    { name: "row" }, { name: "bench" },     // compounds: back, chest
    { name: "fly" }, { name: "curl" },      // isolation: chest, biceps
  ]);
  assert.equal(adjacentSameMuscle(out, muscleOf), 0, names(out).join(", "));
});

test("an unclassified drill never blocks and is never blocked", () => {
  // A run, a ball drill or a stretch has no muscle to clash with — and makes a
  // perfectly good separator between two that do.
  const out = order([{ name: "fly" }, { name: "bench" }, { name: "run" }]);
  assert.equal(adjacentSameMuscle(out, muscleOf), 0, names(out).join(", "));
});

test("nothing is lost or duplicated", () => {
  // The failure that would make every assertion above pass while silently
  // dropping an exercise from somebody's session.
  const input: D[] = [
    { name: "bench", slot: "primary" }, { name: "fly", slot: "accessory" },
    { name: "curl", slot: "accessory" }, { name: "crunch", slot: "accessory" },
    { name: "situp", slot: "accessory" }, { name: "run", slot: "conditioning" },
  ];
  const out = order(input);
  assert.equal(out.length, input.length);
  assert.deepEqual([...names(out)].sort(), [...names(input)].sort());
});

test("adjacentSameMuscle counts what it says it counts", () => {
  // The measure the assertions above rest on. A counter that always returned 0
  // would make this whole file pass while checking nothing.
  assert.equal(adjacentSameMuscle([{ name: "fly" }, { name: "bench" }], muscleOf), 1);
  assert.equal(adjacentSameMuscle([{ name: "fly" }, { name: "row" }], muscleOf), 0);
  // Unclassified drills are not "the same muscle" as each other.
  assert.equal(adjacentSameMuscle([{ name: "run" }, { name: "run" }], muscleOf), 0);
});
