// The question the engines could not previously ask: is this the same lift?
import test from "node:test";
import assert from "node:assert/strict";
import { movementKey, sameMovement, preferUnused } from "./movement-key";

test("the same movement with different kit is one lift", () => {
  // The reported bug, in its own words: "barbell bench press then bench press".
  assert.ok(sameMovement("Bench Press", "Dumbbell Bench Press"));
  assert.ok(sameMovement("Barbell bench press", "Bench Press"));
  assert.ok(sameMovement("Machine Shrug", "Dumbbell Shrug"));
  assert.ok(sameMovement("Hex Bar Shrug", "Machine Shrug"));
  assert.ok(sameMovement("Leg Extension", "Cable Leg Extension"));
  assert.ok(sameMovement("Barbell Curl", "EZ Bar Curl"));
  assert.ok(sameMovement("Pull Up", "Weighted Pull Up"));
  assert.ok(sameMovement("Assisted Chin Up", "Chin Ups"));
});

test("anything that changes what is loaded is a different lift", () => {
  // The whole risk of this module is being too eager. A block SHOULD contain
  // several of these pairs, and merging them would empty the pools.
  assert.ok(!sameMovement("Standing Calf Raise", "Seated Calf Raise"));
  assert.ok(!sameMovement("Bench Press", "Incline Bench Press"));
  assert.ok(!sameMovement("Barbell Deadlift", "Romanian Deadlift"));
  assert.ok(!sameMovement("Barbell Back Squat", "Barbell Front Squat"));
  assert.ok(!sameMovement("Lat Pulldown", "Barbell Row"));
  assert.ok(!sameMovement("Overhead Press", "Bench Press"));
  assert.ok(!sameMovement("Lying Leg Curl", "Seated Leg Curl"));
});

test("plural and spelling variants collapse", () => {
  assert.equal(movementKey("Chin Ups"), movementKey("Chin Up"));
  assert.equal(movementKey("Dips"), movementKey("Dip"));
  assert.equal(movementKey("Cable Flyes"), movementKey("Cable Fly"));
  assert.equal(movementKey("Dumbbell Flies"), movementKey("Fly"));
  // "Press" ends in a double s and must survive singularisation intact —
  // stemming it would merge presses with anything else ending "pres".
  assert.equal(movementKey("Bench Press"), "bench press");
});

test("\"bar\" is only kit when something makes it kit", () => {
  // Stripping it unconditionally merged movements that share nothing.
  assert.equal(movementKey("Hex Bar Deadlift"), "deadlift");
  assert.equal(movementKey("Bar Muscle Up"), "bar muscle up");
});

test("a name made entirely of kit words still has an identity", () => {
  // Never return "", which as a Set member would make every such movement the
  // same as every other.
  assert.notEqual(movementKey("Dumbbell"), "");
  assert.equal(movementKey("Dumbbell"), "dumbbell");
});

test("preferUnused prefers, and never empties the list", () => {
  const items = ["Bench Press", "Dumbbell Bench Press", "Incline Bench Press"];
  const avoid = new Set([movementKey("Bench Press")]);
  assert.deepEqual(preferUnused(items, avoid, (x) => x), ["Incline Bench Press"]);

  // The property the whole design rests on: a shallow pool must still produce a
  // movement. Calves have two worth prescribing and are trained twice a week.
  const shallow = ["Bench Press", "Dumbbell Bench Press"];
  assert.deepEqual(preferUnused(shallow, avoid, (x) => x), shallow);
});

test("preferUnused leaves a single candidate alone", () => {
  const one = ["Bench Press"];
  assert.deepEqual(preferUnused(one, new Set([movementKey("Bench Press")]), (x) => x), one);
});
