import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weightTrend, changeLabel, spanLabel, direction, isTowardGoal, NOISE_KG, TREND_WINDOWS,
} from "./weight-trend";
import type { Bodyweight } from "./bodyweight";

const w = (date: string, kg: number, source: Bodyweight["source"] = "weigh-in"): Bodyweight =>
  ({ date, kg, source });

const TODAY = "2026-08-24";

test("no history means no trend, and no invented one", () => {
  const t = weightTrend([], TODAY);
  assert.equal(t.latest, null);
  assert.deepEqual(t.windows, []);
  assert.deepEqual(t.entries, []);
});

test("a single reading is not a trend", () => {
  const t = weightTrend([w(TODAY, 80)], TODAY);
  assert.equal(t.latest?.kg, 80);
  assert.deepEqual(t.windows, [], "nothing to compare against");
});

/**
 * THE LIE THIS EXISTS TO PREVENT. Nine days of history cannot answer "how much
 * this month", and answering it with the nine-day change gets acted on:
 * somebody cutting reads "−2.1 kg this month" and eats accordingly.
 */
test("a window with nothing old enough behind it is not reported", () => {
  const series = [w("2026-08-15", 82), w("2026-08-24", 80)];
  const t = weightTrend(series, TODAY);
  assert.deepEqual(t.windows.map((x) => x.days), [7], "7 only — 30 and 90 cannot be answered");
});

test("each window compares against the closest entry that is still old enough", () => {
  const series = [
    w("2026-05-01", 90),  // 115 days
    w("2026-07-01", 86),  // 54 days
    w("2026-07-25", 84),  // 30 days
    w("2026-08-17", 81),  // 7 days
    w("2026-08-24", 80),  // today
  ];
  const t = weightTrend(series, TODAY);
  const by = new Map(t.windows.map((x) => [x.days, x]));

  assert.equal(by.get(7)!.from.date, "2026-08-17");
  assert.equal(by.get(7)!.change, -1);
  assert.equal(by.get(30)!.from.date, "2026-07-25", "not the 7-day point, which is inside the window");
  assert.equal(by.get(30)!.change, -4);
  assert.equal(by.get(90)!.from.date, "2026-05-01");
  assert.equal(by.get(90)!.change, -10);
});

test("it never reaches forwards to a point inside the window", () => {
  // Nothing at 30 days; the only older entry is 60 days back.
  const series = [w("2026-06-25", 88), w("2026-08-20", 84), w("2026-08-24", 83)];
  const t = weightTrend(series, TODAY);
  const thirty = t.windows.find((x) => x.days === 30);
  assert.equal(thirty?.from.date, "2026-06-25", "an older point answers; a newer one may not");
  assert.ok(thirty!.spanDays > 30, "and the span says what was actually measured");
});

/**
 * Bodyweight moves a kilo either way on water and salt. An up-arrow over 0.2 kg
 * is the app inventing a trend out of hydration, and somebody told they gained
 * every other Tuesday stops believing any of it.
 */
test("movement under the noise floor is steady, not a direction", () => {
  assert.equal(direction(0), "steady");
  assert.equal(direction(0.2), "steady");
  assert.equal(direction(-0.2), "steady");
  assert.equal(direction(NOISE_KG), "up");
  assert.equal(direction(-NOISE_KG), "down");

  const t = weightTrend([w("2026-08-17", 80), w("2026-08-24", 80.2)], TODAY);
  assert.equal(t.windows[0].direction, "steady");
});

test("a weekly rate is only offered over a span long enough to mean anything", () => {
  const short = weightTrend([w("2026-08-17", 82), w("2026-08-24", 81)], TODAY);
  assert.equal(short.windows[0].perWeek, null, "seven days is one data point of rate");

  const long = weightTrend([w("2026-07-25", 84), w("2026-08-24", 80)], TODAY);
  const thirty = long.windows.find((x) => x.days === 30)!;
  assert.equal(thirty.spanDays, 30);
  assert.equal(thirty.perWeek, -0.9);
});

test("floating point does not leak into a weight difference", () => {
  const t = weightTrend([w("2026-08-17", 80.3), w("2026-08-24", 79.1)], TODAY);
  assert.equal(t.windows[0].change, -1.2, "not -1.1999999999999957");
});

test("entries come back newest first, because that is the one being fixed", () => {
  const t = weightTrend([w("2026-08-01", 82), w("2026-08-24", 80)], TODAY);
  assert.deepEqual(t.entries.map((e) => e.date), ["2026-08-24", "2026-08-01"]);
});

test("an undated profile weight cannot be trended and is dropped", () => {
  const t = weightTrend([{ kg: 80, date: null, source: "profile" }], TODAY);
  assert.equal(t.latest, null);
  assert.deepEqual(t.entries, []);
});

test("the labels say the sign and the real span", () => {
  assert.equal(changeLabel(-1.4), "−1.4 kg");
  assert.equal(changeLabel(0.8), "+0.8 kg");
  assert.equal(changeLabel(0.1), "steady");
  assert.equal(spanLabel({ spanDays: 1 } as never), "over 1 day");
  assert.equal(spanLabel({ spanDays: 26 } as never), "over 26 days");
});

/**
 * Losing two kilos is a win on a cut and a problem on a bulk. Colouring every
 * drop green tells a teenager trying to add size that they are doing well
 * while they lose it.
 */
test("whether a change is good news depends on the goal, and is not decided here", () => {
  assert.equal(isTowardGoal(-2, "cut"), true);
  assert.equal(isTowardGoal(-2, "build"), false);
  assert.equal(isTowardGoal(2, "build"), true);
  assert.equal(isTowardGoal(2, "maintain"), false);
  assert.equal(isTowardGoal(-2, null), null, "no goal, no verdict");
  assert.equal(isTowardGoal(0.1, "cut"), null, "steady is not progress or regress");
});

test("the windows are shortest first, so the UI reads left to right", () => {
  assert.deepEqual([...TREND_WINDOWS], [7, 30, 90]);
});
