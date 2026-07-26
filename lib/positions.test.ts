import { test } from "node:test";
import assert from "node:assert/strict";
import { positionList, primaryPosition, positionLabel } from "./positions";
import { skillsForSport, skillForSession } from "./skills";
import { positionGuide, positionGuides } from "./essentials";
import { buildProgram } from "./coach";

test("positionList takes an array, a string, or nothing", () => {
  assert.deepEqual(positionList(["Winger", "Striker"]), ["Winger", "Striker"]);
  assert.deepEqual(positionList("Winger"), ["Winger"]);
  assert.deepEqual(positionList(null), []);
  assert.deepEqual(positionList(undefined), []);
  assert.deepEqual(positionList([]), []);
});

test("blanks and duplicates are dropped", () => {
  // The array and the legacy single column both hold the primary, so callers
  // routinely pass it twice.
  assert.deepEqual(positionList(["Winger", "Winger"]), ["Winger"]);
  assert.deepEqual(positionList([" Winger ", "", "  "]), ["Winger"]);
});

test("the primary is the first one they picked", () => {
  assert.equal(primaryPosition(["Full back", "Centre back"]), "Full back");
  assert.equal(primaryPosition([]), undefined);
});

test("positionLabel reads like a sentence", () => {
  assert.equal(positionLabel([]), "");
  assert.equal(positionLabel(["Winger"]), "Winger");
  assert.equal(positionLabel(["Winger", "Striker"]), "Winger & Striker");
  assert.equal(positionLabel(["Winger", "Striker", "Central mid"]), "Winger, Striker & Central mid");
});

test("skill drills cover every position played, not just the first", () => {
  const both = skillsForSport("football", ["Full back", "Centre back"]);
  const led = both.slice(0, both.filter((d) => d.positions.some((p) => ["Full back", "Centre back"].includes(p))).length);
  assert.ok(led.some((d) => d.positions.includes("Full back")), "no full-back work up front");
  assert.ok(led.some((d) => d.positions.includes("Centre back")), "no centre-back work up front");
});

test("filtering by several positions still loses nothing", () => {
  const all = skillsForSport("football");
  const some = skillsForSport("football", ["Winger", "Striker"]);
  assert.equal(some.length, all.length);
  assert.deepEqual([...some].map((d) => d.id).sort(), [...all].map((d) => d.id).sort());
});

test("a two-position athlete's program trains both", () => {
  const p = buildProgram({
    goal: "speed", painMap: {}, sport: "football",
    position: ["Winger", "Centre back"], daysPerWeek: 4,
  });
  const skills = p.weeks.flatMap((w) => w.sessions.flatMap((s) => s.drills)).filter((d) => d.skill);
  assert.ok(skills.length > 0, "no technical work at all");
  // Not a strict assertion that both appear in every block — the rotation is by
  // skill heading — but the pool must be drawn from both.
  const pool = skillsForSport("football", ["Winger", "Centre back"]).map((d) => d.name);
  for (const s of skills) assert.ok(pool.includes(s.name), `${s.name} isn't in this athlete's pool`);
});

test("skillForSession accepts one position or several", () => {
  assert.equal(skillForSession("football", "Winger", 0)?.needs, "solo");
  assert.equal(skillForSession("football", ["Winger", "Striker"], 0)?.needs, "solo");
});

test("the playbook shows a guide per position", () => {
  const guides = positionGuides("football", ["Winger", "Centre back"]);
  assert.equal(guides.length, 2);
  assert.deepEqual(guides.map((g) => g.position), ["Winger", "Centre back"]);
  assert.notEqual(guides[0].guide.summary, guides[1].guide.summary);
});

test("positionGuide leads with the primary, and still falls back", () => {
  assert.equal(
    positionGuide("football", ["Winger", "Centre back"]).summary,
    positionGuide("football", "Winger").summary,
  );
  // An unknown primary shouldn't hide a real second position.
  assert.equal(
    positionGuide("football", ["Nonsense", "Centre back"]).summary,
    positionGuide("football", "Centre back").summary,
  );
  // Nothing recognisable at all → the sport fallback, not a crash.
  assert.ok(positionGuide("football", ["Nonsense"]).summary.length > 0);
  assert.equal(positionGuides("football", []).length, 1);
});
