import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOgCardSvg, ogImage, ogPath, ALL_OG, OG_SECTIONS, OG_WIDTH, OG_HEIGHT } from "./og";
import { ARTICLES } from "./articles";
import { standardPages } from "./standards-page";
import { SITE } from "./seo";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 43 OF 805 PAGES HAD A LINK PREVIEW.
 *
 * Not an oversight — a Next.js sharp edge. The root layout sets
 * `openGraph.images`, and a page that sets `openGraph: { title, description,
 * url }` REPLACES that object rather than merging into it. So every page that
 * bothered to write a good social title thereby deleted its own image, which
 * is the exact opposite of what writing one is for.
 *
 * The cost is not subtle: a share with no image is a grey rectangle in
 * WhatsApp, Slack, iMessage, Discord and every DM this app spreads through.
 * It is the cheapest advertising the site has and it was switched off on the
 * 762 pages worth sharing.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("every public page ships a link preview", (t) => {
  const out = new URL("../out/", import.meta.url);
  if (!existsSync(new URL("sitemap.xml", out))) return t.skip("no export — run npm run build first");

  const xml = readFileSync(new URL("sitemap.xml", out), "utf8");
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].replace(/^https:\/\/[^/]+/, "").replace(/\/$/, ""));

  assert.ok(paths.length > 700, `only ${paths.length} pages — has the export shrunk?`);

  const missing: string[] = [];
  for (const path of paths) {
    const file = new URL(`.${path}/index.html`, out);
    if (!existsSync(file)) continue;
    const html = readFileSync(file, "utf8");
    if (!/property="og:image"/.test(html)) missing.push(path || "/");
  }
  assert.deepEqual(missing.slice(0, 8), [],
    `${missing.length} pages share as a grey rectangle`);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AND CHECKED IN THE SOURCE, NOT ONLY IN THE EXPORT.
 *
 * The export check above is the truth, and it is only as fresh as the last
 * build — deleting `images` from a page and re-running the tests leaves it
 * green, because out/ still holds yesterday's HTML. Verified by doing exactly
 * that: the build-output test did not notice.
 *
 * So the rule is also enforced where it is broken. `openGraph` in Next
 * REPLACES the inherited object, so any page declaring one and omitting
 * `images` is a page that has switched its own preview off — which is the
 * original bug, stated as a rule.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("no page declares openGraph without an image", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const offenders: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(rel);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name) || entry.name.includes(".test.")) continue;
      const src = readFileSync(join(root, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, " ");
      if (!/\bopenGraph\s*:/.test(src)) continue;

      // Each openGraph object, up to its closing brace. Nested braces are not
      // a concern: these are flat metadata literals.
      for (const m of src.matchAll(/\bopenGraph\s*:\s*\{([^{}]*)\}/g)) {
        if (!/\bimages\s*:/.test(m[1])) offenders.push(`${rel}: ${m[1].trim().slice(0, 60)}…`);
      }
    }
  };
  walk("app");
  walk("components");

  assert.deepEqual(offenders, [],
    "openGraph REPLACES the root's images rather than merging — these pages "
    + "switch off their own link preview");
});

/** A referenced image that was never generated is a broken preview. */
test("every image a page references was actually written", (t) => {
  const dir = new URL("../public/og/", import.meta.url);
  if (!existsSync(dir)) return t.skip("no public/og — run npm run og first");
  for (const slug of ALL_OG) {
    assert.ok(existsSync(new URL(`${slug}.png`, dir)), `${slug}.png was referenced and never generated`);
  }
});

/**
 * The generator and the reference list must walk the same sources. A per-page
 * image written but not listed silently serves the section default, which
 * looks fine and is the wrong picture — the failure that hides as "it works".
 */
test("the known set covers every per-page image the generator writes", () => {
  for (const a of ARTICLES) assert.ok(ALL_OG.has(`articles-${a.slug}`), `articles-${a.slug}`);
  for (const { slug } of standardPages()) assert.ok(ALL_OG.has(`standards-${slug}`), `standards-${slug}`);
  for (const s of OG_SECTIONS) assert.ok(ALL_OG.has(s), s);
});

test("an unknown slug falls back rather than returning nothing", () => {
  const [img] = ogImage("no-such-page", "Alt text");
  assert.equal(img.url, `${SITE}${ogPath("default")}`);
  assert.equal(img.width, OG_WIDTH);
  assert.equal(img.height, OG_HEIGHT);
  assert.equal(img.alt, "Alt text");

  // A missing `images` key is worse than a wrong picture: no preview at all.
  assert.equal(ogImage("also-missing", "x").length, 1);
});

test("the card is the size every platform renders at, and escapes its text", () => {
  const svg = buildOgCardSvg({ kicker: "A & B", title: "5 < 6 & > 4", subtitle: "Fish & chips" });
  assert.match(svg, new RegExp(`width="${OG_WIDTH}" height="${OG_HEIGHT}"`));
  assert.ok(!/<text[^>]*>[^<]*&(?!amp;|lt;|gt;)/.test(svg), "unescaped text would break the card");
  assert.ok(svg.includes("&amp;"));
});

test("a long title wraps instead of running off the card", () => {
  const svg = buildOgCardSvg({
    kicker: "Test",
    title: "A title far longer than any card could hold on one line without running clean off the edge of it",
  });
  const lines = [...svg.matchAll(/font-size="68"/g)];
  assert.ok(lines.length > 1 && lines.length <= 3, `${lines.length} title lines`);
});
