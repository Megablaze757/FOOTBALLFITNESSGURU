import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { contentPages, findBySlug, slugify } from "./seo";
import { MEALS } from "./meals-data";
import { EXERCISES, isRunEntry } from "./exercises";

const MOVEMENTS = EXERCISES.filter((e) => !isRunEntry(e));

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIX HUNDRED PAGES IS SIX HUNDRED CHANCES TO SHIP A DUPLICATE OR A 404.
 *
 * At seven public pages you can check by looking. At seven hundred the failure
 * modes are the ones nobody sees: two recipes that slugify to the same URL so
 * one silently never exists, a sitemap listing a page the build did not make,
 * or a title repeated across a hundred pages — which is the fastest way to be
 * told the site is thin.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("every recipe and exercise gets its own URL", () => {
  for (const [what, items] of [["recipe", MEALS], ["exercise", MOVEMENTS]] as const) {
    const pages = contentPages(items);
    assert.equal(pages.length, items.length, `${what}s lost a page on the way to a slug`);

    const slugs = pages.map((p) => p.slug);
    const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    assert.deepEqual(dupes, [], `two ${what}s share a URL: ${dupes.join(", ")}`);

    for (const slug of slugs) {
      assert.match(slug, /^[a-z0-9][a-z0-9-]*$/, `${slug} is not a usable URL`);
    }
  }
});

/** A collision must produce a second page, never swallow one. */
test("two things with the same name both still get a page", () => {
  const pages = contentPages([
    { id: "a", name: "Chicken curry" },
    { id: "b", name: "Chicken curry" },
  ]);
  assert.equal(pages.length, 2);
  assert.notEqual(pages[0].slug, pages[1].slug);
  assert.equal(pages[0].slug, slugify("Chicken curry"));
});

test("every slug resolves back to the thing it came from", () => {
  /** Generic, not a loop over [MEALS, MOVEMENTS]: a union of arrays cannot infer T. */
  const roundTrips = <T extends { id: string; name: string }>(items: T[]) => {
    for (const { slug, id } of contentPages(items)) {
      assert.equal(findBySlug(items, slug)?.id, id, `${slug} resolves to the wrong row`);
    }
  };
  roundTrips(MEALS);
  roundTrips(MOVEMENTS);
  assert.equal(findBySlug(MEALS, "no-such-recipe"), null);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A RATCHET, NOT A PASS MARK.
 *
 * `why` is the meta description of every public exercise page, and 201 of them
 * repeat another page's — 43 saying "Builds the legs." alone. That is thin and
 * duplicated, on the pages this site is asking to rank.
 *
 * 201 rather than the 197 in docs/EXERCISE-CUES.md, and the gap is the point:
 * 197 is what the drafting script can fix, because it only takes rows with a
 * description long enough to check a cue against. The other four are two pairs
 * of hand-written entries that happen to share a sentence, and they need a
 * person, not a model.
 *
 * It cannot be a clean assertion today without failing, and a test that fails
 * on main teaches people to ignore red. So it holds the line at what was
 * measured and no worse: another import of stub rows breaks it, and every
 * drafted description lets the number come down.
 *
 * LOWER THIS NUMBER as drafts land — see docs/EXERCISE-CUES.md. It is meant to
 * reach zero.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const DUPLICATE_DESCRIPTIONS_BASELINE = 201;

test("no more exercise pages share a meta description than already do", () => {
  const counts = new Map<string, number>();
  for (const e of MOVEMENTS) {
    const description = e.why.trim();
    counts.set(description, (counts.get(description) ?? 0) + 1);
  }

  const duplicated = [...counts.values()].filter((n) => n > 1).reduce((a, b) => a + b, 0);
  assert.ok(duplicated <= DUPLICATE_DESCRIPTIONS_BASELINE,
    `${duplicated} exercise pages share a meta description with another, up from `
    + `${DUPLICATE_DESCRIPTIONS_BASELINE}. A page that describes itself the same way as `
    + `42 others is a duplicate-content signal on the pages meant to rank.`);

  if (duplicated < DUPLICATE_DESCRIPTIONS_BASELINE) {
    console.log(`  ↓ duplicate descriptions now ${duplicated}; lower the baseline from `
      + `${DUPLICATE_DESCRIPTIONS_BASELINE} in lib/seo-pages.test.ts`);
  }
});

/**
 * The one rule that decides whether these pages are worth having: the app's
 * own catalogue must be public, and the signed-in browser for it must not be.
 */
test("robots opens the content pages and still closes the app", () => {
  const robots = readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8");
  for (const open of ["/recipes", "/exercises", "/collections", "/cheapest-protein"]) {
    assert.ok(!new RegExp(`^Disallow: ${open}`, "m").test(robots),
      `${open} is disallowed — the pages exist and no crawler may read them`);
  }
  for (const shut of ["/library", "/nutrition", "/admin", "/journal"]) {
    assert.match(robots, new RegExp(`^Disallow: ${shut}`, "m"),
      `${shut} needs a session and would put a login redirect in the index`);
  }
});

/**
 * A sitemap that lists a URL the build did not make is worse than no sitemap —
 * it tells a crawler the site is broken, in the one file it trusts.
 */
test("the sitemap only lists pages that were actually built", (t) => {
  const out = new URL("../out/", import.meta.url);
  if (!existsSync(new URL("sitemap.xml", out))) {
    return t.skip("no export in out/ — run npm run build first");
  }
  const xml = readFileSync(new URL("sitemap.xml", out), "utf8");
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(urls.length > 500, `only ${urls.length} URLs — the content pages are missing`);

  const missing = urls
    .map((u) => u.replace(/^https:\/\/[^/]+/, "").replace(/\/$/, ""))
    .filter((path) => path !== "")
    .filter((path) => !existsSync(new URL(`.${path}/index.html`, out)));
  assert.deepEqual(missing.slice(0, 10), [], `the sitemap lists pages that do not exist`);
});
