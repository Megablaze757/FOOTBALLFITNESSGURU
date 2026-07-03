import { test } from "node:test";
import assert from "node:assert/strict";
import { buildShareSvg } from "./share-card";

test("buildShareSvg embeds the headline and stats, and escapes markup", () => {
  const svg = buildShareSvg({
    name: "Alex <A>",
    headlineValue: "12",
    headlineLabel: "sessions",
    stats: [{ label: "Reps", value: "1,250" }, { label: "PR", value: "110kg" }],
    caption: "Go",
  });
  assert.match(svg, /^<svg[\s\S]+<\/svg>$/);
  assert.match(svg, />12</);
  assert.match(svg, /1,250/);
  assert.match(svg, /Alex &lt;A&gt;/); // escaped
  assert.doesNotMatch(svg, /<A>/);
});

test("caps at three stats", () => {
  const svg = buildShareSvg({
    name: "A", headlineValue: "1", headlineLabel: "x",
    stats: [1, 2, 3, 4, 5].map((i) => ({ label: `L${i}`, value: `${i}` })),
  });
  assert.ok(svg.includes("L1") && svg.includes("L3"));
  assert.ok(!svg.includes("L4"));
});
