import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  reelScript, scriptProblems, readTimeMs, SCRIPTS, HOOK_BY_MS, MIN_BEAT_MS,
  type ReelScript,
} from "./reel-script";
import { holdFor, MAX_REEL_MS } from "./reel";
import { HOOK_MAX_WORDS } from "./reel-kinds";

const all = () => SCRIPTS.map((s) => reelScript(s.id)).filter((s): s is ReelScript => s !== null);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE REELS WERE SLIDESHOWS, AND SLIDESHOWS DO NOT GET WATCHED.
 *
 * lib/reel.ts draws SVG cards onto a canvas and records the canvas. Every
 * figure on them is real and the result is still text sliding over a gradient —
 * the format people scroll past fastest, because there is nothing on screen
 * that could not have been a screenshot.
 *
 * These are shot lists for filming the app instead.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("every script is filmable, and says what to point the camera at", () => {
  assert.equal(all().length, SCRIPTS.length, "a script in the menu produces nothing");
  for (const script of all()) {
    assert.deepEqual(scriptProblems(script), [], `${script.id} would not survive being recorded`);
    assert.ok(script.beats.length >= 3, `${script.id} is three shots or fewer — that is a slideshow again`);
    for (const beat of script.beats) {
      assert.ok(beat.action.trim().length > 10, `${script.id}: "${beat.action}" is not a direction`);
      assert.ok(!/undefined|null|NaN|\[object/.test(beat.say + beat.action), `${script.id}: ${beat.say}`);
    }
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A BEAT MUST OUTLAST ITS OWN LINE.
 *
 * The single rule that decides whether a reel is watchable. Four seconds of
 * picture under nine seconds of narration is either a voice racing the screen
 * or a cut landing mid-word, and both read as amateur in the first second —
 * and neither can be fixed without filming it again.
 * ═══════════════════════════════════════════════════════════════════════════
 */
test("no line overruns the shot it is spoken over", () => {
  for (const script of all()) {
    for (const [i, beat] of script.beats.entries()) {
      if (!beat.say) continue;
      assert.ok(beat.ms >= holdFor(beat.say),
        `${script.id} beat ${i}: ${beat.ms}ms of picture, ${holdFor(beat.say)}ms of speech`);
    }
  }
});

test("the beats are contiguous and add up to the whole", () => {
  for (const script of all()) {
    let at = 0;
    for (const [i, beat] of script.beats.entries()) {
      assert.equal(beat.at, at, `${script.id} beat ${i} starts at ${beat.at}, not ${at} — there is a gap or an overlap`);
      assert.ok(beat.ms >= MIN_BEAT_MS, `${script.id} beat ${i} is ${beat.ms}ms — too short to read`);
      at += beat.ms;
    }
    assert.equal(script.totalMs, at);
    assert.ok(script.totalMs <= MAX_REEL_MS, `${script.id} runs ${Math.round(script.totalMs / 1000)}s`);
    assert.ok(script.totalMs >= 8_000, `${script.id} is ${Math.round(script.totalMs / 1000)}s — not enough to say anything`);
  }
});

/** A hook that arrives at four seconds is a reel with no hook. */
test("the hook is short and it is first", () => {
  for (const script of all()) {
    assert.ok(script.hook.split(/\s+/).length <= HOOK_MAX_WORDS, `${script.id}: "${script.hook}"`);
    assert.equal(script.beats[0].at, 0);
    assert.ok(script.beats[0].at <= HOOK_BY_MS);
    assert.ok(!script.hook.endsWith(","), `${script.id}: the hook was cut mid-clause`);
  }
});

/**
 * The figures come from the same functions the pages render, so a script cannot
 * quote a price the site does not show. Nothing here is typed twice.
 */
test("a script quotes the app's own numbers", () => {
  const cost = reelScript("demo-cost")!;
  const spoken = cost.beats.map((b) => b.say).join(" ");
  assert.match(spoken, /£\d/, "the cost script names no price at all");
  assert.match(spoken, /30 grams|30g/, "it never says how much protein it is pricing");
});

/** Every route has to be somewhere the recorder can actually go. */
test("no beat points at a page that does not exist", () => {
  const known = /^\/(|home|journal|nutrition|benchmarks|drills|standards|recipes|cheapest-protein|exercises|a|articles|collections|plans)(\/|$)/;
  for (const script of all()) {
    for (const beat of script.beats) {
      assert.match(beat.route, known, `${script.id}: ${beat.route}`);
    }
  }
});

test("the read time is a real estimate, not a placeholder", () => {
  for (const script of all()) {
    assert.ok(script.words > 20, `${script.id} has ${script.words} words of narration`);
    assert.ok(readTimeMs(script) > 0);
    assert.ok(readTimeMs(script) <= script.totalMs,
      `${script.id}: ${Math.round(readTimeMs(script) / 1000)}s to read over ${Math.round(script.totalMs / 1000)}s of film`);
  }
});

/** The checks have to be able to fail, or they are decoration. */
test("scriptProblems reports the mistakes it exists for", () => {
  const good = reelScript("demo-cost")!;

  /**
   * ABOVE the minimum-length floor, below the time its line takes.
   *
   * The first version used 200ms, which trips the "too short to read" rule as
   * well — so an assertion matching either passed with the overrun check gone
   * entirely. Two rules, one assertion, and the one being tested was not the
   * one firing.
   */
  const long = good.beats.find((b) => b.say && holdFor(b.say) > MIN_BEAT_MS + 500)!;
  assert.ok(long, "no beat has a line long enough to test an overrun against");
  const overrun: ReelScript = {
    ...good,
    beats: good.beats.map((b) => (b === long ? { ...b, ms: MIN_BEAT_MS + 1 } : b)),
  };
  const found = scriptProblems(overrun).map((p) => p.problem);
  assert.ok(found.some((p) => /does not fit/.test(p)), `expected an overrun, got: ${found.join("; ")}`);
  assert.ok(!found.some((p) => /too short/.test(p)), "the length rule fired instead — this proves nothing");

  const noRoute: ReelScript = {
    ...good,
    beats: good.beats.map((b, i) => (i === 0 ? { ...b, route: "journal" } : b)),
  };
  assert.ok(scriptProblems(noRoute).some((p) => /is not a route/.test(p.problem)));

  const rambling: ReelScript = { ...good, hook: "a b c d e f g h i j k l m n" };
  assert.ok(scriptProblems(rambling).some((p) => /hook/.test(p.problem)));

  const tooLong: ReelScript = { ...good, totalMs: MAX_REEL_MS + 1 };
  assert.ok(scriptProblems(tooLong).some((p) => /ceiling/.test(p.problem)));

  assert.deepEqual(scriptProblems({ ...good, beats: [] }).map((p) => p.problem), ["there is nothing to film"]);
});

/**
 * AND THE RECORDER HAS TO CAPTURE A SCREEN, NOT A CANVAS.
 *
 * The whole point of this file is that the old reel recorded generated frames.
 * A recorder that quietly went back to canvas.captureStream would pass every
 * test above, because every test above is about the script.
 */
test("the recorder films the screen and can carry a voice", () => {
  const src = readFileSync(new URL("../components/ReelRecorder.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

  /**
   * MATCHED ON THE CALL, NOT THE WORD.
   *
   * These read `/inspectRecording/` and `/getDisplayMedia/`, which the import
   * line satisfies on its own — so removing the actual call left the guard
   * green. A source check that a stale import can pass is not a check.
   */
  assert.match(src, /navigator\.mediaDevices\.getDisplayMedia\(/, "it is not recording the screen");
  assert.match(src, /navigator\.mediaDevices\.getUserMedia\(/, "there is no way to record a voice over it");
  assert.ok(!/captureStream\(/.test(src), "it is back to filming a canvas");
  // The container checks already exist and catch VP9 inside an .mp4 — a reel
  // that will not play on the platform it was made for.
  assert.match(src, /pickMimeType\(\(t\) => MediaRecorder\.isTypeSupported/,
    "it is not choosing a container the platforms accept");
  assert.match(src, /inspectRecording\(head\)/, "nothing checks what actually came out");
  assert.match(src, /isPostable\(info\)/, "the check runs and its answer is thrown away");

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * iOS HAS NO getDisplayMedia, AND THE BUTTON WAS OFFERED ANYWAY.
   *
   * Tapped on an iPhone it threw "navigator.mediaDevices.getDisplayMedia is
   * not a function" into the page. Safari on iOS does not implement screen
   * capture for web pages at all — no flag, no permission — so the capability
   * has to be absent from the UI rather than discovered by pressing it.
   * ═══════════════════════════════════════════════════════════════════════
   */
  assert.match(src, /typeof navigator\.mediaDevices\?\.getDisplayMedia === "function"/,
    "nothing checks whether this browser can record before offering to");
  assert.match(src, /canRecord === false \?/, "the button is offered on a browser that cannot record");
  assert.match(src, /Control Centre/,
    "it says it cannot record and does not say what to do instead — iOS records the screen fine");
});
