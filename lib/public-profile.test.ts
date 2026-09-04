import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  publishable, isPublicUsername, membershipLength, profileTitle, profileDescription,
  MISS_PARAM, type PublicAthlete,
} from "./public-profile";
import { athletesUrl } from "./public-athletes";

const row = {
  username: "sam", sport: "football", position: "Centre back",
  xp: 4200, created_at: "2026-01-04T00:00:00Z",
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PAGE PER ATHLETE IS THE ONLY SEO SURFACE HERE THAT GROWS WITH THE PRODUCT.
 *
 * Everything else on this site was written once. But it is also the only page
 * built from somebody's own data, so the shape rules matter more than the
 * ranking does: a row that produces "/a/undefined" is worse than no page.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("only rows that could be a URL become a page", () => {
  assert.equal(publishable([row]).length, 1);
  for (const bad of [
    { ...row, username: undefined },
    { ...row, username: "" },
    { ...row, username: "a" },              // too short for the constraint
    { ...row, username: "Sam" },            // usernames are stored lowercase
    { ...row, username: "sam smith" },      // a space is not a URL
    { ...row, username: "sam__smith" },     // the constraint forbids a double
    { ...row, username: "_sam" },
    null,
    "sam",
  ]) {
    assert.deepEqual(publishable([bad]), [], `${JSON.stringify(bad)} produced a page`);
  }
  assert.deepEqual(publishable(null), [], "a failed fetch must produce no pages, not throw");
  assert.deepEqual(publishable({ username: "sam" }), [], "an object is not a list of rows");
});

test("a missing field never reaches a page as 'undefined'", () => {
  const [a] = publishable([{ username: "sam" }]);
  assert.equal(a.sport, null);
  assert.equal(a.position, null);
  assert.equal(a.xp, 0);
  assert.ok(!JSON.stringify(a).includes("undefined"));
});

test("xp that is not a number is zero, not NaN on the page", () => {
  assert.equal(publishable([{ ...row, xp: "lots" }])[0].xp, 0);
  assert.equal(publishable([{ ...row, xp: null }])[0].xp, 0);
});

test("the username rule matches the database's own constraint", () => {
  for (const ok of ["sam", "sam_smith", "a1b", "x".repeat(20)]) {
    assert.ok(isPublicUsername(ok), ok);
  }
  for (const bad of ["ab", "x".repeat(21), "Sam", "sam-smith", "sam__x", "1_"]) {
    assert.ok(!isPublicUsername(bad), bad);
  }
});

/** A join date is a fact nobody asked to publish; a duration is the useful part. */
test("how long they have been at it, without printing the date", () => {
  const now = new Date("2026-09-04T00:00:00Z");
  assert.equal(membershipLength("2026-09-01T00:00:00Z", now), "New this month");
  assert.equal(membershipLength("2026-07-20T00:00:00Z", now), "One month in");
  assert.equal(membershipLength("2026-01-04T00:00:00Z", now), "8 months in");
  assert.equal(membershipLength("2025-08-04T00:00:00Z", now), "A year in");
  assert.equal(membershipLength("2023-08-04T00:00:00Z", now), "3 years in");
  assert.equal(membershipLength("not a date", now), null);
});

test("the title and description say who and what, and never a real name", () => {
  const a = publishable([row])[0] as PublicAthlete;
  assert.equal(profileTitle(a), "@sam — Centre back, Football");
  // The root layout appends " | PocketAthlete". A title that says it too gives
  // "@sam on PocketAthlete | PocketAthlete", which is what the first one did.
  assert.ok(!/PocketAthlete/i.test(profileTitle(a)));
  assert.equal(profileTitle({ ...a, sport: null, position: null }), "@sam");
  const long = profileTitle({
    ...a, username: "x".repeat(20), position: "Attacking midfielder and left wing-back",
  });
  assert.ok(long.length <= 44, `${long.length}: ${long}`);
  assert.ok(long.startsWith("@xxx"), "the identity survives the trim");
  const d = profileDescription(a, "Gold II");
  assert.ok(d.includes("Centre back") && d.includes("Gold II"), d);
  // The label, not the column value: the page's own tags say "Football".
  assert.ok(d.includes("Football") && !d.includes("football"), d);
  assert.ok(d.length <= 160, `${d.length} characters — Google truncates around 160`);
  // No position or sport: still a sentence, not a gap.
  assert.ok(!profileDescription({ ...a, sport: null, position: null }, "Iron I").includes(" — ."));
});

/**
 * THE ONLY DESCRIPTION ON THIS SITE BUILT FROM SOMEBODY ELSE'S TYPING.
 *
 * Every other page's is written once and read once. Here a 20-character
 * username and a free-text position both land inside the template, so the
 * length is a range, not a number — and the first version of this had no clamp
 * at all because the one example it was written against happened to fit.
 */
test("a long username and a long position cannot overrun the meta limit", () => {
  const a = publishable([{
    ...row,
    username: "x".repeat(20),
    position: "Attacking midfielder and occasional left wing-back",
  }])[0] as PublicAthlete;
  const d = profileDescription(a, "Diamond III");
  assert.ok(d.length <= 160, `${d.length} characters: ${d}`);
  assert.ok(d.startsWith("@xxxx"), "the identity must survive the trim, not be trimmed away");
});

// --- what the build actually asks for ---------------------------------------

/**
 * THE SELECT LIST IS A SECURITY BOUNDARY, NOT A PERFORMANCE ONE.
 *
 * The view is what stops a private column reaching the open web, but the two
 * have to agree: a select naming a column the view does not have makes
 * PostgREST 400 the whole request, and this module swallows failures on
 * purpose — so the symptom of a mismatch is not an error, it is a deploy where
 * every athlete page silently vanishes.
 */
test("the build asks the view for exactly the columns the page renders", () => {
  const url = athletesUrl("https://real.supabase.co", "sb_publishable_x");
  assert.ok(url, "real credentials must produce a request");
  const select = new URL(url).searchParams.get("select")!.split(",").sort();
  assert.deepEqual(select, ["created_at", "position", "sport", "username", "xp"]);

  const view = readFileSync(
    new URL("../supabase/migrations/0108_public_profiles.sql", import.meta.url),
    "utf8",
  );
  // Comments stripped first. The view's own note explains that full_name is
  // never published, and a check that reads the prose fails on the sentence
  // promising the thing it is checking for.
  const body = view
    .slice(view.search(/create (or replace )?view public\.public_athletes/))
    .replace(/--[^\n]*/g, "");
  const selected = body.slice(0, body.indexOf("from public.profiles"));
  for (const column of select) {
    assert.ok(
      new RegExp(`\\b${column}\\b`).test(selected),
      `the build selects ${column} but the view does not expose it`,
    );
  }
  // And the other direction: nothing about their body, food or health.
  for (const banned of ["full_name", "weight", "height", "email", "avatar_url", "birth"]) {
    assert.ok(!selected.includes(banned), `the view exposes ${banned}`);
  }
});

/** A placeholder URL resolves, so the fetch hangs rather than failing fast. */
test("a placeholder or missing Supabase URL is never fetched", () => {
  assert.equal(athletesUrl("https://example.supabase.co", "k"), null);
  assert.equal(athletesUrl(undefined, "k"), null);
  assert.equal(athletesUrl("https://real.supabase.co", undefined), null);
  assert.equal(athletesUrl("", ""), null);
  // A trailing slash must not produce a double slash in the path.
  assert.ok(!athletesUrl("https://real.supabase.co/", "k")!.includes(".co//"));
});

/**
 * An empty list is not an empty section of the site — it is a failed export.
 * The always-present page is what stops a feature nobody has opted into from
 * breaking every build, and it can only do that if no athlete can hold it.
 */
test("the always-present page can never be shadowed by a real athlete", () => {
  assert.ok(!isPublicUsername(MISS_PARAM), `${MISS_PARAM} is a username somebody could register`);
  assert.deepEqual(publishable([{ ...row, username: MISS_PARAM }]), []);
  // The reason it is safe: usernames have no hyphen, by migration 0047.
  const constraint = readFileSync(
    new URL("../supabase/migrations/0047_usernames.sql", import.meta.url), "utf8",
  );
  assert.match(constraint, /\^\[a-z0-9\]\[a-z0-9_\]\{1,18\}\[a-z0-9\]\$/);
  assert.ok(MISS_PARAM.includes("-"), "the hyphen IS the guarantee — do not remove it");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * "I CAN'T FIND WHERE THE SOCIAL PROFILES ARE."
 *
 * They were not findable. /a/ is linked from MarketingShell's footer — the
 * PUBLIC site — so from inside the signed-in app there was no route to it at
 * all, and the switch that creates a page sits in Profile among a dozen other
 * checkboxes. A feature nobody can reach is a feature that does not exist, and
 * this one is the share loop's whole destination.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a signed-in athlete can reach their own page from inside the app", () => {
  const card = readFileSync(new URL("../components/PublicPageCard.tsx", import.meta.url), "utf8");
  assert.match(card, /href=\{`\/a\/\$\{username\}\/`\}/, "there is no way to open your own page");
  assert.match(card, /href="\/a\/"/, "there is no way to reach anybody else's");
  assert.match(card, /clipboard\.writeText/, "the address cannot be copied — so it cannot be posted");
  // Off and no-username are different states and must read differently.
  assert.match(card, /Turn on my page/);
  assert.match(card, /Choose a username/);

  const rewards = readFileSync(new URL("../app/(app)/rewards/page.tsx", import.meta.url), "utf8");
  assert.match(rewards, /<PublicPageCard username=\{data\.username\} isPublic=\{data\.publicProfile\}/,
    "the card is not rendered where the rank is");
  assert.match(rewards, /username: \(profile as/, "the page never loads the username the card needs");
});
