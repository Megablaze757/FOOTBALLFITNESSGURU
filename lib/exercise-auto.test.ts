import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { autoPlan, autoStep, autoSummary, VIDEO_REASON, type AutoRow } from "./exercise-auto";
import { EMPTY_DRAFT, nameTaken, publishBlockers, type ExerciseDraft } from "./exercise-review";

const code = (src: string) =>
  readFileSync(src, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** A draft with nothing wrong with it — the only shape that may auto-publish. */
const GOOD: ExerciseDraft = {
  ...EMPTY_DRAFT,
  equipment: "Barbell",
  muscles: ["quads", "glutes"],
  cues: ["Brace before you unrack it.", "Drive the floor away through mid-foot."],
  why: "Loads the legs through a full range under a bar you can add to.",
  description:
    "Set the bar on your upper back, take two steps out, and sit between your hips until "
    + "your thighs reach parallel. Stand by driving the floor away, keeping your ribs down.",
  youtubeId: "dQw4w9WgXcQ",
};

const row = (over: Partial<AutoRow> = {}): AutoRow => ({
  id: "r1",
  // Not a name the compiled catalogue already has — publishBlockers refuses
  // those, and a fixture that trips a different rule tests a different thing.
  name: "Zercher anderson squat",
  aiDraftedAt: "2026-09-05T09:00:00Z",
  reviewNotes: null,
  draft: GOOD,
  ...over,
});

test("a row nobody has drafted gets drafted, not judged", () => {
  assert.deepEqual(autoStep(row({ aiDraftedAt: null, draft: EMPTY_DRAFT })), { id: "r1", action: "draft" });
  // Even one that would otherwise be perfect: the fields on an undrafted row
  // are whatever the athlete typed, and judging them is judging the wrong text.
  assert.equal(autoStep(row({ aiDraftedAt: null })).action, "draft");
});

test("a complete, clean, checked row publishes itself", () => {
  assert.deepEqual(autoStep(row()), { id: "r1", action: "publish" });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RULE THIS FILE EXISTS TO HOLD.
 *
 * A YouTube id is eleven characters a model will invent as readily as recall.
 * Publishing without one puts a card teaching somebody how to load their spine
 * onto a page whose "how does this go?" answer is a search box.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("nothing is ever published without a video", () => {
  for (const youtubeId of [null, "", undefined as unknown as null]) {
    const step = autoStep(row({ draft: { ...GOOD, youtubeId } }));
    assert.equal(step.action, "hold", `a row with youtubeId ${JSON.stringify(youtubeId)} was published`);
  }
});

/** Belt and braces: no combination of the other fields can reach publish. */
test("no draft without a video can reach publish, however good the rest is", () => {
  const fields: Partial<ExerciseDraft>[] = [
    {}, { tempo: "3-1-1" }, { muscles: ["quads", "glutes", "hamstrings"] },
    { cues: [...GOOD.cues, "Keep your heels down."] },
    { why: `${GOOD.why} It also carries over to everything else you do.` },
  ];
  for (const extra of fields) {
    const draft = { ...GOOD, ...extra, youtubeId: null };
    assert.notEqual(autoStep(row({ draft })).action, "publish", JSON.stringify(extra));
    assert.ok(publishBlockers(draft, "Zercher anderson squat").some((r) => VIDEO_REASON.test(r)));
  }
});

/**
 * `review_notes` means the cue checks found something wrong with the WORDS —
 * a fluent, confident cue about a different exercise. That is the failure that
 * reads as fine, so it must outrank every field being present.
 */
test("a draft the cue checks held is never published, however complete it looks", () => {
  const step = autoStep(row({ reviewNotes: "a cue names the hamstrings; the description does not" }));
  assert.equal(step.action, "hold");
  assert.deepEqual(step.action === "hold" ? step.reasons : [], [
    "a cue names the hamstrings", "the description does not",
  ]);
});

test("an empty review note is not a hold", () => {
  for (const notes of [null, "", "   ", ";", " ; ; "]) {
    assert.equal(autoStep(row({ reviewNotes: notes })).action, "publish", JSON.stringify(notes));
  }
});

test("moderation outranks a complete draft", () => {
  // A name the moderator refuses. If this ever stops being refused the
  // assertion below fails loudly rather than the test quietly passing.
  const blocked = autoStep(row({ name: "buy cheap steroids online www.example.com" }));
  assert.equal(blocked.action, "hold", "a submission the moderator blocks was published");
});

test("a name the library already has is held, not duplicated", () => {
  // Asserted, not assumed: "Back squat" is NOT in the compiled catalogue and
  // the first version of this test used it, so it published and the assertion
  // was testing nothing. A fixture that does not trip the rule it is named
  // after is worse than no test.
  const taken = "Barbell back squat";
  assert.ok(nameTaken(taken), `${taken} is no longer in the catalogue — pick another`);

  const step = autoStep(row({ name: taken }));
  assert.equal(step.action, "hold");
  assert.ok(
    step.action === "hold" && step.reasons.some((r) => /already has/i.test(r)),
    `held for the wrong reason: ${step.action === "hold" ? step.reasons.join("; ") : ""}`,
  );
});

test("a plan keeps one step per row, in order", () => {
  const rows = [
    row({ id: "a", aiDraftedAt: null }),
    row({ id: "b" }),
    row({ id: "c", draft: { ...GOOD, youtubeId: null } }),
  ];
  const plan = autoPlan(rows);
  assert.deepEqual(plan.map((s) => s.id), ["a", "b", "c"]);
  assert.deepEqual(plan.map((s) => s.action), ["draft", "publish", "hold"]);
});

/**
 * The count that decides whether the remaining work is a pile of judgement or
 * one repeated task. Lumping "needs a clip" in with "read this one" hides that.
 */
test("rows waiting only on a clip are counted apart from real holds", () => {
  const plan = autoPlan([
    row({ id: "a", aiDraftedAt: null }),
    row({ id: "b" }),
    row({ id: "c", draft: { ...GOOD, youtubeId: null } }),
    row({ id: "d", draft: { ...GOOD, youtubeId: null } }),
    row({ id: "e", reviewNotes: "a cue names something the description does not" }),
  ]);
  assert.deepEqual(autoSummary(plan), { draft: 1, publish: 1, hold: 3, needVideo: 2 });
});

test("a row missing a clip AND something else is not counted as just needing a clip", () => {
  const plan = autoPlan([row({ draft: { ...GOOD, youtubeId: null, cues: [] } })]);
  assert.equal(autoSummary(plan).needVideo, 0, "it would be offered as a one-paste fix and would not publish");
  assert.equal(autoSummary(plan).hold, 1);
});

test("an empty queue summarises to nothing rather than throwing", () => {
  assert.deepEqual(autoSummary(autoPlan([])), { draft: 0, publish: 0, hold: 0, needVideo: 0 });
});

// --- the screen has to actually run it ---------------------------------------

test("the review panel drives itself from this plan", () => {
  // The queue half only. The Editor below it is the manual path and is
  // supposed to call publishBlockers directly — it renders the reasons.
  const queue = code("components/admin/ExerciseReview.tsx").split("function Editor")[0];

  assert.match(queue, /autoPlan\(/, "the queue still waits to be clicked at");
  assert.match(queue, /autoSummary\(/, "nothing tells the admin what the pass did or left");
  for (const action of ["draft", "publish"]) {
    assert.ok(
      new RegExp(`"${action}"`).test(queue),
      `the queue never acts on the plan's ${action} decision`,
    );
  }
  // CALLED, not merely defined. Deleting `await publishAll(...)` leaves the
  // function on the page and `publishRow(` inside it, so a guard looking for
  // either of those names passes on a queue that decides and never acts.
  assert.match(queue, /await publishAll\(/, "the queue decides what to publish and never writes it");
  assert.match(queue, /await draftPicked\(/, "the queue decides what to draft and never drafts it");
  assert.match(queue, /publishRow\(/, "nothing writes the publish columns");

  /**
   * The switch the whole feature hangs off, pinned because nothing else can
   * see it: a guard of `if (true) return;` leaves every name in this file
   * present and the queue completely inert.
   *
   * Three conditions may legitimately stop a pass and no others — the admin
   * turned it off, the queue has not loaded, or a pass is already running.
   */
  assert.match(
    queue,
    /if \(!auto \|\| loading \|\| running\.current\) return;\s*\n\s*void runnerRef\.current\(\);/,
    "the automatic pass is gated on something other than the toggle, the load and the in-flight flag — or never fires at all",
  );
  // The CALL form, not the name. Both are on the import at the top of the
  // file, which sits above `function Editor` and matched the bare name — a
  // guard tripped by an import rather than by the thing it is guarding.
  assert.ok(
    !/canPublish\(|publishBlockers\(/.test(queue),
    "the queue re-decides publishing itself instead of asking exercise-auto, so the two can disagree",
  );
});

/**
 * TERMINATION, WHICH IS NOT OBVIOUS AND IS THE THING THAT COULD COST MONEY.
 *
 * The pass reloads and re-runs. That only ends while every pass strictly
 * reduces the work — and it would not if an update failed silently behind a
 * policy, leaving an unbounded loop of AI calls nobody asked for. So a
 * row-and-action that has been attempted is never attempted again, and
 * termination does not depend on the server behaving.
 */
test("the automatic pass cannot loop forever on a row that will not budge", () => {
  const queue = code("components/admin/ExerciseReview.tsx").split("function Editor")[0];
  assert.match(queue, /attempted/, "nothing remembers what this visit has already tried");
  assert.match(
    queue,
    /attempted\.current\.has\(/,
    "the pass never checks whether it has already tried a row, so a stuck row is retried forever",
  );
  /**
   * BOTH actions, each under its own key. One `add` call satisfies a guard
   * looking for the bare name while the other branch retries forever — which
   * is exactly what a mutation dropping the draft branch did.
   */
  for (const action of ["draft", "publish"]) {
    assert.ok(
      queue.includes(`:${action}\`)`),
      `the pass never records its ${action} attempts, so that branch retries forever`,
    );
  }
});
