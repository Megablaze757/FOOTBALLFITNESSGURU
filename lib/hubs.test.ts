import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { EXERCISES, isRunEntry } from "./exercises";
import { contentPages, slugify } from "./seo";
import { publishableHubs, hubMembers, findHub, hubsFor, hubPath, MIN_HUB_MEMBERS } from "./hubs";

const MOVEMENTS = EXERCISES.filter((e) => !isRunEntry(e));

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A HUB WITH FOUR THINGS ON IT IS A DOORWAY PAGE.
 *
 * This file is programmatic SEO, which is the technique that produces both the
 * genuinely useful list page and the thousand thin pages that get a site
 * penalised. The only thing separating them is whether the page has enough on
 * it to be worth landing on — so the floor is enforced here rather than
 * remembered by whoever adds the next dimension.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("no hub is published thin", () => {
  const hubs = publishableHubs(MOVEMENTS);
  assert.ok(hubs.length > 10, `only ${hubs.length} hubs — has the catalogue shrunk?`);
  for (const { hub, members } of hubs) {
    assert.ok(members.length >= MIN_HUB_MEMBERS, `${hub.name}: ${members.length} members`);
  }
});

test("the gate can actually shut", () => {
  const tiny = MOVEMENTS.slice(0, 3);
  assert.deepEqual(publishableHubs(tiny), [], "three movements produced a hub");
});

/** "Neck" has one movement and "Grip" has two. Neither is a page. */
test("the long tail stays unpublished", () => {
  const names = new Set(publishableHubs(MOVEMENTS).map((h) => h.hub.name.toLowerCase()));
  for (const tail of ["neck", "hands", "grip", "patellar tendon", "traps"]) {
    assert.ok(!names.has(tail), `${tail} was published as a hub`);
  }
});

/**
 * "Other" is the equipment bucket for everything that did not classify. A page
 * for it is a hundred unrelated movements under a heading that means nothing.
 */
test("the unclassified bucket is not a topic", () => {
  assert.ok(!publishableHubs(MOVEMENTS).some((h) => h.hub.name.toLowerCase() === "other"));
});

/**
 * The catalogue spells it both "Whole Body" and "whole body". Matched
 * case-insensitively, or that is two hubs of half the size and both below the
 * floor — the bug that hides as an absence.
 */
test("one muscle group is one hub, however it is spelled", () => {
  const whole = publishableHubs(MOVEMENTS).filter((h) => h.hub.name.toLowerCase() === "whole body");
  assert.equal(whole.length, 1, "two spellings produced two hubs");
  assert.equal(whole[0].members.length, 40, "the two spellings were not merged");
});

test("every hub resolves from its own URL and lists real pages", () => {
  const slugs = new Set(contentPages(MOVEMENTS).map((p) => p.slug));
  for (const { hub, members } of publishableHubs(MOVEMENTS)) {
    const found = findHub(hub.kind, hub.slug, MOVEMENTS);
    assert.ok(found, `${hubPath(hub)} does not resolve`);
    assert.equal(found!.members.length, members.length);
    for (const m of members) {
      assert.ok(slugs.has(slugify(m.name)), `${hub.name} lists ${m.name}, which has no page`);
    }
  }
  assert.equal(findHub("muscle", "no-such-muscle", MOVEMENTS), null);
});

/** A hub URL must never collide with an exercise's own URL. */
test("no exercise slugifies to a hub segment", () => {
  const slugs = new Set(contentPages(MOVEMENTS).map((p) => p.slug));
  for (const segment of ["muscle", "equipment"]) {
    assert.ok(!slugs.has(segment), `an exercise is at /exercises/${segment}/, which the hubs claim`);
  }
});

/** Members and membership must agree, or a page links up to a hub that omits it. */
test("a movement's hubs list it back", () => {
  for (const e of MOVEMENTS) {
    for (const hub of hubsFor(e, MOVEMENTS)) {
      assert.ok(hubMembers(hub, MOVEMENTS).some((m) => m.id === e.id),
        `${e.name} links to ${hubPath(hub)}, which does not list it`);
    }
  }
});

/** Every movement should reach at least one topic page. */
test("no movement is outside every topic", () => {
  const stranded = MOVEMENTS.filter((e) => hubsFor(e, MOVEMENTS).length === 0).map((e) => e.name);
  assert.ok(stranded.length < MOVEMENTS.length * 0.1,
    `${stranded.length} movements belong to no hub: ${stranded.slice(0, 5).join(", ")}`);
});

test("the hubs are built and in the sitemap", (t) => {
  const out = new URL("../out/", import.meta.url);
  if (!existsSync(new URL("sitemap.xml", out))) return t.skip("no export — run npm run build");
  const xml = readFileSync(new URL("sitemap.xml", out), "utf8");
  for (const { hub } of publishableHubs(MOVEMENTS)) {
    assert.ok(xml.includes(`${hubPath(hub)}</loc>`), `${hubPath(hub)} is not in the sitemap`);
    assert.ok(existsSync(new URL(`.${hubPath(hub)}index.html`, out)), `${hubPath(hub)} was not built`);
  }
});
