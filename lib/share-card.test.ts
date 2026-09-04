import { test } from "node:test";
import assert from "node:assert/strict";
import { athleteShareLink, buildShareSvg, displayLink, SHARE_FALLBACK_LINK, type ShareStats } from "./share-card";

const base: ShareStats = {
  name: "Sam",
  headlineValue: "18",
  headlineLabel: "sessions this month",
  stats: [{ label: "Total reps", value: "1,240" }],
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A SHARED CARD WITH NO ADDRESS ON IT IS NOT MARKETING.
 *
 * The card said "POCKETATHLETE" across the top and gave no way to find it.
 * Somebody who sees an athlete's rank in a group chat had a brand name, a
 * screenshot and nowhere to go — so the one piece of distribution that costs
 * nothing and carries social proof ended at the image.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("every card carries somewhere to go", () => {
  assert.ok(buildShareSvg(base).includes(SHARE_FALLBACK_LINK), "no address on the card");
  assert.ok(
    buildShareSvg({ ...base, link: "https://pocketathlete.com/?ref=SAM" }).includes("pocketathlete.com/?ref=SAM"),
    "the athlete's own link is not on their card",
  );
});

test("the link reads as something you could type", () => {
  assert.equal(displayLink("https://pocketathlete.com/?ref=SAM"), "pocketathlete.com/?ref=SAM");
  assert.equal(displayLink("http://pocketathlete.com/"), "pocketathlete.com");
  assert.equal(displayLink(undefined), SHARE_FALLBACK_LINK, "no code is the plain address, not a blank");
  assert.equal(displayLink(""), SHARE_FALLBACK_LINK);
  assert.equal(displayLink("   "), SHARE_FALLBACK_LINK, "whitespace is not a link");
  assert.ok(!displayLink("https://x.com/").includes("//"), "nobody transcribes the scheme");
});

test("the link does not sit on top of the caption", () => {
  const svg = buildShareSvg({ ...base, caption: "Train smarter." });
  const y = (needle: string) => {
    const m = new RegExp(`y="(\\d+)"[^>]*>${needle}`).exec(svg);
    return m ? Number(m[1]) : null;
  };
  const caption = y("Train smarter\\.");
  const link = y(SHARE_FALLBACK_LINK);
  assert.ok(caption !== null && link !== null, "a line is missing from the card");
  assert.ok(link! > caption!, "the link is above the caption");
  assert.ok(link! - caption! >= 30, `only ${link! - caption!}px apart — they will collide`);
  assert.ok(link! <= 1040, "the link is drawn off the bottom of the card");
});

test("text on the card is escaped", () => {
  const svg = buildShareSvg({ ...base, name: "A & B", caption: "5 < 6" });
  assert.ok(!/<text[^>]*>[^<]*&(?!amp;|lt;|gt;)/.test(svg));
  assert.ok(svg.includes("&amp;"));
});

// --- whose link goes on the card --------------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO MIGRATIONS EXISTED FOR THIS AND NEITHER DID ANYTHING.
 *
 * 0107 made every username a referral code that resolves; 0108 gave opted-in
 * athletes a page. But nothing in the app ever set `link`, so every card
 * printed the bare domain and no share was attributable to anybody. The bug was
 * invisible: the card looked right, it just credited nobody.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("an athlete's card carries their own address, not the bare domain", () => {
  // Public page: short enough to read off a screenshot, and the page itself
  // records the referral, so no query string.
  assert.equal(athleteShareLink("sam", true), "pocketathlete.com/a/sam");
  // No page: the credit still has to land somewhere.
  assert.equal(athleteShareLink("sam", false), "pocketathlete.com/?ref=sam");
  // Neither is a link the card must invent — displayLink falls back.
  assert.equal(athleteShareLink(null, true), undefined);
  assert.equal(athleteShareLink(undefined, false), undefined);
  assert.equal(athleteShareLink("   ", true), undefined);
  assert.equal(displayLink(athleteShareLink(null, false)), SHARE_FALLBACK_LINK);
});

test("the link on the card is the link in the share text", () => {
  const link = athleteShareLink("sam", true)!;
  const svg = buildShareSvg({
    name: "Sam", headlineValue: "7", headlineLabel: "days in a row", stats: [], link,
  });
  assert.ok(svg.includes(link), "the card must show the athlete's own address");
  assert.ok(!svg.includes(`>${SHARE_FALLBACK_LINK}<`), "and not also the bare domain");
});

/** Usernames are lowercase in the database; a link that is not cannot resolve. */
test("a link is never a shape the database would not match", () => {
  assert.equal(athleteShareLink("SAM", true), "pocketathlete.com/a/sam");
  assert.equal(athleteShareLink(" Sam ", false), "pocketathlete.com/?ref=sam");
});
