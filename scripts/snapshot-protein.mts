#!/usr/bin/env node
// =============================================================================
// Record today's protein index into lib/protein-history.ts.
//
// The prices in lib/food-db.ts are overwritten in place, so the only way to
// have a series is to write one down as it happens. Run this whenever the
// shelf prices are updated — lib/protein-history.test.ts fails until you do,
// which is the whole reason the series will still be accurate next year.
//
// Idempotent per day: running it twice replaces today's reading rather than
// adding a second one.
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { snapshotNow, type Snapshot } from "../lib/protein-history";

const FILE = "lib/protein-history.ts";

function render(s: Snapshot): string {
  return `  {
    date: ${JSON.stringify(s.date)},
    count: ${s.count},
    cheapest: ${s.cheapest.toFixed(2)},
    cheapestName: ${JSON.stringify(s.cheapestName)},
    dearest: ${s.dearest.toFixed(2)},
    dearestName: ${JSON.stringify(s.dearestName)},
    median: ${s.median.toFixed(2)},
  },`;
}

function main(): void {
  const today = new Date().toISOString().slice(0, 10);
  const snap = snapshotNow(today);

  const src = readFileSync(FILE, "utf8");
  // The WHOLE declaration, not a prefix. Searching for the next "[" after
  // `export const SNAPSHOTS` finds the one in `Snapshot[]` and rewrites the
  // type annotation instead of the array — which is what happened the first
  // time this ran, and it produced a file that still compiled.
  const MARKER = "export const SNAPSHOTS: Snapshot[] = [";
  const open = src.indexOf(MARKER);
  const close = src.indexOf("\n];", open);
  if (open === -1 || close === -1) throw new Error(`could not find SNAPSHOTS in ${FILE}`);

  const bodyStart = open + MARKER.length;
  const body = src.slice(bodyStart, close);
  // Drop any reading already taken today, so a second run replaces rather than
  // duplicates. Entries are whole objects; splitting on "  {" is safe because
  // this file is only ever written by this script.
  const kept = body
    .split(/\n(?=  \{)/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0 && !e.includes(`date: ${JSON.stringify(today)}`))
    .map((e) => `  ${e}`);

  const next = `${src.slice(0, bodyStart)}\n${[...kept, render(snap)].join("\n")}\n${src.slice(close + 1)}`;
  writeFileSync(FILE, next);
  console.log(`recorded ${today}: cheapest £${snap.cheapest.toFixed(2)} (${snap.cheapestName}), `
    + `median £${snap.median.toFixed(2)}, ${snap.count} foods`);
}

main();
