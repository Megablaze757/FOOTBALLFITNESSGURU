// =============================================================================
// THE PROTEIN INDEX, OVER TIME.
//
// ═══════════════════════════════════════════════════════════════════════════
// A NUMBER IS A PAGE. A NUMBER WITH A HISTORY IS A REFERENCE.
//
// /cheapest-protein already answers "what is the cheapest 30g of protein in a
// UK supermarket" from real pack sizes and real shelf prices, which is the one
// thing on this site nobody can copy without doing the same work. But a single
// figure is a fact somebody reads once. "31p, up from 27p in March" is a fact
// somebody comes back to, quotes, and links to — and food prices are a subject
// people already track.
//
// ─────────────────────────────────────────────────────────────────────────
// THE SERIES IS RECORDED, NOT RECONSTRUCTED.
//
// There is no way to know what these foods cost last year: the prices live in
// lib/food-db.ts and each edit overwrites the last. So this file holds
// snapshots taken at the time, and it starts with one. A chart of one point is
// not a chart, which is why the page says what it is doing rather than drawing
// a flat line and implying a year of stability nobody measured.
//
// Adding a point is `npm run protein:snapshot`, and lib/protein-history.test.ts
// FAILS when the live index has moved away from the newest snapshot — so a
// price edit cannot quietly leave the series behind. That failing test is the
// mechanism; without it this file would be accurate for one week.
// ═══════════════════════════════════════════════════════════════════════════
// =============================================================================

import { proteinIndex, indexFacts } from "./protein-index";

export interface Snapshot {
  /** ISO date, the day the prices were read. */
  date: string;
  /** Foods that passed both tests on that day. */
  count: number;
  /** £ for 30g of protein from the cheapest qualifying food. */
  cheapest: number;
  /** ...and its name, because the cheapest source changing IS the story. */
  cheapestName: string;
  /** £ for 30g from the dearest. */
  dearest: number;
  dearestName: string;
  /** The middle of the list — moves with the whole shelf, not with one price. */
  median: number;
}

/**
 * Every reading, oldest first.
 *
 * APPEND ONLY, and never edited to make a line look better. The point of a
 * price index is that it is what was there.
 */
export const SNAPSHOTS: Snapshot[] = [
  {
    date: "2026-09-04",
    count: 23,
    cheapest: 0.31,
    cheapestName: "Red lentils",
    dearest: 3.19,
    dearestName: "Cooked king prawns",
    median: 1.13,
  },
];

/** Readings needed before a chart says anything. Two points is a line, and a
 *  line drawn through two points reads as a trend it cannot support. */
export const MIN_POINTS = 3;

export function history(): Snapshot[] {
  return [...SNAPSHOTS].sort((a, b) => a.date.localeCompare(b.date));
}

export function latest(): Snapshot | null {
  const all = history();
  return all[all.length - 1] ?? null;
}

export interface Change {
  /** £ then, £ now. */
  from: number;
  to: number;
  since: string;
  /** Signed pence, rounded — the number people say out loud. */
  pence: number;
  /** Signed percent, one decimal. */
  percent: number;
  direction: "up" | "down" | "flat";
}

/**
 * What has happened since the first reading, or null while there is only one.
 *
 * Null rather than a zero change. "No change since September" is a claim about
 * a period that has not been measured yet, and the difference between "flat"
 * and "not yet known" is the whole credibility of a price index.
 */
export function changeSince(field: "cheapest" | "median" = "cheapest"): Change | null {
  const all = history();
  if (all.length < 2) return null;
  const first = all[0];
  const last = all[all.length - 1];
  const from = first[field];
  const to = last[field];
  const pence = Math.round((to - from) * 100);
  return {
    from, to, since: first.date, pence,
    percent: from === 0 ? 0 : +(((to - from) / from) * 100).toFixed(1),
    direction: pence > 0 ? "up" : pence < 0 ? "down" : "flat",
  };
}

export interface ChartPoint {
  date: string;
  value: number;
  /** 0-1 across the chart, left to right. */
  x: number;
  /** 0-1 up from the floor. */
  y: number;
}

/**
 * Points normalised for drawing, or null when there are too few to draw.
 *
 * THE FLOOR IS ZERO, NOT THE LOWEST READING. A chart scaled to its own minimum
 * turns a 2p move into a cliff, which is the single most common way a price
 * chart misleads — and this one is published as a reference. Headroom above the
 * peak, so the top point is not welded to the frame.
 */
export function chartPoints(field: "cheapest" | "median" = "cheapest"): ChartPoint[] | null {
  const all = history();
  if (all.length < MIN_POINTS) return null;

  const values = all.map((s) => s[field]);
  const top = Math.max(...values) * 1.15 || 1;
  const first = Date.parse(`${all[0].date}T00:00:00Z`);
  const span = Date.parse(`${all[all.length - 1].date}T00:00:00Z`) - first;

  return all.map((s) => ({
    date: s.date,
    value: s[field],
    // Spaced by DATE, not by index. Readings are not taken on a timetable, and
    // evenly spacing them would draw a month and a fortnight as the same
    // distance — which is a chart that lies about how fast something moved.
    x: span === 0 ? 0 : (Date.parse(`${s.date}T00:00:00Z`) - first) / span,
    y: s[field] / top,
  }));
}


/**
 * Today's reading, from the same functions the page renders.
 *
 * IN THE LIBRARY, NOT IN THE SCRIPT, because the test that keeps this series
 * honest has to call it — a guard that lives in a build script is a guard that
 * only runs when somebody remembers to run the build script.
 */
export function snapshotNow(date: string): Snapshot {
  const index = proteinIndex();
  const facts = indexFacts();
  if (!facts) throw new Error("the protein index is empty — nothing to record");

  const costs = index.map((e) => e.cost).sort((a, b) => a - b);
  const median = costs.length % 2
    ? costs[(costs.length - 1) / 2]
    : (costs[costs.length / 2 - 1] + costs[costs.length / 2]) / 2;

  // Rounded to the penny, because that is what a shelf price is and what the
  // page prints. Storing four decimals would make every comparison in the
  // drift test depend on floating-point noise nobody can see.
  const p = (n: number) => Math.round(n * 100) / 100;

  return {
    date,
    count: index.length,
    cheapest: p(facts.cheapest.cost),
    cheapestName: facts.cheapest.name,
    dearest: p(facts.dearest.cost),
    dearestName: facts.dearest.name,
    median: p(median),
  };
}
