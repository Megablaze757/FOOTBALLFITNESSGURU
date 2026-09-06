import { test } from "node:test";
import assert from "node:assert/strict";
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
