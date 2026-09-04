import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loopStats, loopWarning, classify, type LoopInput } from "./share-loop";

const base: LoopInput = {
  affiliateCodes: ["COACH20", "GYMBOX"],
  usernames: ["sam", "alex_r", "jordan"],
  attributed: [],
  totalProfiles: 100,
  publicProfiles: 2,
};

const on = (over: Partial<LoopInput>) => loopStats({ ...base, ...over });

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PANEL WAS UNDERSTATING ITS OWN LOOP, AND SAYING SO IN ITS EMPTY STATE.
 *
 * "Links issued" was read off the affiliates table, and the empty state said
 * "the plain address for most athletes, their own for anyone with an affiliate
 * row". True when written; false since migration 0107, which made every
 * username a code that resolves. Almost nobody is an affiliate and almost
 * everybody has a username, so the one screen meant to answer "is the share
 * loop working" ignored nearly all of it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("every athlete with a username can share, not only affiliates", () => {
  const s = on({});
  assert.equal(s.canShare.affiliates, 2);
  assert.equal(s.canShare.athletes, 3, "usernames are referral codes since 0107 — they count");
  assert.equal(s.canShare.withPage, 2);
});

/**
 * The two kinds are not interchangeable and must never be merged: an affiliate
 * code creates a commission line, a username creates nothing. Showing them as
 * one number is showing a cost as if it were free growth.
 */
test("paid referrals and free ones are counted apart", () => {
  const s = on({ attributed: ["COACH20", "sam", "sam", "GYMBOX", "alex_r"] });
  assert.equal(s.signups.affiliate, 2);
  assert.equal(s.signups.athlete, 3);
  assert.equal(s.signups.total, 5);
  assert.equal(s.sharePct, 5, "5 of 100 profiles");
});

/**
 * Mirrors referral_code_valid in migration 0107, which resolves to the PAID
 * side when a code matches both. Calling a commission-bearing signup free is
 * the one classification error that costs money to believe.
 */
test("a code that is somehow both resolves to the paid side", () => {
  const affiliates = new Set(["coach20"]);
  const usernames = new Set(["coach20", "sam"]);
  assert.equal(classify("COACH20", affiliates, usernames), "affiliate");
  assert.equal(classify("sam", affiliates, usernames), "athlete");
});

/** Codes are typed by hand at signup and stored as typed. */
test("case and spacing do not lose a referral", () => {
  const s = on({ attributed: ["  Coach20 ", "SAM", "Alex_R"] });
  assert.equal(s.signups.unknown, 0, "a capital letter should not orphan an attribution");
  assert.equal(s.signups.affiliate, 1);
  assert.equal(s.signups.athlete, 2);
});

/**
 * The only one of the three that points at a bug rather than a result: somebody
 * was given a code, typed it, and it matched nothing. Invisible everywhere else.
 */
test("a code that matches nothing is surfaced, not silently dropped", () => {
  const s = on({ attributed: ["COACH20", "typo123"] });
  assert.equal(s.signups.unknown, 1);
  assert.equal(s.signups.total, 2, "it still arrived — it just cannot be credited");
  assert.match(loopWarning(s)!, /matches no affiliate and no username/);
});

test("the busiest sources come first, and say which kind they are", () => {
  const s = on({ attributed: ["sam", "sam", "sam", "COACH20", "COACH20", "alex_r"] });
  assert.deepEqual(s.sources.map((x) => [x.code, x.kind, x.signups]), [
    ["sam", "athlete", 3],
    ["coach20", "affiliate", 2],
    ["alex_r", "athlete", 1],
  ]);
});

test("no signups yet is zero, never a division by zero", () => {
  const empty = loopStats({ ...base, totalProfiles: 0 });
  assert.equal(empty.sharePct, 0);
  assert.equal(empty.signups.total, 0);
  assert.deepEqual(empty.sources, []);
  assert.equal(loopWarning(empty), null, "two athletes have pages — nothing to warn about");
});

/** Warnings are about what is broken; the panel already shows what is working. */
test("the warning names the thing worth acting on, in order", () => {
  // A lost attribution beats everything: it is the only bug of the three.
  const lost = on({ attributed: ["typo"], publicProfiles: 0 });
  assert.match(loopWarning(lost)!, /attribution is lost/);

  // No usernames at all is a migration that has not run.
  assert.match(loopWarning(on({ usernames: [], publicProfiles: 0 }))!, /migration 0050/);

  // And otherwise: nobody has a page, which is the strongest share target.
  assert.match(loopWarning(on({ publicProfiles: 0 }))!, /public page/);
});

/**
 * AND THE PANEL HAS TO USE IT.
 *
 * Every rule above passes with loopStats written, exported, tested and called
 * by nobody — which is exactly the state the panel was already in, counting
 * affiliate rows while the real loop ran past it.
 */
test("the admin panel counts the whole loop, not just the affiliates", () => {
  const src = readFileSync(new URL("../components/admin/ShareLoop.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

  assert.match(src, /loopStats\(/, "the panel does not use the shared maths");
  assert.match(src, /username/, "the panel never reads usernames, so it cannot see most of the loop");
  assert.match(src, /public_profile/, "the panel does not know how many athletes have a page");
  assert.ok(!/their own for anyone with an affiliate row/.test(src),
    "the empty state still tells you only affiliates have a link, which stopped being true at 0107");
});
