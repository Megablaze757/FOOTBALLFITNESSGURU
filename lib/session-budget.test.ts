import test from "node:test";
import assert from "node:assert/strict";
import { fitSessionToBudget, STANDARD_SESSION_MAX_MINUTES } from "./session-budget";
import { sessionMinutes } from "./session-time";
import type { ProgramDrill, ProgramSession, Slot } from "./engine";

function drill(name: string, slot: Slot | undefined, minutes: number, extra: Partial<ProgramDrill> = {}): ProgramDrill {
  return {
    name, slot, sets: 1, reps: minutes, prescription: `${minutes} min`, rest: 30,
    cue: "", reason: "", ...extra,
  };
}

test("the fit pass solves for the best complete combination instead of deleting from the end", () => {
  const session: ProgramSession = {
    day: 1, title: "Long generated day", focus: "strength",
    drills: [
      drill("Warm-up", "warmup", 8),
      drill("Main lift", "primary", 25),
      drill("Long low-value accessory", "accessory", 30),
      drill("Useful secondary", "secondary", 18),
      drill("Sport skill", "skill", 8, { skill: true }),
      drill("Conditioning", "conditioning", 18),
      drill("Cool-down", "cooldown", 5),
    ],
  };

  const fitted = fitSessionToBudget(session, "strength");
  const names = fitted.drills.map((d) => d.name);
  assert.ok(sessionMinutes(fitted) <= STANDARD_SESSION_MAX_MINUTES);
  for (const essential of ["Warm-up", "Main lift", "Useful secondary", "Sport skill", "Conditioning", "Cool-down"]) {
    assert.ok(names.includes(essential), `${essential} was lost even though a lower-value combination fits`);
  }
  assert.ok(!names.includes("Long low-value accessory"), "the expensive accessory beat the more useful combination");
  // Selection order is still session order; optimisation must not turn the
  // workout into a shuffled list.
  assert.deepEqual(names, ["Warm-up", "Main lift", "Useful secondary", "Sport skill", "Conditioning", "Cool-down"]);
});

test("active rest and a single long endurance effort use their own caps", () => {
  const rest = fitSessionToBudget({
    day: 1, title: "Active rest", focus: "endurance", kind: "active_rest",
    durationMinutes: 180, drills: [],
  }, "endurance");
  assert.equal(rest.durationMinutes, 60);

  const run = fitSessionToBudget({
    day: 1, title: "Long run", focus: "endurance",
    drills: [drill("Long run", undefined, 180)],
  }, "endurance");
  assert.equal(sessionMinutes(run), 120);
  assert.match(run.drills[0].prescription ?? "", /^119 min/);
});
