import test from "node:test";
import assert from "node:assert/strict";
import { howToFor, hasHowTo } from "./how-to";
import { buildProgram } from "./coach";
import { getExerciseByName } from "./exercises";
import { SKILL_DRILLS } from "./skills";
import { RUN_TYPES } from "./running";

/**
 * "Guided session not showing how to before starting."
 *
 * The player asked the exercise library and nothing else, so every ball drill
 * and every run appeared with a rep count and no instruction whatsoever. The
 * bug is not in either catalogue — the coaching is written in all three — it is
 * in the seam, which is why the load-bearing test here is the one that walks
 * real generated programs rather than the ones that check a shape.
 */

test("every drill a generated program prescribes can be explained", () => {
  // THE TEST THAT WOULD HAVE CAUGHT IT. Unit tests on lib/exercises pass while
  // 13% of a football session is unteachable, because nothing in either module
  // spans the gap between them.
  const inputs = [
    { sport: "football", goal: "strength", daysPerWeek: 4 },
    { sport: "football", goal: "aesthetics", daysPerWeek: 5 },
    { sport: "rugby", goal: "power", daysPerWeek: 3 },
    { sport: "running", goal: "endurance", daysPerWeek: 4 },
    { sport: "basketball", goal: "speed", daysPerWeek: 5 },
  ] as any[];

  const orphans = new Set<string>();
  let total = 0;
  const bySource = { exercise: 0, skill: 0, run: 0 };
  for (const input of inputs) {
    const plan: any = buildProgram(input);
    for (const week of plan.weeks ?? []) {
      for (const session of week.sessions ?? []) {
        for (const drill of session.drills ?? []) {
          total++;
          const how = howToFor(drill.name);
          if (!how) orphans.add(drill.name);
          else bySource[how.source]++;
        }
      }
    }
  }

  assert.equal(orphans.size, 0, `no coaching for: ${[...orphans].slice(0, 8).join(", ")}`);
  assert.ok(total > 300, `only ${total} drills sampled`);
  // The point of the file: a meaningful share of a real program is NOT a
  // library exercise. If this ever reads zero the sample has stopped covering
  // the case that motivated any of this.
  assert.ok(bySource.skill > 20, `only ${bySource.skill} skill drills in the sample`);
  assert.ok(bySource.run > 0, "no runs in the sample");
});

test("the exercise library wins when a name is in two catalogues", () => {
  // Nine run labels and two skill drills also exist as full library entries,
  // and those entries already say what the run type says. Printing both would
  // give the same coaching twice in two voices.
  const clashes = RUN_TYPES.filter((r) => getExerciseByName(r.label));
  assert.ok(clashes.length > 0, "expected some run labels to exist in the library");
  for (const run of clashes) {
    assert.equal(howToFor(run.label)?.source, "exercise", run.label);
  }
});

test("a skill drill brings its setup, steps and progression", () => {
  const how = howToFor("Tight cone weave");
  assert.equal(how?.source, "skill");
  assert.equal(how?.tag, "Football · Dribbling");
  assert.ok(how?.setup, "kit and space is the first reason a drill gets skipped");
  assert.ok((how?.steps.length ?? 0) >= 3);
  assert.ok(how?.progression, "how to make it harder");
  assert.equal(how?.needs, "solo");
  assert.equal(how?.demo, "ball", "a ball drill should draw the ball figure");
});

test("a run brings its purpose, method and the mistake that ruins it", () => {
  const how = howToFor("Tempo / threshold");
  assert.equal(how?.source, "run");
  assert.equal(how?.tag, "Running · Zone 4");
  assert.ok(how?.watch?.length, "watchFor is the most useful line a run type carries");
  assert.equal(how?.demo, "run");
});

test("a skill drill does not print its coaching point twice", () => {
  // `coaching` is used as the why, because a skill drill has no other one-line
  // summary. Repeating it in the cue list puts the same sentence on the card
  // twice, which reads as a bug in the data.
  for (const drill of SKILL_DRILLS) {
    const how = howToFor(drill.name);
    if (how?.source !== "skill") continue;
    assert.ok(!how.cues.includes(drill.coaching), drill.name);
  }
});

test("only claims to teach the movement when it actually does", () => {
  // The bulk gym import's `why` is a one-line benefit. Showing it as the method
  // promises a step-by-step and delivers a sentence.
  const ex = getExerciseByName("Barbell back squat");
  assert.ok(ex, "expected the staple lift to exist");
  const how = howToFor("Barbell back squat")!;
  assert.equal(how.teaches, !!ex!.hasHowTo);
  if (!how.teaches) assert.equal(how.steps.length, 0, "steps must be empty when nothing was written");
});

test("an exercise is tagged with what it trains and what it needs", () => {
  const how = howToFor("Barbell back squat");
  assert.equal(how?.source, "exercise");
  // Primary mover, then the kit — the same two facts the library card shows,
  // so a drill in a session and the same drill in the library read alike.
  assert.match(how!.tag, /·/);
  assert.match(how!.tag, /Barbell/);
});

test("a coach-entered exercise still gets an honest fallback card", () => {
  const fallback = howToFor("Single-arm landmine rainbow press");
  assert.ok(fallback);
  assert.equal(fallback.name, "Single-arm landmine rainbow press");
  assert.equal(fallback.source, "exercise");
  assert.ok(fallback.muscles.length > 0);
  assert.ok(fallback.steps.length > 0);
  assert.equal(fallback.teaches, false, "generic safety guidance must not claim to be exact movement coaching");
  assert.equal(howToFor("   "), null);
  assert.equal(hasHowTo("Tight cone weave"), true);
  assert.equal(hasHowTo("Single-arm landmine rainbow press"), true);
});
