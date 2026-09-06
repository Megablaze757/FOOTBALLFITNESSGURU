import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SLIDES, ROWS_PER_SLIDE, SLIDE_H, SLIDE_W, carouselSlides, type Row,
} from "./carousel";

const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    rank: i + 1, name: `Food ${i + 1}`, cost: `£${(0.3 + i * 0.1).toFixed(2)}`, portion: `${100 + i}g`,
  }));

const input = (n: number) => ({
  rows: rows(n), spread: "10x", cheapestName: "Red lentils",
  cheapestCost: "£0.31", dearestCost: "£3.19",
});

/** 4:5 is the tallest a feed post may be, and taller is more screen. */
test("the slide is the tallest shape the feed allows", () => {
  assert.equal(SLIDE_W / SLIDE_H, 1080 / 1350);
  assert.equal(Math.round((SLIDE_W / SLIDE_H) * 100) / 100, 0.8, "not 4:5 — the feed will crop it");
});

test("it opens on the contrast and says it is a carousel", () => {
  const [first] = carouselSlides(input(23));
  assert.equal(first.kind, "hook");
  assert.ok(first.kind === "hook" && first.headline.includes("10x"), "the hook drops the number");
  assert.match((first as { swipe: string }).swipe, /swipe/i,
    "nothing tells the reader there is more than one image");
});

/**
 * Save rate was 0.0%. The best-evidenced way to raise it is to ask — people do
 * not think of saving a post unless it says it is worth keeping.
 */
test("the last slide asks for the save and names the app", () => {
  const slides = carouselSlides(input(23));
  const last = slides[slides.length - 1];
  assert.equal(last.kind, "cta");
  assert.match((last as { headline: string }).headline, /save/i, "the post never asks to be saved");
  assert.match((last as { action: string }).action, /sign up for free/i);
  assert.doesNotMatch((last as { action: string }).action, /waitlist/i);
});

/**
 * Running out of room must cost LIST slides, never the ask. A carousel that
 * does all the work and never says where to go is the whole post wasted.
 */
test("the ask survives a list too long to fit", () => {
  const slides = carouselSlides(input(500));
  assert.ok(slides.length <= MAX_SLIDES, `${slides.length} slides — over the platform limit`);
  assert.equal(slides[0].kind, "hook");
  assert.equal(slides[slides.length - 1].kind, "cta");
  assert.ok(slides.some((s) => s.kind === "list"), "the list vanished entirely");
});

test("every ranked food appears exactly once, in order, when they fit", () => {
  const slides = carouselSlides(input(23));
  const seen = slides.flatMap((s) => (s.kind === "list" ? s.rows : []));
  assert.deepEqual(seen.map((r) => r.rank), Array.from({ length: 23 }, (_, i) => i + 1),
    "a row was dropped, duplicated or reordered between slides");
  for (const s of slides) {
    if (s.kind === "list") assert.ok(s.rows.length <= ROWS_PER_SLIDE, `${s.rows.length} rows on one slide`);
  }
});

/** When the list is truncated the post must say so rather than imply it is all of it. */
test("a truncated list says the rest is on the site", () => {
  const many = carouselSlides(input(500));
  const cta = many[many.length - 1] as { sub: string };
  assert.match(cta.sub, /free on the site/i, "the reader is not told there is more");

  const all = carouselSlides(input(16));
  const shortCta = all[all.length - 1] as { sub: string };
  assert.doesNotMatch(shortCta.sub, /free on the site/i,
    "it claims there is more when the whole list is already shown");
});

test("no rows, no carousel", () => {
  assert.deepEqual(carouselSlides(input(0)), []);
});

test("one food still produces a whole post", () => {
  const slides = carouselSlides(input(1));
  assert.equal(slides.length, 3);
  assert.deepEqual(slides.map((s) => s.kind), ["hook", "list", "cta"]);
});
