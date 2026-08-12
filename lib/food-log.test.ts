import { test } from "node:test";
import assert from "node:assert/strict";
import {
  logTotals, addEntry, removeEntry, removeByRef, rescaleEntry, updateEntry, parseEntries,
  entriesForDay, addQuickCalories, QUICK_ADD_LABEL,
  type FoodEntry,
} from "./food-log";

const entry = (over: Partial<FoodEntry> = {}): FoodEntry => ({
  id: "a", label: "Chicken & rice", kcal: 600, protein: 45, carbs: 70, fats: 12,
  source: "plan", ...over,
});

test("the total is the sum of the list, never stored separately", () => {
  const list = [entry(), entry({ id: "b", label: "Yoghurt", kcal: 300, protein: 20, carbs: 30, fats: 8 })];
  assert.deepEqual(logTotals(list), { kcal: 900, protein: 65, carbs: 100, fats: 20 });
  assert.deepEqual(logTotals([]), { kcal: 0, protein: 0, carbs: 0, fats: 0 });
});

test("un-ticking removes the entry that tick created, not one that looks like it", () => {
  /**
   * A weekly plan serves the same dish more than once, so two entries can carry
   * the same label. Matching on the label would delete whichever came first —
   * un-tick Thursday's porridge and Monday's would vanish instead.
   */
  const list = [
    entry({ id: "1", label: "Porridge", ref: "mon-breakfast" }),
    entry({ id: "2", label: "Porridge", ref: "thu-breakfast" }),
  ];
  const left = removeByRef(list, "thu-breakfast");
  assert.equal(left.length, 1);
  assert.equal(left[0].ref, "mon-breakfast");
});

test("editing the calories carries the macros with them", () => {
  // "That was more like 900 than 600" must not leave the protein at 45, or the
  // day's macros quietly stop adding up to its calories.
  const bigger = rescaleEntry(entry(), 900);
  assert.equal(bigger.kcal, 900);
  assert.equal(bigger.protein, 68); // 45 x 1.5
  assert.equal(bigger.carbs, 105);
  assert.equal(bigger.fats, 18);
});

test("an entry can never be edited down to zero", () => {
  /**
   * The same trap the gram field fell into. Scaling is relative, so a target of
   * zero wipes the macros and leaves nothing to scale back from — the entry is
   * then stuck at zero however large a number you type next. Zero calories of
   * food is a removal, and remove is its own button.
   */
  const e = entry();
  assert.deepEqual(rescaleEntry(e, 0), e, "0 is refused outright");
  assert.deepEqual(rescaleEntry(e, -50), e);
  assert.deepEqual(rescaleEntry(e, NaN), e);
  // And the recovery case: an entry that somehow holds 0 kcal can still be given
  // a real figure rather than being multiplied by zero forever.
  const revived = rescaleEntry(entry({ kcal: 0, protein: 0, carbs: 0, fats: 0 }), 400);
  assert.equal(revived.kcal, 400);
});

test("add, update and remove leave the rest of the list alone", () => {
  let list: FoodEntry[] = [];
  list = addEntry(list, { label: "Toast", kcal: 200, protein: 8, carbs: 30, fats: 4, source: "estimate" });
  list = addEntry(list, { label: "Banana", kcal: 90, protein: 1, carbs: 23, fats: 0, source: "estimate" });
  assert.equal(list.length, 2);
  assert.ok(list[0].id && list[1].id && list[0].id !== list[1].id, "ids are unique");

  list = updateEntry(list, list[0].id, rescaleEntry(list[0], 400));
  assert.equal(list[0].kcal, 400);
  assert.equal(list[1].kcal, 90, "the other entry is untouched");

  list = removeEntry(list, list[0].id);
  assert.deepEqual(list.map((e) => e.label), ["Banana"]);
});

test("a day logged before this column existed reads as empty, not as a crash", () => {
  // 0072 added `entries`; every row written before it has none. Those days must
  // still open — their totals are on the row and remain correct.
  assert.deepEqual(parseEntries(null), []);
  assert.deepEqual(parseEntries(undefined), []);
  assert.deepEqual(parseEntries({}), [], "an object must not be map()ed over");
  assert.deepEqual(parseEntries("[]"), []);
  // Junk inside the array is dropped rather than taking the whole day with it.
  assert.equal(parseEntries([entry(), null, { label: "no id" }, 7]).length, 1);
});

/**
 * A QUICK-ADD IS A THING YOU ATE, NOT A NUMBER THAT WENT UP.
 *
 * The +200/+400/+600 buttons ran `setEaten(c => c + 200)` and stopped. Nothing
 * reached the database, and nothing reached the list — so the next thing logged,
 * which recomputes the day by summing the list, wiped it. Tap +200, tick your
 * breakfast, and the 200 is gone. That is the regression this pins: a quick-add
 * has to survive a later log, and it only can if it is IN the list.
 */
test("a quick-add survives the next thing you log", () => {
  let list = addQuickCalories([], 200);
  assert.equal(list.length, 1);
  assert.equal(list[0].kcal, 200);
  assert.equal(list[0].label, QUICK_ADD_LABEL);
  assert.equal(list[0].source, "manual");
  assert.deepEqual([list[0].protein, list[0].carbs, list[0].fats], [0, 0, 0],
    "no macros were given, so none are invented");

  // Ticking a meal. The totals are summed from the list, which is exactly how
  // the 200 used to disappear.
  list = addEntry(list, { label: "Porridge", kcal: 450, protein: 20, carbs: 60, fats: 10, source: "plan" });
  assert.equal(logTotals(list).kcal, 650, "the quick-add is still part of the day");
});

test("a quick-add of nothing is not a log", () => {
  // Zero and negative would make the day's arithmetic unexplainable, and
  // removing is what the list's own ✕ is for.
  assert.deepEqual(addQuickCalories([], 0), []);
  assert.deepEqual(addQuickCalories([], -200), []);
  assert.deepEqual(addQuickCalories([], Number.NaN), []);
  assert.equal(addQuickCalories([], 249.6)[0].kcal, 250, "the column is an integer");
});

/**
 * THE DAY THAT HAS TOTALS AND NO LIST.
 *
 * Two ways to get one: a row written before 0072 added the column, or a row
 * written by the old quick-add buttons, which moved a number and recorded
 * nothing. Today's row in production reads 1,338 calories eaten against zero
 * entries for the second reason.
 *
 * Those days are a trap, not a display problem. Every total is summed from the
 * list, so the first meal ticked on such a day REPLACES 1,338 with the value of
 * that one meal. Carrying the totals into an entry is what stops the day being
 * quietly destroyed by using it.
 */
test("a day with totals but no list keeps its totals", () => {
  const carried = entriesForDay(null, { kcal: 1338, protein: 90, carbs: 140, fats: 40 });
  assert.equal(carried.length, 1);
  assert.deepEqual(logTotals(carried), { kcal: 1338, protein: 90, carbs: 140, fats: 40 });

  // And it behaves like any other row from then on: nothing is lost when the
  // next meal goes in.
  const after = addEntry(carried, { label: "Porridge", kcal: 450, protein: 20, carbs: 60, fats: 10, source: "plan" });
  assert.equal(logTotals(after).kcal, 1788);
});

test("an empty day is empty, and a listed day is left alone", () => {
  assert.deepEqual(entriesForDay(null, { kcal: 0, protein: 0, carbs: 0, fats: 0 }), []);
  assert.deepEqual(entriesForDay(null, null), []);
  // Macros without a calorie figure is a real row shape — `calories_eaten` is
  // written as null when it is zero. Dropping it would lose the protein.
  assert.equal(entriesForDay(null, { protein: 90 })[0].protein, 90);
  /**
   * A REAL LIST ALWAYS WINS, and this is the assertion that carries weight.
   *
   * The page re-derives this on every mount, and the stored totals are only ever
   * a summary OF the list. Carrying them in beside a list that already exists
   * would add a phantom entry on every remount — a tab switch would double the
   * day, and then double it again.
   */
  const real = [entry({ id: "x", kcal: 600 })];
  assert.deepEqual(entriesForDay(real, { kcal: 9999 }), real);
  assert.equal(logTotals(entriesForDay(real, { kcal: 9999 })).kcal, 600);
});
