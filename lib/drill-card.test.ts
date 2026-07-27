import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDrillCardSvg } from "./drill-card";
import { SKILL_DRILLS } from "./skills";

const drill = SKILL_DRILLS[0];

test("produces a square SVG at post resolution", () => {
  const svg = buildDrillCardSvg({ drill, sportLabel: "Football" });
  assert.match(svg, /^<svg /);
  assert.match(svg, /width="1080" height="1080"/);
  assert.match(svg, /<\/svg>$/);
});

test("every drill renders without throwing or overflowing", () => {
  for (const d of SKILL_DRILLS) {
    for (const style of ["drill", "cue"] as const) {
      const svg = buildDrillCardSvg({ drill: d, sportLabel: "Football", style });
      // Nothing may be positioned outside the canvas — an off-card line is
      // invisible in the SVG string but obvious in the exported PNG.
      for (const m of svg.matchAll(/ y="(-?\d+)"/g)) {
        const y = Number(m[1]);
        assert.ok(y >= 0 && y <= 1080, `${d.id} (${style}) places text at y=${y}`);
      }
      for (const m of svg.matchAll(/ x="(-?\d+)"/g)) {
        const x = Number(m[1]);
        assert.ok(x >= 0 && x <= 1080, `${d.id} (${style}) places text at x=${x}`);
      }
    }
  }
});

test("the coaching cue is on the card", () => {
  const svg = buildDrillCardSvg({ drill, sportLabel: "Football" });
  // Wrapping splits it, so check the opening words survive.
  const opening = drill.coaching.split(/\s+/).slice(0, 3).join(" ");
  assert.ok(svg.includes(opening), "the cue is the payoff — it must appear");
});

test("XML special characters are escaped", () => {
  const nasty = { ...drill, name: 'Wall & "pass" <drill>', coaching: "A & B < C" };
  const svg = buildDrillCardSvg({ drill: nasty, sportLabel: "Football & Rugby" });
  assert.ok(!svg.includes("<drill>"), "an unescaped tag would break the SVG");
  assert.ok(svg.includes("&amp;"), "ampersands must be escaped");
  // Everything after the opening <svg must still be balanced enough to parse:
  // an unescaped '<' inside a text node is the classic way this silently fails.
  const textNodes = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
  for (const t of textNodes) assert.ok(!t.includes("<"), `raw '<' left in "${t}"`);
});

test("long text is truncated with an ellipsis rather than running off", () => {
  const wordy = { ...drill, coaching: "word ".repeat(120).trim() };
  const svg = buildDrillCardSvg({ drill: wordy, sportLabel: "Football" });
  assert.ok(svg.includes("…"), "truncation should be visible, not silent");
});

test("solo drills are labelled so a viewer knows they can do it alone", () => {
  const solo = SKILL_DRILLS.find((d) => d.needs === "solo")!;
  assert.ok(buildDrillCardSvg({ drill: solo, sportLabel: "Football" }).includes("YOU ONLY"));
  const team = SKILL_DRILLS.find((d) => d.needs === "team")!;
  assert.ok(buildDrillCardSvg({ drill: team, sportLabel: "Football" }).includes("FULL SESSION"));
});

test("the handle is overridable for campaign links", () => {
  const svg = buildDrillCardSvg({ drill, sportLabel: "Football", handle: "pocketathlete.com/waitlist" });
  assert.ok(svg.includes("pocketathlete.com/waitlist"));
});
