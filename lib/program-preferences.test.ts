import { test } from "node:test";
import assert from "node:assert/strict";
import type { ProgramPlan } from "./engine";
import { parseConstraints } from "./constraints";
import {
  applyProgramPreferences, defaultSchedule, engineAnchor, goalBlendCopy,
  goalPreviewCopy, minimumExercises, sanitiseGoals, sessionExerciseCount, strictSlots,
  warmupClassificationWarnings,
} from "./program-preferences";

const plan: ProgramPlan = {
  goal: "strength",
  summary: "A test block.",
  constraints: [],
  weeks: Array.from({ length: 2 }, (_, wi) => ({
    week: wi + 1,
    theme: "Base",
    intensity: "Moderate",
    focusNote: "",
    sessions: [{
      day: 1,
      title: "Day 1 · Upper",
      focus: "strength",
      drills: [
        { name: "Incline Dumbbell Bench Press", sets: 3, reps: 10, slot: "warmup", cue: "", reason: "" },
        { name: "Bench press", sets: 3, reps: 8, slot: "primary", cue: "", reason: "" },
        { name: "Couch stretch", sets: 1, reps: 30, slot: "cooldown", cue: "", reason: "" },
      ],
    }],
  })),
};

test("goals are deduplicated, capped at three, and priorities follow their order", () => {
  const goals = sanitiseGoals([
    { type: "strength", priority: 3 },
    { type: "hypertrophy", priority: 1 },
    { type: "strength", priority: 2 },
    { type: "endurance", priority: 2 },
    { type: "mobility", priority: 1 },
  ]);
  assert.deepEqual(goals, [
    { type: "strength", priority: 1 },
    { type: "hypertrophy", priority: 2 },
    { type: "endurance", priority: 3 },
  ]);
  assert.deepEqual(engineAnchor([{ type: "hypertrophy", priority: 1 }]), { goal: "strength", focus: "aesthetics" });
  assert.match(goalBlendCopy(goals), /Strength anchors the main lifts/);
  assert.match(goalPreviewCopy(goals), /3–4 × 6–12/);
});

test("a six or seven day rotation has no gaps and recognises active rest", () => {
  for (const days of [6, 7]) {
    const schedule = defaultSchedule(days, [{ type: "strength", priority: 1 }]);
    assert.equal(schedule.length, days);
    assert.deepEqual(schedule.map((d) => d.day), Array.from({ length: days }, (_, i) => i + 1));
    assert.ok(schedule.some((d) => d.type === "active_rest"));
    for (const rest of schedule.filter((d) => d.type === "active_rest")) {
      assert.ok((rest.durationMinutes ?? 0) > 0);
      assert.ok((rest.rpe ?? 0) >= 1);
      assert.match(rest.notes ?? "", /walking|mobility|stretching/i);
    }
  }
  const mixed = defaultSchedule(5, [
    { type: "strength", priority: 1 },
    { type: "endurance", priority: 2 },
  ]);
  assert.equal(mixed.filter((d) => d.type === "cardio").length, 2, "secondary endurance should receive dedicated conditioning slots");
  assert.equal(mixed.filter((d) => ["upper", "lower", "full_body"].includes(d.type)).length, 3);
});

test("weighted lifts cannot survive inside the warm-up block", () => {
  const cleaned = strictSlots(plan.weeks[0].sessions[0].drills);
  const incline = cleaned.find((d) => d.name.startsWith("Incline"))!;
  assert.equal(incline.slot, "accessory");
  assert.match(incline.reason, /Moved from warm-up/);
  assert.equal(warmupClassificationWarnings(plan).length, 2, "each saved legacy occurrence should be warned about, not rewritten");
});

test("custom rotation repeats, logs active rest as a real day, and adapts mixed goals", () => {
  const schedule = [
    { day: 1, type: "upper" as const },
    { day: 2, type: "active_rest" as const, durationMinutes: 35, rpe: 3, notes: "Walk and mobility" },
  ];
  const result = applyProgramPreferences(plan, {
    goals: [{ type: "strength", priority: 1 }, { type: "hypertrophy", priority: 2 }],
    schedule,
    exerciseTarget: 6,
    musclePriorities: { back: 2 },
  });

  for (const week of result.weeks) {
    assert.equal(week.sessions.length, 2);
    const workout = week.sessions[0];
    const rest = week.sessions[1];
    assert.equal(workout.kind, "workout");
    assert.ok(sessionExerciseCount(workout) >= 6, "custom target must top up short lifting sessions");
    assert.ok(workout.drills.some((d) => d.name === "Band pull-aparts" && d.slot === "warmup"));
    assert.equal(workout.drills.some((d) => d.name === "Incline Dumbbell Bench Press" && d.slot === "warmup"), false);
    const main = workout.drills.find((d) => d.slot === "primary")!;
    assert.ok(main.sets >= 3 && main.sets <= 4, "combined goals use the combined set range");
    assert.ok(main.reps >= 6 && main.reps <= 12, "combined goals use the combined rep range");
    assert.ok((main.rest ?? 0) >= 90 && (main.rest ?? 0) <= 120);
    const accessory = workout.drills.find((d) => d.slot === "accessory")!;
    assert.ok(accessory.reps >= 6 && accessory.reps <= 12, "combined accessories stay in the combined range");
    assert.ok(accessory.sets <= 3, "four-plus sets are reserved for primary strength work");

    assert.equal(rest.kind, "active_rest");
    assert.equal(rest.drills.length, 0);
    assert.equal(rest.durationMinutes, 35);
    assert.equal(rest.rpe, 3);
    assert.equal(sessionExerciseCount(rest), 0);
  }
});

test("goal-driven minimums match the audit without making active rest a workout", () => {
  assert.equal(minimumExercises("push", [{ type: "strength", priority: 1 }]), 5);
  assert.equal(minimumExercises("push", [{ type: "hypertrophy", priority: 1 }]), 7);
  assert.equal(minimumExercises("full_body", [{ type: "fat_loss", priority: 1 }]), 8);
  assert.equal(minimumExercises("active_rest", [{ type: "hypertrophy", priority: 1 }]), 0);
  assert.equal(minimumExercises("upper", [], 9), 9);
});

test("removing the suggested upper warm-up persists as an empty choice", () => {
  const result = applyProgramPreferences(plan, {
    goals: [{ type: "strength", priority: 1 }],
    schedule: [{ day: 1, type: "upper" }],
    upperWarmup: [],
  });
  assert.equal(result.settings?.upperWarmup?.length, 0);
  assert.equal(result.weeks[0].sessions[0].drills.some((d) => d.name === "Band pull-aparts"), false);
});

test("advanced exercise top-ups respect the athlete's equipment note", () => {
  const result = applyProgramPreferences(plan, {
    goals: [{ type: "hypertrophy", priority: 1 }],
    schedule: [{ day: 1, type: "upper" }],
    exerciseTarget: 8,
  }, { constraints: parseConstraints("I only have dumbbells at home") });
  const added = result.weeks[0].sessions[0].drills.filter((d) => d.reason.startsWith("Added to give"));
  assert.ok(added.length > 0);
  assert.equal(added.some((d) => /barbell|cable|machine|kettlebell/i.test(d.name)), false);
});

test("explicit exercise picks survive an AI-shaped plan unless safety rules exclude them", () => {
  // The production model does not understand movement ids; this preference
  // pass is the shared boundary both the AI and local plan cross.
  const picked = applyProgramPreferences(plan, {
    goals: [{ type: "strength", priority: 1 }],
    schedule: [{ day: 1, type: "upper" }],
    mustInclude: ["lat_pulldown"],
  });
  const pulldown = picked.weeks[0].sessions[0].drills.find((drill) => drill.name === "Lat pulldown");
  assert.ok(pulldown, "the athlete's explicit pick was discarded on the AI route");
  assert.equal(pulldown.preferred, true, "the time fitter cannot distinguish the explicit pick from a generic accessory");

  const excluded = applyProgramPreferences(plan, {
    goals: [{ type: "strength", priority: 1 }],
    schedule: [{ day: 1, type: "upper" }],
    mustInclude: ["lat_pulldown"],
  }, { constraints: parseConstraints("no machines") });
  assert.equal(excluded.weeks[0].sessions[0].drills.some((drill) => drill.name === "Lat pulldown"), false,
    "an explicit preference overruled the athlete's equipment constraint");
});

test("custom top-ups stay inside the athlete's sport", () => {
  const result = applyProgramPreferences(plan, {
    goals: [{ type: "strength", priority: 1 }],
    schedule: [{ day: 1, type: "upper" }],
    exerciseTarget: 10,
  }, { sport: "gym" });
  const names = result.weeks.flatMap((week) => week.sessions.flatMap((session) => session.drills.map((drill) => drill.name)));
  assert.equal(names.some((name) => /scrum|tackle|ruck|lineout/i.test(name)), false,
    "a gym plan was filled with another sport's exercises");
});
