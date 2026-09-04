import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { postTriggers, trendReady } from "./post-triggers";
import { SNAPSHOTS, type Snapshot } from "./protein-history";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A SCHEDULE COVERS THE QUIET DAYS. IT CANNOT COVER THE GOOD ONES.
 *
 * lib/post-plan.ts rotates through catalogues, which is the right answer on an
 * ordinary Tuesday and the wrong one on the day the protein index moves. Those
 * are the posts with a reason to exist — and the ones that go unposted, because
 * the data changed in a file and no screen mentioned it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("there is always something to post, and it is never a placeholder", () => {
  const triggers = postTriggers();
  assert.ok(triggers.length > 0, "nothing to post at all is not a state this should have");
  for (const t of triggers) {
    assert.ok(t.headline.trim().length > 8, `${t.id} has no headline`);
    assert.ok(t.topic.trim().length > 40, `${t.id}: "${t.topic}" is a prompt, not a topic`);
    assert.ok(t.factGroups.length > 0, `${t.id} lets the writer draw on nothing`);
    assert.ok(!/undefined|null|NaN|\[object/.test(t.headline + t.topic), `${t.id}: ${t.topic}`);
  }
  assert.equal(new Set(triggers.map((t) => t.id)).size, triggers.length, "two triggers share an id");
});

/**
 * The order is the whole point. A price move is worth interrupting the
 * schedule for and the size of the catalogue is not, and in a list sorted by
 * anything else the two look identical.
 */
test("news comes before evergreen", () => {
  const triggers = postTriggers({ publicProfiles: 3 });
  const heats = triggers.map((t) => t.heat);
  assert.ok(heats.includes("news") && heats.includes("evergreen"),
    `this proves nothing without both kinds present: ${heats.join(", ")}`);
  const firstEvergreen = heats.indexOf("evergreen");
  assert.ok(!heats.slice(firstEvergreen).includes("news"), `out of order: ${heats.join(", ")}`);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A TRIGGER THAT CANNOT BE EVIDENCED MUST NOT FIRE.
 *
 * The whole value of posting a number is that somebody can check it. The
 * protein series holds ONE reading, so there is no measured change — and
 * "unchanged since September" is a claim about a period nobody measured.
 * lib/protein-history.ts refuses to invent it; this must not reinstate it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("no price-move post while there is nothing to compare against", () => {
  if (SNAPSHOTS.length >= 2) return; // a real second reading exists — nothing to prove here
  const ids = postTriggers().map((t) => t.id);
  assert.ok(!ids.some((id) => id.startsWith("protein-move")), "a move was reported from a single reading");
  assert.ok(!ids.some((id) => id.startsWith("protein-swap")), "a change of source was reported from one reading");
  assert.equal(trendReady(), false);
});

/** And it DOES fire once there is something to compare against. */
test("a real price move becomes a post", () => {
  const fake: Snapshot[] = [
    { date: "2026-03-02", count: 21, cheapest: 0.27, cheapestName: "Red lentils", dearest: 3.05, dearestName: "Cooked king prawns", median: 1.02 },
    { date: "2026-09-04", count: 23, cheapest: 0.31, cheapestName: "Dried chickpeas", dearest: 3.19, dearestName: "Cooked king prawns", median: 1.13 },
  ];
  const original = SNAPSHOTS.splice(0, SNAPSHOTS.length, ...fake);
  try {
    const triggers = postTriggers();
    const move = triggers.find((t) => t.id.startsWith("protein-move"));
    assert.ok(move, "a 4p rise went unreported");
    assert.equal(move!.heat, "news");
    assert.match(move!.topic, /4p|£0\.27|£0\.31/, move!.topic);

    // The cheapest source changing hands is a different story and its own post.
    const swap = triggers.find((t) => t.id.startsWith("protein-swap"));
    assert.ok(swap, "the cheapest source changed and nothing said so");
    assert.match(swap!.headline, /Dried chickpeas/);
    assert.match(swap!.headline, /Red lentils/);

    // AND NOT WHEN IT DID NOT CHANGE. A price that moved while the same food
    // stayed cheapest is one story, not two, and "X is now the cheapest, not X"
    // is the sentence that gets posted if this is left unguarded.
    SNAPSHOTS.splice(0, SNAPSHOTS.length,
      { ...fake[0], cheapestName: "Red lentils" },
      { ...fake[1], cheapestName: "Red lentils" });
    const same = postTriggers();
    assert.ok(!same.some((t) => t.id.startsWith("protein-swap")),
      "reported a change of source when the same food is still cheapest");
    assert.ok(same.some((t) => t.id.startsWith("protein-move")), "the price still moved — that is still a post");
  } finally {
    SNAPSHOTS.splice(0, SNAPSHOTS.length, ...original);
  }
  assert.equal(SNAPSHOTS.length, 1, "the real series was not put back");
});

/** Nobody has a page yet is not "0 athletes are publishing" — it is silence. */
test("the loop is only posted about once it is true", () => {
  assert.ok(!postTriggers({ publicProfiles: 0 }).some((t) => t.id.startsWith("profiles:")));
  const one = postTriggers({ publicProfiles: 1 }).find((t) => t.id.startsWith("profiles:"));
  assert.ok(one);
  assert.match(one!.headline, /1 athlete publishing/, one!.headline);
  assert.equal(one!.heat, "news", "the first few are news; a hundred is a fact about the product");
  assert.equal(postTriggers({ publicProfiles: 200 }).find((t) => t.id.startsWith("profiles:"))!.heat, "evergreen");
});

/** Every trigger points somewhere a reader can go. */
test("a post that names a page links to it", () => {
  for (const t of postTriggers({ publicProfiles: 2 })) {
    assert.ok(t.href?.startsWith("/"), `${t.id} has no page to send anyone to`);
    assert.ok(t.href!.endsWith("/"), `${t.id}: ${t.href} is missing its trailing slash`);
  }
});

/** And the admin screen has to show them. */
test("the social page surfaces the triggers", () => {
  const src = readFileSync(new URL("../components/ContentEngine.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
  assert.match(src, /postTriggers\(/, "nothing renders the triggers, so nobody sees what happened");
});
