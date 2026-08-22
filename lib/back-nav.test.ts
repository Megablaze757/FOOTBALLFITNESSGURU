// The way back out of every page that is not a tab.
//
// With four tabs, everything else is reached from a chip, a card or a deep
// link — and the only route out was the tab bar, which takes you to a DIFFERENT
// section rather than the one you came from. Eight pages had a hand-written
// back link, seventeen had none, and the eight did not agree on where back went.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { parentOf, MOBILE_NAV, NAV_ITEMS, SECTION_LINKS } from "../components/nav-items";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

/** Every route under app/(app), which is every page inside the shell. */
function appRoutes(dir = "../app/(app)", prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const route = `${prefix}/${entry.name}`;
    const files = readdirSync(new URL(`${dir}/${entry.name}`, import.meta.url));
    if (files.includes("page.tsx")) out.push(route);
    out.push(...appRoutes(`${dir}/${entry.name}`, route));
  }
  return out;
}

test("a tab is where back goes, so it has no back of its own", () => {
  for (const tab of MOBILE_NAV) {
    assert.equal(parentOf(tab.href), null, `${tab.href} offers a way back out of a primary tab`);
  }
  assert.equal(parentOf("/home"), null, "Home offers a way back to somewhere");
});

test("every other page has one, and it goes somewhere real", () => {
  const known = new Set(appRoutes());
  const orphans: string[] = [];
  for (const route of known) {
    if (MOBILE_NAV.some((t) => t.href === route) || route === "/home") continue;
    const back = parentOf(route);
    if (!back) { orphans.push(`${route} has no way back`); continue; }
    if (!known.has(back.href)) orphans.push(`${route} goes back to ${back.href}, which is not a page`);
    if (!back.label || back.label === "Back") orphans.push(`${route} goes back to an unnamed destination`);
  }
  assert.deepEqual(orphans, []);
});

test("back goes to the section the page is listed under", () => {
  // Not to history. Half the ways into these pages are deep links and
  // notification taps, where the previous entry is another site or nothing.
  for (const [section, links] of Object.entries(SECTION_LINKS)) {
    for (const link of links) {
      const path = link.href.split("?")[0];
      // A page can appear on more than one section's row; the first wins, and
      // what matters is that it lands on a section that really lists it.
      const back = parentOf(path);
      assert.ok(back, `${path} is on ${section}'s row and has no way back`);
      const listedThere = SECTION_LINKS[back!.href]?.some((l) => l.href.split("?")[0] === path);
      assert.ok(listedThere, `${path} goes back to ${back!.href}, which does not list it`);
    }
  }
});

test("a sub-route walks up rather than being dumped on Home", () => {
  assert.deepEqual(parentOf("/train/view"), { href: "/train", label: "Video analysis" });
});

test("the header renders it, and the page-level copies are desktop only", () => {
  const header = read("../components/AppHeader.tsx");
  assert.match(header, /parentOf\(/, "the header does not offer a way back");

  // Two identical "← Performance" links an inch apart read as a bug.
  const backLink = read("../components/BackLink.tsx");
  assert.match(backLink, /hidden[^"]*lg:inline-flex/, "BackLink still shows on mobile alongside the header's");
});

test("the floating home button does not appear on Home", () => {
  // A button that takes you where you already are teaches people the controls
  // do not mean anything.
  const bubble = read("../components/HomeBubble.tsx");
  assert.match(bubble, /pathname === "\/home"/);
  assert.match(bubble, /return null/);
  // And it is not stacked under the coach, which would make one of them a
  // mis-tap waiting to happen.
  assert.match(bubble, /left-4/);
  const coach = read("../components/CoachBubble.tsx");
  assert.match(coach, /right-4/);
});

test("the layout mounts both", () => {
  const layout = read("../app/(app)/layout.tsx");
  assert.match(layout, /<HomeBubble \/>/);
  assert.match(layout, /<AppHeader \/>/);
});

test("every destination back offers is a name the nav already uses", () => {
  // "← Training" has to be the same word as the tab, or the athlete is being
  // sent to a place the app calls something else.
  // Typed as string: the point is to look up routes that may NOT be in the
  // list, which the literal union of hrefs forbids.
  const labels = new Map<string, string>(NAV_ITEMS.map((i) => [i.href as string, i.label as string]));
  for (const route of appRoutes()) {
    const back = parentOf(route);
    if (!back || !labels.has(back.href)) continue;
    assert.equal(back.label, labels.get(back.href), `${route} calls ${back.href} "${back.label}"`);
  }
});
