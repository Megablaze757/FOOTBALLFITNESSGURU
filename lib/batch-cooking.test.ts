import { test } from "node:test";
import assert from "node:assert/strict";
import { keepsWell, planLeftovers, leftoverLabel, batchTip, MAX_LEFTOVERS } from "./batch-cooking";
import { MEALS } from "./meals-data";

const meal = (name: string, slot: "Breakfast" | "Lunch" | "Dinner" | "Snack" = "Dinner") =>
  ({ id: name.toLowerCase().replace(/\W+/g, "-"), name, slot });

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE DEFAULT IS NO, and that is the whole safety of this feature.
 *
 * A soggy reheated salad presented as tomorrow's lunch is worse than the two
 * pounds it saved: somebody eats it once, decides the meal plans are rubbish,
 * and stops opening the app. So only dishes recognisably of the kind that
 * improve overnight are batched, and anything unrecognised is left alone.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("things that genuinely reheat are batched", () => {
  for (const name of [
    "Chilli con carne", "Chicken katsu curry", "Lentil shepherd's pie",
    "Beef stew", "Mushroom risotto", "Turkey meatballs in tomato sauce",
    "Sweet potato & chickpea curry", "Chicken tikka traybake", "Dal makhani",
  ]) {
    assert.equal(keepsWell(meal(name)), true, name);
  }
});

test("things that do not survive a night are never batched", () => {
  for (const name of [
    "Chicken caesar salad", "Berry protein smoothie", "Scrambled eggs on toast",
    "Overnight oats", "Tuna sandwich", "Chicken wrap", "Poached eggs & avocado",
    "Greek yoghurt with granola", "Steak and chips", "Salmon sashimi bowl",
  ]) {
    assert.equal(keepsWell(meal(name)), false, name);
  }
});

/**
 * The two lists overlap exactly where it matters: a bowl can contain lentils
 * and still be a salad. The deny list is checked first and wins.
 */
test("a salad with lentils in it is still a salad", () => {
  assert.equal(keepsWell(meal("Chicken, lentil & feta salad")), false);
  assert.equal(keepsWell(meal("Bean salad bowl")), false);
  assert.equal(keepsWell(meal("Fresh chickpea salad")), false);
});

test("a dish nobody recognises is left alone rather than guessed at", () => {
  assert.equal(keepsWell(meal("Grilled chicken and veg")), false);
  assert.equal(keepsWell(meal("Protein plate")), false);
});

test("only cooked mains — a batched breakfast is a strange idea", () => {
  assert.equal(keepsWell(meal("Chilli con carne", "Breakfast")), false);
  assert.equal(keepsWell(meal("Chilli con carne", "Snack")), false);
  assert.equal(keepsWell(meal("Chilli con carne", "Lunch")), true);
});

test("the real recipe book has enough batchable mains to plan from", () => {
  const mains = MEALS.filter((m) => m.slot === "Dinner" || m.slot === "Lunch");
  const batchable = mains.filter(keepsWell);
  assert.ok(batchable.length >= 40,
    `only ${batchable.length} of ${mains.length} mains batch — not enough for a week to find three`);
});

// --- planning -----------------------------------------------------------------

const day = (i: number, dinner: string, lunch = "Chicken wrap") => ({
  day: `Day ${i}`,
  meals: [{ meal: meal(lunch, "Lunch") }, { meal: meal(dinner, "Dinner") }],
});

test("a keeping dinner becomes the next day's lunch", () => {
  const week = [day(0, "Chilli con carne"), day(1, "Grilled chicken and veg")];
  const plan = planLeftovers(week);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].cookDay, 0);
  assert.equal(plan[0].eatDay, 1);
  assert.equal(plan[0].slot, "Lunch");
});

test("always next-day, never two days later and never the same evening", () => {
  const week = [day(0, "Beef stew"), day(1, "Grilled chicken and veg"), day(2, "Grilled chicken and veg")];
  const plan = planLeftovers(week);
  assert.deepEqual(plan.map((l) => [l.cookDay, l.eatDay]), [[0, 1]],
    "a two-day gap is a food safety question this app has no business answering");
});

test("no chains — a leftover day is not also a source", () => {
  const week = [0, 1, 2, 3].map((i) => day(i, "Chicken curry"));
  const plan = planLeftovers(week);
  for (const l of plan) {
    assert.ok(!plan.some((o) => o !== l && (o.eatDay === l.cookDay || o.cookDay === l.eatDay)),
      "a three-serving chain was planned");
  }
});

/**
 * Above three the week stops being a meal plan and becomes a rota — and the
 * entire reason the repeat penalty exists is that a week of four distinct
 * dinners is miserable.
 */
test("a week is capped at three leftovers", () => {
  const week = Array.from({ length: 7 }, (_, i) => day(i, "Chicken curry"));
  assert.ok(planLeftovers(week).length <= MAX_LEFTOVERS);
  assert.equal(planLeftovers(week, 1).length, 1, "the cap is respected when tightened");
});

test("a day with no lunch planned is a day they said they were eating out", () => {
  const week = [
    day(0, "Chilli con carne"),
    { day: "Day 1", meals: [{ meal: meal("Steak", "Dinner") }] },
  ];
  assert.deepEqual(planLeftovers(week), []);
});

test("nothing to batch is an empty plan, not a crash", () => {
  assert.deepEqual(planLeftovers([]), []);
  assert.deepEqual(planLeftovers([day(0, "Grilled chicken and veg")]), []);
});

/**
 * A leftover only works if somebody knew to cook extra. Finding out at lunchtime
 * that you were supposed to have made double is the plan being wrong about your
 * day, which is worse than not suggesting it.
 */
test("both ends are labelled — the plate and the night before", () => {
  assert.equal(leftoverLabel("Chilli con carne"), "Last night's chilli con carne");
  assert.match(batchTip("Beef stew"), /Cook double/i);
  assert.match(batchTip("Beef stew"), /tomorrow's lunch/i);
});
