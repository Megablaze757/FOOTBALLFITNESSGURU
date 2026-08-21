import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  latestBodyweight, weightSeries, weightAgeDays, weightProvenance, weightIsStale, WEIGHT_STALE_DAYS,
} from "./bodyweight";

test("the freshest weight wins, whichever table it came from", () => {
  const w = latestBodyweight({
    checkIns: [{ date: "2026-08-01", kg: 80 }],
    weighIns: [{ date: "2026-08-10", kg: 78.5 }],
  });
  assert.equal(w?.kg, 78.5);
  assert.equal(w?.source, "weigh-in");

  const other = latestBodyweight({
    checkIns: [{ date: "2026-08-12", kg: 81 }],
    weighIns: [{ date: "2026-08-10", kg: 78.5 }],
  });
  assert.equal(other?.kg, 81);
  assert.equal(other?.source, "check-in");
});

test("rows arrive in any order and the newest still wins", () => {
  // Queries are ordered, but a resolver that only works on sorted input is a
  // resolver that breaks the first time somebody drops the .order() clause.
  const w = latestBodyweight({
    checkIns: [
      { date: "2026-08-01", kg: 80 },
      { date: "2026-08-14", kg: 77 },
      { date: "2026-07-02", kg: 84 },
    ],
  });
  assert.equal(w?.kg, 77);
});

test("a tie on the same day goes to the scale, not the slider", () => {
  const w = latestBodyweight({
    checkIns: [{ date: "2026-08-10", kg: 81 }],
    weighIns: [{ date: "2026-08-10", kg: 78.5 }],
  });
  assert.equal(w?.source, "weigh-in");
  assert.equal(w?.kg, 78.5);
});

/**
 * THE ACTUAL BUG. Progress read profiles.weight_kg, which nothing writes, while
 * the athlete's weight sat in the check-in table the whole time.
 */
test("a weight recorded only in the check-in still resolves", () => {
  const w = latestBodyweight({
    checkIns: [{ date: "2026-08-14", kg: 76 }],
    weighIns: [],
    profileKg: null,
  });
  assert.equal(w?.kg, 76, "the check-in weight did not resolve — this is the Progress bug");
});

test("the profile is a fallback, never a peer", () => {
  // It has no date, so it cannot out-rank a dated row however old that row is.
  const w = latestBodyweight({
    checkIns: [{ date: "2020-01-01", kg: 70 }],
    profileKg: 95,
  });
  assert.equal(w?.kg, 70);

  // But it still answers when nothing else does.
  const only = latestBodyweight({ profileKg: 95 });
  assert.equal(only?.kg, 95);
  assert.equal(only?.source, "profile");
  assert.equal(only?.date, null);
});

/**
 * ABSENT IS NOT ZERO — the mistake the Rewards page made with `weight_kg ?? 0`.
 * A zero bodyweight does not mean "weightless", it means "we do not know", and
 * dividing a lift by it ranks everybody as World Class or as nothing.
 */
test("zero, negative and non-finite weights are absent, not real", () => {
  for (const bad of [0, -5, NaN, Infinity]) {
    assert.equal(latestBodyweight({ checkIns: [{ date: "2026-08-14", kg: bad }] }), null, `${bad} was treated as a weight`);
    assert.equal(latestBodyweight({ profileKg: bad }), null, `${bad} was treated as a profile weight`);
  }
  assert.equal(latestBodyweight({ checkIns: [{ date: "2026-08-14", kg: null }] }), null);
  assert.equal(latestBodyweight({ checkIns: [{ date: "2026-08-14", kg: undefined }] }), null);
});

test("nothing anywhere resolves to null rather than a guess", () => {
  assert.equal(latestBodyweight({}), null);
  assert.equal(latestBodyweight({ checkIns: [], weighIns: [], profileKg: null }), null);
  assert.equal(latestBodyweight({ checkIns: null, weighIns: null }), null);
});

test("a row with no date cannot masquerade as dated", () => {
  const w = latestBodyweight({ checkIns: [{ date: "", kg: 80 }], profileKg: 70 });
  assert.equal(w?.kg, 70, "an undated row was accepted as a dated one");
});

test("age is measured in whole days and never negative", () => {
  const w = { kg: 80, date: "2026-08-01", source: "check-in" as const };
  assert.equal(weightAgeDays(w, "2026-08-15"), 14);
  assert.equal(weightAgeDays(w, "2026-08-01"), 0);
  // A weight logged "tomorrow" (a device clock askew) reads as today, not -1.
  assert.equal(weightAgeDays(w, "2026-07-30"), 0);
  assert.equal(weightAgeDays(null, "2026-08-15"), null);
  assert.equal(weightAgeDays({ kg: 80, date: null, source: "profile" }, "2026-08-15"), null);
});

test("provenance says where the number came from and how old it is", () => {
  const on = (date: string | null, source: "check-in" | "weigh-in" | "profile" = "check-in") =>
    weightProvenance({ kg: 80, date, source }, "2026-08-15");
  assert.equal(on("2026-08-15"), "from today's check-in");
  assert.equal(on("2026-08-14"), "from yesterday's check-in");
  assert.equal(on("2026-08-10"), "from your check-in 5 days ago");
  assert.equal(on("2026-08-10", "weigh-in"), "from your weigh-in 5 days ago");
  assert.match(on("2026-07-15") ?? "", /weeks ago/);
  assert.match(on("2026-05-15") ?? "", /months ago/);
  assert.equal(on(null, "profile"), "from your profile");
  assert.equal(weightProvenance(null, "2026-08-15"), null);
});

test("staleness is a nudge, and an undated weight is never called stale", () => {
  assert.equal(weightIsStale({ kg: 80, date: "2026-08-14", source: "check-in" }, "2026-08-15"), false);
  assert.equal(weightIsStale({ kg: 80, date: "2026-06-01", source: "check-in" }, "2026-08-15"), true);
  // Exactly on the boundary counts, so the copy and the flag cannot disagree.
  const boundary = new Date(Date.UTC(2026, 7, 15) - WEIGHT_STALE_DAYS * 86_400_000)
    .toISOString().slice(0, 10);
  assert.equal(weightIsStale({ kg: 80, date: boundary, source: "check-in" }, "2026-08-15"), true);
  assert.equal(weightIsStale({ kg: 80, date: null, source: "profile" }, "2026-08-15"), false);
  assert.equal(weightIsStale(null, "2026-08-15"), false);
});

/**
 * THE REGRESSION GUARD.
 *
 * The bug was not that a function was wrong — it was that two screens read a
 * column nothing writes. A unit test of the resolver cannot catch that coming
 * back, so these read the call sites.
 */
test("no screen resolves bodyweight from the profile column alone", () => {
  const files = [
    "../components/ProgressPanel.tsx",
    "../app/(app)/rewards/page.tsx",
  ];
  for (const f of files) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.match(src, /latestBodyweight/,
      `${f} does not use the shared bodyweight resolver, so it can go back to reading a column nothing writes`);
  }
});

test("the rewards page never defaults a missing bodyweight to zero", () => {
  const src = readFileSync(new URL("../app/(app)/rewards/page.tsx", import.meta.url), "utf8");
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/weight_kg\s*\?\?\s*0/.test(noComments),
    "`weight_kg ?? 0` is back: every lift divided by a zero bodyweight ranks as nothing");
});

// --- the chart, which was reading one table -----------------------------------

/**
 * THE OTHER HALF OF THE SAME BUG. Every reader was taught to look in both
 * tables. The chart on /body was not — it plotted body_logs alone, so an
 * athlete who answers the weight question in their daily check-in saw a trend
 * that stopped at whenever they last opened that page. "Shows old data instead
 * of the most recent", and the recent data was two tables deep in the app.
 */
test("the trend is drawn from every weight the athlete has recorded", () => {
  const series = weightSeries({
    checkIns: [
      { date: "2026-08-12", kg: 79.2 },
      { date: "2026-08-14", kg: 78.8 },
    ],
    weighIns: [{ date: "2026-08-01", kg: 80 }],
  });
  assert.deepEqual(series.map((p) => p.date), ["2026-08-01", "2026-08-12", "2026-08-14"]);
  assert.equal(series[2].kg, 78.8, "the check-in weights are missing from the chart");
});

test("the chart reads left to right, whatever order the rows arrived in", () => {
  const series = weightSeries({
    checkIns: [{ date: "2026-08-14", kg: 77 }, { date: "2026-07-02", kg: 84 }],
    weighIns: [{ date: "2026-08-01", kg: 80 }],
  });
  assert.deepEqual(series.map((p) => p.kg), [84, 80, 77], "oldest first, so a chart needs no reversing");
});

test("one day is one point", () => {
  // Two bars for one Tuesday reads as a two-kilo swing inside a day. The scale
  // wins the tie, for the same reason it wins it in latestBodyweight.
  const series = weightSeries({
    checkIns: [{ date: "2026-08-10", kg: 81 }],
    weighIns: [{ date: "2026-08-10", kg: 78.5 }],
  });
  assert.equal(series.length, 1);
  assert.equal(series[0].kg, 78.5);
  assert.equal(series[0].source, "weigh-in");
});

test("the headline number is the end of the line it is drawn beside", () => {
  // They are one function now precisely so they cannot disagree — a page that
  // says 78.8 kg above a chart ending at 80 is a page nobody trusts again.
  const sources = {
    checkIns: [{ date: "2026-08-14", kg: 78.8 }, { date: "2026-08-02", kg: 80 }],
    weighIns: [{ date: "2026-08-10", kg: 79.4 }, { date: "2026-08-14", kg: 78.5 }],
  };
  const series = weightSeries(sources);
  assert.deepEqual(latestBodyweight(sources), series[series.length - 1]);
});

test("nothing recorded is an empty chart, not a zero", () => {
  assert.deepEqual(weightSeries({}), []);
  assert.deepEqual(weightSeries({ checkIns: [{ date: "2026-08-10", kg: 0 }], weighIns: null }), [],
    "a zero weight is absent, not a data point at the bottom of the axis");
  // A profile weight has no date, so it cannot be plotted — and must not
  // silently become today's bar.
  assert.equal(latestBodyweight({ profileKg: 80 })?.source, "profile");
});

test("the Body page asks both tables", () => {
  // THE TEST THAT WOULD HAVE CAUGHT IT. weightSeries can be perfect and the
  // page still draws half the data if it only ever queries one table — the bug
  // lives in the seam, so the test has to span it.
  const page = readFileSync(new URL("../app/(app)/body/page.tsx", import.meta.url), "utf8");
  assert.match(page, /from\("body_logs"\)/);
  assert.match(page, /from\("daily_check_ins"\)/, "the check-in weights are still invisible on this page");
  assert.match(page, /weightSeries\(/, "the page is still merging the two sources by hand");
});
