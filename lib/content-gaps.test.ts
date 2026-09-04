import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  contentGaps, nearMisses, gapSummary, byCheapest, mentionsButUntagged, NEARLY, type Gap,
} from "./content-gaps";
import { build } from "./exercise-catalog";
import { MIN_MEMBERS, allCollections, publishableCollections } from "./collections";
import { allHubs, publishableHubs, MIN_HUB_MEMBERS } from "./hubs";
import { allRecipeHubs, publishableRecipeHubs } from "./recipe-hubs";
import { EXERCISES, isRunEntry } from "./exercises";

const MOVEMENTS = EXERCISES.filter((e) => !isRunEntry(e));

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A COLLECTION TWO RECIPES SHORT IS A PAGE THAT DOES NOT EXIST.
 *
 * Three modules gate a page on having twelve things behind it, and the floors
 * are right — below them the page is a list rather than an answer. But each one
 * returned ONLY what had already cleared its floor, so what was nearly ready
 * was not hidden behind a filter: it was never computed. This is the other side
 * of that number.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a gap is a page that does not exist yet, and nothing else", () => {
  const gaps = contentGaps();
  assert.ok(gaps.length > 0, "nothing to report at all is suspicious");

  const publishedHrefs = new Set([
    ...publishableCollections().map(({ collection }) => `/collections/${collection.slug}/`),
    ...publishableHubs(MOVEMENTS).map(({ hub }) => `/exercises/${hub.kind}/${hub.slug}/`),
  ]);
  for (const g of gaps) {
    assert.ok(g.short >= 1, `${g.name} is "short" by ${g.short} — that is a published page`);
    assert.equal(g.have + g.short, g.need, `${g.name}: ${g.have} + ${g.short} ≠ ${g.need}`);
    assert.ok(g.have > 0, `${g.name} has nothing behind it — that is not a near miss, it is an empty idea`);
    assert.ok(!publishedHrefs.has(g.href), `${g.name} already publishes`);
    assert.ok(g.todo.length > 20, `${g.name} says nothing actionable`);
  }
});

/** Cheapest first: one recipe for a whole new page beats five for a bigger one,
 *  and a list sorted by size buries exactly the entries worth acting on. */
test("the cheapest wins are at the top", () => {
  const shorts = contentGaps().map((g) => g.short);
  assert.deepEqual(shorts, [...shorts].sort((a, b) => a - b), "not ordered by what is cheapest to finish");
  assert.ok(nearMisses().every((g) => g.short <= NEARLY));
});

test("the summary counts pages, not items", () => {
  const near = nearMisses();
  const summary = gapSummary();
  if (near.length === 0) {
    assert.equal(summary, null);
    return;
  }
  assert.match(summary!, new RegExp(`${near.length} new page`));
  assert.match(summary!, new RegExp(`${near.reduce((n, g) => n + g.short, 0)} more item`));
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * "PUBLISHABLE" IS A FILTER OVER "ALL", NOT A SECOND IMPLEMENTATION.
 *
 * Two functions that each decide what a collection contains are two functions
 * that will one day disagree, and the symptom would be a gap report describing
 * a page that already exists.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the near-miss view and the published view agree about membership", () => {
  for (const { collection, members } of publishableCollections()) {
    const all = allCollections().find((c) => c.collection.slug === collection.slug);
    assert.equal(all?.members.length, members.length, `${collection.slug} has two different member counts`);
  }
  assert.ok(allCollections().length >= publishableCollections().length);
  assert.ok(allHubs(MOVEMENTS).length > publishableHubs(MOVEMENTS).length,
    "every candidate hub publishes, so nothing was ever being filtered");
  assert.ok(allRecipeHubs().length >= publishableRecipeHubs().length);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LATS PAGE DID NOT EXIST BECAUSE OF FIVE MISSING TAGS.
 *
 * The imported catalogue carried one muscle per row, so five plain lat
 * movements — Close Grip Lat Pulldown, Dumbbell Pullover, Straight Arm
 * Pulldown, Reverse Grip Lat Pulldown, Yates Row — were tagged "Back" and
 * nothing else. /exercises/muscle/lats/ sat on 8 of 12 and did not publish:
 * four pull-downs short of a page about the lats.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("an imported exercise may carry more than one muscle", () => {
  const lats = MOVEMENTS.filter((e) => e.muscles.includes("Lats"));
  assert.ok(lats.length >= MIN_HUB_MEMBERS, `${lats.length} lat exercises — the page needs ${MIN_HUB_MEMBERS}`);

  for (const name of ["Close Grip Lat Pulldown", "Straight Arm Pulldown", "Yates Row"]) {
    const e = MOVEMENTS.find((x) => x.name === name);
    assert.ok(e, `${name} has gone from the catalogue`);
    assert.ok(e!.muscles.includes("Lats"), `${name} still is not tagged Lats`);
    assert.equal(e!.muscles[0], "Back", "the PRIMARY muscle must stay first — category and copy read it");
  }

  // And nothing was broken on the way: a row with no muscle builds no entry.
  assert.deepEqual(MOVEMENTS.filter((e) => e.muscles.some((m) => !m)).map((e) => e.name), []);
  assert.ok(MOVEMENTS.every((e) => e.muscles.length > 0), "an exercise with no muscle matches no hub");
});

/**
 * A HEURISTIC WORTH HAVING AND NOT WORTH OBEYING.
 *
 * Of the first two it reported, one was right and one was not: the five lats
 * matches were genuine, and the single "hip flexors" match was Sit Ups, whose
 * description mentions them to say the load should NOT go there. The wording
 * has to ask somebody to look.
 */
test("a retag suggestion says to check it, not to do it", () => {
  const withRetag = contentGaps().filter((g) => (g.retagCandidates ?? 0) > 0);
  for (const g of withRetag) {
    assert.match(g.todo, /worth checking/, `${g.name} reads as an instruction`);
    assert.match(g.todo, /NOT/, `${g.name} does not warn that a mention can be a warning`);
  }
});

/** Word-bounded: "abs" must not match "absolute", "lats" must not match "flats". */
test("the mention search does not match inside other words", () => {
  const gaps = contentGaps();
  const cardio = gaps.find((g) => g.name === "Cardio");
  if (!cardio) return;
  // Nothing to assert about the count itself — only that a substring match
  // would inflate it, so it must not be wildly larger than the shortfall.
  assert.ok((cardio.retagCandidates ?? 0) < MIN_MEMBERS * 4,
    `${cardio.retagCandidates} mentions of "cardio" looks like a substring match, not a word match`);
});

// --- the rules real data cannot exercise -------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THREE GUARDS WERE UNREACHABLE, AND THEREFORE UNPROVEN.
 *
 * Mutation testing removed each of them and the suite stayed green — not
 * because the tests were weak about the behaviour, but because no real row
 * reaches the branch: no catalogue line is malformed, no collection matches
 * nothing, and all three floors are 12 so ordering by "how many short" and by
 * "how many already" agree on every row that exists.
 *
 * A guard that cannot be shown to work is a guard that will not be there when
 * it is finally needed, so each is now driven directly.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("ordering by cheapest is not ordering by size", () => {
  const gap = (name: string, have: number, need: number): Gap => ({
    kind: "collection", name, href: `/${name}/`, have, need, short: need - have, todo: "x",
  });
  // Only distinguishable when the floors differ: 9/10 is one away and 20/24 is
  // four, so "most already there" and "least still needed" disagree.
  const sorted = [gap("big", 20, 24), gap("small", 9, 10)].sort(byCheapest);
  assert.deepEqual(sorted.map((g) => g.name), ["small", "big"],
    "sorted by how much is already there, which buries the one-item win");

  // Equal cost falls back to the more established topic, then to the name.
  const tied = [gap("b", 5, 6), gap("a", 11, 12), gap("c", 11, 12)].sort(byCheapest);
  assert.deepEqual(tied.map((g) => g.name), ["a", "c", "b"]);
});

test("a catalogue row with no muscle builds nothing", () => {
  assert.equal(build("Ghost Lift|").length, 0, "a row with an empty muscle became an exercise");
  assert.equal(build("Ghost Lift").length, 0, "a row with no separator became an exercise");
  assert.equal(build("|Back").length, 0, "a row with no name became an exercise");
  // And a good row still builds, so the guard is not simply rejecting everything.
  assert.equal(build("Barbell Thing|Back").length, 1);
});

test("a catalogue row may name a second muscle, and the first stays primary", () => {
  const [one] = build("Test Pulldown|Back,Lats");
  assert.deepEqual(one.muscles, ["Back", "Lats"]);
  // categoryOf and the fallback `why` both read the first muscle, so a row
  // gaining a second must not change either.
  assert.equal(build("Test Pulldown|Back")[0].category, one.category);
  assert.equal(build("Test Pulldown|Back")[0].why, one.why);
  // Whitespace and trailing commas are a person typing, not a new meaning.
  assert.deepEqual(build("Test Pulldown| Back , Lats ,")[0].muscles, ["Back", "Lats"]);
});

/**
 * "Lats" must not match "flats", and "abs" must not match "absolute".
 *
 * Unprovable from the catalogue: no muscle name in it is a substring of another
 * word that appears in any description, so substring matching and word matching
 * return the same counts on real data — a mutation between them passed. Driven
 * with a fixture instead.
 */
test("the mention search matches words, not fragments", () => {
  const ex = (name: string, why: string, muscles: string[]) =>
    ({ id: name, name, category: "strength", demo: "squat", equipment: "None",
       muscles, tempo: "Controlled", cues: [], why } as unknown as Parameters<typeof mentionsButUntagged>[1][number]);

  const all = [
    ex("Deck press", "Performed on the flats of the bench.", ["Chest"]),
    ex("Wide pulldown", "Stretches the lats at the top.", ["Back"]),
    ex("Real lat row", "Hits the lats hard.", ["Lats"]),
  ];
  assert.equal(mentionsButUntagged("Lats", all), 1,
    "either 'flats' was counted, or the genuine untagged mention was missed");

  // Already tagged is never a candidate — it is not a gap, it is a member.
  assert.equal(mentionsButUntagged("Chest", all), 0);
  // A muscle nothing mentions has no candidates rather than throwing.
  assert.equal(mentionsButUntagged("Calves", all), 0);
});

/** And the panel shows it, or it is a report nobody reads. */
test("the social tab surfaces the gaps", () => {
  const src = readFileSync(new URL("../components/ContentEngine.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
  assert.match(src, /nearMisses\(\)/, "nothing renders the near misses");
  assert.match(src, /gapSummary\(\)/, "the summary line is not shown");
  assert.match(src, /\{g\.todo\}/, "the list shows names without saying what to do about them");
});
