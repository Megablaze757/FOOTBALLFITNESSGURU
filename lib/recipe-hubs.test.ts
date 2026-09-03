import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { MEALS } from "./meals-data";
import { contentPages, slugify } from "./seo";
import { recipeFacts } from "./collections";
import {
  publishableRecipeHubs, recipeHubMembers, findRecipeHub, recipeHubsFor, recipeHubPath,
  definingIngredient, searchName, recipeHubTitle, MIN_RECIPE_HUB,
} from "./recipe-hubs";

test("no recipe hub is published thin", () => {
  const hubs = publishableRecipeHubs();
  assert.ok(hubs.length >= 10, `only ${hubs.length} hubs`);
  for (const { hub, members } of hubs) {
    assert.ok(members.length >= MIN_RECIPE_HUB, `${hub.name}: ${members.length}`);
  }
});

test("the gate can shut", () => {
  assert.deepEqual(publishableRecipeHubs(recipeFacts().slice(0, 4)), []);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PAGE THAT MUST NEVER EXIST IS "OLIVE OIL RECIPES".
 *
 * Grouping by ingredients a recipe CONTAINS produced exactly that, with 189
 * members, then lemons, garlic, onions and ground spices — the most common
 * ingredients precisely because they are cooking fat and seasoning. They are
 * in half the book and define none of it, and a page for them is a doorway
 * with a keyword in the title.
 *
 * One defining ingredient per recipe, by protein contributed, is what keeps
 * them out. This test is the reason that rule cannot quietly be relaxed back
 * to "contains".
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("seasoning and cooking fat never become a topic", () => {
  const names = new Set(publishableRecipeHubs().map((h) => h.hub.name.toLowerCase()));
  for (const staple of ["olive oil", "lemons", "garlic", "onions", "salt", "black pepper", "stock cubes"]) {
    assert.ok(!names.has(staple), `"${staple} recipes" was published`);
  }
});

/** A URL and a heading a person would recognise, not a shelf label. */
test("every hub is named the way somebody would search for it", () => {
  for (const { hub } of publishableRecipeHubs()) {
    assert.ok(!/[()%\d]/.test(hub.name), `"${hub.name}" still reads like a packet`);
    assert.ok(hub.name.split(/\s+/).length <= 3, `"${hub.name}" is too long to be a search term`);
    assert.match(hub.slug, /^[a-z0-9][a-z0-9-]*$/, `${hub.slug} is not a usable URL`);
  }
});

test("searchName strips the packet and keeps the food", () => {
  assert.equal(searchName("Tuna chunks in spring water"), "tuna");
  assert.equal(searchName("Greek style yoghurt (0% fat)"), "greek yoghurt");
  assert.equal(searchName("Free range eggs"), "eggs");
  assert.equal(searchName("Frozen edamame"), "edamame");
  assert.equal(searchName("Chicken breast fillets"), "chicken breast");
  assert.equal(searchName("Beef mince (5% fat)"), "beef");
  // Nothing to strip is left alone.
  assert.equal(searchName("Chickpeas"), "chickpeas");
});

test("the defining ingredient is the one carrying the plate", () => {
  const withNone = MEALS.filter((m) => definingIngredient(m) === null);
  assert.ok(withNone.length < MEALS.length * 0.1,
    `${withNone.length} recipes have no protein-bearing ingredient at all`);

  for (const m of MEALS.slice(0, 40)) {
    const name = definingIngredient(m);
    if (!name) continue;
    assert.ok(!/olive oil|salt|pepper$/i.test(name), `${m.name} is defined by ${name}`);
  }
});

test("every hub resolves and lists pages that exist", () => {
  const slugs = new Set(contentPages(MEALS).map((p) => p.slug));
  for (const { hub, members } of publishableRecipeHubs()) {
    assert.ok(findRecipeHub(hub.kind, hub.slug), `${recipeHubPath(hub)} does not resolve`);
    for (const f of members) {
      assert.ok(slugs.has(slugify(f.meal.name)), `${hub.name} lists ${f.meal.name}, which has no page`);
    }
  }
});

test("a recipe's hubs list it back", () => {
  const all = recipeFacts();
  for (const f of all) {
    for (const hub of recipeHubsFor(f.meal, all)) {
      assert.ok(recipeHubMembers(hub, all).some((m) => m.meal.id === f.meal.id),
        `${f.meal.name} links to ${recipeHubPath(hub)}, which does not list it`);
    }
  }
});

test("a hub URL never collides with a recipe's own", () => {
  const slugs = new Set(contentPages(MEALS).map((p) => p.slug));
  for (const segment of ["with", "meal"]) {
    assert.ok(!slugs.has(segment), `a recipe is at /recipes/${segment}/, which the hubs claim`);
  }
});

test("the hubs are built and in the sitemap", (t) => {
  const out = new URL("../out/", import.meta.url);
  if (!existsSync(new URL("sitemap.xml", out))) return t.skip("no export — run npm run build");
  const xml = readFileSync(new URL("sitemap.xml", out), "utf8");
  for (const { hub } of publishableRecipeHubs()) {
    assert.ok(xml.includes(`${recipeHubPath(hub)}</loc>`), `${recipeHubPath(hub)} is not in the sitemap`);
    assert.ok(existsSync(new URL(`.${recipeHubPath(hub)}index.html`, out)), `${recipeHubTitle(hub)} was not built`);
  }
});
