// The five sections of a session, and the colours that tell them apart.
//
// The spec asked for each block of a session to be recognisable before it is
// read: rehab orange, warm-up blue, the main work in the app's own gold,
// conditioning green, cool-down purple. A session is scanned far more often
// than it is read, and five identical grey blocks make that impossible.
//
// Asserted against the source rather than a rendered DOM: these are Tailwind
// class names on a client component with data fetching behind it, and the thing
// that actually breaks is somebody changing one and not the other three places
// the same section is coloured.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../components/SessionDrills.tsx", import.meta.url), "utf8");

const SECTIONS: { label: string; hue: string }[] = [
  { label: "Rehab", hue: "orange" },
  { label: "Warm-up", hue: "sky" },
  { label: "Conditioning", hue: "emerald" },
  { label: "Cool-down", hue: "violet" },
];

test("each section carries its own colour", () => {
  for (const { label, hue } of SECTIONS) {
    const entry = new RegExp(`label: "${label}"[^}]*`).exec(SRC)?.[0] ?? "";
    assert.ok(entry, `no section called "${label}"`);
    assert.ok(entry.includes(`border-l-${hue}-`), `${label} has no ${hue} edge: ${entry}`);
    assert.ok(entry.includes(`bg-${hue}-`), `${label} has no ${hue} wash: ${entry}`);
  }
});

test("the main work wears the app's own colour", () => {
  // Everything else is a supporting section. The lifts are the session.
  const entry = /label: "Main \/ Strength"[^}]*/.exec(SRC)?.[0] ?? "";
  assert.ok(entry, "there is no main-work section");
  assert.ok(entry.includes("border-l-pitch-400"), `the main section is not the primary colour: ${entry}`);
});

test("no two sections share a colour", () => {
  const hues = SECTIONS.map((s) => s.hue).concat("pitch");
  assert.equal(new Set(hues).size, hues.length, "two sections are the same colour, so neither is a signal");
});

test("there is no SECONDARY section", () => {
  // "Main work", then "Secondary", then "Accessory" is how a coach FILES a
  // session and not how anybody reads one — three headings over eight
  // exercises, and an athlete reasonably asking what a secondary section is.
  // The tiers still decide the order and are shown per exercise instead.
  assert.ok(!/label: "Secondary"/i.test(SRC), "the Secondary heading is back");
  assert.ok(!/label: "Accessory"/i.test(SRC), "the Accessory heading is back");
  assert.match(SRC, /const WORKING: \(Slot \| null\)\[\] = \["primary", "secondary", "accessory"\]/,
    "the three working slots no longer share one heading");
});

test("the rehab section is the one that says to do it first", () => {
  // It comes from a different document with a different reason, and folding it
  // into the warm-up presents a hamstring protocol as a way to get warm.
  assert.match(SRC, /Rehab <span[^>]*>do this first/);
});
