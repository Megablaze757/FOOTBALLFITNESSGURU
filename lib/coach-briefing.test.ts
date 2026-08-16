import test from "node:test";
import assert from "node:assert/strict";
import { buildBriefing, type BriefingInput } from "./coach-briefing";
import { RECOVERY_INJURY } from "./essentials";

const hamstring = RECOVERY_INJURY.find((p) => p.id === "hamstring")!;

/**
 * THE REPORTED BUG. "I asked it a question about my injury plan and it couldn't
 * see it." The chat was given four facts — goal, sore-area NAMES, a readiness
 * colour, and next session's drill names — so a question about a rehab plan was
 * answered by something that had never seen one.
 */
test("the briefing carries the actual rehab plan, not just where it hurts", () => {
  const b = buildBriefing({
    pain: { hamstring_left: 6 },
    painReportedOn: "2 days ago",
    protocols: [hamstring],
  });
  assert.match(b, /hamstring left: 6\/10/, "the severity is missing");
  assert.match(b, /2 days ago/, "how old the report is went missing");
  assert.match(b, new RegExp(hamstring.title.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")),
    "the protocol is not named");
  // The STAGES are the plan. Naming the protocol without them answers nothing.
  for (const stage of hamstring.stages ?? []) {
    assert.ok(b.includes(stage.phase), `stage "${stage.phase}" is missing from the briefing`);
    assert.ok(b.includes(stage.criteria), `the criteria to progress past "${stage.phase}" are missing`);
  }
  assert.match(b, /Red flags/, "the escalation criteria are missing");
});

test("nothing sore says so, rather than saying nothing", () => {
  // Silence and "no injuries" produce very different answers, and only one of
  // them is honest about what the coach was told.
  const b = buildBriefing({ pain: {} });
  assert.match(b, /Nothing sore reported/);
});

test("every section states its own absence", () => {
  const bare = buildBriefing({});
  for (const [what, pattern] of [
    ["bodyweight", /Bodyweight: not recorded/],
    ["the block", /No active training block/],
    ["readiness", /No check-in today/],
    ["nutrition", /No nutrition logged/],
    ["strength", /No lifts ranked yet/],
  ] as const) {
    assert.match(bare, pattern, `${what} is silently missing rather than declared absent`);
  }
});

test("a full briefing carries every area the athlete can ask about", () => {
  const full: BriefingInput = {
    sport: "football", positions: ["Striker"], focus: "performance",
    bodyweight: { kg: 78, date: "2026-08-14", source: "weigh-in" },
    goal: "strength", blockWeek: 2, adherencePct: 75, inSeason: true,
    nextSessionTitle: "Day 2 · Lower",
    nextSessionDrills: [{ name: "Back squat", prescription: "4 × 5", intensity: "RPE 8" }],
    effort: { verdict: "too_hard", sessions: 4, avgReported: 9, prescribed: 7, gap: 2, note: "You are rating sessions 9/10." },
    readinessStatus: "Yellow", readinessReason: "poor sleep", fatigue: 7, sleepQuality: 4,
    pain: { hamstring_left: 6 }, painReportedOn: "yesterday", protocols: [hamstring],
    targets: { calories: 2900, protein: 170, carbs: 340, fats: 90 } as never,
    eatenToday: { calories: 1800, protein: 90 },
    avgCalories: 2700, avgProtein: 150,
    ranks: [{
      lift: { key: "squat", label: "Back squat" }, best: 140, ratio: 1.79,
      tier: { name: "Advanced" }, source: "tested",
    }] as never,
    parts: [{ muscle: "quads", tier: { name: "Advanced" }, from: "Back squat" }] as never,
    weak: { muscle: "shoulders", tier: { name: "Novice" }, behind: 2, suggest: "Overhead press" } as never,
    benchmarks: { sprint_10m: 1.72 },
  };
  const b = buildBriefing(full);

  for (const [what, needle] of [
    ["sport and position", "football — Striker"],
    ["bodyweight", "78kg"],
    ["the block", "strength"],
    ["block progress", "Week 2"],
    ["adherence", "75%"],
    ["the next session", "Day 2 · Lower"],
    ["the prescribed effort", "RPE 8"],
    ["the effort verdict", "9/10"],
    ["readiness", "Yellow"],
    ["fatigue", "7/10"],
    ["the injury", "hamstring left: 6/10"],
    ["the rehab plan", hamstring.title],
    ["calorie target", "2900 kcal"],
    ["what they ate", "1800 kcal"],
    ["a ranked lift", "Back squat: 140kg"],
    ["that it was tested", "tested"],
    ["the weak link", "shoulders"],
    ["a benchmark", "sprint 10m"],
  ] as const) {
    assert.ok(b.includes(needle), `${what} is missing from the briefing (looked for "${needle}")`);
  }
});

test("the briefing stays small enough to send with every question", () => {
  // It rides on every message. A briefing that grows without bound is a bill
  // that grows without bound, and the model stops attending to the end of it.
  const b = buildBriefing({
    sport: "football", positions: ["Striker"], goal: "strength",
    pain: { hamstring_left: 6, knee_right: 4 }, protocols: RECOVERY_INJURY.slice(0, 3),
    nextSessionDrills: Array.from({ length: 12 }, (_, i) => ({ name: `Drill ${i}`, prescription: "3 × 10" })),
    ranks: Array.from({ length: 20 }, (_, i) => ({
      lift: { key: `l${i}`, label: `Lift ${i}` }, best: 100, ratio: 1.2,
      tier: { name: "Novice" }, source: "logged",
    })) as never,
  });
  assert.ok(b.length < 6000, `briefing is ${b.length} characters — too long to send every turn`);
  // Ranked lifts are capped, so a lifter with a long history does not crowd out
  // the injury section below it.
  assert.ok(!b.includes("Lift 9:"), "the ranked-lift list is not capped");
});

test("sections with nothing to say are dropped, not left as empty headings", () => {
  const b = buildBriefing({ goal: "speed" });
  assert.ok(!/##[^\n]*\n\n/.test(b), "an empty section was rendered");
  assert.ok(!b.endsWith("\n"), "trailing whitespace in the briefing");
});

/**
 * THE GROUNDING RULE HAS TO BE IN THE BRIEFING, NOT IN A PROMPT.
 *
 * It started life in the coach-chat Edge Function's system prompt, which never
 * runs: `invokeAI` prefers the Cloudflare Worker whenever NEXT_PUBLIC_API_URL
 * is set, the Worker answers /coach-chat, and none of the fourteen Supabase
 * functions in this repo is deployed. A rule in a prompt nobody reads is not a
 * rule. The briefing is built in the browser and travels with every question,
 * so it reaches whichever backend is actually serving the call.
 */
test("the exercise list carries its own rule about not inventing exercises", () => {
  const out = buildBriefing({
    goal: "strength",
    programExercises: ["Barbell back squat", "Bench press", "Barbell row"],
    loggedExercises: ["Barbell back squat"],
  });
  assert.match(out, /exactly these 3 exercises and no others/);
  assert.match(out, /Barbell back squat, Bench press, Barbell row/);
  assert.match(out, /RULE:/, "the list arrives with no instruction about how to use it");
  assert.match(out, /Do not name any exercise as being in their programme/);
  // Preacher curls are not on the list, and nothing in the briefing should
  // suggest they are.
  assert.ok(!/preacher/i.test(out));
});

test("with no exercise list, the coach is told to say nothing about the programme", () => {
  // Silence is the safe default. An absent list must not read as "no
  // constraints", which is how the invented exercises got in.
  const out = buildBriefing({ goal: "strength" });
  assert.match(out, /exercise list is not available, so do not describe what it contains/);
  assert.ok(!/RULE:/.test(out), "a rule was written about a list that does not exist");
});
