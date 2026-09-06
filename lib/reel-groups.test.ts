import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupPosts, type StoredFile } from "./reel-groups";

const f = (name: string, createdAt = "2026-09-06T12:11:00Z"): StoredFile =>
  ({ name, url: `https://x/${name}`, size: 100, createdAt });

/** Exactly what the uploader writes. */
const CAROUSEL = [
  "carousel-2026-09-06T12-11-01.png",
  "carousel-2026-09-06T12-11-02.png",
  "carousel-2026-09-06T12-11-03.png",
  "carousel-2026-09-06T12-11-04.png",
  "carousel-2026-09-06T12-11-05.png",
  "carousel-2026-09-06T12-11-caption.txt",
].map((n) => f(n));

test("five slides and a caption are one post, not six rows", () => {
  const groups = groupPosts(CAROUSEL);
  assert.equal(groups.length, 1, `${groups.length} rows for one carousel`);
  assert.equal(groups[0].kind, "carousel");
  assert.equal(groups[0].files.length, 5, "the caption was counted as a slide");
  assert.ok(groups[0].caption, "the caption was dropped");
  assert.match(groups[0].title, /5 slides/);
});

/**
 * "10" sorts before "2" as text. A ten-slide carousel would read 1, 10, 2, 3 —
 * and nothing downstream could tell, because every slide is present and the
 * order looks deliberate.
 */
test("slides are ordered by number, not alphabetically", () => {
  /**
   * UNPADDED, which is the case that actually breaks. My first fixture used
   * "01".."12" — zero-padded, so alphabetical and numeric agree and a mutation
   * replacing the numeric sort with localeCompare survived. The pattern
   * accepts an unpadded number, so unpadded input is possible, and that is
   * where "10" sorting before "2" shows up.
   */
  const many = Array.from({ length: 12 }, (_, i) => f(`carousel-S-${i + 1}.png`));
  // Shuffled, with the two-digit ones first — the failing arrangement.
  const shuffled = [...many.slice(9), ...many.slice(0, 9)];
  const [group] = groupPosts(shuffled);
  assert.deepEqual(
    group.files.map((x) => x.name),
    many.map((x) => x.name),
    "the slides are out of order, so the carousel reads wrong",
  );
});

test("a reel is still one row of its own", () => {
  const groups = groupPosts([f("demo-cost-2026-09-06T12-11.mp4"), ...CAROUSEL]);
  assert.equal(groups.length, 2);
  const reel = groups.find((g) => g.kind === "reel");
  assert.ok(reel, "the reel was swallowed into a carousel");
  assert.equal(reel!.files.length, 1);
  assert.equal(reel!.title, "demo-cost-2026-09-06T12-11.mp4");
});

test("two carousels from different runs stay apart", () => {
  const second = ["carousel-2026-09-07T09-00-01.png", "carousel-2026-09-07T09-00-02.png"].map((n) => f(n));
  const groups = groupPosts([...CAROUSEL, ...second]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.files.length).sort(), [2, 5]);
});

/** A caption with no slides yet is still a post in progress, not a lost file. */
test("a caption arriving before its slides does not vanish", () => {
  const groups = groupPosts([f("carousel-S-caption.txt"), f("carousel-S-01.png")]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].files.length, 1);
  assert.ok(groups[0].caption);
});

test("nothing in, nothing out", () => {
  assert.deepEqual(groupPosts([]), []);
});

test("an unrecognised name is left alone rather than dropped", () => {
  const groups = groupPosts([f("probe-1788649248.txt"), f("something.srt")]);
  assert.equal(groups.length, 2, "a file the pattern does not know was discarded");
  for (const g of groups) assert.equal(g.kind, "reel");
});

/** Order of the groups follows the order the files arrived (newest first). */
test("the newest post stays at the top", () => {
  const groups = groupPosts([f("newest.mp4"), ...CAROUSEL, f("oldest.mp4")]);
  assert.deepEqual(groups.map((g) => g.id[0]), ["n", "c", "o"]);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DELETING A POST DELETES ALL OF IT.
 *
 * A carousel is six objects in the bucket — five slides and a caption. Removing
 * "the post" one file at a time leaves orphans that come back as a broken group
 * on the next refresh, which is worse than not being able to delete at all.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a post knows every file it is made of", () => {
  const [carousel] = groupPosts(CAROUSEL);
  const names = [...carousel.files.map((f) => f.name), ...(carousel.caption ? [carousel.caption.name] : [])];
  assert.equal(names.length, CAROUSEL.length,
    `deleting this post would leave ${CAROUSEL.length - names.length} orphaned file(s)`);
  assert.deepEqual([...names].sort(), CAROUSEL.map((f) => f.name).sort());
});

test("the panel deletes the whole group and asks first", () => {
  const panel = readFileSync("components/admin/ReelLibrary.tsx", "utf8");
  assert.match(panel, /post\.files\.map\(\(f\) => f\.name\)[\s\S]{0,120}post\.caption/,
    "delete does not gather the caption, so it would be orphaned");
  assert.match(panel, /window\.confirm\(/, "a reel takes three minutes to make and deletes without asking");
  assert.match(panel, /storage\.from\("reels"\)\.remove\(/, "nothing actually removes the files");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLEARING THE WHOLE LIBRARY.
 *
 * "Clear the old demo vids, start fresh." One confirm per post is right for
 * one post and absurd for fourteen, so there is a single action — and because
 * it is every file there is, and none of them are recoverable, it asks for a
 * number to be TYPED rather than for a button to be clicked. A confirm dialog
 * next to a Refresh button is one misplaced press away from an empty library.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("clearing the library takes more than a click, and takes every file", () => {
  const panel = readFileSync("components/admin/ReelLibrary.tsx", "utf8");
  const fn = panel.slice(panel.indexOf("const clearAll"), panel.indexOf("const load ="));

  assert.ok(fn.length > 0, "there is no clear-all action at all");
  assert.match(fn, /window\.prompt\(/,
    "clearing everything asks the same single confirm as deleting one post");
  assert.match(fn, /typed\.trim\(\) !== String\(posts\)/,
    "the typed answer is not checked, so anything dismisses the guard");
  assert.match(fn, /all\.map\(\(f\) => f\.name\)/,
    "it deletes something other than every file it listed");
  assert.match(fn, /storage\.from\("reels"\)\.remove\(/, "nothing actually removes the files");
});

/** A cancelled prompt returns null, and null must not read as a match. */
test("dismissing the prompt deletes nothing", () => {
  const panel = readFileSync("components/admin/ReelLibrary.tsx", "utf8");
  const fn = panel.slice(panel.indexOf("const clearAll"), panel.indexOf("const load ="));
  assert.match(fn, /if \(typed === null\) return;/,
    "a dismissed prompt falls through to the comparison instead of returning");
  assert.ok(
    fn.indexOf("typed === null") < fn.indexOf("typed.trim()"),
    "null is compared before it is checked, which throws instead of cancelling",
  );
});

/** The button cannot be there when there is nothing to clear. */
test("the button only exists when the library has something in it", () => {
  const panel = readFileSync("components/admin/ReelLibrary.tsx", "utf8");
  assert.match(panel, /\{!!reels\?\.length && \([\s\S]{0,400}Clear all/,
    "Clear all is offered on an empty library");
});
