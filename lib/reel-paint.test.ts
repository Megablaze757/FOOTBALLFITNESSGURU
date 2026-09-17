import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_PAINTED_CHARS, NOTHING_SEEN, PAINT_TIMEOUT_MS, SKELETON_GRACE_MS, SKELETON_MIN_PX,
  blindBeat, blindBeats, observerSource, paintReport, paintStep,
  type Paint, type PaintMemory, type PaintObservation,
} from "./reel-paint";
import { DATA_ROUTE_PAINT_MS } from "./reel-script";
import type { PlanStep, ReelPlan } from "./reel-plan";

const seen = (over: Partial<PaintObservation> = {}): PaintObservation => ({
  skeletons: 0, textLength: 500, sinceMs: 2_000, ...over,
});

/** Drive the reducer over a sequence of frames, the way the observer does. */
function run(frames: readonly PaintObservation[]): { verdict: string; at: number | null; memory: PaintMemory } {
  let memory = NOTHING_SEEN;
  for (const frame of frames) {
    const result = paintStep(memory, frame);
    memory = result.memory;
    if (result.verdict !== "wait") return { verdict: result.verdict, at: result.at, memory };
  }
  return { verdict: "wait", at: null, memory };
}

// ═══════════════════════════════════════════════════════════════════════════
// THE DECISION, AND THE FOUR WAYS IT COULD FLATTER ITSELF.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The document exists before React mounts, and at that instant there are no
 * skeletons — because there is nothing at all. The most flattering possible
 * answer is "painted in under a frame", which is why it is tested first.
 */
test("an empty document has not painted, however few skeletons it has", () => {
  assert.equal(paintStep(NOTHING_SEEN, seen({ textLength: 0, sinceMs: 10 })).verdict, "wait");
  assert.equal(paintStep(NOTHING_SEEN, seen({ textLength: MIN_PAINTED_CHARS - 1, sinceMs: 10 })).verdict, "wait");
});

test("a skeleton on screen is the definition of not painted", () => {
  const up = paintStep(NOTHING_SEEN, seen({ skeletons: 1 }));
  assert.equal(up.verdict, "wait");
  assert.equal(up.memory.sawSkeleton, true, "the skeleton was not remembered, so its clearing means nothing");
  assert.equal(paintStep(NOTHING_SEEN, seen({ skeletons: 12 })).verdict, "wait");
});

/**
 * A skeleton that appears and clears is unambiguous: the loading screen ended
 * when it left the screen. No grace is needed to tell that apart from anything.
 */
test("a skeleton clearing paints at once, with no grace period", () => {
  const out = run([
    seen({ skeletons: 4, textLength: 10, sinceMs: 50 }),
    seen({ skeletons: 4, textLength: 10, sinceMs: 300 }),
    seen({ skeletons: 0, textLength: 900, sinceMs: 620 }),
  ]);
  assert.equal(out.verdict, "painted");
  assert.equal(out.at, 620, "a data route was made to wait out the grace period as well");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE BUG THE LIVE RUN FOUND, WHICH IS WHY THIS IS A REDUCER.
 *
 * The first version was a predicate and the caller supplied the timestamp,
 * which meant the only timestamp it had: now. Against real pages that reported
 * /home at 1001ms, /nutrition at 1016ms and /pricing at 1002ms — three
 * different pages, one number, and that number is SKELETON_GRACE_MS. Each had
 * finished long before and was credited with the moment the waiting ended.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a static route paints when it was ready, not when the grace ran out", () => {
  const out = run([
    seen({ textLength: 0, sinceMs: 20 }),
    seen({ textLength: 4_000, sinceMs: 80 }),
    seen({ textLength: 4_000, sinceMs: 600 }),
    seen({ textLength: 4_000, sinceMs: 80 + SKELETON_GRACE_MS }),
  ]);
  assert.equal(out.verdict, "painted");
  assert.equal(out.at, 80,
    `a page ready at 80ms was reported as painting at ${out.at} — the grace period, not the paint`);
});

test("it does not call a static route painted before the grace has run", () => {
  const out = run([
    seen({ textLength: 4_000, sinceMs: 80 }),
    seen({ textLength: 4_000, sinceMs: 80 + SKELETON_GRACE_MS - 1 }),
  ]);
  assert.equal(out.verdict, "wait", "it decided there was no skeleton before it had waited to find out");
});

/**
 * A route that renders its shell before its skeleton. Under a grace counted
 * from the navigation this was called painted a hundred milliseconds BEFORE
 * its loading screen appeared — a case the predicate shape could not express.
 */
test("a shell that renders before the skeleton does is not the screen being ready", () => {
  const out = run([
    seen({ textLength: 300, sinceMs: 900 }),
    seen({ skeletons: 6, textLength: 300, sinceMs: 1_100 }),
    seen({ skeletons: 6, textLength: 300, sinceMs: 1_900 }),
    seen({ skeletons: 0, textLength: 3_000, sinceMs: 2_400 }),
  ]);
  assert.equal(out.verdict, "painted");
  assert.equal(out.at, 2_400, "the shell at 900ms was reported as the screen being ready");
});

test("a skeleton that never clears gives up rather than reporting a number", () => {
  const out = run([
    seen({ skeletons: 3, textLength: 200, sinceMs: 500 }),
    seen({ skeletons: 3, textLength: 200, sinceMs: PAINT_TIMEOUT_MS }),
  ]);
  assert.equal(out.verdict, "gave-up");
  assert.equal(out.at, null, "giving up produced a timestamp anyway");
});

test("a page that never renders anything gives up too", () => {
  const out = run([seen({ textLength: 0, sinceMs: PAINT_TIMEOUT_MS + 1 })]);
  assert.equal(out.verdict, "gave-up");
});

test("the size threshold sits between a status dot and the smallest skeleton", () => {
  // Not a judgement about what counts as big — a gap in a bimodal
  // distribution. The dots are 6px; the smallest skeleton bar is 12px tall.
  assert.ok(SKELETON_MIN_PX > 6, "a 6px status dot would be counted as a skeleton");
  assert.ok(SKELETON_MIN_PX <= 48, "a real skeleton block would be dismissed as a dot");
});

// ═══════════════════════════════════════════════════════════════════════════
// WHAT A PAINT COSTS A BEAT. THE SILENCE AT THE START ABSORBS MOST OF IT.
// ═══════════════════════════════════════════════════════════════════════════

const step = (over: Partial<PlanStep> = {}): PlanStep => ({
  index: 1, at: 0, ms: 5_000, route: "/home", action: "look at it", captions: [],
  clips: [{ atMs: 400, ms: 1_200 }, { atMs: 1_800, ms: 1_000 }],
  ...over,
});

test("a paint inside the opening silence costs the narration nothing", () => {
  const beat = blindBeat(step(), 300);
  assert.equal(beat.spokenBlindMs, 0, "a paint that finished before the first word was charged to it");
  assert.equal(beat.blackMs, 300, "the viewer still looked at a loading screen for 300ms");
});

test("a paint that runs into the first line is charged only the overlap", () => {
  // First clip runs 400-1600. A paint at 1000 covers 600ms of it.
  const beat = blindBeat(step(), 1_000);
  assert.equal(beat.spokenBlindMs, 600);
});

test("a paint past every line is charged all of the narration", () => {
  const beat = blindBeat(step(), 5_000);
  assert.equal(beat.spokenBlindMs, beat.spokenMs);
  assert.equal(beat.spokenMs, 2_200);
});

/** The gap between two clips is silence, and silence is not spoken over. */
test("the gap between two lines is not counted as narration", () => {
  // Clips at 400-1600 and 1800-2800. A paint at 1700 covers the first
  // entirely and none of the second — 1200, not 1300.
  assert.equal(blindBeat(step(), 1_700).spokenBlindMs, 1_200);
});

test("a beat with no narration reports its black frames and no speech", () => {
  const silent = blindBeat(step({ clips: [] }), 2_000);
  assert.equal(silent.spokenBlindMs, 0);
  assert.equal(silent.spokenMs, 0);
  assert.equal(silent.blackMs, 2_000);
});

/** A paint longer than the beat cannot black out more of it than it has. */
test("the black frames are capped by the length of the beat", () => {
  assert.equal(blindBeat(step({ ms: 1_500 }), 9_000).blackMs, 1_500);
});

test("a negative paint is read as zero rather than as credit", () => {
  assert.equal(blindBeat(step(), -500).blackMs, 0);
  assert.equal(blindBeat(step(), -500).spokenBlindMs, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ONLY THE BEATS THAT ACTUALLY NAVIGATE.
// ═══════════════════════════════════════════════════════════════════════════

const plan = (steps: PlanStep[]): ReelPlan => ({
  id: "t", hook: "h", hookMs: 1_000, width: 540, height: 960, scale: 2,
  steps, totalMs: steps.reduce((t, s) => t + s.ms, 0),
});

/**
 * The recorder navigates only when the route changes — three beats on one
 * screen navigate once. A beat that inherited a painted screen has no paint to
 * wait for, and counting it would multiply one cost by however many beats
 * happened to sit on that page.
 */
test("a beat that stays on the same screen is not charged for the paint again", () => {
  const p = plan([
    step({ index: 0, route: "/home" }),
    step({ index: 1, route: "/home" }),
    step({ index: 2, route: "/coach" }),
  ]);
  const paints: Paint[] = [
    { route: "/home", ms: 1_000, hadSkeleton: true },
    { route: "/coach", ms: 900, hadSkeleton: true },
  ];
  const found = blindBeats(p, paints);
  assert.deepEqual(found.map((b) => b.index), [0, 2], "a beat that did not navigate was charged for a paint");
});

/** A route visited twice is cold then warm, and the two are different numbers. */
test("the second visit to a route uses the second measurement", () => {
  const p = plan([
    step({ index: 0, route: "/home" }),
    step({ index: 1, route: "/coach" }),
    step({ index: 2, route: "/home" }),
  ]);
  const paints: Paint[] = [
    { route: "/home", ms: 2_000, hadSkeleton: true },
    { route: "/coach", ms: 500, hadSkeleton: true },
    { route: "/home", ms: 120, hadSkeleton: true },
  ];
  const found = blindBeats(p, paints);
  assert.equal(found.find((b) => b.index === 2)?.blackMs, 120,
    "the warm revisit was charged the cold paint");
});

test("a route that never painted is left out rather than counted as instant", () => {
  const p = plan([step({ index: 0, route: "/home" })]);
  assert.deepEqual(blindBeats(p, [{ route: "/home", ms: null, hadSkeleton: true }]), []);
});

test("a measurement with no matching beat is ignored", () => {
  const p = plan([step({ index: 0, route: "/home" })]);
  const found = blindBeats(p, [{ route: "/nowhere", ms: 500, hadSkeleton: true }]);
  assert.deepEqual(found, []);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE REPORT. IT IS THE WHOLE POINT, SO IT HAS TO SAY SOMETHING.
// ═══════════════════════════════════════════════════════════════════════════

test("it says which way the project's own constant is wrong", () => {
  const p = plan([step({ index: 0, route: "/home" })]);
  const over = paintReport(p, [{ route: "/home", ms: DATA_ROUTE_PAINT_MS + 500, hadSkeleton: true }]);
  assert.ok(over.some((l) => /above DATA_ROUTE_PAINT_MS/.test(l)), over.join("\n"));

  const under = paintReport(p, [{ route: "/home", ms: DATA_ROUTE_PAINT_MS - 500, hadSkeleton: true }]);
  assert.ok(under.some((l) => /inside DATA_ROUTE_PAINT_MS/.test(l)), under.join("\n"));
});

/**
 * A static route paints immediately and is not evidence about data routes.
 * Averaging it in is how a real problem gets reported as half a problem.
 */
test("static routes are not averaged into the data-route figure", () => {
  const p = plan([step({ index: 0, route: "/" }), step({ index: 1, route: "/home" })]);
  const lines = paintReport(p, [
    { route: "/", ms: 50, hadSkeleton: false },
    { route: "/home", ms: 2_000, hadSkeleton: true },
  ]);
  const summary = lines.find((l) => /^Data routes:/.test(l))!;
  assert.match(summary, /Data routes: 1/);
  assert.match(summary, /mean 2\.00s/, "the static route was averaged in");
});

test("a reel whose paints all land in the silence says so plainly", () => {
  const p = plan([step({ index: 0, route: "/home" })]);
  const lines = paintReport(p, [{ route: "/home", ms: 100, hadSkeleton: true }]);
  assert.ok(lines.some((l) => /covered by the silence between beats/.test(l)), lines.join("\n"));
});

test("nothing measured is said in words rather than as an empty table", () => {
  const p = plan([step({ index: 0, route: "/home" })]);
  const lines = paintReport(p, [{ route: "/home", ms: null, hadSkeleton: true }]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /nothing to report/);
});

test("a route that never painted is named as such, not silently dropped", () => {
  const p = plan([step({ index: 0, route: "/home" }), step({ index: 1, route: "/coach" })]);
  const lines = paintReport(p, [
    { route: "/home", ms: 800, hadSkeleton: true },
    { route: "/coach", ms: null, hadSkeleton: true },
  ]);
  assert.ok(lines.some((l) => /\/coach.*never painted/.test(l)), lines.join("\n"));
});

test("the share of a beat's narration spoken blind is reported, not just the ms", () => {
  const p = plan([step({ index: 0, route: "/home" })]);
  const lines = paintReport(p, [{ route: "/home", ms: 5_000, hadSkeleton: true }]);
  // Every clip is covered, so it is all of the narration.
  assert.ok(lines.some((l) => /100% of its narration/.test(l)), lines.join("\n"));
});

// ═══════════════════════════════════════════════════════════════════════════
// AND THE CONSTANT THIS WAS BUILT TO FINALLY READ.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * DATA_ROUTE_PAINT_MS was declared, documented as a standard, referenced by
 * nothing, and is the reason the blank frame shipped. The point of this module
 * is that the number now has something that reads it and can disagree with it.
 */
test("the report is the first thing in the project to read DATA_ROUTE_PAINT_MS", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("lib/reel-paint.ts", "utf8");
  assert.match(src, /import \{ DATA_ROUTE_PAINT_MS \}/,
    "the report no longer compares against the project's own belief");
  assert.ok(DATA_ROUTE_PAINT_MS > 0, "the constant it is compared against is gone");
});

// ═══════════════════════════════════════════════════════════════════════════
// THE COPY THAT RUNS IN THE BROWSER IS THE SAME FUNCTION, AND THIS PROVES IT.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The verdict cannot be imported into the page, so it is serialised into the
 * init script. That is one implementation and a photocopy rather than two
 * implementations — but only while the photocopy is faithful, and a bundler
 * that wrapped the function on its way out would break it silently.
 *
 * scripts/record-reel.mts carries a comment about exactly that happening: an
 * init script transpiled on its way in died with "__name is not defined"
 * before its first line ran, and surfaced one step later as an unrelated
 * "window.__reelHook is not a function". So the photocopy is exercised here
 * rather than trusted.
 */
const inlined = (() => {
  const src = observerSource();
  const start = src.indexOf("var step = ") + "var step = ".length;
  const end = src.indexOf("\n\n  var out =");
  const body = src.slice(start, end).replace(/;\s*$/, "");
  const consts = ["PAINT_TIMEOUT_MS", "MIN_PAINTED_CHARS", "SKELETON_GRACE_MS", "SKELETON_MIN_PX"]
    .map((name) => {
      const m = new RegExp(`var ${name} = (\\d+);`).exec(src);
      assert.ok(m, `${name} is not inlined into the observer, so the page would throw on it`);
      return `var ${name} = ${m![1]};`;
    }).join("\n");
  // eslint-disable-next-line no-new-func
  return new Function(`${consts}\nreturn (${body});`)() as typeof paintStep;
})();

test("the serialised reducer is a faithful copy of the real one", () => {
  let compared = 0;
  for (const textLength of [0, MIN_PAINTED_CHARS - 1, MIN_PAINTED_CHARS, 5_000]) {
    for (const skeletons of [0, 1, 9]) {
      for (const sawSkeleton of [true, false]) {
        for (const readyAt of [null, 0, 80, 900]) {
          for (const sinceMs of [0, 80, SKELETON_GRACE_MS, PAINT_TIMEOUT_MS - 1, PAINT_TIMEOUT_MS]) {
            const memory: PaintMemory = { sawSkeleton, readyAt };
            const now: PaintObservation = { textLength, skeletons, sinceMs };
            assert.deepEqual(inlined(memory, now), paintStep(memory, now),
              `the copy in the browser disagrees on ${JSON.stringify({ memory, now })}`);
            compared += 1;
          }
        }
      }
    }
  }
  assert.ok(compared >= 400, `only ${compared} states compared — the grid collapsed`);
});

test("the observer starts from the same empty memory this module defines", () => {
  assert.match(observerSource(), new RegExp(`var memory = ${JSON.stringify(NOTHING_SEEN)}`.replace(/[{}[\]().*+?^$|\\]/g, "\\$&")),
    "the observer invents its own starting state instead of using NOTHING_SEEN");
});

test("the constants are inlined as numbers, not left as free variables", () => {
  const src = observerSource();
  for (const name of ["PAINT_TIMEOUT_MS", "MIN_PAINTED_CHARS", "SKELETON_GRACE_MS", "SKELETON_MIN_PX"]) {
    assert.match(src, new RegExp(`var ${name} = \\d+;`),
      `${name} is not a literal in the init script, so the page would throw a ReferenceError`);
  }
  // The whole script has to be parseable, or it fails before its first line —
  // which is the failure mode that reads as something else entirely.
  assert.doesNotThrow(() => new Function(src), "the init script does not parse");
});

test("the observer reports through a name the recorder can read", () => {
  assert.match(observerSource(), /window\.__reelPaint = out/,
    "the recorder reads window.__reelPaint and the observer no longer sets it");
});

/** A helper reference would be a ReferenceError inside the page. */
test("the serialised function carries no transpiler helpers", () => {
  assert.doesNotMatch(paintStep.toString(), /__name|__publicField|_defineProperty/,
    "the bundler wrapped the function, so serialising it no longer works");
});

// ═══════════════════════════════════════════════════════════════════════════
// AND THE GUARD THIS WHOLE MODULE EXISTS BECAUSE OF.
//
// DATA_ROUTE_PAINT_MS was declared, documented as a standard, and referenced
// by nothing — which is how a rule that had never once been applied read, to
// everyone who found it, as a rule the pipeline enforced. A measurement module
// that nothing calls would be the same failure with more lines in it.
// ═══════════════════════════════════════════════════════════════════════════

test("the recorder installs the observer and prints what it measured", async () => {
  const { readFileSync } = await import("node:fs");
  const recorder = readFileSync("scripts/record-reel.mts", "utf8");

  assert.match(recorder, /addInitScript\(\{ content: observerSource\(\) \}\)/,
    "the observer is not installed, so every measurement would be missing");
  /**
   * `{ content }` and not a function. scripts/record-reel.mts already carries
   * the scar: an init script passed as a function was transpiled on its way
   * in, arrived with a `__name` helper, and threw before its first line —
   * surfacing one step later as an unrelated-looking missing-function error.
   */
  assert.doesNotMatch(recorder, /addInitScript\(\(\) => \{[^}]*__reelPaint/s,
    "the observer is being passed as a function, which gets transpiled on the way in");
  assert.match(recorder, /for \(const line of paintReport\(plan, paints\)\) console\.log\(line\)/,
    "the measurement is taken and never printed, which is the same as not taking it");

  /**
   * Read before the navigation, not after. page.goto destroys the document
   * and window.__reelPaint with it, so a collect placed after the goto reads
   * the NEW page's empty stamp and every route measures as null.
   */
  const navigation = recorder.slice(recorder.indexOf("if (step.route !== onRoute) {"));
  const collectAt = navigation.indexOf("await collectPaint(onRoute)");
  const gotoAt = navigation.indexOf("await page.goto(");
  assert.ok(collectAt >= 0 && gotoAt >= 0, "the navigation block no longer looks like this");
  assert.ok(collectAt < gotoAt,
    "the stamp is read after the navigation that destroys it, so every route reads null");
});

test("nothing in the recorder waits on the measurement", async () => {
  const { readFileSync } = await import("node:fs");
  const recorder = readFileSync("scripts/record-reel.mts", "utf8");
  // A waitForFunction on the stamp would make a slow route lengthen the reel —
  // which is how the soft-navigation attempt made the reel worse.
  assert.doesNotMatch(recorder, /waitForFunction[^;]*__reelPaint/s,
    "the recorder waits for the paint, so a slow route now changes the recording");
});
