import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CUES_REQUIRED,
  CUE_MAX,
  draftPrompt,
  draftProblems,
  draftTargets,
  needsDraft,
  parseDraft,
  partition,
  STUB_WHY,
  type Draft,
  type DraftTarget,
} from "./exercise-draft";
import { EXERCISES, isRunEntry } from "./exercises";

const MOVEMENTS = EXERCISES.filter((e) => !isRunEntry(e));

/** A real row, so the validator is tested against real ground truth. */
const LEG_PRESS: DraftTarget = {
  id: "horizontal_leg_press",
  name: "Horizontal Leg Press",
  category: "Strength",
  equipment: "Machine",
  muscles: ["Legs"],
  description:
    "Back flat against the seat, feet on the platform shoulder width. Press out to "
    + "near-extension, then return under control until the knees are around 90°. Adjust "
    + "the seat so you get range without the hips rolling off the pad.",
};

const good: Draft = {
  id: LEG_PRESS.id,
  why: "Loads the legs heavily with your back supported, so you can push hard on tired days.",
  cues: [
    "Back flat against the seat throughout",
    "Press out to near-extension, never snap the knees",
    "Return under control until the knees reach 90",
  ],
};

test("a clean draft has nothing wrong with it", () => {
  assert.deepEqual(draftProblems(good, LEG_PRESS), []);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ONE THAT MATTERS.
 *
 * Clumsy writing is caught by whoever reads the diff. A cue that is fluent,
 * confident and about a DIFFERENT EXERCISE is not — "keep the bar tight to
 * your back" reads like coaching until you notice the leg press has no bar.
 * That is the failure that reaches an athlete, so it is the one with a test.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a cue about equipment this exercise does not have is caught", () => {
  const wrong: Draft = {
    ...good,
    cues: [
      "Keep the bar tight against your back",
      "Press out to near-extension, never snap the knees",
      "Return under control until the knees reach 90",
    ],
  };
  const problems = draftProblems(wrong, LEG_PRESS);
  assert.ok(problems.some((p) => p.includes('names "bar"')), problems.join("; "));
});

/**
 * Matching one spelling must not license its neighbours. "Machine" matched the
 * `machine` key, which also lists "sled/scrum machine" — and the first version
 * of allowedEquipment() took the words of every spelling under a matched key,
 * so "Drive the sled away" passed clean on a leg press.
 */
test("matching one spelling does not license the equipment filed next to it", () => {
  const wrong: Draft = {
    ...good,
    cues: [
      "Drive the sled away with both feet",
      "Press out to near-extension, never snap the knees",
      "Return under control until the knees reach 90",
    ],
  };
  const problems = draftProblems(wrong, LEG_PRESS);
  assert.ok(problems.some((p) => p.includes('names "sled"')), problems.join("; "));

  // And the equipment it does have still passes.
  const right: Draft = {
    ...good,
    cues: [
      "Set the machine seat before you load it",
      "Press out to near-extension, never snap the knees",
      "Return under control until the knees reach 90",
    ],
  };
  assert.deepEqual(draftProblems(right, LEG_PRESS), []);
});

test("a cue about a muscle this exercise does not train is caught", () => {
  const wrong: Draft = {
    ...good,
    cues: [
      "Squeeze the chest hard at the top",
      "Press out to near-extension, never snap the knees",
      "Return under control until the knees reach 90",
    ],
  };
  const problems = draftProblems(wrong, LEG_PRESS);
  assert.ok(problems.some((p) => p.includes('names "chest"')), problems.join("; "));
});

test("a body part the description itself names is allowed", () => {
  // "hips" is not in muscles: ["Legs"], but the description says it.
  const ok: Draft = {
    ...good,
    cues: [
      "Stop before the hips roll off the pad",
      "Press out to near-extension, never snap the knees",
      "Return under control until the knees reach 90",
    ],
  };
  assert.deepEqual(draftProblems(ok, LEG_PRESS), []);
});

test("cues written from the name alone, ignoring the description, are caught", () => {
  const generic: Draft = {
    ...good,
    cues: ["Breathe out on the effort", "Stay tight throughout", "Move with intent"],
  };
  const problems = draftProblems(generic, LEG_PRESS);
  assert.ok(problems.some((p) => p.includes("refer to the description")), problems.join("; "));
});

test("one general cue among three specific ones is fine", () => {
  const mixed: Draft = {
    ...good,
    cues: [
      "Breathe out on the effort",
      "Press out to near-extension, never snap the knees",
      "Return under control until the knees reach 90",
    ],
  };
  assert.deepEqual(draftProblems(mixed, LEG_PRESS), []);
});

test("claims this app will not make are caught wherever they appear", () => {
  const claims = [
    "Strengthens the legs and prevents knee injuries in season.",
    "This is the best exercise for building leg strength there is.",
    "Guarantees bigger legs within six weeks of starting it.",
    "Rehabilitates the knee after a long injury layoff safely.",
  ];
  for (const why of claims) {
    const problems = draftProblems({ ...good, why }, LEG_PRESS);
    assert.ok(problems.some((p) => p.startsWith("claim this app will not make")),
      `not caught: ${why} — got ${problems.join("; ")}`);
  }
  const inACue = draftProblems(
    { ...good, cues: [...good.cues.slice(1), "Bulletproof your knees"] }, LEG_PRESS);
  assert.ok(inACue.some((p) => p.startsWith("claim this app will not make")), inACue.join("; "));
});

test("house style is enforced, because it was measured not invented", () => {
  const check = (draft: Partial<Draft>, needle: string) => {
    const problems = draftProblems({ ...good, ...draft }, LEG_PRESS);
    assert.ok(problems.some((p) => p.includes(needle)),
      `expected "${needle}", got: ${problems.join("; ")}`);
  };
  check({ why: "Builds the legs." }, "placeholder");
  check({ why: "Short." }, "wanted 40-200");
  check({ why: "Loads the legs heavily with your back supported so you push hard" }, "full stop");
  check({ cues: good.cues.slice(0, 2) }, `wanted exactly ${CUES_REQUIRED}`);
  check({ cues: [...good.cues.slice(1), "Back flat against the seat throughout."] }, "ends in a full stop");
  check({ cues: [good.cues[0], good.cues[1], good.cues[0]] }, "duplicate cue");
  check({ cues: [...good.cues.slice(1), "Up"] }, "wanted 10-70");
  check({ cues: [...good.cues.slice(1), "I like to keep the knees tracking outwards here"] }, "second person");
  check({ cues: [...good.cues.slice(1), `Return under control ${"x".repeat(CUE_MAX)}`] }, "wanted 10-70");
});

test("a reply wrapped in markdown or chat still parses", () => {
  const payload = '{"why": "Loads the legs.", "cues": ["one", "two", "three"]}';
  for (const raw of [
    payload,
    "```json\n" + payload + "\n```",
    "```\n" + payload + "\n```",
    "Here is the JSON you asked for:\n\n" + payload,
    "Sure!\n```json\n" + payload + "\n```\nLet me know if you want changes.",
  ]) {
    const draft = parseDraft("x", raw);
    assert.ok(draft, `did not parse: ${raw.slice(0, 40)}`);
    assert.equal(draft.cues.length, 3);
    assert.equal(draft.id, "x");
  }
});

test("a reply that is not a usable draft returns null rather than half a draft", () => {
  for (const raw of [
    "", "I cannot help with that.", "{", "{ not json }",
    '{"why": "no cues here"}',
    '{"cues": ["one"]}',
    '{"why": 12, "cues": ["one"]}',
    '{"why": "fine", "cues": "not an array"}',
    '{"why": "fine", "cues": [1, 2, 3]}',
    "null", "[]",
  ]) {
    assert.equal(parseDraft("x", raw), null, `should not have parsed: ${raw}`);
  }
});

test("blank cues are dropped rather than counted", () => {
  const draft = parseDraft("x", '{"why": "w", "cues": ["one", "  ", "", "two"]}');
  assert.deepEqual(draft?.cues, ["one", "two"]);
});

/**
 * The queue only exists if the gap does. If a later import arrives with cues
 * already written, this should quietly find nothing rather than redraft over
 * work somebody did.
 */
test("only rows with real ground truth and a real gap are drafted for", () => {
  const targets = draftTargets(MOVEMENTS);
  assert.ok(targets.length > 100, `only ${targets.length} targets — has the catalogue changed?`);

  for (const t of targets) {
    assert.ok(t.description.length >= 80, `${t.name} has no description to check cues against`);
    const row = MOVEMENTS.find((e) => e.id === t.id)!;
    assert.ok((row.cues?.length ?? 0) === 0 || STUB_WHY.test(row.why),
      `${t.name} already has cues and a real why`);
  }

  const alreadyDone = MOVEMENTS.filter((e) => (e.cues?.length ?? 0) >= 3 && !STUB_WHY.test(e.why));
  assert.ok(alreadyDone.length > 0);
  for (const e of alreadyDone) {
    assert.ok(!needsDraft(e), `${e.name} would be redrafted over work already done`);
  }

  assert.equal(needsDraft({ ...MOVEMENTS[0], description: "", cues: [], why: "Builds the legs." }), false,
    "an entry with no description is guessing material, not a draft target");
});

test("the prompt carries the ground truth and asks for nothing else", () => {
  const { system, user } = draftPrompt(LEG_PRESS);
  assert.ok(user.includes(LEG_PRESS.description), "the description is the whole point");
  assert.ok(user.includes("Horizontal Leg Press"));
  assert.ok(user.includes("Machine"));
  // The fields the model may not touch must not be solicited.
  for (const forbidden of ["demo", "video", "tempo", "imported", "difficulty"]) {
    assert.ok(!new RegExp(`"${forbidden}"`).test(system),
      `the prompt asks for ${forbidden}, which is not the model's to write`);
  }
  assert.ok(system.includes('{"why"'), "the shape has to be stated to be parseable");
});

test("nothing is applied automatically — drafts are only sorted", () => {
  const reviewed = [
    { target: LEG_PRESS, draft: good, problems: [] },
    { target: LEG_PRESS, draft: good, problems: ["something is wrong"] },
  ];
  const { clean, held } = partition(reviewed);
  assert.equal(clean.length, 1);
  assert.equal(held.length, 1);
  assert.equal(held[0].problems[0], "something is wrong");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PATTERN DECIDES WHOSE WORK GETS OVERWRITTEN.
 *
 * The first version of STUB_WHY was /^builds? the [a-z ]+\.?$/i, and against
 * the real catalogue it swallowed seven sentences a person actually wrote —
 * "Builds the chest through a bigger range than a barbell, evening out
 * left/right" among them. Every one would have been queued up for a model to
 * replace. So this does not test the pattern against examples I made up; it
 * tests it against every `why` in the book.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("the placeholder pattern matches the placeholders and nothing else", () => {
  for (const stub of ["Builds the legs.", "Builds the core.", "Build the whole body.", "Builds the chest"]) {
    assert.ok(STUB_WHY.test(stub), `should be a stub: ${stub}`);
  }

  // Every real sentence in the catalogue, including the seven that start the
  // same way the placeholders do.
  const written = MOVEMENTS.map((e) => e.why).filter((w) => w.split(" ").length > 4);
  assert.ok(written.length > 100);
  for (const why of written) {
    assert.ok(!STUB_WHY.test(why), `a written sentence would be redrafted over: ${why}`);
  }

  const stubs = MOVEMENTS.filter((e) => STUB_WHY.test(e.why));
  assert.ok(stubs.length > 150, `only ${stubs.length} placeholders found — the queue looks wrong`);
  for (const e of stubs) {
    assert.match(e.why, /^Builds the /, `unexpected shape: ${e.why}`);
  }
});

/**
 * A claim filter that fires on good coaching gets switched off, which is worse
 * than not having one. "Fix your eyes ahead and keep the back flat" is a real
 * cue that an adjacent-words pattern reads as "fix ... back".
 */
test("the claim filter leaves real coaching alone", () => {
  const legitimate = [
    "Fix your eyes ahead and keep the back flat",
    "Keep the back flat and the chest proud",
    "Treat the last rep like the first",
    "Heels stay down, knees track over the toes",
    "Brace hard before the bar leaves the floor",
    "Stop the set when the back starts to round",
    "Free the shoulders before you press",
  ];
  for (const cue of legitimate) {
    const problems = draftProblems(
      { ...good, cues: [cue, good.cues[1], good.cues[2]] }, LEG_PRESS);
    assert.deepEqual(problems.filter((p) => p.startsWith("claim this app will not make")), [],
      `a real cue was flagged as a claim: ${cue}`);
  }

  // And every cue the catalogue already ships, which is the strongest version
  // of the same check: none of them may trip the filter.
  for (const e of MOVEMENTS) {
    for (const cue of e.cues ?? []) {
      const problems = draftProblems({ ...good, cues: [cue, good.cues[1], good.cues[2]] }, LEG_PRESS);
      assert.deepEqual(problems.filter((p) => p.startsWith("claim this app will not make")), [],
        `a shipped cue trips the claim filter: ${cue}`);
    }
  }
});
