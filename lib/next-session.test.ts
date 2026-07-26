import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSession } from "./next-session";
import { buildProgram } from "./coach";

const plan = () => buildProgram({ goal: "strength", painMap: {}, sport: "gym", focus: "aesthetics", daysPerWeek: 3 });

test("with nothing completed, it's the first session of week 1", () => {
  const n = nextSession(plan(), []);
  assert.ok(n);
  assert.equal(n.week, 1);
  assert.equal(n.day, 1);
  assert.equal(n.id, "w1d1");
  assert.ok(n.drills.length > 0);
});

test("completed sessions are skipped", () => {
  const n = nextSession(plan(), ["w1d1", "w1d2"]);
  assert.equal(n?.id, "w1d3");
});

test("it rolls into the next week", () => {
  const p = plan();
  const week1 = p.weeks[0].sessions.map((s) => `w1d${s.day}`);
  assert.equal(nextSession(p, week1)?.week, 2);
});

test("a finished block returns null rather than looping back", () => {
  const p = plan();
  const all = p.weeks.flatMap((w) => w.sessions.map((s) => `w${w.week}d${s.day}`));
  assert.equal(nextSession(p, all), null);
});

test("drills come back loggable — named, with sets and reps", () => {
  const n = nextSession(plan(), []);
  for (const d of n!.drills) {
    assert.ok(d.name.length > 0);
    assert.ok(d.sets > 0 && d.reps > 0);
    assert.equal(d.load_kg, null, "load is the athlete's to fill in");
  }
});

test("missing or empty plans are safe", () => {
  assert.equal(nextSession(null, []), null);
  assert.equal(nextSession(undefined, []), null);
  assert.equal(nextSession({ goal: "strength", summary: "", constraints: [], weeks: [] }, []), null);
});
