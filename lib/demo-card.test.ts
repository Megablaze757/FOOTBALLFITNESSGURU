import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemoCardSvg, DEMO_SCREENS } from "./demo-card";
import { FACT_GROUPS, allFacts, PILLARS, NEVER_CLAIM } from "./content";

test("every demo screen renders a square SVG", () => {
  for (const s of DEMO_SCREENS) {
    const svg = buildDemoCardSvg({ screen: s.id });
    assert.match(svg, /^<svg /, `${s.id} is not an SVG`);
    assert.match(svg, /width="1080" height="1080"/);
    assert.match(svg, /<\/svg>$/);
  }
});

test("nothing is drawn outside the canvas", () => {
  for (const s of DEMO_SCREENS) {
    const svg = buildDemoCardSvg({ screen: s.id });
    for (const m of svg.matchAll(/ (?:x|y|cx|cy)="(-?\d+(?:\.\d+)?)"/g)) {
      const v = Number(m[1]);
      assert.ok(v >= -10 && v <= 1090, `${s.id} places something at ${v}`);
    }
  }
});

test("the headline is overridable", () => {
  const svg = buildDemoCardSvg({ screen: "readiness", headline: "Your body said no" });
  assert.ok(svg.includes("Your body said no"));
});

test("special characters in a headline are escaped", () => {
  const svg = buildDemoCardSvg({ screen: "program", headline: 'Sleep & "recovery" <matter>' });
  assert.ok(!svg.includes("<matter>"), "an unescaped tag would break the SVG");
  const textNodes = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
  for (const t of textNodes) assert.ok(!t.includes("<"), `raw '<' left in "${t}"`);
});

test("demo screens show no real athlete's data", () => {
  // The whole point of drawing rather than screenshotting. If a real name or
  // email ever appears here it has leaked from somewhere it shouldn't.
  for (const s of DEMO_SCREENS) {
    const svg = buildDemoCardSvg({ screen: s.id });
    // A real address, not the "@" in "4 × 6 @ RPE 7".
    assert.ok(!/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(svg), `${s.id} contains an email address`);
    assert.ok(!/sacharaif|freddie|jackson/i.test(svg), `${s.id} leaks a real name`);
    // UUIDs would mean a database row got in here.
    assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(svg), `${s.id} contains an id`);
  }
});

// --- The fact list -----------------------------------------------------------

test("facts are non-empty and unique", () => {
  const facts = allFacts();
  assert.ok(facts.length > 20, `only ${facts.length} facts`);
  assert.equal(new Set(facts).size, facts.length, "duplicate fact");
  for (const f of facts) assert.ok(f.trim().length > 15, `too short to be a claim: "${f}"`);
});

test("no fact makes a claim we told the writer never to make", () => {
  // The fact list is what the AI is allowed to build on, so a bad claim here
  // defeats every guard downstream.
  const banned = /\b(\d[\d,.]*\s*(k|m|\+)?\s*(users|athletes|members|downloads|customers)|thousands of|trusted by|clinically proven|guaranteed?|cures?|prevents? injur|diagnoses)\b/i;
  for (const f of allFacts()) {
    assert.ok(!banned.test(f), `unsupportable claim in the fact list: "${f}"`);
  }
});

test("fact group ids are unique", () => {
  const ids = FACT_GROUPS.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("the pillars add up to a full week", () => {
  assert.equal(PILLARS.reduce((n, p) => n + p.share, 0), 10);
  for (const p of PILLARS) assert.ok(p.prompts.length > 0, `${p.id} has no prompts`);
});

test("the never-claim list is populated", () => {
  assert.ok(NEVER_CLAIM.length >= 4);
});
