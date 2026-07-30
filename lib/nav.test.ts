// Navigation labels, and whether the page you land on agrees with them.
//
// The old set couldn't be guessed by anyone who hadn't built the app: "Train"
// opened video analysis while the place you actually train was "Coach", and
// "Journal" was a daily check-in. Worse, the pages disagreed with the nav —
// you tapped "Coach" and arrived at a heading saying something else. That
// mismatch is most of what "confusing" means in practice, and nothing caught
// it because labels are just strings in two unrelated files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NAV_ITEMS, MOBILE_NAV, MOBILE_MORE, COACH_NAV } from "../components/nav-items";
import tailwind from "../tailwind.config";

const page = (route: string) =>
  readFileSync(new URL(`../app/(app)${route}/page.tsx`, import.meta.url), "utf8");

test("every mobile destination exists in the full nav", () => {
  const known = new Map(NAV_ITEMS.map((i) => [i.href, i.label]));
  for (const item of [...MOBILE_NAV, ...MOBILE_MORE]) {
    assert.ok(known.has(item.href), `${item.href} is reachable on mobile but missing from NAV_ITEMS`);
    assert.equal(
      item.label,
      known.get(item.href),
      `${item.href} is called "${item.label}" on mobile and "${known.get(item.href)}" on desktop`
    );
  }
});

test("mobile reaches everything the desktop nav does", () => {
  const onMobile = new Set([...MOBILE_NAV, ...MOBILE_MORE].map((i) => i.href));
  for (const item of NAV_ITEMS) {
    assert.ok(onMobile.has(item.href), `${item.href} is unreachable on a phone — it's in no tab and no More sheet`);
  }
});

test("the mobile bar stays small enough to read", () => {
  // Four tabs plus More. Five equal-weight choices is a menu, not a bar.
  // Five plus More. Raised from four to give Injury a tab, after two rounds of
  // "still can't find it" — but six slots on a 343px phone is about 57px each,
  // which is the floor for an icon and a readable label. Six tabs would not fit.
  assert.ok(MOBILE_NAV.length <= 5, `${MOBILE_NAV.length} primary tabs plus More is too many for a phone`);
});

test("no destination is listed twice", () => {
  const all = [...MOBILE_NAV, ...MOBILE_MORE].map((i) => i.href);
  assert.equal(new Set(all).size, all.length, "a route appears in both the tab bar and the More sheet");
});

// The pages themselves. Checked by reading the source for the <h1>, because
// these are client components with data fetching and rendering them in a test
// would need a browser and a database.
const TITLE_SHOULD_MATCH: { route: string; label: string }[] = [
  { route: "/coach", label: "My plan" },
  { route: "/journal", label: "Check in" },
  { route: "/dashboard", label: "Progress" },
  { route: "/train", label: "Video analysis" },
  { route: "/nutrition", label: "Nutrition" },
  { route: "/rewards", label: "Rewards" },
  { route: "/profile", label: "Profile" },
];

test("each page's heading matches the nav label that leads there", () => {
  for (const { route, label } of TITLE_SHOULD_MATCH) {
    const navLabel = NAV_ITEMS.find((i) => i.href === route)?.label;
    assert.equal(navLabel, label, `NAV_ITEMS for ${route} says "${navLabel}", this test expects "${label}"`);
    assert.ok(
      page(route).includes(`>${label}</h1>`),
      `nav says "${label}" but ${route} renders a different <h1> — tapping a label should land on that word`
    );
  }
});

test("every page says what it is for", () => {
  // A bare title leaves someone who doesn't already know the feature with
  // nothing to read. One sentence under the heading is the whole fix.
  for (const { route } of TITLE_SHOULD_MATCH) {
    const src = page(route);
    const hasLead = /<\/h1>\s*(\{[^}]*\}\s*)?<p/.test(src) || /<h1[\s\S]{0,400}?<p className="mt-1/.test(src);
    assert.ok(hasLead, `${route} has a heading with no sentence explaining what the page is for`);
  }
});

// --- the coach entry -------------------------------------------------------
// /squad is the whole coach product and had NO navigation entry: the only route
// in was a link on the Profile page. These guard the fix, and guard against the
// obvious wrong fix of putting it in the athlete nav where it opens a wall.

test("the coach nav is not shown to athletes", () => {
  // Typed as string, not the athlete routes' literal union — the whole point is
  // to ask about a route that must NOT be in it, which the narrow type forbids.
  const athleteRoutes = new Set<string>([...NAV_ITEMS, ...MOBILE_NAV, ...MOBILE_MORE].map((i) => i.href));
  for (const item of COACH_NAV) {
    assert.ok(
      !athleteRoutes.has(item.href),
      `${item.href} is in the athlete nav — most users aren't coaches, and a tab that opens a "coaches only" wall is worse than no tab`
    );
  }
});

test("the coach nav has a label and an icon that exists", () => {
  const icons = readFileSync(new URL("../components/nav-items.tsx", import.meta.url), "utf8");
  for (const item of COACH_NAV) {
    assert.ok(item.label.length > 2, `${item.href} needs a real label`);
    assert.ok(
      icons.includes(`case "${item.icon}":`),
      `icon "${item.icon}" has no case in NavIcon, so it renders as nothing`
    );
  }
});

test("every nav icon resolves", () => {
  // A missing case falls through and renders blank — a nav entry with no icon
  // and no error is the kind of thing nobody notices until a screenshot.
  const icons = readFileSync(new URL("../components/nav-items.tsx", import.meta.url), "utf8");
  for (const item of [...NAV_ITEMS, ...MOBILE_NAV, ...MOBILE_MORE, ...COACH_NAV]) {
    assert.ok(icons.includes(`case "${item.icon}":`), `icon "${item.icon}" (${item.href}) has no case in NavIcon`);
  }
});

test("injury has one name everywhere, not three", () => {
  // It was a tab called "Injury & rehab", a tile called "Injury & mobility" and
  // very nearly a nav entry called "Injury". One destination, one name — the
  // rule the rest of this file enforces, applied to the page that most needed
  // finding.
  const nav = NAV_ITEMS.find((i) => i.href === "/injury");
  assert.ok(nav, "/injury is missing from the nav — it was buried as a tab for exactly this reason");
  assert.equal(nav!.label, "Injury");
  assert.ok(
    page("/injury").includes(`>${nav!.label}</h1>`),
    "the page heading doesn't match the nav label that leads there"
  );
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
