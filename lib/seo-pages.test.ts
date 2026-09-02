import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { contentPages, findBySlug, slugify, exerciseMetaDescription, trimToMeta, META_MAX } from "./seo";
import { STUB_WHY } from "./exercise-draft";
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
 * THE UNIQUE TEXT WAS ALREADY IN THE ROW; THE PAGE WAS PICKING THE PLACEHOLDER.
 *
 * This was a ratchet held at 201 — 201 exercise pages whose meta description
 * repeated another page's, 43 of them saying "Builds the legs." and nothing
 * else — with a note to lower it as drafted cues landed.
 *
 * No cue was ever drafted. The page took `ex.why`, and for every bulk-imported
 * movement that string is what the importer generated from the muscle column.
 * `ex.description` held a real how-to for all 197 of them, written by a person
 * — "Back flat against the seat, feet on the platform shoulder width. Press
 * out to near-extension..." — and the page was choosing the placeholder over
 * it. exerciseMetaDescription now prefers a curated `why`, falls back to that
 * how-to, and only invents a line when there is neither.
 *
 * The last four were a different bug: two movements listed in both catalogue
 * blocks, so the site built the same page twice under a "-2" slug. Deduped in
 * build() — see the note there.
 *
 * So this is a clean assertion now, not a ratchet, and it stays clean: an
 * import of stub rows can no longer move it, because a stub `why` is not what
 * the page prints.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("no two exercise pages describe themselves the same way", () => {
  const counts = new Map<string, string[]>();
  for (const e of MOVEMENTS) {
    const description = exerciseMetaDescription(e, (w) => STUB_WHY.test(w));
    counts.set(description, [...(counts.get(description) ?? []), e.name]);
  }

  const shared = [...counts].filter(([, names]) => names.length > 1);
  assert.deepEqual(shared.map(([d, names]) => `${names.join(" / ")}: ${d}`), [],
    "pages that describe themselves identically are a duplicate-content signal "
    + "on the pages this site is asking to rank");
});

/**
 * The check that would have caught the "-2" pages on the day they appeared.
 *
 * Two lists of movement names are maintained by hand and concatenated, and a
 * name in both used to produce two identical catalogue rows: two entries in
 * every picker in the app, and two public pages with the same title, the same
 * copy and the same schema.org block.
 */
test("no movement is in the catalogue twice", () => {
  const byId = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const e of MOVEMENTS) {
    byId.set(e.id, (byId.get(e.id) ?? 0) + 1);
    byName.set(e.name.toLowerCase(), (byName.get(e.name.toLowerCase()) ?? 0) + 1);
  }
  assert.deepEqual([...byId].filter(([, n]) => n > 1), [], "two catalogue rows share an id");
  assert.deepEqual([...byName].filter(([, n]) => n > 1), [], "two catalogue rows share a name");
});

/**
 * A description Google cuts in half is one it wrote itself instead, and a
 * description cut mid-word reads as broken rather than as abbreviated.
 */
test("every exercise description fits, and none ends mid-word", () => {
  for (const e of MOVEMENTS) {
    const d = exerciseMetaDescription(e, (w) => STUB_WHY.test(w));
    assert.ok(d.length <= META_MAX, `${e.name}: ${d.length} chars`);
    assert.ok(d.length >= 20, `${e.name} says almost nothing: ${JSON.stringify(d)}`);
    if (d.endsWith("…")) {
      // The character before the ellipsis has to be the end of a whole word:
      // the trim cut at a space, so what is left cannot be half of one.
      const stem = d.slice(0, -1);
      assert.ok(e.description?.replace(/\s+/g, " ").startsWith(stem) || e.why.startsWith(stem),
        `${e.name} was cut somewhere the source text does not go: ${JSON.stringify(d)}`);
      assert.ok(!/[,;:—-]$/.test(stem), `${e.name} ends on punctuation: ${JSON.stringify(d)}`);
    }
  }
});

test("a curated why still wins over the how-to", () => {
  const pick = (why: string, description: string) =>
    exerciseMetaDescription({ name: "Bench Press", why, description }, (w) => STUB_WHY.test(w));

  assert.equal(pick("Emphasises the upper chest and front delts.", "Bench at ~30°. Bar to the upper chest."),
    "Emphasises the upper chest and front delts.");
  assert.match(pick("Builds the chest.", "Bench at ~30°, blades retracted, and drive the feet into the floor as you press."),
    /^Bench at ~30°/);
  // Neither: a line that at least names the page it is on.
  assert.equal(pick("Builds the chest.", "Push."), "Bench Press: what it works, how to do it, and the cues that matter.");
});

test("trimToMeta prefers a sentence, then a word, and never overruns", () => {
  const short = "Press out to near-extension.";
  assert.equal(trimToMeta(short), short, "nothing to cut");
  assert.equal(trimToMeta("  spaced   out  \n text "), "spaced out text", "whitespace collapses");

  // A sentence ends comfortably inside the window: cut there, no ellipsis.
  const two = "Back flat against the seat, feet on the platform shoulder width. Press out to near-extension, then return under control.";
  assert.equal(trimToMeta(two, 80), "Back flat against the seat, feet on the platform shoulder width.");

  // No sentence end in range: cut at a space and mark it.
  const run = "Take a wide stance with toes turned out and grip the bar inside the knees before you pull";
  const cut = trimToMeta(run, 40);
  assert.ok(cut.length <= 40, `${cut.length} chars`);
  assert.ok(cut.endsWith("…"));
  assert.ok(run.startsWith(cut.slice(0, -1)), `${cut} is not a prefix of the source`);
  assert.ok(!cut.slice(0, -1).endsWith(" "));

  /**
   * THE FULL STOP INSIDE A NUMBER IS NOT A SENTENCE.
   *
   * The window here ends "...loaded at 3." and the digit that would prove it
   * is a decimal is the character the cut threw away — so the test that the
   * function reads past the window, not just inside it.
   */
  const decimal = "Add a little each week, so a bar loaded at 3.5kg this Monday is 5kg the next one.";
  assert.equal(decimal.indexOf("."), 44, "the window below has to END on that full stop to prove anything");
  assert.equal(trimToMeta(decimal, 46), "Add a little each week, so a bar loaded at…");

  // A single word longer than the window still has to come back inside it.
  assert.ok(trimToMeta("a".repeat(200), 20).length <= 20);
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
