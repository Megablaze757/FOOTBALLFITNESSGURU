import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SPORTS } from "./exercises";
import { positionsForSport } from "./coach";
import { ACHIEVEMENTS } from "./gamification";
import { CHALLENGE_POOL } from "./challenge-pool";

/**
 * THE PUBLIC PAGE HAS TO STAY TRUE.
 *
 * Marketing numbers drift away from the product silently — a sport gets added,
 * a badge gets removed for being unreachable, and nothing anywhere notices that
 * the landing page still quotes the old figure. The first person to spot it is
 * a customer, and by then it reads as carelessness about everything else too.
 *
 * These are hardcoded on the page rather than imported so the marketing bundle
 * does not have to ship the whole challenge pool to render four numbers. This
 * test is the price of that choice.
 */
const PAGE = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("the numbers on the landing page are the app's real numbers", () => {
  const positions = SPORTS.reduce((n, s) => n + positionsForSport(s.id).length, 0);
  const expected: [string, number][] = [
    ["positions", positions],
    ["sports", SPORTS.length],
    ["challenges", CHALLENGE_POOL.length],
    ["badges", ACHIEVEMENTS.length],
  ];
  for (const [label, value] of expected) {
    const re = new RegExp(`<HeroStat\\s+n="(\\d+)"\\s+label="${label}"`);
    const m = PAGE.match(re);
    assert.ok(m, `the landing page no longer shows a "${label}" figure`);
    assert.equal(Number(m[1]), value, `the page claims ${m[1]} ${label}, the app has ${value}`);
  }
});

/**
 * AND IT MUST NOT OVERCLAIM THE ONE THING PEOPLE ASK ABOUT.
 *
 * The clip IS uploaded — it is saved to the athlete's account so they can open
 * it again. Only the ANALYSIS is local. The page said "the clip never leaves
 * your device", and the FAQ answered "do my videos get uploaded somewhere?"
 * with "never sent anywhere to be processed", which answers a narrower question
 * than the one asked. Both are fixed; this stops them coming back.
 */
test("the landing page does not claim the clip never leaves the phone", () => {
  // Comments stripped: this file explains what the old copy said, and a guard
  // that reads its own documentation as a violation is one that gets deleted.
  const copy = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  // Anchored on the SUBJECT, not the phrase. "The analysis never leaves your
  // phone" is true and is the actual selling point; "the clip never leaves your
  // phone" is false. A blanket ban on the wording forbids both.
  const forbidden: [RegExp, string][] = [
    [/(?:clip|video|footage)[^.]{0,60}never leaves/i, "says the clip never leaves the device"],
    [/never (?:uploaded|sent anywhere)/i, "says the video is never uploaded or sent anywhere"],
    [/(?:clip|video)[^.]{0,60}stays on your (?:phone|device)/i, "says the clip stays on the device"],
  ];
  for (const [re, why] of forbidden) {
    const hit = copy.match(re);
    assert.ok(!hit, `the landing page ${why}: "${hit?.[0]}"`);
  }
  // And it still makes the claim that IS true, or the fix removed a real
  // selling point instead of correcting it.
  assert.match(PAGE, /analysis runs on your phone, not on a server/i,
    "the on-device analysis claim is gone entirely");
});

test("the hero leads with what is actually different", () => {
  const hero = PAGE.slice(PAGE.indexOf("<h1"), PAGE.indexOf("</h1>"));
  assert.match(hero, /position/i, "the headline no longer mentions the position, which is the differentiator");
});
