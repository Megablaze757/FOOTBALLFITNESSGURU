import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  athleteShareLink, buildShareSvg, displayLink, loadImage, svgDataUrl,
  IMAGE_TIMEOUT_MS, SHARE_FALLBACK_LINK, type LoadableImage, type ShareStats,
} from "./share-card";

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


// --- the card that would not build -------------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * "SHARE MY PROGRESS WORKS FOR SOME OF THE STUFF."
 *
 * That is what a silent failure looks like from outside. The SVG is handed to
 * an <img> as a data: URL, and XML parsing is all-or-nothing: one character
 * XML 1.0 forbids, or one `undefined` reaching `.replace`, and the image never
 * decodes. exportShareCard rejected, ShareButton had try/finally and no catch,
 * so the label stopped saying "Creating…" and nothing else happened at all.
 * ═══════════════════════════════════════════════════════════════════════════
 */
function wellFormed(svg: string): void {
  assert.ok(svg.startsWith("<svg "), "not an svg");
  assert.ok(svg.trimEnd().endsWith("</svg>"), "unterminated");
  const stray = svg.replace(/&(amp|lt|gt|quot|apos|#\d+);/g, "");
  assert.ok(!stray.includes("&"), "an unescaped ampersand — the parser stops there");
  for (const attr of svg.matchAll(/="([^"]*)"/g)) {
    assert.ok(!attr[1].includes("<"), `a < inside an attribute: ${attr[1]}`);
  }
  // eslint-disable-next-line no-control-regex
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(svg),
    "a control character XML 1.0 forbids — there is no way to escape one, it just fails");
}

test("a card still builds when the data is not what the types promise", () => {
  const hostile: ShareStats[] = [
    { ...base, name: "Sam & Alex <script>" },
    { ...base, headlineValue: '18 "sessions"' },
    { ...base, caption: "It's 100% > last month & rising" },
    // The ones that threw rather than rendering wrong.
    { ...base, name: undefined as unknown as string },
    { ...base, headlineLabel: undefined as unknown as string },
    { ...base, stats: [{ label: undefined as unknown as string, value: "12" }] },
    { ...base, stats: [{ label: "Reps", value: undefined as unknown as string }] },
    // A name pasted out of a spreadsheet, control character and all.
    { ...base, name: "Sam\u0001 Taylor" },
    { ...base, headlineValue: "🥇 Gold" },
  ];
  for (const stats of hostile) {
    const svg = buildShareSvg(stats);
    wellFormed(svg);
    assert.ok(svg.length > 500, "the card came out empty");
    /**
     * AND IT MUST NOT PRINT THE WORD.
     *
     * `String(s)` on an absent value is perfectly valid XML that renders
     * "UNDEFINED" across somebody's progress card — well-formed, so the
     * parse-level checks above pass it happily. A card that fails to build is a
     * bug; a card that builds and says UNDEFINED gets posted.
     */
    assert.ok(!/>\s*(undefined|null|NaN)\s*</i.test(svg), `the card prints a placeholder: ${stats.name}`);
  }
});

/** The escaping must not eat the content it is protecting. */
test("escaping keeps the words, and the emoji", () => {
  const svg = buildShareSvg({ ...base, name: "Sam & Alex", caption: "100% > before", headlineValue: "🥇" });
  assert.ok(svg.includes("Sam &amp; Alex"));
  assert.ok(svg.includes("100% &gt; before"));
  assert.ok(svg.includes("🥇"), "an emoji is a perfectly legal character and must survive");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CANCELLED SHARE IS NOT A FAILED ONE.
 *
 * Dismissing the share sheet used to drop a PNG in Downloads anyway — a file
 * for the trouble of saying no thanks.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the export says what it did, and a dismissal saves nothing", () => {
  const src = readFileSync(new URL("./share-card.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

  assert.match(src, /e\.name === "AbortError"\) return "cancelled"/,
    "a dismissed share sheet still drops a file in Downloads");
  assert.match(src, /Promise<ShareOutcome>/, "the caller cannot tell a cancel from a break");

  /**
   * The two mistakes that make a save silently not save: a detached anchor
   * (Firefox ignores the click) and revoking the object URL on the next line
   * (click only SCHEDULES the download, so revoking races it). Both fail with
   * nothing thrown, which is why they survived.
   */
  assert.match(src, /document\.body\.appendChild\(a\)/, "the anchor is detached — Firefox ignores the click");
  assert.match(src, /setTimeout\(\(\) => \{[\s\S]*?revokeObjectURL/,
    "the object URL is revoked synchronously, which races the download it belongs to");
});

/** And the button has to show the failure it used to swallow. */
test("the share button reports what happened", () => {
  const src = readFileSync(new URL("../components/ShareButton.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
  assert.match(src, /catch \(e\)[\s\S]{0,140}?setNote\(/, "a failure is still silent");
  assert.match(src, /Save image/, "there is no way to save without going through the share sheet");
  assert.match(src, /saveBlob\(await shareCardPng/, "the save button does not build a card");
});

// --- turning the card into a picture -----------------------------------------

/** An <img> stand-in whose `src` setter decides what the browser does. */
function fakeImage(on: "load" | "error" | "silent" | "sync-load"): LoadableImage {
  const img: LoadableImage = { onload: null, onerror: null, src: "" };
  let value = "";
  Object.defineProperty(img, "src", {
    get: () => value,
    set(next: string) {
      value = next;
      if (on === "sync-load") { img.onload?.(); return; }
      if (on === "load") setTimeout(() => img.onload?.(), 0);
      if (on === "error") setTimeout(() => img.onerror?.(), 0);
      // "silent" fires nothing, which is the case the timeout exists for.
    },
  });
  return img;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE BUG THIS REPLACED: `await img.decode()`.
 *
 * decode() REJECTS FOR SVG IMAGES IN WEBKIT — "the source image cannot be
 * decoded", every time, on every iPhone and every Safari. So "Share my
 * progress" could not work on the device most of these cards are made on. The
 * card was always fine; the wait for it was not.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a card that loads resolves", async () => {
  const img = fakeImage("load");
  assert.equal(await loadImage(img, "data:image/svg+xml;base64,x"), img);
  assert.equal(img.src, "data:image/svg+xml;base64,x");
});

/**
 * A cached data: URL can fire load SYNCHRONOUSLY on assignment. Assigning src
 * before the handlers means onload is still null when it fires, and the
 * promise never settles — the button says "Creating…" forever.
 */
test("a card that loads instantly still resolves", async () => {
  const img = fakeImage("sync-load");
  assert.equal(await loadImage(img, "data:image/svg+xml;base64,x"), img);
});

test("a card that fails to draw rejects, rather than hanging", async () => {
  await assert.rejects(loadImage(fakeImage("error"), "x"), /could not be drawn/);
});

/** An <img> that fires neither event leaves the button saying "Creating…"
 *  forever — the exact silent failure this whole path has been through once. */
test("a card that never loads gives up", { timeout: 2_000 }, async () => {
  // The explicit timeout is the assertion. Without it, removing the timer
  // leaves this promise pending forever and node:test simply never finishes
  // the subtest — which the runner does not report as a failure.
  await assert.rejects(loadImage(fakeImage("silent"), "x", 20), /too long/);
});

test("handlers are dropped once it has settled, and a late event changes nothing", async () => {
  const img = fakeImage("load");
  await loadImage(img, "x");
  assert.equal(img.onload, null, "the load handler outlives the promise");
  assert.equal(img.onerror, null, "a late error would still be handled");
});

test("the timeout is long enough to draw a card and short enough to notice", () => {
  assert.ok(IMAGE_TIMEOUT_MS >= 5_000 && IMAGE_TIMEOUT_MS <= 30_000, `${IMAGE_TIMEOUT_MS}ms`);
});

/**
 * `btoa` throws on anything outside Latin-1 — and the athlete's own NAME goes
 * on this card, so an accent or an emoji in it threw from inside the encoder.
 */
test("a name with characters outside Latin-1 does not break the encoder", () => {
  for (const name of ["Sam", "Zoë", "Ríoghnach", "Håkon", "田中", "Sam 🏋️"]) {
    const svg = buildShareSvg({ ...base, name });
    const url = svgDataUrl(svg);
    assert.match(url, /^data:image\/svg\+xml;base64,/);
    const bytes = Uint8Array.from(atob(url.split(",")[1]), (c) => c.charCodeAt(0));
    assert.equal(new TextDecoder().decode(bytes), svg, `${name} did not survive the round trip`);
  }
});

/**
 * THE REGRESSION, GUARDED WHERE IT WAS.
 *
 * Everything above tests loadImage in isolation, and none of it would notice
 * the rasteriser going back to `img.decode()` — which is the actual bug, and
 * which cannot be reached from here because it needs a canvas.
 */
test("the rasteriser never goes back to decode()", () => {
  const src = readFileSync(new URL("./share-card.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.ok(
    !/\.decode\(\)/.test(src),
    "decode() rejects for SVG in WebKit — this is the bug that stopped every iPhone making a card",
  );
  assert.match(src, /await loadImage\(img, svgDataUrl\(svg\)\)/,
    "the rasteriser does not wait through loadImage, so none of the tests above cover it");
});
