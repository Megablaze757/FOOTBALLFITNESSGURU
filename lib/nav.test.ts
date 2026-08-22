// Navigation: what's in the bar, how many taps anything costs, and whether the
// page you land on agrees with the label that sent you.
//
// The old set couldn't be guessed by anyone who hadn't built the app, and the
// pages disagreed with the nav — you tapped "Coach" and arrived at a heading
// saying something else. That mismatch is most of what "confusing" means in
// practice, and nothing caught it because labels are just strings in two
// unrelated files.
//
// THEN IT GREW A "MORE" SHEET. Five tabs plus a "…" button holding seven more
// destinations, four of which (/library, /train, /essentials, /history) had no
// other link anywhere in the app. A menu of everything you didn't have room
// for is where features go to stop being used. These tests are what stops it
// coming back: four tabs, no sheet, and a hard ceiling of two taps to anything.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NAV_ITEMS, MOBILE_NAV, HEADER_NAV, SECTION_LINKS, COACH_NAV } from "../components/nav-items";
import tailwind from "../tailwind.config";

const page = (route: string) =>
  readFileSync(new URL(`../app/(app)${route}/page.tsx`, import.meta.url), "utf8");
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** SECTION_LINKS may deep-link (`/library?tab=meals`); the destination is the path. */
const route = (href: string) => href.split("?")[0];

const oneTap = new Set<string>([...MOBILE_NAV, ...HEADER_NAV].map((i) => i.href));
const twoTaps = new Set<string>(Object.values(SECTION_LINKS).flat().map((l) => route(l.href)));

test("the bar is four tabs, and there is no fifth slot", () => {
  // Four is the number the whole design rests on: it is what let the labels go
  // back to full words ("Recovery", "Performance") after five tabs had forced
  // them down to "Check" and "Plan", and it is what makes a More sheet
  // unnecessary rather than merely unfashionable.
  assert.equal(MOBILE_NAV.length, 4, `${MOBILE_NAV.length} primary tabs — the design is four`);
});

test("nothing is reachable only from a drawer", () => {
  // The rule the More sheet broke. Every destination in the nav model is either
  // in the bottom bar, in the top bar, or on the section it belongs to.
  for (const item of NAV_ITEMS) {
    const taps = oneTap.has(item.href) ? 1 : twoTaps.has(item.href) ? 2 : Infinity;
    assert.ok(
      taps <= 2,
      `${item.href} ("${item.label}") is in no tab, no header and no section row — it is unreachable`
    );
  }
});

test("the More sheet is gone from the tab bar", () => {
  // Deleting the list without deleting the button would leave a "…" that opens
  // nothing, which is worse than the sheet was.
  const bar = source("components/TabBar.tsx");
  assert.ok(!/setMoreOpen|MOBILE_MORE/.test(bar), "TabBar still has the More sheet wired up");
  assert.ok(!/>More</.test(bar), "TabBar still renders a More button");
});

test("the header that carries Home and Profile is actually mounted", () => {
  // Both were moved out of the sheet and into the top bar. If the bar isn't
  // rendered, the two most-used destinations in the app have no link at all.
  const layout = source("app/(app)/layout.tsx");
  assert.ok(layout.includes("<AppHeader />"), "AppHeader is not mounted — Home and Profile are unreachable on a phone");
  const header = source("components/AppHeader.tsx");
  for (const item of HEADER_NAV) {
    assert.ok(header.includes("HEADER_NAV"), "AppHeader hard-codes its links instead of reading HEADER_NAV");
    assert.ok(NAV_ITEMS.some((n) => n.href === item.href), `${item.href} is in the header but not in NAV_ITEMS`);
  }
});

test("every section row hangs off a tab that exists", () => {
  const tabs = new Set<string>(MOBILE_NAV.map((t) => t.href));
  for (const key of Object.keys(SECTION_LINKS)) {
    assert.ok(tabs.has(key), `SECTION_LINKS has a row for ${key}, which is not one of the four tabs`);
  }
  // And every one of the four gets a row, so no tab is a dead end.
  for (const tab of MOBILE_NAV) {
    assert.ok(SECTION_LINKS[tab.href]?.length, `${tab.href} has no section row — nothing else in that domain is findable from it`);
  }
});

test("a destination has one name wherever it is offered", () => {
  // The bar, the header and the section rows are three separate lists of the
  // same routes. Two names for one place reads as two places.
  const known = new Map<string, string>(NAV_ITEMS.map((i) => [i.href, i.label]));
  for (const item of [...MOBILE_NAV, ...HEADER_NAV]) {
    assert.equal(
      item.label,
      known.get(item.href),
      `${item.href} is called "${item.label}" in the bar and "${known.get(item.href)}" in NAV_ITEMS`
    );
  }
  for (const [section, links] of Object.entries(SECTION_LINKS)) {
    for (const link of links) {
      assert.ok(known.has(route(link.href)), `${link.href} is offered on ${section} but is not a known destination`);
    }
  }
});

test("no route is offered twice on the same screen", () => {
  const bar = MOBILE_NAV.map((i) => i.href);
  assert.equal(new Set(bar).size, bar.length, "a route appears twice in the tab bar");
  for (const [section, links] of Object.entries(SECTION_LINKS)) {
    const hrefs = links.map((l) => l.href);
    assert.equal(new Set(hrefs).size, hrefs.length, `${section} lists the same route twice`);
    assert.ok(
      !hrefs.some((h) => route(h) === section),
      `${section} links to itself in its own section row`
    );
  }
});

// The pages themselves. Checked by reading the source for the <h1>, because
// these are client components with data fetching and rendering them in a test
// would need a browser and a database.
const TITLE_SHOULD_MATCH: { route: string; label: string }[] = [
  { route: "/coach", label: "Training" },
  { route: "/nutrition", label: "Food" },
  { route: "/injury", label: "Recovery" },
  { route: "/dashboard", label: "Performance" },
  { route: "/journal", label: "Today's log" },
  { route: "/library", label: "Exercises" },
  { route: "/train", label: "Video analysis" },
  { route: "/rewards", label: "Rewards" },
  { route: "/profile", label: "Profile" },
];

test("each page's heading matches the nav label that leads there", () => {
  for (const { route: r, label } of TITLE_SHOULD_MATCH) {
    const navLabel = NAV_ITEMS.find((i) => i.href === r)?.label;
    assert.equal(navLabel, label, `NAV_ITEMS for ${r} says "${navLabel}", this test expects "${label}"`);
    const heading = label.replace(/'/g, "&apos;");
    const src = page(r);
    assert.ok(
      src.includes(`>${label}</h1>`) || src.includes(`>${heading}</h1>`),
      `nav says "${label}" but ${r} renders a different <h1> — tapping a label should land on that word`
    );
  }
});

test("every page says what it is for", () => {
  // A bare title leaves someone who doesn't already know the feature with
  // nothing to read. One sentence under the heading is the whole fix.
  for (const { route: r } of TITLE_SHOULD_MATCH) {
    const src = page(r);
    const hasLead = /<\/h1>\s*(\{[^}]*\}\s*)?<p/.test(src) || /<h1[\s\S]{0,400}?<p className="mt-1/.test(src);
    assert.ok(hasLead, `${r} has a heading with no sentence explaining what the page is for`);
  }
});

test("Recovery still says the word people arrive looking for", () => {
  // The tab was widened from "Injury" to "Recovery" so it isn't a tab you only
  // tap when something already hurts. That trade is only safe while the page
  // itself is still obviously the injury page — it was reported unfindable
  // twice under a narrower name, and a broader one could repeat that.
  const src = page("/injury");
  const lead = src.slice(src.indexOf("</h1>"), src.indexOf("</h1>") + 600);
  assert.ok(/injury/i.test(lead), "the Recovery lead never says \"injury\" — the page goes back to being unfindable");
});

test("the coach nav is not shown to athletes", () => {
  // Typed as string, not the athlete routes' literal union — the whole point is
  // to ask about a route that must NOT be in it, which the narrow type forbids.
  const athleteRoutes = new Set<string>([
    ...NAV_ITEMS.map((i) => i.href),
    ...MOBILE_NAV.map((i) => i.href),
    ...Object.values(SECTION_LINKS).flat().map((l) => route(l.href)),
  ]);
  for (const item of COACH_NAV) {
    assert.ok(
      !athleteRoutes.has(item.href),
      `${item.href} is in the athlete nav — most users aren't coaches, and a tab that opens a "coaches only" wall is worse than no tab`
    );
  }
});

test("every nav icon resolves", () => {
  // A missing case falls through and renders blank — a nav entry with no icon
  // and no error is the kind of thing nobody notices until a screenshot.
  const icons = source("components/nav-items.tsx");
  const all = [...NAV_ITEMS, ...MOBILE_NAV, ...HEADER_NAV, ...COACH_NAV, ...Object.values(SECTION_LINKS).flat()];
  for (const item of all) {
    assert.ok(icons.includes(`case "${item.icon}":`), `icon "${item.icon}" (${item.href}) has no case in NavIcon`);
  }
});

test("the muted text tiers pass WCAG AA on this app's background", () => {
  // Tailwind's stock slate-500 and slate-600 do NOT pass here — 4.18:1 and
  // 2.63:1 against this background, where normal text needs 4.5:1.
  // tailwind.config.ts overrides both, and that override is the only thing
  // standing between ~185 uses of text-slate-500 and a contrast failure across
  // every hint, caption and empty state in the app.
  //
  // I twice reasoned about these colours using Tailwind's DEFAULTS and reached a
  // wrong conclusion — once declaring a passing colour a failure. This reads the
  // real config so nobody has to remember that it's overridden.
  const slate = (tailwind.theme?.extend?.colors as Record<string, Record<string, string>>)?.slate;
  assert.ok(slate, "slate is no longer overridden in tailwind.config.ts — Tailwind's defaults fail AA here");

  const lum = (h: string) => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; })
      .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  // ink-800, the card surface. The lighter of the two backgrounds text sits on,
  // so the harder of the two tests.
  const CARD = "#141416";
  for (const shade of ["500", "600"]) {
    const hex = slate[shade];
    assert.ok(hex, `slate-${shade} is not overridden — Tailwind's default fails AA here`);
    const r = ratio(hex, CARD);
    assert.ok(r >= 4.5, `slate-${shade} (${hex}) is ${r.toFixed(2)}:1 on a card — AA needs 4.5:1`);
  }
});
