import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const robots = readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8");

const disallowed = new Set(
  robots.split("\n")
    .filter((l) => l.toLowerCase().startsWith("disallow:"))
    .map((l) => l.slice("disallow:".length).trim())
    .filter(Boolean),
);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EVERY SIGNED-IN ROUTE IS DISALLOWED, AND THE LIST IS NOT MAINTAINED BY HAND.
 *
 * /ask, /injury and /partner sat in app/(app) exactly like /home and /journal
 * and were simply missed off robots.txt. That is not a small omission on a
 * static export: a signed-in route builds to a five-word shell that inherits
 * the ROOT title and description, so three empty pages were indexable, orphaned
 * and competing with the homepage for its own name. Found by counting the
 * indexable pages in out/, not by reading the file — nothing on any screen
 * would ever have shown it.
 *
 * A hand-kept enumeration of a directory drifts the moment somebody adds a
 * route, which is why this reads the directory instead.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("every route behind the app shell is disallowed to crawlers", () => {
  const routes = readdirSync(new URL("../app/(app)/", import.meta.url), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  assert.ok(routes.length > 10, `only ${routes.length} app routes found — is the path right?`);

  const missing = routes.filter((r) => !disallowed.has(`/${r}`));
  assert.deepEqual(missing, [],
    "these signed-in routes are indexable, and each builds to an empty page carrying the homepage's title");
});

/**
 * The other direction, which is the more expensive mistake.
 *
 * The public catalogue is built from the same data the app uses and is most of
 * this site's reach — /recipes, /exercises and /collections were once
 * disallowed by exactly this file, and 600 real pages sat outside the index
 * because of one line. Adding a Disallow is cheap to type and quiet to be
 * wrong about.
 */
test("nothing public is disallowed", () => {
  for (const path of [
    "/recipes", "/exercises", "/collections", "/cheapest-protein", "/standards",
    "/articles", "/guides", "/drills", "/plans", "/waitlist", "/a",
  ]) {
    assert.ok(!disallowed.has(path), `${path} is a public page and robots.txt is hiding it`);
  }
  assert.match(robots, /Sitemap: https:\/\/pocketathlete\.com\/sitemap\.xml/);
});
