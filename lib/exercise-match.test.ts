import test from "node:test";
import assert from "node:assert/strict";
import { findExercise, hasHowTo, similarExercises, applySwaps } from "./exercise-match";
import { EXERCISES } from "./exercises";

// --- finding ------------------------------------------------------------------

test("every exercise in the library finds itself", () => {
  // Asserted over the whole catalogue rather than a hand-picked few: an exact
  // lookup that fails on any of its own names is broken, and picking examples
  // by hand is how you end up testing the four that happen to work.
  for (const ex of EXERCISES) {
    assert.equal(findExercise(ex.name)?.id, ex.id, `the library could not find its own "${ex.name}"`);
  }
});

test("a common shorthand resolves to the real exercise", () => {
  // The library calls it "Barbell back squat"; everybody else says "back
  // squat", and a rehab plan or a programme written elsewhere will too.
  assert.match(findExercise("Back squat")?.name ?? "", /squat/i);
  assert.match(findExercise("Nordic curl")?.name ?? "", /nordic/i);
});

test("casing and punctuation do not matter", () => {
  const a = findExercise("BACK SQUAT");
  const b = findExercise("back  squat");
  assert.ok(a && b);
  assert.equal(a!.id, b!.id);
});

/**
 * THE FAILURE MODE THAT SET THE THRESHOLD.
 *
 * A fuzzy matcher that answers eagerly returns "Leg Extension" for "Terminal
 * knee extension" — a real exercise, the wrong one, offered with exactly the
 * same confidence as a correct match. For a rehab exercise that is worse than
 * no answer, because the athlete follows it.
 */
test("a name it cannot place returns nothing rather than something plausible", () => {
  for (const name of ["Wobble board proprioception drill", "Scapular clock", "", "asdfgh"]) {
    const ex = findExercise(name);
    assert.equal(ex, null, `"${name}" matched "${ex?.name}"`);
  }
});

test("a fuzzy match has to be about the same movement", () => {
  // "Hamstring curl" shares one word in three with the query, which is exactly
  // the case that must NOT resolve — a hamstring curl is the loaded exercise a
  // rehab plan prescribing isometrics is keeping the athlete away from.
  const m = findExercise("Isometric hamstring hold");
  assert.notEqual(m?.name, "Lying Leg Curl");
  assert.notEqual(m?.name, "Seated Leg Curl");
});

test("a short common word does not win every lookup", () => {
  // "Squat" appears in twenty-five exercise names. Scoring only by how much of
  // the QUERY matched would make the shortest of them the answer to all of
  // them, purely by being short.
  const m = findExercise("Bulgarian split squat with dumbbells");
  assert.notEqual(m?.name?.toLowerCase(), "squat");
});

test("hasHowTo only claims a how-to when there is one", () => {
  assert.equal(hasHowTo("Wobble board proprioception drill"), false);
  assert.equal(hasHowTo("Back squat"), true);
});

// --- swapping -----------------------------------------------------------------

test("a swap trains the same muscles as the thing it replaces", () => {
  const opts = similarExercises("Back squat");
  assert.ok(opts.length > 0, "no substitute offered for the most common lift in the gym");
  for (const o of opts) {
    const muscles = o.ex.muscles.map((m) => m.toLowerCase());
    assert.ok(muscles.some((m) => ["quads", "glutes", "hamstrings"].includes(m)),
      `${o.ex.name} was offered as a squat substitute and trains ${muscles.join("/")}`);
  }
});

/**
 * THE REASON PEOPLE SWAP IS THE KIT.
 *
 * Ranking by similarity of equipment would answer "no barbell" with the front
 * squat, the box squat and the pause squat — three more barbell lifts.
 */
test("swaps are not all the same equipment as the original", () => {
  const opts = similarExercises("Barbell bench press", 8);
  assert.ok(opts.length > 0);
  assert.ok(opts.some((o) => o.ex.equipment !== "Barbell"),
    `every substitute for a barbell press also needed a barbell: ${opts.map((o) => o.ex.name).join(", ")}`);
});

test("an exercise is never offered as its own substitute", () => {
  for (const name of ["Back squat", "Pull-up", "Lat pulldown"]) {
    const original = findExercise(name)!;
    assert.ok(similarExercises(name).every((o) => o.ex.id !== original.id), `${name} was offered to replace itself`);
  }
});

test("nothing is suggested for a movement we cannot identify", () => {
  // Guessing here is how somebody replaces a rehab isometric with a leg
  // extension because both mention a knee.
  assert.deepEqual(similarExercises("Wobble board proprioception drill"), []);
  assert.deepEqual(similarExercises(""), []);
});

test("a vague muscle tag does not make everything a substitute for everything", () => {
  // "Full body" is on carries, burpees and Olympic lifts alike. Counting it as
  // a shared muscle would make every one of those swap for every other.
  const vague = EXERCISES.find((e) => e.muscles.some((m) => /full body|whole body/i.test(m)));
  if (!vague) return; // nothing tagged that way; the guard is still worth having
  for (const o of similarExercises(vague.name, 5)) {
    const shared = o.ex.muscles.map((m) => m.toLowerCase());
    assert.ok(!shared.every((m) => /full body|whole body/i.test(m)),
      `${o.ex.name} matched ${vague.name} on nothing but a "full body" tag`);
  }
});

test("every option carries a reason the athlete can judge", () => {
  for (const o of similarExercises("Back squat")) {
    assert.ok(o.why.length > 3, `${o.ex.name} was offered with no explanation`);
    assert.ok(o.score > 0);
  }
});

test("the whole library can be looked up without throwing", () => {
  // Names in this catalogue come from several sources and include punctuation,
  // digits and accents; a lookup that throws on one takes a page down.
  for (const ex of EXERCISES) {
    assert.doesNotThrow(() => findExercise(ex.name), ex.name);
    assert.doesNotThrow(() => similarExercises(ex.name, 3), ex.name);
  }
});

// --- applying swaps -----------------------------------------------------------

test("a swap renames the drill and remembers what it replaced", () => {
  const [d] = applySwaps([{ name: "Barbell back squat", sets: 4 }], { "Barbell back squat": "Goblet squat" });
  assert.equal(d.name, "Goblet squat");
  assert.equal(d.swappedFrom, "Barbell back squat");
  assert.equal(d.sets, 4, "the prescription was lost along with the name");
});

test("a swap survives the block being regenerated under a different spelling", () => {
  // The map is keyed by whatever the plan called it when they tapped. A raw
  // string comparison would drop every swap on the next rebuild — their
  // shoulder still hates overhead pressing and the programme has forgotten.
  const swaps = { "Back squat": "Goblet squat" };
  assert.equal(applySwaps([{ name: "Barbell back squat" }], swaps)[0].name, "Goblet squat");
  assert.equal(applySwaps([{ name: "BACK  SQUAT" }], swaps)[0].name, "Goblet squat");
});

test("drills nobody swapped are untouched", () => {
  const drills = [{ name: "Bench press" }, { name: "Pull-up" }];
  const out = applySwaps(drills, { "Back squat": "Goblet squat" });
  assert.deepEqual(out.map((d) => d.name), ["Bench press", "Pull-up"]);
  assert.ok(out.every((d) => d.swappedFrom === undefined));
});

test("an empty or broken swap map changes nothing", () => {
  const drills = [{ name: "Back squat" }];
  for (const swaps of [null, undefined, {}, { "Back squat": "" }, { "Back squat": "   " }]) {
    assert.equal(applySwaps(drills, swaps as never)[0].name, "Back squat");
  }
});

test("a swap cannot leak onto a different exercise", () => {
  // Keying by movement rather than spelling must not become keying by "looks a
  // bit like it": a front squat is not a back squat, and hijacking it would
  // silently replace a lift the athlete never asked to change.
  const swaps = { "Back squat": "Goblet squat" };
  assert.equal(applySwaps([{ name: "Front squat" }], swaps)[0].name, "Front squat");
  assert.equal(applySwaps([{ name: "Bulgarian split squat" }], swaps)[0].name, "Bulgarian split squat");
});

// --- rehab coverage -----------------------------------------------------------

/**
 * EVERY EXERCISE A REHAB PLAN PRESCRIBES CAN BE DEMONSTRATED.
 *
 * Tapping an exercise on the injury page shows you how to do it, and it could
 * only do that for 27 of these 63 — the rest showed a name and a dose, which
 * for somebody who has never done a Copenhagen plank is an instruction they
 * cannot follow, on the one screen where following it correctly matters most.
 *
 * This is the standard clinical vocabulary for the seven areas the injury
 * planner covers. It is a list rather than a sample on purpose: a spot check of
 * five would have passed at 27/63.
 */
const REHAB_VOCABULARY: Record<string, string[]> = {
  ankle: ["Ankle alphabet", "Ankle circles", "Single-leg balance", "Calf raise", "Heel raises",
    "Band ankle eversion", "Band ankle inversion", "Ankle dorsiflexion stretch", "Lateral hops", "Wobble board balance"],
  knee: ["Isometric wall sit", "Spanish squat", "Terminal knee extension", "Straight leg raise", "Step down",
    "Split squat", "Quad set", "Leg extension", "Wall slide", "Box step up"],
  hamstring: ["Isometric hamstring hold", "Hamstring slider", "Single leg bridge", "Romanian deadlift",
    "Nordic hamstring curl", "Hamstring catch", "Prone hamstring curl", "Build-up runs",
    "Supine hamstring stretch", "Glute bridge"],
  groin: ["Adductor squeeze", "Copenhagen plank", "Side-lying adduction", "Ball squeeze",
    "Adductor isometric", "Side lunge", "Cossack squat", "Lateral shuffle"],
  calf: ["Isometric calf hold", "Eccentric calf raise", "Seated calf raise", "Standing calf raise",
    "Pogo hops", "Skipping", "Soleus raise", "Heel drop"],
  back: ["McGill curl-up", "Bird dog", "Side plank", "Cat cow", "Glute bridge", "Dead bug",
    "Hip hinge pattern", "Pelvic tilt", "Prone press up"],
  shoulder: ["Band external rotation", "Scapular retraction", "Wall slide", "Pendulum swing",
    "Scapular push-up", "Face pull", "Y raise", "Sleeper stretch"],
};

test("every exercise a rehab plan prescribes has a demo", () => {
  const missing: string[] = [];
  let total = 0;
  for (const [area, list] of Object.entries(REHAB_VOCABULARY)) {
    for (const name of list) {
      total++;
      // The area goes in, exactly as the injury page passes it.
      if (!findExercise(name, area)) missing.push(`${area}: ${name}`);
    }
  }
  assert.ok(total >= 60, `the vocabulary shrank to ${total}; it is the point of this test`);
  assert.deepEqual(missing, [], "these appear in rehab plans and cannot be demonstrated");
});

/**
 * RESOLVING IS NOT THE SAME AS RESOLVING CORRECTLY, and this is the assertion
 * that was missing.
 *
 * "Wall slide" appears under both knee and shoulder in the vocabulary above.
 * There was only ever a knee entry, so the shoulder lookup quietly returned a
 * quad exercise — and the old test, which asked only whether SOMETHING came
 * back, passed while an athlete rehabbing a shoulder was shown squats.
 */
test("an exercise resolves to something that trains the area it was asked for", () => {
  const AREA_MUSCLES: Record<string, RegExp> = {
    ankle: /ankle|calf|calv|achilles|glute med/i,
    knee: /quad|vmo|glute|hamstring/i,
    hamstring: /hamstring|glute|calf/i,
    groin: /adductor|groin|quad|glute|oblique/i,
    // "calv" as well as "calf": the library tag is "Calves".
    calf: /calf|calv|achilles|ankle/i,
    back: /back|core|oblique|glute|spine|hamstring|deep core/i,
    shoulder: /shoulder|rotator|trap|back|delt/i,
  };
  const wrong: string[] = [];
  for (const [area, list] of Object.entries(REHAB_VOCABULARY)) {
    for (const name of list) {
      const ex = findExercise(name, area);
      if (!ex) continue; // covered by the test above
      const muscles = (ex.muscles ?? []).join(" ");
      // "Legs" and "Whole body" are uninformative rather than wrong — a split
      // squat tagged "Legs" is a perfectly good knee exercise. Flagging those
      // would be measuring the catalogue's tagging, not the lookup, and the
      // shoulder-to-quads bug this test exists for is still caught: "Quads" is
      // a specific tag and does not match the shoulder pattern.
      if (/^(legs|whole body|full body|cardio)( |$)/i.test(muscles.trim()) && (ex.muscles?.length ?? 0) <= 2) continue;
      if (!AREA_MUSCLES[area].test(muscles)) {
        wrong.push(`${area}: "${name}" -> ${ex.name} (trains ${muscles})`);
      }
    }
  }
  assert.deepEqual(wrong, [], "a rehab exercise resolved to a demo for the wrong body part");
});

test("a name meaning two exercises refuses to guess without an area", () => {
  // A wall slide is a supported squat for a knee and a scapular slide for a
  // shoulder. With no area, picking either is a coin flip on somebody's rehab.
  assert.equal(findExercise("Wall slide"), null);
  assert.equal(findExercise("Wall slides"), null);
  assert.match(findExercise("Wall slide", "knee")?.muscles.join() ?? "", /Quads/);
  assert.match(findExercise("Wall slide", "shoulder")?.muscles.join() ?? "", /trap|Shoulder/i);
  // And an area the name has no entry for is still a refusal, not a fallback.
  assert.equal(findExercise("Wall slide", "hamstring"), null);
});

test("a rehab exercise's demo teaches it, rather than only naming it", () => {
  // TEACHES IT BY EITHER ROUTE. The hand-written entries carry coaching cues;
  // the 199 imported ones carry a written how-to instead and no cues at all.
  // Asserting on cues alone failed on Split Squat, which has a perfectly good
  // description — the test was measuring the wrong thing, not finding a gap.
  // `hasHowTo` is the question the injury page actually asks.
  for (const [area, list] of Object.entries(REHAB_VOCABULARY)) {
    for (const name of list) {
      const ex = findExercise(name, area)!;
      assert.ok(hasHowTo(name, area), `${name} -> ${ex.name} resolves but teaches nothing`);
      assert.ok((ex.cues?.length ?? 0) >= 2 || (ex.description?.length ?? 0) > 80,
        `${name} -> ${ex.name} has neither cues nor a written how-to`);
    }
  }
});

test("the synonyms map names to the movement they actually mean", () => {
  // Each of these is a claim that two names are the SAME exercise. A wrong one
  // sends somebody rehabbing a hamstring to the wrong movement, so they are
  // asserted rather than trusted.
  const expected: [string, RegExp][] = [
    ["Heel raises", /calf raise/i],
    ["Ball squeeze", /adductor/i],
    ["Hamstring catch", /nordic/i],
    ["Clamshell", /band lateral|glute/i],
    ["Quad setting", /quad set/i],
  ];
  for (const [name, pattern] of expected) {
    assert.match(findExercise(name)?.name ?? "", pattern, `"${name}" resolved wrongly`);
  }
});
