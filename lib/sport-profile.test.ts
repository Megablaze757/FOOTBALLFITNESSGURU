import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sportProfile, metricsForSport } from "./sport-profile";
import { sportTerms } from "./sport-terms";
import { METRIC_CATALOG } from "./benchmarks";
import { SPORTS } from "./exercises";

const ALL = SPORTS.map((s) => s.id);

// --- contrast ---------------------------------------------------------------
// The source claims every accent clears 4.5:1 on the app's dark surface. That
// claim is worth exactly as much as a test behind it, so here it is.

const SURFACE = "#0a0a0b"; // ink-900, the page background

function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("every sport accent is readable on the app background", () => {
  for (const id of ALL) {
    const { accent, label } = sportProfile(id);
    const ratio = contrast(accent, SURFACE);
    assert.ok(
      ratio >= 4.5,
      `${label}'s accent ${accent} is ${ratio.toFixed(2)}:1 against ${SURFACE} — WCAG AA needs 4.5:1`
    );
  }
});

test("sports are visually distinguishable from each other", () => {
  const accents = ALL.map((id) => sportProfile(id).accent);
  assert.equal(new Set(accents).size, accents.length, "two sports share an accent, so neither feels like its own");
});

// --- tools ------------------------------------------------------------------

test("every sport reaches every tool", () => {
  // Reordering is the point; hiding is not. A footballer who wants to lift, or
  // a lifter who wants their clip analysed, must still be able to get there.
  const reference = new Set(sportProfile("football").tools.map((t) => t.href));
  for (const id of ALL) {
    const hrefs = sportProfile(id).tools.map((t) => t.href);
    assert.equal(new Set(hrefs).size, hrefs.length, `${id} lists a tool twice`);
    assert.deepEqual(new Set(hrefs), reference, `${id} is missing or inventing a tool`);
  }
});

test("the order actually differs between sports", () => {
  const first = ALL.map((id) => sportProfile(id).tools[0].href);
  assert.ok(new Set(first).size > 1, "every sport leads with the same tool, so the tailoring does nothing");
});

test("a runner leads with load, not drills", () => {
  // Runners get hurt from load errors more than anything else, and ACWR lives
  // on Progress. This is the one ordering with a safety argument behind it.
  assert.equal(sportProfile("running").tools[0].href, "/dashboard");
});

// --- metrics ----------------------------------------------------------------

test("headline metrics all exist in the catalogue", () => {
  const known = new Set(METRIC_CATALOG.map((m) => m.key));
  for (const id of ALL) {
    for (const key of sportProfile(id).headlineMetrics) {
      assert.ok(known.has(key), `${id} promotes "${key}", which no longer exists in METRIC_CATALOG`);
    }
  }
});

test("metricsForSport promotes without dropping anything", () => {
  for (const id of ALL) {
    const ordered = metricsForSport(id, METRIC_CATALOG);
    assert.equal(ordered.length, METRIC_CATALOG.length, `${id} lost or duplicated a metric`);
    assert.equal(new Set(ordered).size, ordered.length, `${id} lists a metric twice`);
    assert.deepEqual(
      ordered.slice(0, sportProfile(id).headlineMetrics.length),
      sportProfile(id).headlineMetrics,
      `${id}'s own tests aren't first`
    );
  }
});

test("a weightlifter isn't asked for a Yo-Yo level first", () => {
  const top5 = metricsForSport("weightlifting", METRIC_CATALOG).slice(0, 5);
  assert.ok(!top5.includes("yo_yo_level"), "a football fitness test led the list for a weightlifter");
  assert.ok(top5.includes("snatch_1rm") && top5.includes("clean_jerk_1rm"));
});

test("a runner is offered runs", () => {
  const top = metricsForSport("running", METRIC_CATALOG).slice(0, 3);
  assert.ok(top.every((k) => k.startsWith("run_")), `expected run times first, got ${top.join(", ")}`);
});

// --- fallbacks --------------------------------------------------------------

test("unknown or missing sports fall back rather than crash", () => {
  for (const bad of [null, undefined, "", "quidditch"]) {
    assert.equal(sportProfile(bad).id, "football");
    assert.ok(sportProfile(bad).tools.length > 0);
  }
});

test("rugby is no longer football wearing a different badge", () => {
  // It was aliased outright, in vocabulary and in tests.
  assert.notEqual(sportTerms("rugby").minutes, sportTerms("football").minutes);
  assert.notEqual(sportProfile("rugby").accent, sportProfile("football").accent);
  assert.notDeepEqual(sportProfile("rugby").headlineMetrics, sportProfile("football").headlineMetrics);
});

test("every sport has a tagline that says something", () => {
  for (const id of ALL) {
    const { tagline, label } = sportProfile(id);
    assert.ok(tagline.length > 20, `${label}'s tagline is too short to be useful`);
    assert.ok(/[.!]$/.test(tagline), `${label}'s tagline should read as a sentence`);
  }
});

// --- the home tool grid -----------------------------------------------------
// Home's primary card (NextUp) is a link to /coach in every one of its states,
// so the grid below it drops /coach rather than offering the same destination
// twice on one screen. That also makes the tile count divide evenly by the
// grid's two column counts, so neither breakpoint ends on an orphan row.

test("dropping the primary destination leaves a grid that divides evenly", () => {
  for (const id of ALL) {
    const shown = sportProfile(id).tools.filter((t) => t.href !== "/coach");
    assert.equal(
      shown.length % 2,
      0,
      `${id} shows ${shown.length} tiles — grid-cols-2 on mobile would end on an orphan`
    );
    assert.equal(
      shown.length % 3,
      0,
      `${id} shows ${shown.length} tiles — sm:grid-cols-3 would end on an orphan`
    );
  }
});

test("every sport still offers the plan somewhere in its tools", () => {
  // The grid filters /coach out for display; the underlying list must still
  // contain it, or the sport ordering has silently lost the main destination.
  for (const id of ALL) {
    assert.ok(
      sportProfile(id).tools.some((t) => t.href === "/coach"),
      `${id} has no /coach in its tools at all`
    );
  }
});

// --- per-sport dashboard ----------------------------------------------------
// Progress showed everyone the same four numbers. These check the tailoring is
// real, renderable, and can't drift out of sync with the page that draws it.

test("every sport asks for exactly four dashboard stats", () => {
  for (const id of ALL) {
    const stats = sportProfile(id).dashboardStats;
    assert.equal(stats.length, 4, `${id} has ${stats.length} — the grid is 2x2 on a phone, a fifth orphans`);
    assert.equal(new Set(stats).size, 4, `${id} lists the same stat twice`);
  }
});

test("every requested stat is one the dashboard can actually draw", () => {
  // A stat with no case in the switch renders nothing — a blank tile with no
  // error, which is the failure mode nobody notices until a screenshot.
  const page = readFileSync(new URL("../app/(app)/dashboard/page.tsx", import.meta.url), "utf8");
  for (const id of ALL) {
    for (const stat of sportProfile(id).dashboardStats) {
      assert.ok(
        page.includes(`case "${stat}":`),
        `${id} asks for "${stat}" and dashboard/page.tsx has no case for it`
      );
    }
  }
});

test("the dashboards genuinely differ between sports", () => {
  const signatures = ALL.map((id) => sportProfile(id).dashboardStats.join(","));
  assert.ok(
    new Set(signatures).size >= 4,
    `only ${new Set(signatures).size} distinct dashboards across six sports — the tailoring isn't doing much`
  );
});

test("each sport leads with the number it actually cares about", () => {
  // The first tile is the most prominent; it should be the sport's own unit, not
  // a generic one shared with everybody.
  assert.equal(sportProfile("running").dashboardStats[0], "distance");
  assert.equal(sportProfile("weightlifting").dashboardStats[0], "tonnage");
  assert.equal(sportProfile("gym").dashboardStats[0], "tonnage");
  assert.equal(sportProfile("rugby").dashboardStats[0], "contactLoad");
});

test("sport-specific stats are only asked for by the sports that can supply them", () => {
  // Contact minutes come from a field only rugby players are shown (see
  // TrainingLogInput), so any other sport asking for it renders a permanent
  // dash. Distance and pace are no longer in that category — every sport can
  // log a run now, and the programme prescribes them in all six — but they are
  // still a runner's headline numbers rather than a footballer's, so they lead
  // for exactly one sport.
  for (const id of ALL) {
    const stats: string[] = [...sportProfile(id).dashboardStats];
    if (id !== "rugby") assert.ok(!stats.includes("contactLoad"), `${id} asks for contact load but is never asked for it`);
    if (id !== "running") {
      assert.ok(!stats.includes("distance"), `${id} leads with distance, which is a runner's number`);
      assert.ok(!stats.includes("avgPace"), `${id} leads with pace, which is a runner's number`);
    }
  }
  // And a runner's two lead the row, in that order.
  assert.deepEqual(sportProfile("running").dashboardStats.slice(0, 2), ["distance", "avgPace"]);
});
