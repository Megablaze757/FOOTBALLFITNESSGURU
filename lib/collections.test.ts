import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTIONS,
  MIN_MEMBERS,
  collectionSlugs,
  collectionSummary,
  findCollection,
  membersOf,
  publishableCollections,
  recipeFacts,
  slugLooksRight,
  type Collection,
  type RecipeFacts,
} from "./collections";

test("every slug is a usable URL and no two collide", () => {
  const seen = new Set<string>();
  for (const c of COLLECTIONS) {
    assert.ok(slugLooksRight(c), `${c.slug} is not a clean slug`);
    assert.ok(!seen.has(c.slug), `${c.slug} is declared twice`);
    seen.add(c.slug);
  }
});

test("nothing gets published without enough recipes behind it", () => {
  for (const { collection, members } of publishableCollections()) {
    assert.ok(members.length >= MIN_MEMBERS,
      `${collection.slug} published with only ${members.length}`);
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE GATE HAS TO BE ABLE TO SHUT.
 *
 * A rule nothing ever trips is decoration. The first run of this file caught
 * cheap-high-protein-meals at eleven, which is how the £2 threshold got looked
 * at in the first place. So the test does not merely assert the survivors are
 * fat enough — it proves a thin collection is genuinely unreachable, because
 * being absent from an index page is not the same as not having a URL.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a thin collection has no page at all, not merely no link", () => {
  const thin: Collection = {
    slug: "impossible-collection",
    title: "Impossible",
    blurb: "Nothing matches this.",
    match: (f) => f.protein > 10_000,
    rank: (a, b) => b.protein - a.protein,
  };
  assert.equal(membersOf(thin).length, 0);

  const barelyThin: Collection = { ...thin, match: (f) => f.protein >= 30 && f.cost > 0 && f.cost <= 1.2 };
  assert.ok(membersOf(barelyThin).length < MIN_MEMBERS,
    "the fixture stopped being thin — pick a tighter filter");

  for (const slug of collectionSlugs()) {
    assert.ok(membersOf(COLLECTIONS.find((c) => c.slug === slug)!).length >= MIN_MEMBERS);
  }
  assert.equal(findCollection("impossible-collection"), null);
  assert.equal(findCollection("no-such-collection"), null);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE COPY IS A PROMISE AND THE FILTER IS THE ONLY THING THAT KEEPS IT.
 *
 * "Under £3 a serving" is written by hand; `f.cost <= 3` is what actually
 * decides. Nothing but this test stops the two drifting apart, and a page that
 * says £3 over a list containing a £4 dinner is worse than no page — it is the
 * kind of wrong a reader notices and a crawler eventually does too.
 *
 * So every number that appears in a title or blurb is read back out of the
 * copy and checked against every recipe on the page. Change the threshold
 * without changing the sentence and this goes red.
 * ═══════════════════════════════════════════════════════════════════════════
 */
interface Claim {
  what: string;
  holds: (f: RecipeFacts) => boolean;
}

/** Only patterns that are unambiguous — a number nobody can read back is not checked. */
function claimsIn(c: Collection): Claim[] {
  const copy = `${c.title}. ${c.blurb}`;
  const claims: Claim[] = [];

  for (const [, g] of copy.matchAll(/(\d+)\s*g\b/g)) {
    const floor = Number(g);
    claims.push({ what: `${floor}g of protein`, holds: (f) => f.protein >= floor });
  }
  for (const [, p] of copy.matchAll(/£(\d+(?:\.\d+)?)/g)) {
    const cap = Number(p);
    claims.push({ what: `under £${p} a serving`, holds: (f) => f.cost > 0 && f.cost <= cap });
  }
  for (const [, k] of copy.matchAll(/(\d+) calories or more/g)) {
    const floor = Number(k);
    claims.push({ what: `${floor} calories or more`, holds: (f) => f.kcal >= floor });
  }
  for (const [, k] of copy.matchAll(/(?:under|inside) (\d+) calories/g)) {
    const cap = Number(k);
    claims.push({ what: `under ${cap} calories`, holds: (f) => f.kcal <= cap });
  }
  for (const [, m] of copy.matchAll(/in (\d+) minutes/g)) {
    const cap = Number(m);
    claims.push({ what: `in ${cap} minutes`, holds: (f) => f.minutes > 0 && f.minutes <= cap });
  }
  return claims;
}

test("every number in the copy is true of every recipe on the page", () => {
  let checked = 0;
  let covered = 0;

  for (const { collection, members } of publishableCollections()) {
    const claims = claimsIn(collection);
    if (claims.length > 0) covered++;
    for (const claim of claims) {
      checked++;
      for (const f of members) {
        assert.ok(claim.holds(f),
          `${collection.slug} promises "${claim.what}" but lists ${f.meal.name} ` +
          `(${f.protein.toFixed(1)}g, £${f.cost.toFixed(2)}, ${Math.round(f.kcal)} kcal, ${f.minutes} min)`);
      }
    }
  }

  // Without these the test would pass by reading nothing at all.
  assert.ok(checked >= 8, `only ${checked} claims were read out of the copy`);
  assert.ok(covered >= publishableCollections().length - 2,
    `${covered} of ${publishableCollections().length} collections had a checkable number`);
});

test("the dietary collections exclude what they say they exclude", () => {
  const banned: Record<string, string[]> = {
    "vegetarian-high-protein": ["meat", "pork", "fish"],
    "vegan-high-protein": ["meat", "pork", "fish", "dairy", "egg", "honey"],
    "gluten-free-high-protein": ["gluten"],
  };
  for (const [slug, tags] of Object.entries(banned)) {
    const found = findCollection(slug);
    assert.ok(found, `${slug} is not published`);
    for (const f of found.members) {
      for (const tag of tags) {
        assert.ok(!f.tags.includes(tag as never),
          `${slug} lists ${f.meal.name}, which is tagged ${tag}`);
      }
    }
  }
});

test("best is first", () => {
  for (const { collection, members } of publishableCollections()) {
    for (let i = 1; i < members.length; i++) {
      assert.ok(collection.rank(members[i - 1], members[i]) <= 0,
        `${collection.slug} is out of order at ${i}`);
    }
  }
});

/** The intro replaces one a model would have written, so it has to be true. */
test("the computed summary states facts that are actually true of the list", () => {
  assert.equal(collectionSummary([]), "");

  for (const { collection, members } of publishableCollections()) {
    const summary = collectionSummary(members);
    assert.match(summary, new RegExp(`^${members.length} recipes\\.`),
      `${collection.slug} miscounts itself`);

    const cheapest = Math.min(...members.map((m) => m.cost));
    const most = Math.max(...members.map((m) => m.protein));
    assert.ok(summary.includes(`£${cheapest.toFixed(2)}`),
      `${collection.slug} names a cheapest that is not the cheapest`);
    assert.ok(summary.includes(`${Math.round(most)}g`),
      `${collection.slug} names a protein high that is not the highest`);

    const named = members.find((m) => summary.includes(m.meal.name.toLowerCase()));
    assert.ok(named, `${collection.slug} names a recipe that is not on the page`);
  }
});

test("recipe facts are computed once and stay consistent", () => {
  const a = recipeFacts();
  const b = recipeFacts();
  assert.equal(a, b, "facts are recomputed on every call");
  for (const f of a) {
    assert.ok(f.kcal > 0, `${f.meal.name} has no calories`);
    assert.ok(f.protein >= 0);
    assert.ok(f.cost >= 0);
    assert.equal(f.proteinPerPound > 0, f.cost > 0 && f.protein > 0,
      `${f.meal.name} has a protein-per-pound that disagrees with its cost`);
  }
});
