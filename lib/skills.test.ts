import { test } from "node:test";
import assert from "node:assert/strict";
import { SKILL_DRILLS, skillsForSport, skillCategories, hasSkills, drillsYouCanDo, skillsForAthlete, skillForSession } from "./skills";
import { POSITIONS_BY_SPORT, positionsForSport } from "./coach";
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

test("the lifting sports have technical work too", () => {
  // This used to assert they had NONE, on the reasoning that "their training IS
  // the lifting". That was backwards: technique is precisely the skill in the
  // barbell sports, and a lifter got a program with no technical work in it at
  // all while a footballer got rondos.
  for (const s of ["weightlifting", "gym"] as const) {
    assert.ok(hasSkills(s), `${s} still has no skill drills`);
  }
  const wl = skillsForSport("weightlifting");
  assert.ok(wl.some((d) => /squat|bench|deadlift/i.test(d.name)), "no main-lift technique work");
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

/**
 * FOUR POSITIONS HAD NO BALL WORK AT ALL, AND NOTHING NOTICED.
 *
 * `skillForSession` filters the pool to solo drills — a session has to be
 * doable on the evening it lands, and one needing three team-mates is one that
 * gets skipped. A prop, a lock, a flanker and a No. 8 had ZERO solo drills
 * between them, so all four got `null` for every session of every block: four
 * of the ten rugby positions had no technical work in their programme, ever.
 *
 * Nothing failed. The skill slot simply rendered nothing and the session looked
 * like a normal session that happened to be gym-only. That is the shape of bug
 * this file exists to catch and did not, so here is the floor.
 */
test("every position of every sport gets ball work it can actually do alone", () => {
  const thin: string[] = [];
  for (const s of SPORTS) {
    for (const p of positionsForSport(s.id)) {
      const pool = skillsForAthlete(s.id, p).filter((d) => d.needs === "solo");
      if (pool.length < 4) thin.push(`${s.id}/${p}: ${pool.length} solo drills`);
    }
  }
  assert.deepEqual(thin, [], "these positions have too little to rotate through");
});

/**
 * And the programme actually receives them. The pool existing is not the same
 * as the selector reaching it — `skillForSession` groups by skill first, and a
 * position whose drills all share one skill would get the same drill every
 * session while the pool looked healthy.
 */
test("a block's sessions get different ball work, not the same drill twelve times", () => {
  const repeats: string[] = [];
  for (const s of SPORTS) {
    for (const p of positionsForSport(s.id)) {
      const got = Array.from({ length: 12 }, (_, i) => skillForSession(s.id, p, i));
      if (got.some((d) => d === null)) {
        repeats.push(`${s.id}/${p}: no drill at all`);
        continue;
      }
      const distinct = new Set(got.map((d) => d!.id)).size;
      if (distinct < 4) repeats.push(`${s.id}/${p}: only ${distinct} different drills across 12 sessions`);
    }
  }
  assert.deepEqual(repeats, []);
});

/**
 * A position should also be practising more than one THING. Four drills that
 * are all shooting is a pool, not a curriculum — the sprinter sits at the floor
 * here (technique and speed), which is honest for the event.
 */
test("every position practises more than one skill", () => {
  const narrow: string[] = [];
  for (const s of SPORTS) {
    for (const p of positionsForSport(s.id)) {
      const skills = new Set(
        skillsForAthlete(s.id, p).filter((d) => d.needs === "solo").map((d) => d.skill)
      );
      if (skills.size < 2) narrow.push(`${s.id}/${p}: only "${[...skills][0]}"`);
    }
  }
  assert.deepEqual(narrow, []);
});

/**
 * Every drill names positions that exist. A typo here is silent and total: the
 * drill simply never reaches the athlete it was written for, and the position it
 * was meant for keeps whatever thin pool it had.
 */
test("no drill is written for a position nobody can pick", () => {
  const bad: string[] = [];
  for (const d of SKILL_DRILLS) {
    const offered = new Set(positionsForSport(d.sport));
    for (const p of d.positions) if (!offered.has(p)) bad.push(`${d.id}: "${p}"`);
  }
  assert.deepEqual(bad, []);
});

/** Ids are used to key the rotation and to look drills up. Two the same and one
 *  of them can never be reached. */
test("drill ids and names are unique", () => {
  const ids = SKILL_DRILLS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  const names = SKILL_DRILLS.map((d) => `${d.sport}:${d.name}`);
  assert.equal(new Set(names).size, names.length, "two drills with one name are indistinguishable in a session");
});

/** Coaching content, not a title. "Practise crossing" is not a drill. */
test("every drill says how to run it, how much, and what to look for", () => {
  for (const d of SKILL_DRILLS) {
    assert.ok(d.how.length >= 2, `${d.id} has ${d.how.length} steps`);
    assert.ok(d.reps.length > 4, `${d.id} has no meaningful volume`);
    assert.ok(d.coaching.length > 25, `${d.id}'s coaching point is too thin to be one`);
    assert.ok(d.progression.length > 15, `${d.id} has nowhere to go`);
    assert.ok(d.setup.length > 5, `${d.id} does not say what you need`);
  }
});
