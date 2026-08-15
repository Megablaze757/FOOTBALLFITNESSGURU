import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  latestBodyweight, weightAgeDays, weightProvenance, weightIsStale, WEIGHT_STALE_DAYS,
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
