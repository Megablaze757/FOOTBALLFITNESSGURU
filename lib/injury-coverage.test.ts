import test from "node:test";
import assert from "node:assert/strict";
import { MOVEMENTS } from "./movements";
import { BODY_REGIONS } from "./body-map";
import { INJURY_AREAS, baseAreaOf, protocolsForAreas } from "./essentials";
import { buildBlock } from "./engine";

/**
 * THE SEAM BETWEEN "WHERE IT HURTS" AND "WHAT YOU WILL BE ASKED TO DO".
 *
 * Every one of these held individually and the app still failed as a whole:
 * the body map was complete, the protocols were good, the engine trained
 * around pain — and marking a groin changed nothing, because no movement in
 * the catalogue declared it loaded a groin and `load[area] ?? 0` reads a
 * missing entry as "this exercise is fine". Six of thirteen areas were in that
 * state. The gap was between the parts, so the test has to be too.
 */

/** Reported pain the programme deliberately does not reroute around. */
const NOT_PROGRAMMED = new Set([
  // A suspected concussion is not a loading problem. The answer is to stop,
  // which the protocol says; swapping a drill would imply carrying on is an
  // option.
  "head",
]);

test("every area on the body map has a rehab protocol behind it", () => {
  const areas = new Set(INJURY_AREAS.map((a) => a.id));
  for (const r of BODY_REGIONS) {
    const base = baseAreaOf(r.key);
    assert.ok(areas.has(base), `${r.key} → "${base}" is not an injury area`);
    assert.ok(protocolsForAreas([base]).length > 0, `"${base}" has no rehab protocol`);
  }
});

test("every area on the body map is loaded by some movement", () => {
  const bare: string[] = [];
  for (const base of new Set(BODY_REGIONS.map((r) => baseAreaOf(r.key)))) {
    if (NOT_PROGRAMMED.has(base)) continue;
    const n = MOVEMENTS.filter((m) => ((m.load as Record<string, number>)?.[base] ?? 0) > 0).length;
    if (n === 0) bare.push(base);
  }
  assert.deepEqual(bare, [],
    `these areas can be marked but no movement declares loading them, so every exercise ` +
    `silently claims to spare them and the programme will not change: ${bare.join(", ")}`);
});

test("marking an area sore actually removes the work that loads it", () => {
  for (const base of new Set(BODY_REGIONS.map((r) => baseAreaOf(r.key)))) {
    if (NOT_PROGRAMMED.has(base)) continue;
    const cost = new Map(MOVEMENTS.map((m) => [m.name, (m.load as Record<string, number>)?.[base] ?? 0]));
    const heavyCount = (painMap: Record<string, number>) => {
      const plan = buildBlock({ goal: "speed", painMap, sport: "football" }) as {
        weeks: { sessions: { drills: { name: string }[] }[] }[];
      };
      return plan.weeks
        .flatMap((w) => w.sessions.flatMap((s) => s.drills.map((d) => d.name)))
        .filter((n) => (cost.get(n) ?? 0) >= 2).length;
    };
    const healthy = heavyCount({});
    if (healthy === 0) continue; // nothing heavy is ever picked for this area anyway
    const sore = heavyCount({ [`${base}_left`]: 8, [base]: 8 });
    assert.ok(sore < healthy,
      `"${base}" sore at 8/10 still programmes ${sore} movements that load it heavily (${healthy} when healthy)`);
  }
});
