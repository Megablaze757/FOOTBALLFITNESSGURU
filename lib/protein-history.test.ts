import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SNAPSHOTS, history, latest, changeSince, chartPoints, snapshotNow, MIN_POINTS,
} from "./protein-history";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THIS TEST IS THE FEATURE.
 *
 * A recorded series is accurate for exactly as long as somebody remembers to
 * record it. The prices in lib/food-db.ts are overwritten in place, so a price
 * edit with no snapshot leaves a published price index quietly claiming last
 * month's number — and nothing about the page would look wrong.
 *
 * So the drift is a failing test. Edit a price, this goes red, and the fix is
 * `npm run protein:snapshot`. Without it this file would be right for one week
 * and misleading for a year.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the newest snapshot still matches what the index says today", () => {
  const newest = latest();
  assert.ok(newest, "the series has no readings at all");
  const now = snapshotNow(newest.date);

  assert.deepEqual(
    { cheapest: now.cheapest, dearest: now.dearest, median: now.median, count: now.count },
    { cheapest: newest.cheapest, dearest: newest.dearest, median: newest.median, count: newest.count },
    "shelf prices have moved since the last reading — run `npm run protein:snapshot`",
  );
  assert.equal(now.cheapestName, newest.cheapestName,
    "a different food is cheapest now, which IS the story — run `npm run protein:snapshot`");
});

/** Append only. A price index that gets tidied up is not a price index. */
test("readings are dated, unique and in order", () => {
  const seen = new Set<string>();
  for (const s of SNAPSHOTS) {
    assert.match(s.date, /^\d{4}-\d{2}-\d{2}$/, `${s.date} is not a date`);
    assert.ok(!seen.has(s.date), `two readings on ${s.date}`);
    seen.add(s.date);
    assert.ok(s.count > 0, "a reading with no foods in it");
    assert.ok(s.cheapest > 0 && s.dearest >= s.cheapest, `${s.date}: cheapest is not the cheapest`);
    assert.ok(s.median >= s.cheapest && s.median <= s.dearest, `${s.date}: the median is outside the range`);
    assert.ok(s.cheapestName.trim() && s.dearestName.trim(), `${s.date}: a reading with no name on it`);
  }
  assert.deepEqual(history().map((s) => s.date), [...SNAPSHOTS].map((s) => s.date).sort(),
    "history() must return them oldest first whatever order the file is in");
});

/**
 * "No change since September" is a claim about a period nobody measured. The
 * difference between "flat" and "not yet known" is the whole credibility of a
 * price index, and a zero is the easy wrong answer.
 */
test("one reading is not a trend", () => {
  if (SNAPSHOTS.length >= 2) {
    const c = changeSince()!;
    assert.ok(c, "two readings must produce a change");
    assert.equal(c.pence, Math.round((c.to - c.from) * 100));
    return;
  }
  assert.equal(changeSince(), null, "a single reading must not report a change of zero");
  assert.equal(chartPoints(), null, "a single reading must not be drawn as a chart");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FLOOR IS ZERO, WHICH IS THE ONE THING PRICE CHARTS GET WRONG.
 *
 * Scaled to its own minimum, a 2p move becomes a cliff. This one is published
 * as a reference and quoted by people who will not check the axis.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the chart is drawn from zero and spaced by date", () => {
  const fake = [
    { date: "2026-01-01", count: 20, cheapest: 0.3, cheapestName: "a", dearest: 3, dearestName: "z", median: 1 },
    { date: "2026-02-01", count: 20, cheapest: 0.32, cheapestName: "a", dearest: 3, dearestName: "z", median: 1 },
    { date: "2026-07-01", count: 20, cheapest: 0.34, cheapestName: "a", dearest: 3, dearestName: "z", median: 1 },
  ];
  const original = SNAPSHOTS.splice(0, SNAPSHOTS.length, ...fake);
  try {
    const pts = chartPoints()!;
    assert.equal(pts.length, MIN_POINTS);
    assert.equal(pts[0].x, 0);
    assert.equal(pts[2].x, 1);
    // One month of six is a sixth of the way across, NOT half — evenly spacing
    // the readings would draw a month and five months as the same distance.
    assert.ok(pts[1].x < 0.25, `a month into six sat at ${pts[1].x.toFixed(2)} of the width`);

    // Zero floor: a 4p rise on a 30p base is a small rise, not a doubling.
    assert.ok(pts[0].y > 0.7, `the cheapest point sat at ${pts[0].y.toFixed(2)} — the axis is not from zero`);
    assert.ok(pts[2].y <= 1, "the top point is outside the frame");
    assert.ok(pts[2].y > pts[0].y, "the line goes the wrong way");
  } finally {
    SNAPSHOTS.splice(0, SNAPSHOTS.length, ...original);
  }
  assert.equal(SNAPSHOTS.length, original.length, "the real series was not put back");
});
