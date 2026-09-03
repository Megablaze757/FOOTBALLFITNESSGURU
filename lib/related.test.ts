import { test } from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, isRunEntry } from "./exercises";
import { MEALS } from "./meal-plan";
import { relatedExercises, relatedMeals, RELATED_COUNT } from "./related";

const MOVEMENTS = EXERCISES.filter((e) => !isRunEntry(e));

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 719 PAGES THAT LINKED TO NOTHING IN THEIR OWN SECTION.
 *
 * Counted off the built HTML: every exercise and recipe page had exactly one
 * same-section link, its own index. A crawler landing on one could reach the
 * home page and nothing else about the subject, and a reader who wanted the
 * next thing had to go back to a list of 383 and start again.
 *
 * Every page must now offer a way further in — and it must be a real link, to
 * a page that exists, that is not itself.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("every movement has somewhere to go next", () => {
  const ids = new Set(MOVEMENTS.map((e) => e.id));
  const empty: string[] = [];
  for (const e of MOVEMENTS) {
    const related = relatedExercises(e, MOVEMENTS);
    if (!related.length) { empty.push(e.name); continue; }
    assert.ok(related.length <= RELATED_COUNT, `${e.id}: ${related.length} links`);
    assert.equal(new Set(related.map((r) => r.id)).size, related.length, `${e.id}: duplicate links`);
    for (const r of related) {
      assert.notEqual(r.id, e.id, `${e.id} links to itself`);
      assert.ok(ids.has(r.id), `${e.id} links to ${r.id}, which is not in the catalogue`);
    }
  }
  assert.deepEqual(empty, [], "these movements are still dead ends");
});

test("every recipe has somewhere to go next", () => {
  const ids = new Set(MEALS.map((m) => m.id));
  const empty: string[] = [];
  for (const m of MEALS) {
    const related = relatedMeals(m, MEALS);
    if (!related.length) { empty.push(m.name); continue; }
    for (const r of related) {
      assert.notEqual(r.id, m.id, `${m.id} links to itself`);
      assert.ok(ids.has(r.id), `${m.id} links to a recipe that does not exist`);
    }
  }
  assert.deepEqual(empty, [], "these recipes are still dead ends");
});

/** The link has to be relevant, or it is a link farm with better manners. */
test("a movement's first suggestion trains the same muscle", () => {
  let sameMuscle = 0;
  for (const e of MOVEMENTS) {
    const [first] = relatedExercises(e, MOVEMENTS);
    const muscles = new Set(e.muscles.map((m) => m.toLowerCase()));
    if (first.muscles.some((m) => muscles.has(m.toLowerCase()))) sameMuscle++;
  }
  const share = sameMuscle / MOVEMENTS.length;
  assert.ok(share > 0.95, `only ${Math.round(share * 100)}% of top suggestions share a muscle`);
});

test("a recipe's suggestions share an ingredient or a slot", () => {
  for (const m of MEALS.slice(0, 60)) {
    const foods = new Set(m.items.map((i) => i.foodId));
    for (const r of relatedMeals(m, MEALS)) {
      const shares = r.items.some((i) => foods.has(i.foodId)) || r.slot === m.slot;
      assert.ok(shares, `${m.id} -> ${r.id} has nothing in common`);
    }
  }
});

/**
 * Order must depend on the DATA, not on the catalogue's order — otherwise
 * inserting one row reshuffles the related block on hundreds of pages, and
 * every one of them is a changed page to a crawler for no change in meaning.
 */
test("the order is stable when the catalogue is reordered", () => {
  const target = MOVEMENTS.find((e) => e.name === "Bench Press") ?? MOVEMENTS[0];
  const before = relatedExercises(target, MOVEMENTS).map((e) => e.id);
  const shuffled = [...MOVEMENTS].reverse();
  const after = relatedExercises(target, shuffled).map((e) => e.id);
  assert.deepEqual(after, before);
});

/** Not just the first one: a page of six links is six chances to be irrelevant. */
test("every suggestion has something in common, not only the top one", () => {
  for (const e of MOVEMENTS) {
    const muscles = new Set(e.muscles.map((m) => m.toLowerCase()));
    for (const r of relatedExercises(e, MOVEMENTS)) {
      const shares = r.muscles.some((m) => muscles.has(m.toLowerCase()))
        || r.equipment === e.equipment
        || r.category === e.category;
      assert.ok(shares, `${e.name} -> ${r.name}: no shared muscle, equipment or category`);
    }
  }
});

test("an unrelated movement in the pool is not linked to fill the block", () => {
  const alien = {
    id: "x_alien", name: "Alien Thing", category: "Skill", demo: "press",
    equipment: "Nothing at all", muscles: ["Antennae"], tempo: "Controlled",
    cues: [], why: "",
  } as unknown as (typeof MOVEMENTS)[number];
  // A pool of one real movement plus the alien: the block should come back
  // short rather than padded with something that shares nothing.
  const target = MOVEMENTS.find((e) => e.name === "Bench Press") ?? MOVEMENTS[0];
  const related = relatedExercises(target, [target, alien]);
  assert.deepEqual(related.map((r) => r.id), [], "an unrelated movement was linked to fill space");
});

test("a movement nothing resembles gets no links rather than bad ones", () => {
  const lonely = {
    id: "x_lonely", name: "Lonely", category: "Skill", demo: "press",
    equipment: "Nothing at all", muscles: ["Antennae"], tempo: "Controlled",
    cues: [], why: "", 
  } as unknown as Parameters<typeof relatedExercises>[0];
  assert.deepEqual(relatedExercises(lonely, [lonely]), [], "it must not link to itself");
});
