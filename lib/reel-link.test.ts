import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reelHref, parseReelHash, reelKindFor, REEL_ANCHOR } from "./reel-link";
import { REEL_KINDS } from "./reel-kinds";
import { plannedPosts } from "./post-plan";

const isKind = (k: string) => REEL_KINDS.some((r) => r.id === k);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SCHEDULE SAID WHAT TO POST AND THE STUDIO MADE IT. THEY DID NOT SPEAK.
 *
 * A row names "Five-spot shooting" and says the asset is a drill card. Getting
 * to the thing that builds one meant scrolling past three panels, choosing the
 * right kind, and retyping the name — three steps between a plan and the thing
 * it planned, every time, which is three chances to do something else.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a link round-trips the kind and the subject", () => {
  for (const kind of REEL_KINDS.map((k) => k.id)) {
    const target = { kind, query: "Five-spot shooting (Basketball)" };
    assert.deepEqual(parseReelHash(reelHref(target), isKind), target);
  }
});

test("subjects with characters a URL cares about survive the trip", () => {
  for (const q of ["Chicken & rice", "30g protein: what it costs", "Bench press — 100kg?", "a/b test", "#1 drill"]) {
    assert.equal(parseReelHash(reelHref({ kind: "recipe", query: q }), isKind)?.query, q);
  }
});

/**
 * This is the address bar: anybody can type into it. An unknown kind must not
 * fall back to a default — showing the wrong picker confidently is worse than
 * showing none, and it would look like the link was right.
 */
test("a hash it cannot trust produces nothing, never a guess", () => {
  for (const bad of [
    "", "#", "#something-else", `#${REEL_ANCHOR}`, `#${REEL_ANCHOR}?kind=nonsense&q=x`,
    `#${REEL_ANCHOR}?q=no-kind`, `#${REEL_ANCHOR}?kind=&q=x`, "#reel-studio-other?kind=drill",
    /**
     * ANOTHER FEATURE'S HASH, THE SAME LENGTH AS OURS.
     *
     * Every case above rejects even with the anchor check removed, because the
     * slice offset then lands mid-word and nothing parses — so a mutation that
     * deleted the check passed. This one is exactly eleven characters before
     * the "?", so without the check it slices cleanly to "kind=drill&q=y" and
     * hijacks an unrelated fragment.
     */
    "#notreelstud?kind=drill&q=y",
  ]) {
    assert.equal(parseReelHash(bad, isKind), null, `"${bad}" produced a target`);
  }
});

test("a query is capped rather than trusted", () => {
  const long = parseReelHash(`#${REEL_ANCHOR}?kind=drill&q=${"x".repeat(500)}`, isKind);
  assert.equal(long?.query.length, 120);
});

/**
 * Only where a reel is honestly the asset. "Text only" is a caption, and a
 * link to a picker with nothing in it is worse than no link at all.
 */
test("only the assets that are actually reels get offered", () => {
  assert.equal(reelKindFor("Drill card"), "drill");
  assert.equal(reelKindFor("Recipe card"), "recipe");
  assert.equal(reelKindFor("App demo"), "demo");
  assert.equal(reelKindFor("Text only"), null);
  assert.equal(reelKindFor("Reel"), null, "an unmapped asset must not guess a kind");

  // And every kind it can return is a kind the studio actually has.
  for (const asset of ["Drill card", "Recipe card", "App demo"] as const) {
    assert.ok(isKind(reelKindFor(asset)!), `${asset} maps to a kind the studio does not offer`);
  }
});

/** A link is only useful if the subject finds something in the picker. */
test("a planned subject matches the studio's own search", () => {
  const posts = plannedPosts("2026-09-07", 30).filter((p) => reelKindFor(p.asset));
  assert.ok(posts.length > 0, "no planned post is ever filmable — the mapping reaches nothing");
  for (const post of posts.slice(0, 6)) {
    const target = parseReelHash(reelHref({ kind: reelKindFor(post.asset)!, query: post.subject }), isKind)!;
    assert.ok(target.query.length > 2, `${post.date} sends an empty search`);
  }
});

/** And both ends have to be wired, or this is a library nothing calls. */
test("the schedule links to the studio, and the studio listens", () => {
  const engine = readFileSync(new URL("../components/ContentEngine.tsx", import.meta.url), "utf8");
  assert.match(engine, /reelHref\(\{ kind: reelKindFor\(post\.asset\)!, query: post\.subject \}\)/,
    "the schedule rows do not link to the studio");
  assert.match(engine, /reelKindFor\(post\.asset\) &&/, "a Text-only row is offered a reel it cannot make");

  const studio = readFileSync(new URL("../components/ReelStudio.tsx", import.meta.url), "utf8");
  assert.match(studio, /parseReelHash\(window\.location\.hash/, "the studio ignores the link");
  assert.match(studio, /addEventListener\("hashchange"/,
    "clicking a second row changes only the fragment, so without this the studio keeps the first");
  assert.match(studio, new RegExp(`id=\\{REEL_ANCHOR\\}`), "there is nothing for the browser to scroll to");
});
