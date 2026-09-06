import { test } from "node:test";
import assert from "node:assert/strict";
import { emphasise, hasFigure, type Run } from "./caption-emphasis";

const join = (runs: Run[]) => runs.map((r) => r.text).join("");
const keyed = (s: string) => emphasise(s).filter((r) => r.key).map((r) => r.text);

/**
 * The runs concatenate back to exactly the input. A caption renderer that
 * silently drops a space or a full stop is one nobody would notice until a
 * reel went out with "costs£0.31" burned into it.
 */
test("nothing is lost or added", () => {
  for (const line of [
    "The same 30 grams costs £3.19 at the other end.",
    "Same protein.",
    "  leading and trailing  ",
    "Build a week of meals and it prices the whole shop.",
  ]) {
    assert.equal(join(emphasise(line)), line, JSON.stringify(line));
  }
});

test("the figure is what gets coloured", () => {
  assert.deepEqual(keyed("Cheapest: £0.31."), ["£0.31."]);
  assert.deepEqual(keyed("Dearest: £3.19. Same protein."), ["£3.19."]);
  assert.deepEqual(keyed("Same protein. 10x the price."), ["10x"]);
  assert.deepEqual(keyed("Today you are a fifty-four."), []);
});

/**
 * Colouring "30" and leaving "grams" white splits the fact across two colours,
 * which is worse than not colouring it — the eye lands on half a number.
 */
test("a number keeps its unit", () => {
  assert.deepEqual(keyed("Every food here gives you the same 30 grams of protein."), ["30 grams"]);
  assert.deepEqual(keyed("It costs 45 pence"), ["45 pence"]);
  assert.deepEqual(keyed("175g of protein"), ["175g"]);
});

/**
 * Highlighting a word because it feels important is how every line ends up
 * with three coloured words and the device stops meaning anything.
 */
/**
 * WHICH figure, not just how many. "The same 30 grams costs £3.19" has two,
 * and a mutation colouring the FIRST instead of the last passed everything —
 * every other fixture had them in the same place. The quantity is the setup;
 * the price is the point.
 */
test("the payload is coloured, not the setup", () => {
  assert.deepEqual(keyed("The same 30 grams costs £3.19 at the other end."), ["£3.19"]);
  assert.deepEqual(keyed("30 grams of protein costs £0.31."), ["£0.31."]);
  // With only one figure there is nothing to prefer, and it is still coloured.
  assert.deepEqual(keyed("Every food here gives you the same 30 grams of protein."), ["30 grams"]);
});

test("at most one thing per caption is coloured", () => {
  for (const line of [
    "The same 30 grams costs £3.19 at the other end.",
    "Every recipe in the app is costed the same way, down to the ingredient.",
    "All priced from real supermarket packs.",
  ]) {
    const runs = emphasise(line).filter((r) => r.key);
    assert.ok(runs.length <= 1, `${runs.length} coloured runs in "${line}": ${runs.map((r) => r.text).join(" | ")}`);
  }
});

/** A bare number in prose is a word, not a fact. */
test("a number without a unit is left alone", () => {
  assert.deepEqual(keyed("Do 2 or 3 sets of it"), ["3 sets"],
    "only the one with a unit after it should colour");
  assert.deepEqual(keyed("Section 4 of the guide"), []);
});

test("a caption with no figure colours nothing", () => {
  assert.equal(hasFigure("Same protein."), false);
  assert.equal(hasFigure("Before you go."), false);
  assert.equal(hasFigure("Cheapest: £0.31."), true);
  assert.deepEqual(emphasise("Same protein."), [{ text: "Same protein.", key: false }]);
});

test("nothing in, nothing out", () => {
  assert.deepEqual(emphasise(""), []);
  assert.deepEqual(emphasise("   "), []);
  assert.deepEqual(emphasise(null as unknown as string), []);
});

/** Every caption the demo-cost reel actually burns in. */
test("the real captions colour sensibly", () => {
  const captions = [
    "Every food here gives you the same", "30 grams of protein.",
    "All priced from real supermarket packs.", "Cheapest: £0.31.",
    "Dearest: £3.19. Same protein.",
    "Every recipe in the app is costed", "the same way, down to the ingredient.",
    "So build a week of meals and it", "prices the whole shop. Before you go.",
  ];
  const coloured = captions.filter((c) => hasFigure(c));
  assert.deepEqual(coloured, ["30 grams of protein.", "Cheapest: £0.31.", "Dearest: £3.19. Same protein."]);
  // Not every caption: a reel where every line has a coloured word has none.
  assert.ok(coloured.length < captions.length / 2,
    `${coloured.length} of ${captions.length} captions coloured — the device stops meaning anything`);
});
