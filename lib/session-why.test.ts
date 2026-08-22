// Why this session, today — and whether the answer is true of the session.
//
// The risk with an explanation is that it becomes decoration: a paragraph that
// was right when it was written and is still on the screen after the thing it
// describes changed. Every line here is derived from the session it appears
// above, so these tests are mostly "does it describe THIS one".
import test from "node:test";
import assert from "node:assert/strict";
import { sessionWhy } from "./session-why";
import type { ProgramDrill } from "./engine";

const drill = (name: string, sets = 3, slot: ProgramDrill["slot"] = "primary"): ProgramDrill =>
  ({ name, sets, reps: 8, cue: "", reason: "", slot }) as ProgramDrill;

const WEEK = { week: 2, theme: "Build", intensity: "Higher", focusNote: "Turn the dial up." };

test("the headline places the session in the block", () => {
  const why = sessionWhy({ week: WEEK, totalWeeks: 4, session: { focus: "strength", drills: [drill("Barbell back squat")] } });
  assert.equal(why.headline, "Week 2 of 4 · Build");
});

test("it counts what is actually in the session", () => {
  const why = sessionWhy({
    week: WEEK,
    totalWeeks: 4,
    session: {
      focus: "strength",
      drills: [drill("Barbell back squat", 4), drill("Barbell bench press", 4), drill("Barbell curl", 3, "accessory")],
    },
  });
  const shape = why.lines.find((l) => /main lift/.test(l.text));
  assert.ok(shape, `no shape line: ${JSON.stringify(why.lines)}`);
  assert.match(shape!.text, /2 main lifts/);
  assert.match(shape!.text, /1 accessory/);
  assert.match(shape!.text, /11 working sets/);
});

test("it names the muscles the work actually lands on", () => {
  const why = sessionWhy({
    week: WEEK,
    totalWeeks: 4,
    session: { focus: "strength", drills: [drill("Barbell back squat", 5), drill("Leg press", 4, "secondary")] },
  });
  const emphasis = why.lines.find((l) => /Most of the work/.test(l.text));
  assert.ok(emphasis, "no emphasis line");
  assert.match(emphasis!.text, /quads/);
});

test("a deload says what a deload is for", () => {
  // The week most likely to be misread as the app losing interest.
  const why = sessionWhy({
    week: { week: 4, theme: "Deload", intensity: "Deload", focusNote: "Recover and absorb the work." },
    totalWeeks: 4,
    session: { focus: "strength", drills: [drill("Barbell back squat")] },
  });
  assert.ok(why.lines.some((l) => /60% of the work/.test(l.text)), "a deload does not explain itself");
});

test("an active rest day is a scheduled day, not a missing one", () => {
  const why = sessionWhy({
    week: WEEK, totalWeeks: 4,
    session: { focus: "endurance", kind: "active_rest", drills: [] },
  });
  assert.ok(why.lines.some((l) => /deliberate easy day/.test(l.text)));
  // And it stops there — counting lifts on a rest day would be nonsense.
  assert.ok(!why.lines.some((l) => /working sets/.test(l.text)));
});

test("the two things that override the plan are named, not left silent", () => {
  const why = sessionWhy({
    week: WEEK, totalWeeks: 4,
    session: { focus: "strength", drills: [drill("Barbell back squat")] },
    hasRehab: true,
    readiness: "Yellow",
  });
  assert.ok(why.lines.some((l) => /rehab plan added work/.test(l.text)));
  assert.ok(why.lines.some((l) => /ease off/.test(l.text)));
});

test("a red day says the block did not prescribe this", () => {
  const why = sessionWhy({
    week: WEEK, totalWeeks: 4,
    session: { focus: "strength", drills: [drill("Barbell back squat")] },
    readiness: "Red",
  });
  assert.ok(why.lines.some((l) => /not the session the block prescribed/.test(l.text)));
});

test("a green day adds nothing about readiness", () => {
  // Saying "you were fine today" on every good day is noise, and it is the
  // fastest way to make the card something people stop reading.
  const why = sessionWhy({
    week: WEEK, totalWeeks: 4,
    session: { focus: "strength", drills: [drill("Barbell back squat")] },
    readiness: "Green",
  });
  assert.ok(!why.lines.some((l) => /check-in/.test(l.text)));
});

test("every line has an icon the icon set actually draws", () => {
  // A missing case renders blank, and a bullet with no icon and no error is
  // the kind of thing nobody notices until a screenshot.
  const icons = new Set<string>();
  for (const readiness of [null, "Yellow", "Red"] as const)
    for (const theme of ["Base", "Deload"])
      for (const kind of [null, "active_rest"])
        for (const line of sessionWhy({
          week: { ...WEEK, theme },
          totalWeeks: 4,
          session: { focus: "speed", kind, drills: [drill("Barbell back squat")] },
          readiness, hasRehab: true, isInSeason: true,
        }).lines) icons.add(line.icon);

  const source = require("node:fs").readFileSync(new URL("../components/Icon.tsx", import.meta.url), "utf8");
  for (const icon of icons) {
    assert.ok(new RegExp(`\\b${icon}:`).test(source), `Icon has no "${icon}" — the bullet renders with a gap`);
  }
});

test("an empty session produces a headline and no invented detail", () => {
  const why = sessionWhy({ week: WEEK, totalWeeks: 4, session: { focus: null, drills: [] } });
  assert.equal(why.headline, "Week 2 of 4 · Build");
  assert.ok(!why.lines.some((l) => /working sets|Most of the work/.test(l.text)));
});
