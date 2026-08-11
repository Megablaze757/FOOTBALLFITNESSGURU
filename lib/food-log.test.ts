import { test } from "node:test";
import assert from "node:assert/strict";
import {
  logTotals, addEntry, removeEntry, removeByRef, rescaleEntry, updateEntry, parseEntries,
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
