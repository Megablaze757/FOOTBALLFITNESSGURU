import { test } from "node:test";
import assert from "node:assert/strict";
import { localCoachAnswer } from "./coach-chat";

const ctx = {
  goal: "agility" as const,
  soreAreas: ["knee"],
  readinessStatus: "Red" as const,
  programDrills: ["Ladder quick-feet", "Reactive mirror drill"],
};

test("explains why a drill is in the plan, noting the sore knee", () => {
  const a = localCoachAnswer("why is Ladder quick-feet in my plan?", ctx);
  assert.match(a, /ladder quick-feet/i);
  assert.match(a, /agility/i);
  assert.match(a, /knee/i);
});

test("answers pain questions with substitution guidance", () => {
  const a = localCoachAnswer("my knee is sore, what now?", ctx);
  assert.match(a, /knee/i);
  assert.match(a, /physio|lower-?load|lower-?impact/i);
});

test("answers readiness questions using today's status", () => {
  assert.match(localCoachAnswer("am I ready to train?", ctx), /recovery|red/i);
});

test("falls back helpfully for unknown questions", () => {
  const a = localCoachAnswer("what's the offside rule", ctx);
  assert.ok(a.length > 0);
});
