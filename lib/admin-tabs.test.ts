import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initialTab, tabForAnchor, type TabDef } from "./admin-tabs";
import { REEL_ANCHOR } from "./reel-link";

const TABS: TabDef[] = [
  { id: "make", label: "Make", anchors: ["reel-studio", "reel-library"] },
  { id: "plan", label: "Plan", anchors: ["schedule"] },
  { id: "reach", label: "Reach" },
];

test("an anchor is found in the tab that owns it", () => {
  assert.equal(tabForAnchor(TABS, "reel-studio"), "make");
  assert.equal(tabForAnchor(TABS, "#reel-studio"), "make");
  assert.equal(tabForAnchor(TABS, "#schedule"), "plan");
  assert.equal(tabForAnchor(TABS, "#nothing"), null);
  assert.equal(tabForAnchor(TABS, ""), null);
  assert.equal(tabForAnchor(TABS, "#"), null);
});

/**
 * reelHref() builds "#reel-studio?kind=drill&q=Five-spot%20shooting" — the
 * anchor carries a query so the studio knows what to start on. Matching the
 * whole string would find no tab and drop the person on the default one.
 */
test("an anchor carrying a query still finds its tab", () => {
  assert.equal(tabForAnchor(TABS, `#${REEL_ANCHOR}?kind=drill&q=Five-spot%20shooting`), "make");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A LINK BEATS A MEMORY.
 *
 * Following a link is something somebody just did. A remembered tab is a guess
 * about what they want now, and the guess must not win — otherwise the
 * schedule's "build this" link lands on whichever tab they last used, which is
 * the feature quietly not working.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a link outranks the tab they were last on", () => {
  assert.equal(initialTab(TABS, "#reel-studio", "reach"), "make");
  assert.equal(initialTab(TABS, "#schedule", "make"), "plan");
});

test("with no link, the tab they were last on wins", () => {
  assert.equal(initialTab(TABS, null, "reach"), "reach");
  assert.equal(initialTab(TABS, "", "plan"), "plan");
  assert.equal(initialTab(TABS, "#unknown-anchor", "reach"), "reach");
});

test("with neither, the page opens on what it is for", () => {
  assert.equal(initialTab(TABS, null, null), "make");
  assert.equal(initialTab(TABS, null, "a-tab-that-was-removed"), "make");
  assert.equal(initialTab([], null, null), "");
});

// --- the page has to hold up its end -----------------------------------------

/**
 * Every anchor a tab claims has to be one the page actually renders, and every
 * anchor something links TO has to be claimed by a tab. A link into a panel no
 * tab owns is a link that opens the wrong one.
 */
test("the anchors the social page claims are the anchors that exist", () => {
  const page = readFileSync("app/admin/social/page.tsx", "utf8");
  assert.match(page, /AdminTabs/, "the social page is still one long scroll");

  /**
   * The CONSTANT, not a copy of its value.
   *
   * The page writes `anchors: [REEL_ANCHOR]`, which is the right way round:
   * a string literal here could drift from lib/reel-link.ts and the drift
   * would be invisible — the tab would simply stop claiming the anchor and the
   * schedule's link would open the wrong panel, silently.
   *
   * So this checks the page imports it and puts it in an anchors list, rather
   * than checking for the text "reel-studio" and thereby preferring the copy.
   */
  const claimed = [...page.matchAll(/anchors: \[([^\]]*)\]/g)].map((m) => m[1]);
  assert.ok(claimed.length > 0, "no tab claims any anchor, so deep links cannot work");
  assert.ok(
    claimed.some((list) => list.includes("REEL_ANCHOR")),
    `nothing claims REEL_ANCHOR ("${REEL_ANCHOR}") — the schedule's "build this" link would open the wrong tab`,
  );
  assert.match(page, /import \{ REEL_ANCHOR \}/, "REEL_ANCHOR is used without being imported from its own module");
});

/**
 * The shell has to USE the arbitration, not just contain it.
 *
 * Everything above tests initialTab in isolation, and none of it would notice
 * AdminTabs opening tabs[0] every time — which looks correct on first load and
 * quietly breaks both the remembered choice and the schedule's link.
 */
test("the tab bar opens the tab the link or the memory asked for", () => {
  const shell = readFileSync("components/admin/AdminShell.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.match(shell, /setActive\(initialTab\(tabs, window\.location\.hash, remembered\)\)/,
    "the tab bar picks its own tab instead of asking initialTab");
  // A link followed while the page is already open changes only the hash.
  assert.match(shell, /addEventListener\("hashchange"/,
    "a link followed from another tab updates the URL and shows nothing");
  assert.match(shell, /tabForAnchor\(tabs, window\.location\.hash\)/,
    "the hash listener does not work out which tab was linked to");
});
