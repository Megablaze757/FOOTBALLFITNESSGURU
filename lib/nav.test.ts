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
import { NAV_ITEMS, MOBILE_NAV, MOBILE_MORE } from "../components/nav-items";

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
  assert.ok(MOBILE_NAV.length <= 4, `${MOBILE_NAV.length} primary tabs plus More is too many for a phone`);
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
