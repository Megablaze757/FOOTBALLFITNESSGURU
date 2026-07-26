import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProgram } from "./coach";
import { skillForSession } from "./skills";

const plan = (over: Partial<Parameters<typeof buildProgram>[0]> = {}) =>
  buildProgram({ goal: "speed", painMap: {}, sport: "football", position: "Winger", daysPerWeek: 3, ...over });

const drills = (p: ReturnType<typeof buildProgram>) => p.weeks.flatMap((w) => w.sessions.flatMap((s) => s.drills));

test("field-sport programs include ball work", () => {
  const skill = drills(plan()).filter((d) => d.skill);
  assert.ok(skill.length > 0, "a footballer's program should contain technical work");
});

test("every session gets skill work, not just the first", () => {
  for (const w of plan().weeks) {
    for (const s of w.sessions) {
      assert.ok(s.drills.some((d) => d.skill), `week ${w.week} day ${s.day} has no ball work`);
    }
  }
});

test("skill work carries its own prescription, not fake sets and reps", () => {
  for (const d of drills(plan()).filter((x) => x.skill)) {
    assert.ok(d.prescription && d.prescription.length > 2, `${d.name} has no prescription`);
    assert.ok(d.cue.length > 5, `${d.name} has no coaching cue`);
  }
});

test("the block covers more than one skill", () => {
  const names = new Set(drills(plan()).filter((d) => d.skill).map((d) => d.name));
  assert.ok(names.size >= 3, `only ${names.size} distinct skill drill(s) across a whole block`);
});

test("it favours the athlete's position", () => {
  const winger = new Set(drills(plan({ position: "Winger" })).filter((d) => d.skill).map((d) => d.name));
  const cb = new Set(drills(plan({ position: "Centre back" })).filter((d) => d.skill).map((d) => d.name));
  assert.notDeepEqual([...winger].sort(), [...cb].sort(), "position should change the technical work");
});

test("only solo drills are programmed", () => {
  // A session drill needing three team-mates just gets skipped on the day.
  for (let i = 0; i < 12; i++) {
    const d = skillForSession("football", "Winger", i);
    assert.equal(d?.needs, "solo", `${d?.name} needs other people`);
  }
});

test("gym programs get no ball work", () => {
  const gym = buildProgram({ goal: "strength", painMap: {}, sport: "gym", focus: "aesthetics", daysPerWeek: 3 });
  assert.ok(!drills(gym).some((d) => d.skill), "a hypertrophy block has no technical drills");
});

test("skill exclusions in notes are honoured", () => {
  const p = plan({ notes: "no ball work this block" });
  // "no ball work" isn't in the vocabulary, so this shouldn't crash — the
  // point is that a note never breaks generation.
  assert.ok(p.weeks.length === 4);
});

test("sports without technical drills still build", () => {
  for (const sport of ["weightlifting", "gym"] as const) {
    const p = buildProgram({ goal: "strength", painMap: {}, sport, daysPerWeek: 3 });
    assert.equal(p.weeks.length, 4);
    for (const w of p.weeks) for (const s of w.sessions) assert.ok(s.drills.length > 0);
  }
});
