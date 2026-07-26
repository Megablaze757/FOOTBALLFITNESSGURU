import { test } from "node:test";
import assert from "node:assert/strict";
import { SKILL_DRILLS, skillsForSport, skillCategories, hasSkills, drillsYouCanDo } from "./skills";
import { POSITIONS_BY_SPORT } from "./coach";
import { SPORTS } from "./exercises";

test("every drill is actually coachable, not just named", () => {
  for (const d of SKILL_DRILLS) {
    assert.ok(d.name.length > 2, `${d.id} has no name`);
    assert.ok(d.setup.length > 5, `${d.id} doesn't say what you need`);
    assert.ok(d.how.length >= 2, `${d.id} has fewer than two steps`);
    assert.ok(d.reps.length > 2, `${d.id} has no volume — "practise crossing" is not a session`);
    assert.ok(d.coaching.length > 10, `${d.id} has no coaching point`);
    assert.ok(d.progression.length > 5, `${d.id} can't be made harder`);
  }
});

test("drill ids are unique", () => {
  const ids = SKILL_DRILLS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("positions listed on a drill are real positions for that sport", () => {
  for (const d of SKILL_DRILLS) {
    const valid = POSITIONS_BY_SPORT[d.sport] ?? [];
    for (const p of d.positions) {
      assert.ok(valid.includes(p), `${d.id} lists "${p}", which isn't a ${d.sport} position`);
    }
  }
});

test("the sports that need technical work have it", () => {
  for (const s of ["football", "rugby", "basketball"] as const) {
    assert.ok(hasSkills(s), `${s} has no skill drills`);
    assert.ok(skillCategories(s).length >= 3, `${s} has too few skill categories`);
  }
});

test("lifting sports honestly report having none", () => {
  // Their training IS the lifting; pretending otherwise would pad the UI with
  // nothing.
  assert.equal(hasSkills("weightlifting"), false);
  assert.equal(hasSkills("gym"), false);
});

test("a position's own drills come first, and nothing is lost", () => {
  const all = skillsForSport("football");
  const cb = skillsForSport("football", "Centre back");
  assert.equal(cb.length, all.length, "filtering by position must not drop drills");
  assert.ok(cb[0].positions.includes("Centre back"), "position-specific work should lead");
});

test("the positions the user named get the drills they asked for", () => {
  const has = (position: string, skill: string) =>
    skillsForSport("football", position).some((d) => d.positions.includes(position) && d.skill === skill);
  assert.ok(has("Centre back", "Heading"), "centre backs need heading");
  assert.ok(has("Striker", "Shooting"), "strikers need shooting");
  assert.ok(has("Central mid", "Passing"), "central mids need passing");
  assert.ok(has("Winger", "Crossing"), "wingers need crossing");
});

test("rugby and basketball cover their headline skills", () => {
  const rugby = skillCategories("rugby");
  for (const s of ["Passing", "Tackling", "Kicking"]) assert.ok(rugby.includes(s), `rugby missing ${s}`);
  const bb = skillCategories("basketball");
  for (const s of ["Shooting", "Ball handling"]) assert.ok(bb.includes(s), `basketball missing ${s}`);
});

test("every sport has enough you can do on your own", () => {
  for (const s of ["football", "rugby", "basketball", "running"] as const) {
    const solo = drillsYouCanDo(skillsForSport(s), "solo");
    assert.ok(solo.length >= 2, `${s} has almost nothing you can do alone`);
  }
});

test("who you need is stated on every drill, and widens correctly", () => {
  for (const d of SKILL_DRILLS) {
    assert.ok(["solo", "partner", "team"].includes(d.needs), `${d.id} has needs "${d.needs}"`);
  }
  const all = skillsForSport("football");
  // Having a partner should not hide the drills you could already do alone.
  const solo = drillsYouCanDo(all, "solo").length;
  const pair = drillsYouCanDo(all, "partner").length;
  assert.ok(pair >= solo, "a partner should only ever unlock more");
  assert.equal(drillsYouCanDo(all, "team").length, all.length);
});

test("no drill is attributed to a person or brand", () => {
  // These are common coaching property. Naming a creator would invent a
  // provenance we can't stand behind.
  const named = /\b(coach|academy|method|system|programme|program)\s+by\b|©|™/i;
  for (const d of SKILL_DRILLS) {
    assert.doesNotMatch(`${d.name} ${d.coaching} ${d.setup}`, named, `${d.id} claims an attribution`);
  }
});

test("every sport in the picker is handled without throwing", () => {
  for (const s of SPORTS) {
    assert.doesNotThrow(() => skillsForSport(s.id, "Nonexistent position"));
    assert.ok(Array.isArray(skillCategories(s.id)));
  }
});
