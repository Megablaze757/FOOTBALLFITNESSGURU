import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  BODY_REGIONS, BODY_VIEWBOX, MAX_TAP_DISTANCE, nearestRegion, regionLabel,
  regionsInView, viewOfRegion, type BodyView,
} from "./body-map";
import { BODY_OUTLINE } from "./body-outline";
import { INJURY_AREAS, baseAreaOf, protocolsForAreas } from "./essentials";

/**
 * The silhouette, in this map's coordinates.
 *
 * The figure is the traced body scaled into the 160x320 space — see the
 * transform in components/BodyMap.tsx, which these numbers mirror. Kept in step
 * by the test at the bottom of this file rather than by memory.
 */
const FIT = { scale: 0.1801, cx: 430.3, top: 36.8, ox: 80, oy: 14 };
const SILHOUETTE: [number, number][] = BODY_OUTLINE
  .slice(1, -1)
  .split("L")
  .map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return [(x - FIT.cx) * FIT.scale + FIT.ox, (y - FIT.top) * FIT.scale + FIT.oy];
  });

/** Ray casting. Whether a point is actually ON the body, not merely in its box. */
function onBody(x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = SILHOUETTE.length - 1; i < SILHOUETTE.length; j = i++) {
    const [xi, yi] = SILHOUETTE[i];
    const [xj, yj] = SILHOUETTE[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * THE MEASUREMENT THAT MADE THIS NECESSARY.
 *
 * The figure renders about 144px wide on a phone, so one figure unit is roughly
 * 0.9 CSS px. A region is drawn at r=8..10, which is a target about 14–18px
 * across — against a 44px floor. Every one of the fifteen was under it, on the
 * control that answers "where does it hurt".
 */
test("every region would be an illegal tap target if it had to be hit", () => {
  const unitsToCss = 288 / BODY_VIEWBOX.height; // the figure renders at h-72
  for (const r of BODY_REGIONS) {
    const drawn = r.r * 2 * unitsToCss;
    assert.ok(drawn < 44, `${r.key} is ${drawn.toFixed(0)}px — this test is out of date`);
  }
});

/**
 * AND WHY A BIGGER HIT CIRCLE CANNOT BE THE FIX.
 *
 * To reach 44px a region would need a hit radius of ~24 units. The closest pair
 * are 17 apart, so at that size a hip would swallow taps meant for the groin.
 * Bodies are crowded; that is not a spacing bug.
 */
test("the regions are too close together for per-region hit circles", () => {
  let closest = Infinity;
  for (const a of BODY_REGIONS) {
    for (const b of BODY_REGIONS) {
      if (a.key === b.key) continue;
      closest = Math.min(closest, Math.hypot(a.cx - b.cx, a.cy - b.cy));
    }
  }
  const neededForForty4px = 44 / 2 / (288 / BODY_VIEWBOX.height);
  assert.ok(
    closest < neededForForty4px,
    `closest pair is ${closest.toFixed(1)} units apart and 44px needs ${neededForForty4px.toFixed(1)} — ` +
      "if this ever passes, per-region hit circles became viable and this design can be simplified"
  );
});

test("a tap on a region picks that region", () => {
  for (const r of BODY_REGIONS) {
    // In its own view. Quads and hamstrings share the thigh, so "the nearest
    // region to a quad's centre" is only the quad while the front is showing.
    for (const view of r.views) {
      assert.equal(nearestRegion(r.cx, r.cy, view)?.key, r.key, `${r.key} on the ${view}`);
    }
  }
});

/**
 * THE BUG THAT ADDED A SECOND VIEW.
 *
 * The figure faces forwards and the front of a thigh is a quadriceps, but the
 * only thigh region was a hamstring — so a quad strain, one of the commonest
 * injuries in any running sport, could not be reported at all. It is not enough
 * that a quad region now exists: the same tap has to mean the quad from the
 * front and the hamstring from behind, or one of the two is still unreachable.
 */
test("the front of the thigh is a quad and the back of it is a hamstring", () => {
  const thigh: [number, number] = [68, 198];
  assert.equal(nearestRegion(...thigh, "front")?.key, "quad_left");
  assert.equal(nearestRegion(...thigh, "back")?.key, "hamstring_left");

  // And neither can be reached from the wrong side, which is the whole reason
  // the view has to be an argument to the hit test rather than a filter on it.
  assert.equal(BODY_REGIONS.find((r) => r.key === "quad_left")?.views.includes("back"), false);
  assert.equal(BODY_REGIONS.find((r) => r.key === "hamstring_left")?.views.includes("front"), false);
});

test("every region an athlete can mark has somewhere to send them", () => {
  // A region you can tap and get no help for is worse than one that resolves to
  // a neighbour — the rule the arms were added under. Quads and glutes were the
  // two new ones, so this now covers every leg region rather than trusting it.
  const areas = new Set(INJURY_AREAS.map((a) => a.id));
  for (const r of BODY_REGIONS) {
    const base = baseAreaOf(r.key);
    assert.ok(areas.has(base), `${r.key} maps to "${base}", which is not an injury area`);
    assert.ok(protocolsForAreas([base]).length > 0, `"${base}" has no rehab protocol`);
  }
});

/** What the old scheme did: a tap counted only if it landed inside a drawn dot. */
function oldSchemeHit(x: number, y: number): string | null {
  const hit = BODY_REGIONS.find((r) => Math.hypot(x - r.cx, y - r.cy) <= r.r);
  return hit?.key ?? null;
}

/**
 * THE POINT OF THE WHOLE THING: a tap that misses every dot still works.
 *
 * Each case is checked BOTH ways — that the old per-dot scheme would have
 * dropped it, and that it now resolves. Asserting only the second half would
 * let a point that was always fine sit here looking like evidence, which is
 * exactly what happened while writing this: three of the six points I first
 * picked as "obvious misses" were comfortably inside a dot.
 */
test("a tap that lands on no dot still finds what it was aimed at", () => {
  const cases: [x: number, y: number, view: BodyView, expect: string][] = [
    [80, 196, "front", "quad_left"],   // between the thighs, ties left
    [80, 206, "back", "hamstring_left"], // the same gap, seen from behind
    [60, 240, "front", "knee_left"],   // below and outside the left knee
    [44, 96, "front", "shoulder_left"], // below the shoulder, on the upper arm
    [80, 300, "front", "ankle_left"],  // below the feet, between them
    [80, 20, "front", "head"],         // above the head
    [104, 210, "back", "hamstring_right"], // outside the right leg entirely
    [104, 168, "back", "glute_right"], // outside the right glute
  ];
  for (const [x, y, view, expect] of cases) {
    assert.equal(oldSchemeHit(x, y), null, `(${x},${y}) was never a miss — pick a better case`);
    assert.equal(nearestRegion(x, y, view)?.key, expect, `(${x},${y}) on the ${view}`);
  }
});

/**
 * How much of the figure was dead before. Not decoration: it is the size of the
 * complaint ("some of the dots are hard to click"), and if a future change
 * shrinks it back toward zero by growing the dots, this says so.
 */
test("most of the figure used to do nothing at all", () => {
  let dead = 0;
  let total = 0;
  for (let x = 46; x <= 114; x += 2) {
    for (let y = 18; y <= 290; y += 2) {
      total++;
      if (!oldSchemeHit(x, y)) dead++;
    }
  }
  const pct = (dead / total) * 100;
  assert.ok(pct > 70, `only ${pct.toFixed(0)}% of the body was unresponsive — has the design changed?`);
});

/**
 * Every point ON the body resolves to something. Not a sample — the whole
 * silhouette, so a dead patch cannot hide between the assertions above.
 */
test("no dead zones anywhere on the figure", () => {
  /**
   * THE BODY, NOT ITS BOUNDING BOX.
   *
   * This used to sweep a rectangle around the old stick figure, which worked
   * because a stick figure nearly fills its box. An anatomical outline does
   * not — there is empty space beside the head, between the legs and under
   * each arm — so a box sweep would now demand that thin air resolve to a body
   * part. Point-in-polygon asks the question that was always meant: is every
   * point somebody could tap ON the figure answered?
   */
  // BOTH VIEWS. The back has a different, smaller set of regions, so a hole
  // there would hide completely behind a front-only sweep — and the back is
  // where the hamstrings and glutes now live.
  for (const view of ["front", "back"] as BodyView[]) {
    const misses: string[] = [];
    let onBodyPoints = 0;
    for (let x = 8; x <= 152; x += 2) {
      for (let y = 12; y <= 306; y += 2) {
        if (!onBody(x, y)) continue;
        onBodyPoints++;
        if (!nearestRegion(x, y, view)) misses.push(`${x},${y}`);
      }
    }
    assert.ok(onBodyPoints > 2000, `only ${onBodyPoints} points landed on the body — the fit is wrong`);
    assert.deepEqual(misses.slice(0, 8), [], `${misses.length} points on the ${view} select nothing`);
  }
});

/**
 * And the figure the component draws has to be the figure this file sweeps. Two
 * hand-maintained copies of a transform is how a hit test silently stops
 * matching the drawing it is testing.
 */
test("the tested fit matches the one the component draws", () => {
  const src = readFileSync(new URL("../components/BodyMap.tsx", import.meta.url), "utf8");
  assert.ok(
    src.includes(`translate(${FIT.ox} ${FIT.oy}) scale(${FIT.scale}) translate(-${FIT.cx} -${FIT.top})`),
    "components/BodyMap.tsx draws the body at a different scale or offset than this file assumes",
  );
});

/**
 * But the box is not the body. A tap in the empty margin should do nothing —
 * an unexplained selection is worse than a missed one, because the athlete has
 * to notice it happened before they can undo it.
 */
test("a tap in the empty margin selects nothing", () => {
  assert.equal(nearestRegion(4, 4), null, "top-left corner");
  assert.equal(nearestRegion(156, 316), null, "bottom-right corner");
  // Beside the head, which is empty on an anatomical figure where it was solid
  // on a stick one. The old "far left of the torso" case is now an arm.
  assert.equal(nearestRegion(30, 20), null, "beside the head");
});

test("ties resolve the same way every time", () => {
  // Exactly between the two shoulders, which are symmetric about x=80.
  assert.equal(nearestRegion(80, 70)?.key, nearestRegion(80, 70)?.key);
  const a = nearestRegion(80, 70)?.key;
  assert.ok(a === "shoulder_left" || a === "lower_back", `unexpected tie winner: ${a}`);
});

test("the tap radius is generous but not unlimited", () => {
  assert.ok(MAX_TAP_DISTANCE > 20, "too tight to be worth the mechanism");
  assert.ok(MAX_TAP_DISTANCE < BODY_VIEWBOX.width / 2, "a tap anywhere would always hit something");
});

test("region keys are unique and every one has a label", () => {
  const keys = BODY_REGIONS.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.notEqual(regionLabel(k), k, `${k} has no label`);
  assert.equal(regionLabel("nonsense"), "nonsense", "unknown keys fall back to themselves");
});
