import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { SITE, guideSports, guidePages } from "./seo";
import { MEALS } from "./meals-data";
import { EXERCISES, isRunEntry } from "./exercises";
import { publishableCollections } from "./collections";
import { indexFacts, money } from "./protein-index";

const out = new URL("../out/", import.meta.url);
const route = readFileSync(new URL("../app/llms.txt/route.ts", import.meta.url), "utf8");

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FILE CLAIMED IT COULD NOT MISS A PAGE. IT WAS MISSING 94% OF THEM.
 *
 * llms.txt says of itself: "Generated rather than hand-written, from the same
 * sources as the pages themselves, so it can't describe a page that no longer
 * exists or miss one that was added."
 *
 * It was generated from `lib/seo.ts` — which covers the guides and drills, and
 * knew nothing about the 336 recipes, 385 exercises, 10 collections and the
 * protein index added since. 732 of 778 URLs, including every page that makes
 * this site worth quoting.
 *
 * That matters more here than a normal sitemap gap. robots.txt deliberately
 * lets GPTBot, ClaudeBot, PerplexityBot and the rest in, on the bet that being
 * the source an assistant quotes beats the click it might have sent. The file
 * whose whole job is telling those crawlers where the substance lives was
 * pointing them at the marketing pages.
 *
 * So the claim in the comment is now a test. Nothing that appears in the
 * sitemap may be absent from llms.txt.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("llms.txt names every kind of page the sitemap publishes", (t) => {
  if (!existsSync(new URL("sitemap.xml", out)) || !existsSync(new URL("llms.txt", out))) {
    t.skip("no build output — run `npm run build` first");
    return;
  }

  const llms = readFileSync(new URL("llms.txt", out), "utf8");
  const sitemap = readFileSync(new URL("sitemap.xml", out), "utf8");

  const sections = new Set(
    [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => m[1].replace(SITE, "").split("/").filter(Boolean)[0] ?? "/"));

  assert.ok(sections.size >= 8, `only ${sections.size} kinds of page — has the sitemap shrunk?`);

  const missing = [...sections].filter((section) =>
    section === "/" ? !llms.includes(`(${SITE}/)`) : !llms.includes(`${SITE}/${section}/`));

  assert.deepEqual(missing, [],
    `llms.txt tells an assistant nothing about these, and robots.txt invites it in to read them`);
});

/**
 * A count in prose goes stale the moment the data moves, and a model quoting a
 * stale number quotes it with your name on it. Every figure has to be
 * interpolated from the source, never typed.
 */
test("the numbers in llms.txt come from the data, not from someone's memory", (t) => {
  if (!existsSync(new URL("llms.txt", out))) {
    t.skip("no build output — run `npm run build` first");
    return;
  }
  const llms = readFileSync(new URL("llms.txt", out), "utf8");

  assert.ok(llms.includes(`${MEALS.length} recipes`), "the recipe count is wrong or absent");
  assert.ok(llms.includes(`${EXERCISES.filter((e) => !isRunEntry(e)).length} movements`),
    "the exercise count is wrong or absent");
  assert.equal(guideSports().length > 0 && guidePages().length > 0, true);

  const facts = indexFacts()!;
  assert.ok(llms.includes(money(facts.cheapest.cost)),
    "the protein index headline is stale — the cheapest price is not the cheapest price");
  assert.ok(llms.includes(facts.cheapest.name.toLowerCase()));

  for (const { collection, members } of publishableCollections()) {
    assert.ok(llms.includes(collection.title), `${collection.slug} is not listed`);
    assert.ok(llms.includes(`${members.length} recipes`), `${collection.slug} has no count`);
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CRAWLER FOLLOWS LINKS, AND THE HOME PAGE LINKED TO NONE OF IT.
 *
 * 778 public pages, and the only route to any of them from the front page was
 * a footer belonging to a different layout. A visitor who was not ready to
 * sign up got offered a waitlist and nothing else, and the pages this site is
 * asking to rank sat one level deeper than they needed to.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the home page links to the free content", () => {
  const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

  for (const path of ["/cheapest-protein/", "/recipes/", "/collections/", "/exercises/", "/guides/", "/drills/"]) {
    assert.ok(home.includes(`"${path}"`), `the home page does not link to ${path}`);
  }
});

/**
 * The home page is the heaviest on the site and the first thing anybody loads.
 * Importing the catalogues to print a count would ship the whole recipe,
 * exercise and food database to every first-time visitor.
 */
test("the home page does not pull a catalogue into the client bundle", () => {
  const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(home, /^"use client";/, "the page is no longer a client component — this rule can relax");
  for (const heavy of ["meals-data", "food-db", "exercises", "protein-index", "collections"]) {
    assert.ok(!new RegExp(`from "@/lib/${heavy}"`).test(home),
      `the home page imports ${heavy}, which lands in every visitor's first load`);
  }
});

/** The source, so the rules hold even before anything is built. */
test("nothing in llms.txt is a hand-typed count", () => {
  // The template literal ONLY. Running to the end of the file swept in the
  // Cache-Control max-age and reported 3600 as a stale count.
  const start = route.indexOf("const body = `");
  const end = route.indexOf("`;", start);
  assert.ok(start > 0 && end > start, "the llms.txt template has moved");
  const body = route.slice(start, end);
  // A bare two-or-more digit number in the template is a number somebody typed.
  // Interpolated ones arrive as ${...} and never appear as literal digits.
  const literals = [...body.matchAll(/(?<![${\w.\-/:])\b(\d{2,})\b(?![}\w])/g)]
    .map((m) => m[1])
    .filter((n) => !["16", "25", "150"].includes(n)); // under-16s, team cap, team price
  assert.deepEqual(literals, [],
    "a count is typed into llms.txt rather than interpolated, so it will go stale silently");
});
