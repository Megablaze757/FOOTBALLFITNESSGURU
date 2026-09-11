import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HOOK_MAX_WORDS, MAX_ONE_ROUTE_SHARE, MAX_REEL_MS, MAX_SILENT_MS, MIN_CAPTION_MS,
  hookProblems, retentionProblems, silentGaps,
} from "./reel-retention";
import { reelPlan, type PlannableScript } from "./reel-plan";
import { SCRIPTS, reelScript, scriptProblems } from "./reel-script";
import { readFileSync } from "node:fs";
import { APP_NAME } from "./signup-link";

const plan = (beats: PlannableScript["beats"], hook = "Is your bench press any good?") =>
  reelPlan({ id: "t", hook, beats, totalMs: beats.reduce((n, b) => n + b.ms, 0) });

const beat = (over: Partial<PlannableScript["beats"][0]> = {}) => ({
  at: 0, ms: 3_000, route: "/a", action: "do a thing", say: "One two three four five six", ...over,
});

/** Consecutive beats, timed the way build() times them. */
const run = (beats: Partial<PlannableScript["beats"][0]>[]) => {
  let at = 0;
  return beats.map((b) => { const made = beat({ ...b, at }); at += made.ms; return made; });
};

// --- the hook ----------------------------------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 71% of viewers decide inside three seconds, and 50-60% of ALL drop-off on
 * Shorts happens there. Past it, 65% reach ten seconds. The hook is not the
 * most important part of the reel; it is the part that decides whether there
 * is a reel.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a hook that does its job passes", () => {
  for (const hook of [
    "Is your bench press any good?",
    "30g of protein: £0.31 from red lentils.",
    "Your app does not know you slept badly.",
    "You are doing wall passing reps wrong.",
  ]) {
    assert.deepEqual(hookProblems(hook), [], hook);
  }
});

test("a hook with nothing in it is refused", () => {
  for (const hook of ["", "   ", null as unknown as string, undefined as unknown as string]) {
    assert.ok(hookProblems(hook).length > 0, JSON.stringify(hook));
  }
});

/** It has to be READ, at speed, by somebody who has not decided to look yet. */
test("a hook too long to read in the deciding second is refused", () => {
  const long = Array.from({ length: HOOK_MAX_WORDS + 3 }, (_, i) => `word${i}`).join(" ") + " you?";
  assert.ok(hookProblems(long).some((p) => /ceiling/.test(p)), hookProblems(long).join("; "));
});

test("a hook that opens on a greeting is refused", () => {
  for (const hook of [
    "Hi guys, is your bench any good?",
    "So you want a better bench press?",
    "Welcome to your new training app, you.",
    "In this video you will see the app.",
    "Let's talk about your bench press today.",
  ]) {
    assert.ok(
      hookProblems(hook).some((p) => /greeting/.test(p)),
      `"${hook}" — ${hookProblems(hook).join("; ") || "(nothing)"}`,
    );
  }
});

/** A label is not a hook. A number, a question, or the viewer — one of three. */
test("a hook that only names the subject is refused", () => {
  for (const hook of ["A training app for footballers.", "Bench press standards explained."]) {
    assert.ok(hookProblems(hook).some((p) => /labels the video/.test(p)), hook);
  }
  for (const ok of ["Bench press standards, in 3 numbers.", "Bench press standards — where are you?"]) {
    assert.deepEqual(hookProblems(ok), [], ok);
  }
});

// --- the reel ----------------------------------------------------------------

test("a reel past the length where completion falls away is refused", () => {
  const beats = run(Array.from({ length: 12 }, () => ({ ms: 3_000, route: `/r${Math.random()}` })));
  const problems = retentionProblems(plan(beats));
  assert.ok(problems.some((p) => /completion falls away/.test(p.problem)),
    `${MAX_REEL_MS}ms limit not enforced: ${problems.map((p) => p.problem).join("; ")}`);
});

test("a reel too short to show anything is refused", () => {
  assert.ok(retentionProblems(plan(run([{ ms: 2_000 }]))).some((p) => /not long enough/.test(p.problem)));
});

test("a caption too brief to read is refused", () => {
  // Twelve words in one short beat: three groups, each well under the floor.
  const beats = run([{ ms: 900, say: "one two three four five six seven eight nine ten eleven twelve" }, { ms: 8_000, route: "/b" }]);
  const problems = retentionProblems(plan(beats));
  assert.ok(problems.some((p) => /too brief to read/.test(p.problem)),
    `${MIN_CAPTION_MS}ms floor not enforced: ${problems.map((p) => p.problem).join("; ")}`);
});

test("a single beat that just sits there is refused", () => {
  const problems = retentionProblems(plan(run([{ ms: 7_000 }, { ms: 3_000, route: "/b" }])));
  assert.ok(problems.some((p) => /one screen doing one thing/.test(p.problem)),
    problems.map((p) => p.problem).join("; "));
});

/**
 * The rule the first version got wrong. It accumulated consecutive beats on
 * one route and called it "nothing changing" — but opening a form and then
 * filling it in are two pieces of footage that share a URL, and it flagged the
 * one script whose whole point is a number moving. This is what it was
 * reaching for: a reel that never leaves one screen.
 */
test("a reel that never leaves one screen is refused, but a revisited screen is not", () => {
  const stuck = run([{ ms: 3_000 }, { ms: 3_000 }, { ms: 3_000 }, { ms: 2_000, route: "/b" }]);
  assert.ok(retentionProblems(plan(stuck)).some((p) => /there is nothing to watch/.test(p.problem)));

  const moves = run([{ ms: 3_000, route: "/a" }, { ms: 3_000, route: "/b" }, { ms: 3_000, route: "/c" }]);
  assert.deepEqual(
    retentionProblems(plan(moves)).filter((p) => /nothing to watch/.test(p.problem)), [],
    `a reel across three screens was called static (share limit ${MAX_ONE_ROUTE_SHARE})`,
  );
});

// --- the silent audience -----------------------------------------------------

/**
 * 85% of Facebook video and 75% of mobile video is watched with the sound off.
 * An uncaptioned stretch is a stretch where most of the audience is watching a
 * silent screen recording with no idea what it is showing them.
 */
test("a long stretch with nothing to read is refused, wherever it falls", () => {
  const silent = { say: "" };
  for (const beats of [
    run([{ ms: 4_000, ...silent }, { ms: 4_000, route: "/b" }]),                 // at the start
    run([{ ms: 3_000 }, { ms: 4_000, route: "/b", ...silent }, { ms: 3_000, route: "/c" }]), // in the middle
    run([{ ms: 4_000 }, { ms: 4_000, route: "/b", ...silent }]),                 // at the end
  ]) {
    assert.ok(
      retentionProblems(plan(beats)).some((p) => /sound off/.test(p.problem)),
      `${MAX_SILENT_MS}ms limit not enforced`,
    );
  }
});

test("a short silent moment is not a problem", () => {
  const beats = run([{ ms: 3_000 }, { ms: 1_500, route: "/b", say: "" }, { ms: 3_000, route: "/c" }]);
  assert.deepEqual(silentGaps(plan(beats)), []);
});

// --- what actually ships -----------------------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ONE THAT MATTERS. Every script in the app is checked against every rule
 * above, so a reel cannot be shipped that the research says nobody will watch.
 *
 * It found two real faults when it was written: a hook that labelled the video
 * instead of starting it, and a drill reel spending 88% of its runtime on one
 * page because no per-drill page exists. Both are fixed in lib/reel-script.ts.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("every script the app ships would actually be watched", () => {
  assert.ok(SCRIPTS.length >= 4, "the script list has shrunk — is this still checking anything?");
  for (const { id, label } of SCRIPTS) {
    const script = reelScript(id, "Five-spot shooting");
    assert.ok(script, `${id} builds nothing`);
    assert.deepEqual(scriptProblems(script), [], `${label}: ${scriptProblems(script).map((p) => p.problem).join("; ")}`);
    const problems = retentionProblems(reelPlan(script));
    assert.deepEqual(
      problems.map((p) => `${p.beat < 0 ? "reel" : `beat ${p.beat + 1}`}: ${p.problem}`), [],
      `${label} would not be watched`,
    );
  }
});

/**
 * The automated pipeline has nobody watching. A reel the research says will
 * not be watched should not consume a CI run, a publish slot and a place in
 * somebody's feed — so the recorder refuses it before it films anything.
 */
test("the recorder refuses a reel that would not be watched", () => {
  const src = readFileSync("scripts/record-reel.mts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.match(src, /retentionProblems\(plan\)/, "the recorder never checks the reel it is about to make");
  assert.match(src, /process\.exit\(1\)/, "it reports problems and films the reel anyway");
  // Before the browser is launched: a refused reel should cost nothing.
  assert.ok(
    src.indexOf("retentionProblems(plan)") < src.indexOf("chromium.launch"),
    "it launches a browser before deciding whether the reel is worth making",
  );
});

/**
 * The overlay has to stay OUT of the TypeScript. tsx transpiles this project's
 * .mts files and esbuild wraps named functions in a `__name(...)` helper that
 * exists in the module scope and not in the page — so an inline overlay throws
 * "__name is not defined" before its first line runs, and the video comes out
 * looking fine with no captions on it at all.
 */
test("the browser-side overlay is a plain file, never transpiled", () => {
  const src = readFileSync("scripts/record-reel.mts", "utf8");
  assert.match(src, /addInitScript\(\{ path:/, "the overlay is inlined and will be transpiled");
  const overlay = readFileSync("scripts/reel-overlay.js", "utf8");
  assert.match(overlay, /window\.__reelCaption/, "nothing sets captions");
  assert.match(overlay, /window\.__reelHook/, "nothing shows the hook");
  // Captions must clear the platforms' own UI, which covers the lower fifth.
  assert.match(overlay, /padding:0 28px 22%/, "the caption sits where TikTok and Instagram draw their own");
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PRONOUN NEEDS AN ANTECEDENT.
 *
 * "Script is incoherent." Read aloud as one block the fault was every
 * demonstrative: "THIS ONE asks first" — this one WHAT? — then "THAT's today's
 * body talking" over a number the voice never names. The product was named
 * once, in the last two seconds, so nothing before it had anything to refer
 * to.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a reel says what it is about before the sign-off", () => {
  for (const meta of SCRIPTS) {
    const script = reelScript(meta.id, "");
    const plan = reelPlan(script!);
    const said = plan.steps.slice(0, -1).flatMap((s) => s.captions.map((c) => c.text)).join(" ");
    assert.ok(said.includes(APP_NAME), `${meta.id} never says ${APP_NAME} until the last beat`);
    assert.equal(retentionProblems(plan).length, 0, `${meta.id}: ${JSON.stringify(retentionProblems(plan))}`);
  }
});

/**
 * NOT IN THE SIGN-OFF. Every reel ends by naming the app, so a check that
 * counted the last beat would pass on every script including the incoherent
 * ones it exists for — which is a guard that cannot fail.
 */
test("naming the app only in the sign-off is refused", () => {
  const script = reelScript("demo-readiness", "")!;
  const stripped = {
    ...script,
    beats: script.beats.map((b, i) => (i === script.beats.length - 1
      ? b
      : { ...b, say: b.say.replaceAll(APP_NAME, "this one") })),
  };
  const problems = retentionProblems(reelPlan(stripped)).map((p) => p.problem).join(" | ");
  assert.match(problems, /refers to nothing/, `the incoherent version passed: ${problems}`);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A NARRATED REEL IS A DIFFERENT THING TO READ.
 *
 * captionReadMs is a COLD-READING rate, and it is right for a silent reel —
 * there is no voice and the caption is the whole content. On a narrated one it
 * is measuring something that is not happening: the words are drawn one at a
 * time with the spoken word lit, so a muted viewer follows a sweep whose pace
 * IS the speaking pace rather than reading a static block.
 *
 * The measurement that forced the distinction: this voice says "Every other
 * training app hands you the session it planned on Sunday" in 3.92 seconds and
 * reading its captions cold takes 5.07. No timing satisfies both — a caption
 * cannot start when the words are spoken AND outlast the speaking.
 *
 * What survives is MIN_CAPTION_MS, which is not a reading rate at all: it is
 * the time an eye needs to find new text on screen, and that does not care
 * whether anybody is talking.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const sayingPlan = (ms: number, clips?: { atMs: number; ms: number }[]): PlannableScript => ({
  id: "t", hook: "Your app doesn't care.", totalMs: 6_000,
  beats: [{ at: 0, ms: 6_000, route: "/", action: "a", say: "Every other training app hands you the session it planned on Sunday.", clips }],
});

test("a narrated caption is held to the eye, not to a cold-reading rate", () => {
  /** One sentence, spoken in less time than reading it cold would take. */
  const narrated = reelPlan(sayingPlan(6_000, [{ atMs: 140, ms: 3_920 }]));
  const problems = retentionProblems(narrated).map((p) => p.problem).join(" | ");
  assert.doesNotMatch(problems, /too brief to read/,
    "the cold-reading rate is still being applied to a reel that has a voice");
});

test("a silent reel keeps the full reading rate", () => {
  const silent = reelPlan(sayingPlan(2_000));
  const short = { ...silent, steps: silent.steps.map((s) => ({ ...s, captions: s.captions.map((c) => ({ ...c, ms: 400 })) })) };
  assert.match(retentionProblems(short).map((p) => p.problem).join(" | "), /too brief to read/,
    "a silent reel with 400ms captions is not being checked against the reading rate");
});

test("a flash is a flash even with a voice over it", () => {
  const narrated = reelPlan(sayingPlan(6_000, [{ atMs: 140, ms: 3_920 }]));
  const flashed = { ...narrated, steps: narrated.steps.map((s) => ({ ...s, captions: s.captions.map((c) => ({ ...c, ms: 300 })) })) };
  assert.match(retentionProblems(flashed).map((p) => p.problem).join(" | "), /the eye does not land on it/,
    "a 300ms caption passes because something is being said over it");
});
