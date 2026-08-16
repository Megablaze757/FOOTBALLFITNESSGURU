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
