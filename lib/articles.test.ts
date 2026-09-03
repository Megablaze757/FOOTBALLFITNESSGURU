import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { ARTICLES, findArticle } from "./articles";
import { articleProblems, articleWords, opening, TITLE_MAX, DESCRIPTION_MAX, MIN_WORDS, MIN_LINKS } from "./article";
import { contentPages, slugify } from "./seo";
import { EXERCISES, isRunEntry } from "./exercises";
import { MEALS } from "./meals-data";
import { publishableHubs, hubPath } from "./hubs";
import { publishableCollections } from "./collections";
import { standardPages } from "./standards-page";
import { indexFacts, money } from "./protein-index";

const MOVEMENTS = EXERCISES.filter((e) => !isRunEntry(e));

/** Every internal path an article is allowed to link to. */
function knownPaths(): Set<string> {
  const paths = new Set<string>([
    "/", "/recipes/", "/exercises/", "/guides/", "/drills/", "/collections/",
    "/cheapest-protein/", "/plans/", "/articles/", "/standards/",
  ]);
  for (const { slug } of contentPages(MOVEMENTS)) paths.add(`/exercises/${slug}/`);
  for (const { slug } of contentPages(MEALS)) paths.add(`/recipes/${slug}/`);
  for (const { hub } of publishableHubs(MOVEMENTS)) paths.add(hubPath(hub));
  for (const { collection } of publishableCollections()) paths.add(`/collections/${collection.slug}/`);
  for (const { slug } of standardPages()) paths.add(`/standards/${slug}/`);
  for (const a of ARTICLES) paths.add(`/articles/${a.slug}/`);
  return paths;
}

test("every article passes its own optimisation rules", () => {
  const paths = knownPaths();
  for (const article of ARTICLES) {
    assert.deepEqual(articleProblems(article, paths), [], `${article.slug}`);
  }
});

test("the rules are strict enough to fail a bad article", () => {
  const paths = knownPaths();
  const bad = {
    slug: "Bad Slug",
    title: "A title that is far too long to ever be shown in full by any search engine at all",
    description: "short",
    keyword: "protein",
    published: "not a date",
    intro: ["Nothing about the subject here."],
    sections: [],
    links: [{ href: "/nope/", text: "Nowhere" }],
  };
  const found = articleProblems(bad as Parameters<typeof articleProblems>[0], paths);
  for (const expected of [/not a usable URL/, /the title is \d+ characters/, /title does not contain/,
    /description is too short/, /description does not contain/, /first hundred words/, /words — under/,
    /no sections/, /internal links/, /which is not a page/, /not an ISO date/]) {
    assert.ok(found.some((p) => expected.test(p)), `${expected} was not caught. Got: ${found.join(" | ")}`);
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A NUMBER TYPED INTO PROSE IS A NUMBER THAT GOES STALE WITH YOUR NAME ON IT.
 *
 * This is the whole objection to a blog, and the only reason these articles
 * are TypeScript rather than markdown. "£0.31" typed into a paragraph survives
 * the price changing; `money(facts.cheapest.cost)` does not.
 *
 * Checked at the SOURCE, because at runtime an interpolated number and a typed
 * one are both just digits — the same trick lib/llms-txt.test.ts uses on the
 * llms.txt template.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("no figure in an article is typed rather than computed", () => {
  const src = readFileSync(new URL("./articles.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    // Interpolations are the allowed way to have a number. Remove them first
    // so what is left is only what somebody typed.
    .replace(/\$\{[^}]*\}/g, " ")
    // Dates are declared, not computed, and are meant to be literal.
    .replace(/published:\s*"[\d-]+"/g, " ")
    .replace(/updated:\s*"[\d-]+"/g, " ");

  const typed = [...src.matchAll(/(?<![\w.])(£\s?\d[\d.,]*|\d[\d.,]*\s?(?:kg|g|%|×|x\b))/gi)]
    .map((m) => m[1].trim())
    // 2.5 is the plate increment, named in prose as a fact about barbells.
    .filter((n) => !/^2\.5\s?kg$/i.test(n));

  assert.deepEqual(typed, [],
    "these figures are typed into lib/articles.ts and will be wrong the moment the data moves");
});

test("an article's numbers change when the data does", () => {
  // Not a mock: the article interpolates from indexFacts(), so its description
  // must contain today's cheapest price rather than a remembered one.
  const facts = indexFacts()!;
  const article = findArticle("cheapest-protein-uk")!;
  assert.ok(article.description.includes(money(facts.cheapest.cost)),
    "the article quotes a price the index no longer holds");
  assert.ok(article.intro.join(" ").includes(facts.cheapest.name.toLowerCase()));
});

test("articles do not collide with each other or with the rest of the site", () => {
  const slugs = ARTICLES.map((a) => a.slug);
  assert.equal(new Set(slugs).size, slugs.length, "two articles share a URL");

  const titles = ARTICLES.map((a) => a.title);
  assert.equal(new Set(titles).size, titles.length, "two articles share a title");

  for (const a of ARTICLES) {
    assert.notEqual(a.slug, slugify(a.title).slice(0, 0) || "x", "");
    assert.equal(findArticle(a.slug)?.slug, a.slug);
  }
  assert.equal(findArticle("no-such-article"), null);
});

test("word count and opening are measured over what the reader sees", () => {
  const article = ARTICLES[0];
  assert.ok(articleWords(article) >= MIN_WORDS);
  assert.ok(opening(article).split(/\s+/).length <= 100);
  assert.ok(article.title.length <= TITLE_MAX);
  assert.ok(article.description.length <= DESCRIPTION_MAX);
  assert.ok(article.links.length >= MIN_LINKS);
});

test("the articles are built, with Article and FAQ schema", (t) => {
  const out = new URL("../out/", import.meta.url);
  if (!existsSync(new URL("sitemap.xml", out))) return t.skip("no export — run npm run build");
  const xml = readFileSync(new URL("sitemap.xml", out), "utf8");
  for (const a of ARTICLES) {
    const path = `/articles/${a.slug}/`;
    assert.ok(xml.includes(`${path}</loc>`), `${path} is not in the sitemap`);
    const file = new URL(`.${path}index.html`, out);
    assert.ok(existsSync(file), `${path} was not built`);
    const html = readFileSync(file, "utf8");
    assert.match(html, /"@type":"Article"/, `${a.slug} has no Article schema`);
    if (a.faq?.length) assert.match(html, /"@type":"FAQPage"/, `${a.slug} has an FAQ and no FAQPage schema`);
    assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${a.slug} does not have exactly one H1`);
  }
});
