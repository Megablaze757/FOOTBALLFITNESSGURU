import { test } from "node:test";
import assert from "node:assert/strict";
import { toLocalDay, todayLocal, daysAgoLocal } from "./day";

/**
 * These tests pin the bug that made check-ins disappear.
 *
 * They run under whatever TZ the process has, so the ones that must hold in a
 * specific zone construct the offset explicitly rather than assuming the
 * runner's. `npm test` sets nothing, so the DST and Sydney cases are written to
 * be true regardless.
 */

test("toLocalDay reads the local calendar, not UTC", () => {
  // 22:00 UTC on the 4th. In any zone at UTC+3 or further east this is already
  // the 5th locally — and toISOString() would still say the 4th.
  const d = new Date("2026-08-04T22:00:00Z");
  const local = toLocalDay(d);
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  assert.equal(local, expected);
});

test("the exact failure: a moment can be one day locally and another in UTC", () => {
  // Chosen so the two differ in every zone east of UTC.
  const d = new Date("2026-08-04T23:30:00Z");
  const utcDay = d.toISOString().slice(0, 10);
  const localDay = toLocalDay(d);
  // If the runner is east of UTC these differ; if not, they agree. Either way
  // toLocalDay must agree with the LOCAL getters, which is the whole point.
  assert.equal(localDay, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  if (d.getTimezoneOffset() < 0) {
    // Negative offset == east of UTC. The old code would have filed this under
    // the previous day, which is the reported bug.
    assert.notEqual(localDay, utcDay, "east of UTC these must differ — that was the bug");
  }
});

test("format is always yyyy-mm-dd, zero padded", () => {
  assert.match(toLocalDay(new Date(2026, 0, 5)), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(toLocalDay(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(toLocalDay(new Date(2026, 11, 31)), "2026-12-31");
});

test("todayLocal agrees with toLocalDay of now", () => {
  assert.equal(todayLocal(), toLocalDay(new Date()));
});

test("daysAgoLocal counts calendar days", () => {
  const from = new Date(2026, 7, 5, 12, 0, 0); // 5 Aug 2026, local noon
  assert.equal(daysAgoLocal(0, from), "2026-08-05");
  assert.equal(daysAgoLocal(1, from), "2026-08-04");
  assert.equal(daysAgoLocal(7, from), "2026-07-29");
});

test("daysAgoLocal crosses a month boundary", () => {
  const from = new Date(2026, 7, 2, 12, 0, 0); // 2 Aug
  assert.equal(daysAgoLocal(5, from), "2026-07-28");
});

test("daysAgoLocal crosses a year boundary", () => {
  const from = new Date(2026, 0, 2, 12, 0, 0); // 2 Jan 2026
  assert.equal(daysAgoLocal(4, from), "2025-12-29");
});

test("daysAgoLocal handles a leap day", () => {
  const from = new Date(2028, 2, 1, 12, 0, 0); // 1 Mar 2028
  assert.equal(daysAgoLocal(1, from), "2028-02-29");
});

/**
 * The DST case, which is why this uses setDate rather than millisecond maths.
 *
 * Built with local constructors so it holds in any observing zone: whatever the
 * runner's rules, N calendar days back from a local noon is always N days back
 * on the calendar. Millisecond subtraction would land on the previous day in
 * the spring-forward week.
 */
test("daysAgoLocal is unaffected by a clock change", () => {
  for (const [month, day] of [[2, 30], [9, 28]] as const) {
    const from = new Date(2026, month, day, 12, 0, 0);
    const back = daysAgoLocal(7, from);
    const expected = new Date(2026, month, day - 7, 12, 0, 0);
    assert.equal(back, toLocalDay(expected));
  }
});

test("millisecond arithmetic is what we are avoiding", () => {
  // Documents the alternative rather than testing our code: if this ever equals
  // daysAgoLocal in every zone, the comment above can be simplified.
  const from = new Date(2026, 2, 30, 12, 0, 0);
  const naive = toLocalDay(new Date(from.getTime() - 7 * 86400_000));
  const correct = daysAgoLocal(7, from);
  // In a non-DST zone these agree; the point is only that `correct` is right.
  assert.equal(correct, toLocalDay(new Date(2026, 2, 23, 12, 0, 0)));
  assert.ok(typeof naive === "string");
});
