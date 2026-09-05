import { test } from "node:test";
import assert from "node:assert/strict";
import { athleteFromPath } from "./athlete-path";
import { MISS_PARAM } from "./public-profile";
import { readFileSync } from "node:fs";

test("an athlete address yields the username", () => {
  for (const [path, expected] of [
    ["/a/sacha/", "sacha"],
    ["/a/sacha", "sacha"],
    ["/A/Sacha/", "sacha"],
    ["/a/rio_98/", "rio_98"],
    ["/a/ab/", "ab"],
  ] as const) {
    assert.equal(athleteFromPath(path), expected, path);
  }
});

/**
 * This value goes into a database query and back out into a URL, and it comes
 * from the address bar, where anybody can type anything.
 */
test("anything that is not a username is not treated as one", () => {
  for (const path of [
    "", "/", "/a", "/a/", "/a//", "/drills/", "/a/sacha/extra/",
    "/a/a/",                       // one character — below the username floor
    "/a/" + "x".repeat(33) + "/",  // above the ceiling
    "/a/Sacha%20Raif/", "/a/sacha raif/", "/a/../../etc/passwd",
    "/a/<script>/", "/a/sacha?x=1", "/a/sacha#top", "//a/sacha/",
  ]) {
    assert.equal(athleteFromPath(path), null, JSON.stringify(path));
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE MISS PAGE CANNOT COLLIDE WITH A REAL ADDRESS, BY CONSTRUCTION.
 *
 * MISS_PARAM carries a hyphen and usernames cannot. That is why it was chosen,
 * and it is why this file needs no special case for it — asserted here so the
 * two facts stay tied together, because changing MISS_PARAM to something a
 * username could be would make the exported miss route shadow a real athlete.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the exported miss route can never be mistaken for an athlete", () => {
  assert.equal(athleteFromPath(`/a/${MISS_PARAM}/`), null,
    `MISS_PARAM "${MISS_PARAM}" now looks like a username, so it shadows whoever picks it`);
  assert.ok(/[^a-z0-9_]/.test(MISS_PARAM),
    `MISS_PARAM "${MISS_PARAM}" is spelled entirely from username characters — it is no longer collision-proof`);
});

test("it never throws, whatever it is handed", () => {
  for (const bad of [undefined, null, 123, {}, []]) {
    assert.doesNotThrow(() => athleteFromPath(bad as unknown as string), JSON.stringify(bad));
  }
});

// --- the 404 has to actually do it -------------------------------------------

const code = (src: string) =>
  readFileSync(src, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

/**
 * GitHub Pages serves 404.html for any path it has no file for, and Next
 * exports app/not-found.tsx as that file. If the 404 does not look at the
 * address it was reached by, a profile published since the last build is a
 * dead link — which is the whole bug.
 */
test("the 404 page recognises an athlete address and answers it", () => {
  const view = code("components/NotFoundView.tsx");
  assert.match(view, /athleteFromPath\(window\.location\.pathname\)/,
    "the 404 never looks at the address it was reached by");
  assert.match(view, /<AthleteFallback/, "nothing renders the athlete");
  // REPLACES the 404 body rather than sitting above it: two answers to one
  // address, one of them wrong.
  assert.match(view, /if \(athleteFound !== false && isAthleteAddress\(\)\) \{\s*\n\s*return \(/,
    "the 404 body and the athlete page can be on screen together, or the page flashes 'not found' first");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FALLBACK READS THE VIEW, NEVER THE TABLE.
 *
 * public_athletes exists precisely so that publishing a profile cannot publish
 * anything else: it selects five columns and excludes every health, food and
 * body column by construction. A client-side path that queried `profiles`
 * directly would be relying on RLS to do the same job, from a page anybody can
 * reach without signing in.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the live lookup goes through the public view and reads nothing else", () => {
  const fallback = code("components/AthleteFallback.tsx");
  assert.match(fallback, /from\("public_athletes"\)/, "it does not use the public view");
  assert.ok(!/from\("profiles"\)/.test(fallback), "it reads the profiles table directly");
  assert.match(fallback, /\.eq\("username", username\)/, "it fetches more than the one athlete asked for");

  // The same five columns the built page has, and no more.
  const selected = /\.select\("([^"]+)"\)/.exec(fallback)?.[1] ?? "";
  assert.deepEqual(
    selected.split(",").map((c) => c.trim()).sort(),
    ["created_at", "position", "sport", "username", "xp"],
    "the live page shows a different set of facts from the built one",
  );
});

test("a username that is not one never reaches the database", () => {
  const fallback = code("components/AthleteFallback.tsx");
  // The parser is the gate. Querying on a raw pathname would put whatever is
  // in the address bar into a filter.
  assert.match(fallback, /athleteFromPath\(/, "the address goes to the database unparsed");
  assert.match(fallback, /if \(!username\) return;/, "an unrecognised address is still looked up");
});
