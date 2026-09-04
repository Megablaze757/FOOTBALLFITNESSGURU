import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MEASURED FROM THE PAGES THAT WERE ACTUALLY BUILT.
 *
 * Every defect this file catches was found by counting the built output and
 * none of them was visible from the source. Three signed-in routes were left
 * off robots.txt, so /ask, /injury and /partner shipped as five-word shells
 * carrying the ROOT title and description — indexable, orphaned, competing
 * with the homepage for its own name. And an article and a standards page were
 * titled identically, which is two of your own pages splitting one query's
 * signal with nothing looking wrong on either.
 *
 * Reading the source could not have found either. Reading `out/` found both in
 * seconds.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const OUT = new URL("../out/", import.meta.url);

interface Page {
  url: string;
  title: string | null;
  description: string | null;
  canonical: string | null;
  words: number;
  links: string[];
}

function disallowedPrefixes(): string[] {
  return readFileSync(new URL("robots.txt", OUT), "utf8")
    .split("\n")
    .filter((l) => l.toLowerCase().startsWith("disallow:"))
    .map((l) => l.slice("disallow:".length).trim())
    .filter(Boolean);
}

/** Pages a crawler is both allowed to fetch and told it may index. */
function indexablePages(): Page[] {
  const blocked = disallowedPrefixes();
  const out: Page[] = [];

  const walk = (dir: string, url: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path, `${url}${entry.name}/`);
      } else if (entry.name === "index.html") {
        const html = readFileSync(path, "utf8");
        const isBlocked = blocked.some((d) =>
          url.startsWith(d.endsWith("/") ? d : `${d}/`) || url.replace(/\/$/, "") === d.replace(/\/$/, ""));
        if (isBlocked || html.includes('content="noindex')) continue;
        const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ");
        out.push({
          url,
          title: /<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? null,
          description: /name="description" content="([\s\S]*?)"/.exec(html)?.[1] ?? null,
          canonical: /rel="canonical" href="([^"]*)"/.exec(html)?.[1] ?? null,
          words: body.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length,
          links: [...html.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]),
        });
      }
    }
  };
  walk(new URL(".", OUT).pathname, "/");
  return out;
}

function withBuild(name: string, body: (pages: Page[]) => void) {
  test(name, (t) => {
    if (!existsSync(new URL("robots.txt", OUT))) {
      t.skip("no build output — run `npm run build` first");
      return;
    }
    body(indexablePages());
  });
}

/**
 * Two pages with one title are two pages splitting one query between them.
 * Nothing looks wrong on either; they simply both rank a little worse, which
 * is the kind of defect that is never reported and never fixed.
 */
withBuild("no two indexable pages share a title", (pages) => {
  assert.ok(pages.length > 500, `only ${pages.length} indexable pages — has the build shrunk?`);
  const byTitle = new Map<string, string[]>();
  for (const p of pages) {
    if (!p.title) continue;
    byTitle.set(p.title, [...(byTitle.get(p.title) ?? []), p.url]);
  }
  const clashes = [...byTitle].filter(([, urls]) => urls.length > 1)
    .map(([title, urls]) => `${title} → ${urls.join(", ")}`);
  assert.deepEqual(clashes, []);
});

withBuild("no two indexable pages share a description", (pages) => {
  const byDesc = new Map<string, string[]>();
  for (const p of pages) {
    if (!p.description) continue;
    byDesc.set(p.description, [...(byDesc.get(p.description) ?? []), p.url]);
  }
  const clashes = [...byDesc].filter(([, urls]) => urls.length > 1)
    .map(([d, urls]) => `${d.slice(0, 60)}… → ${urls.join(", ")}`);
  assert.deepEqual(clashes, []);
});

withBuild("every indexable page says what it is", (pages) => {
  const noTitle = pages.filter((p) => !p.title).map((p) => p.url);
  const noDesc = pages.filter((p) => !p.description).map((p) => p.url);
  const noCanonical = pages.filter((p) => !p.canonical).map((p) => p.url);
  assert.deepEqual(noTitle, []);
  assert.deepEqual(noDesc, []);
  assert.deepEqual(noCanonical, []);
});

/**
 * A PAGE NOTHING LINKS TO IS A PAGE THE SITE DOES NOT VOUCH FOR.
 *
 * Internal links are most of how a crawler decides what a site is about and
 * which of its pages matter — the note in MarketingShell makes the same point
 * about the six hundred recipe pages. An orphan in the sitemap gets crawled and
 * then valued at nothing.
 */
withBuild("no indexable page is an orphan", (pages) => {
  const known = new Set(pages.map((p) => p.url));
  const inbound = new Map<string, number>();
  for (const page of pages) {
    for (const raw of page.links) {
      const href = raw.endsWith("/") ? raw : `${raw}/`;
      if (known.has(href) && href !== page.url) inbound.set(href, (inbound.get(href) ?? 0) + 1);
    }
  }
  const orphans = pages.filter((p) => p.url !== "/" && !inbound.has(p.url)).map((p) => p.url);
  assert.deepEqual(orphans, [],
    "nothing on the site links to these, so a crawler is told they exist and given no reason to value them");
});

/**
 * A five-word page is a signed-in route that escaped robots.txt. That is
 * exactly what /ask, /injury and /partner were, and the shell they build to
 * inherits the ROOT title — which is how three empty pages ended up competing
 * with the homepage.
 */
withBuild("no indexable page is an empty shell", (pages) => {
  const empty = pages.filter((p) => p.words < 60).map((p) => `${p.url} (${p.words} words)`);
  assert.deepEqual(empty, [],
    "these have no content: either they belong in robots.txt or they are broken");
});
