import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HOOK_MAX_WORDS, MAX_ONE_ROUTE_SHARE, MAX_REEL_MS, MAX_SILENT_MS, MIN_CAPTION_MS,
  hookProblems, retentionProblems, silentGaps, stillWatching,
  MAX_OPENING_SILENCE_MS, MAX_CAPTION_LATE_MS,
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
  /**
   * Matched on the CAPTION being named rather than on the old wording.
   * "6s on one screen doing one thing" was true and told you nothing else —
   * it cost a recording run and a round of guesswork to find which of a
   * beat's captions was the six seconds, so the message quotes it now.
   */
  assert.ok(problems.some((p) => /holds the screen for/.test(p.problem)),
    problems.map((p) => p.problem).join("; "));
  assert.ok(problems.some((p) => /"One two three four five six"/.test(p.problem)),
    "the message no longer says which caption is holding it");
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
  /**
   * WHERE the caption sits is deliberately not checked here. This line used to
   * pin the literal string `padding:0 28px 22%` as if that proved the caption
   * cleared the platforms' own UI. It proved nothing: percentage padding
   * resolves against the containing block's WIDTH, so that exact value put the
   * caption 243px off the bottom of a frame whose lower 400px Reels draws over
   * — a guard spelling out the broken value passes only while the bug is
   * there, and fails the moment somebody fixes it. The real check is in
   * lib/safe-zone.test.ts, in named pixels against every edge.
   */
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

// ═══════════════════════════════════════════════════════════════════════════
// THE SILENCE AT THE FRONT, WHICH NOTHING USED TO MEASURE.
// ═══════════════════════════════════════════════════════════════════════════

const openingFault = (clips?: { atMs: number; ms: number }[]) =>
  retentionProblems(reelPlan(sayingPlan(6_000, clips))).map((p) => p.problem).join(" | ");

/** 140ms is LEAD_MS: the room the design puts in front of the voice on purpose. */
test("the room a line is designed to start on is not a fault", () => {
  assert.doesNotMatch(openingFault([{ atMs: 140, ms: 3_920 }]), /first word is not heard/);
});

/**
 * 300ms is what three finished reels actually opened on, before lib/wav.ts
 * started trimming the model's own silence off the front of a clip. The rule
 * exists so that coming back is a failed check rather than a quiet regression.
 */
test("a reel that opens on a third of a second of nothing is refused", () => {
  const problems = openingFault([{ atMs: 460, ms: 3_920 }]);
  assert.match(problems, /first word is not heard until 460ms/);
  assert.match(problems, /half the audience is gone by 1000ms/);
});

/** Exactly at the ceiling passes: a limit that refuses its own value is a typo. */
test("the ceiling itself is allowed", () => {
  assert.doesNotMatch(openingFault([{ atMs: MAX_OPENING_SILENCE_MS, ms: 3_920 }]), /first word is not heard/);
});

/** No voice, no clip, nothing to be late — and no complaint about it either. */
test("a silent reel is not accused of opening on silence", () => {
  assert.doesNotMatch(openingFault(), /first word is not heard/);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ALLOWANCE HAS TO SIT BETWEEN THE TWO NUMBERS IT WAS PICKED FROM.
 *
 * MAX_CAPTION_LATE_MS is enforced by the recorder against a stopwatch, so no
 * test here can exercise it. What a test CAN hold is the reasoning it was
 * chosen by, which is the part that rots: it has to be short enough that a
 * caption arriving "on time" still gets most of its MIN_CAPTION_MS on screen,
 * and long enough that the browser overhead it is not meant to catch stays
 * under it. The two real failures it exists for were 1600ms and about 1500ms.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("a caption allowed to be late still gets most of its time on screen", () => {
  assert.ok(MAX_CAPTION_LATE_MS < MIN_CAPTION_MS / 2,
    `${MAX_CAPTION_LATE_MS}ms of a ${MIN_CAPTION_MS}ms floor is most of the caption`);
});

test("the two failures it was written for are both well over it", () => {
  for (const failure of [1_600, 1_500]) {
    assert.ok(failure > MAX_CAPTION_LATE_MS * 2,
      `${failure}ms would not be caught with room to spare by a ${MAX_CAPTION_LATE_MS}ms allowance`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// THE CURVE THIS ACCOUNT ACTUALLY MEASURED, AS ARITHMETIC.
// ═══════════════════════════════════════════════════════════════════════════

test("the curve returns what was digitised from the insights", () => {
  assert.equal(stillWatching(0), 1);
  for (const [ms, want] of [[500, 0.85], [1_000, 0.5], [2_000, 0.213], [3_000, 0.108]] as const) {
    assert.ok(Math.abs(stillWatching(ms) - want) < 1e-9, `${ms}ms gave ${stillWatching(ms)}`);
  }
});

test("it interpolates between the points rather than stepping", () => {
  const half = stillWatching(750);
  assert.ok(half < 0.85 && half > 0.5, `750ms gave ${half}, which is not between the neighbours`);
});

test("it never climbs, and never leaves the range a fraction lives in", () => {
  let previous = 1.0001;
  for (let ms = 0; ms <= 40_000; ms += 100) {
    const at = stillWatching(ms);
    assert.ok(at <= previous + 1e-9, `the audience grew at ${ms}ms`);
    assert.ok(at >= 0 && at <= 1, `${ms}ms gave ${at}`);
    previous = at;
  }
});

test("past the end of the curve it holds rather than going negative", () => {
  assert.equal(stillWatching(60_000), 0.024);
  assert.equal(stillWatching(-5_000), 1);
});

/**
 * The finding this exists to produce: on this curve there is no good late
 * moment. A reveal at four seconds and a reveal at twelve are seen by almost
 * the same tenth of the audience, so moving one earlier buys very little — and
 * the thing that buys something is the reel being about its point from the
 * first frame.
 */
test("a reveal at four seconds and one at twelve reach a similar tenth", () => {
  const early = stillWatching(4_000);
  const late = stillWatching(12_000);
  assert.ok(early < 0.12, `4s still has ${early}, which is not the measured curve`);
  assert.ok(late > 0.05, `12s has ${late}`);
  assert.ok(early - late < 0.05, "the gap between four seconds and twelve is bigger than the measurement says");
});

test("the first two seconds are where the audience actually goes", () => {
  assert.ok(stillWatching(0) - stillWatching(2_000) > 0.75,
    "the curve no longer loses three quarters of the audience in two seconds");
});
